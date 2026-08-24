/* ============================================================================
 *  IntMap · THE CAPABILITY AUDIT  (#R318)
 * ----------------------------------------------------------------------------
 *  `scripts/atlas-catalog.mjs` (#R278) asks ONE question: is every dispatch case mentioned in the
 *  planner's prompt? It is a good question and it caught six invisible features. It is also the only
 *  question anyone was asking, and the diary is full of the others:
 *
 *    · #R268 — a capability that runs, returns, and changes nothing
 *    · #R291 — a route computed and never drawn, reported as done
 *    · #R302 — a point-needing tool that quietly used the map centre
 *    · #R309 — wiring that existed and was cancelled in the same millisecond
 *
 *  Every one of those is a capability whose CLAIM and whose OBSERVATION disagreed. This file asks
 *  the twenty questions that would have caught them, against js/atlas-capabilities.js — which is
 *  now the one list of what IntMap can do — plus the source of the files that implement it.
 *
 *      node scripts/atlas-capability-audit.mjs            # the full report
 *      node scripts/atlas-capability-audit.mjs --check    # the gate (npm test, CI)
 *      node scripts/atlas-capability-audit.mjs --json     # the machine-readable audit (§2)
 *
 *  ⚠ A GREEN GATE NOBODY HAS SEEN GO RED IS NOT EVIDENCE. Every check below takes its inputs as
 *  DATA, and tests/r318-checks.test.mjs feeds each one a fixture with the defect deliberately
 *  present and asserts that it fails. A check that cannot be made to fail is deleted, not kept.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* ⚠ COMMENTS ARE NOT CODE, AND THIS REPOSITORY HAS PAID FOR THAT NINE TIMES (see the recurring-
   failures memo: a check matching its own explanatory note). Three of the checks below look for a
   CALL, and every file that explains why a call was removed contains the call's spelling in prose —
   js/session-tabs.js says in words that `tab.monitors` is deliberately unregistered, which is the
   opposite of the defect. So they read this, not the file.
   (#R345) It USED to be two lines of regex right here, and tests/helpers/fn-cors.js was about to
   become the second copy — so the stripper moved to scripts/code-only.mjs and both import it. */
import { codeOnly } from './code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const lines = (rel) => read(rel).split(/\r?\n/);

/* The registry and the catalogue are real modules; load them the way the browser does, with the
   one global they publish themselves onto. Nothing here touches the DOM. */
async function loadRegistry() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const caps = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  const docs = (await import('../js/atlas-catalog-text.js')).makeAtlasCatalogText({}, {});
  const results = (await import('../js/atlas-results.js')).makeAtlasResults({});
  return { caps, docs, results };
}

/* (#R406) The argument schemas, loaded the same way — checks ㉑ and ㉒ read the real table rather
   than a list written down twice. */
async function loadSchemas() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  try { return (await import('../js/atlas-schemas.js')).makeAtlasSchemas(); } catch { return null; }
}

/* Every `case 'x': case 'y':` inside the dispatch switch — one group is one capability, whatever
   number of spellings it answers to. Shared with scripts/atlas-catalog.mjs, which reads it here. */
export function dispatchGroups(src) {
  const out = [];
  src.forEach((line, i) => {
    if (!/^ {8}case '/.test(line)) return;
    const names = [...line.matchAll(/case '([A-Za-z_][\w ]*)'\s*:/g)].map((m) => m[1]);
    if (names.length) out.push({ line: i + 1, names, src: src.slice(i, i + 4).join('\n') });
  });
  return out;
}

/* ── the twenty checks. Each takes DATA and returns {id, title, failures[], note} ───────────── */
export function auditWith({ caps, docs, atlas, controls, capSrc, execSrc, stateSrc, resultsSrc, toolsSrc, schemas }) {
  const J = caps.toJSON();
  const byId = Object.create(null);
  J.capabilities.forEach((c) => { byId[c.id] = c; });
  const groups = dispatchGroups(atlas);
  const checks = [];
  const add = (id, title, failures, note) => checks.push({ id, title, failures: failures || [], note: note || '' });

  /* ① every live dispatch spelling belongs to a canonical capability */
  {
    const bad = [];
    groups.forEach((g) => {
      g.names.forEach((n, idx) => {
        const c = caps.resolve(n);
        /* A JS switch takes the FIRST matching case; a spelling already claimed by an earlier group
           is unreachable, and calling it "covered" would be counting a dead label as a feature. */
        const firstOwner = groups.find((g2) => g2.names.includes(n));
        if (firstOwner !== g) { bad.push(`${g.line}: '${n}' is already handled at line ${firstOwner.line} — this label is unreachable`); return; }
        if (!c) bad.push(`${g.line}: '${n}' resolves to no capability`);
        else if (idx === 0 && c.legacy !== n && !c.aliases.includes(n)) bad.push(`${g.line}: '${n}' maps to ${c.id}, which does not list it`);
      });
    });
    add('alias-coverage', 'every live dispatch spelling belongs to a canonical capability', bad,
      `${groups.length} dispatch groups · ${groups.reduce((a, g) => a + g.names.length, 0)} spellings`);
  }

  /* ② every capability has an executor */
  add('has-executor', 'every capability has an executor',
    J.capabilities.filter((c) => !c.hasExecute).map((c) => c.id));

  /* ③ a capability that writes anything has BOTH observe() and verify() */
  add('side-effects-observed', 'a capability that writes has observe() and verify()',
    J.capabilities.filter((c) => c.effects.writes.length && (!c.hasObserve || !c.hasVerify)).map((c) => c.id));

  /* ④ the declared target policy matches what the adapter can actually be given */
  {
    const bad = [];
    J.capabilities.forEach((c) => {
      const t = c.targetPolicy;
      if (!t.kind) return;
      if (t.required && !t.accepts.length) bad.push(`${c.id}: requires a ${t.kind} but accepts nothing`);
      if (t.mapCenterAllowed) bad.push(`${c.id}: declares mapCenterAllowed — a tool may not silently take the map centre (#R302)`);
    });
    add('target-policy', 'the target policy is answerable, and never the map centre', bad);
  }

  /* ⑤ every capability is REACHABLE BY ATLAS: a catalogue block that find_capability can return, a
        seat in the core tool surface, the always-sent rules, or an explicit withdrawal.
        ⚠ (#R406) THE CORE SURFACE IS A THIRD SOURCE, AND IT HAD TO BECOME ONE. `dialog.ask` has no
        catalogue block; it was "documented" by the literal '{"type":"ask"' appearing in SYS()'s
        prose, and when that prose went, a capability that is now a FIRST-CLASS TOOL read as
        undiscoverable. The list is parsed out of js/atlas-toolsurface.js rather than copied here —
        a second copy of a list is how the three disagreeing capability tables of #R323 started. */
  {
    const covered = new Set(docs.idsCovered());
    const ruleDoc = caps.ruleDocumented();
    const coreTools = new Set([...String(toolsSrc || '').matchAll(/cap:\s*'([a-zA-Z.]+)'/g)].map((m) => m[1]));
    const bad = [];
    J.capabilities.forEach((c) => {
      if (covered.has(c.id)) return;
      if (coreTools.has(c.id)) return;
      if (c.withdrawn) return;
      const lit = ruleDoc[c.id];
      if (lit) {
        /* the claim is checked, not believed: the literal must really be in the rules text */
        if (!atlas.join('\n').includes(lit)) bad.push(`${c.id}: claims the rules document it as ${lit}, and they do not`);
        return;
      }
      bad.push(`${c.id}: no catalogue block documents it`);
    });
    add('atlas-discoverable', 'Atlas can reach every capability', bad,
      `${covered.size} of ${J.count} in ${docs.count()} blocks, ${coreTools.size} as core tools`);
  }

  /* ⑥ a lazy capability is in the catalogue BEFORE its module loads */
  {
    const covered = new Set(docs.idsCovered());
    const lazy = J.capabilities.filter((c) => c.lazyModules.length);
    add('lazy-discoverable', 'a lazy capability is catalogued before its module exists',
      lazy.filter((c) => !covered.has(c.id) && !c.withdrawn).map((c) => c.id),
      `${lazy.length} capabilities need a lazy module`);
  }

  /* ⑦ what a capability says it PRODUCES is something its verifier can observe */
  {
    const OBSERVABLE = { camera: ['camera', 'map'], layer: ['map'], paint: ['map', 'object'], panel: ['panel', 'file'],
      route: ['route', 'map', 'panel'], object: ['object', 'map'], setting: ['setting'], time: ['map', 'time'],
      panelPaint: ['panel', 'map', 'object'],
      /* (#R376) the "wxModel" observer reads which forecast model each weather MAP LAYER is
         displaying — an observation OF the map, just not one made by counting features. A raster
         source swap draws exactly as many features as it drew before, which is why "paint" could
         not see it and reported a working switch as not_rendered. */
      wxModel: ['map', 'explanation'],
      sim: ['map', 'camera'], control: ['panel'], none: ['explanation', 'panel', 'view', 'camera', 'map'] };
    const bad = [];
    J.capabilities.forEach((c) => {
      if (!c.produces.length) return;
      const seen = OBSERVABLE[c.observerKind] || [];
      c.produces.forEach((p) => {
        if (p === 'explanation') return;   /* observed by the reply pipeline, not by a map observer */
        if (!seen.includes(p)) bad.push(`${c.id}: produces "${p}" but its ${c.observerKind} observer never looks at one`);
      });
    });
    add('produces-observed', 'a declared output is one the verifier actually looks for', bad);
  }

  /* ⑧ the UI and Atlas converge on the same core command where one exists */
  {
    const bad = [], converged = [];
    const body = read('js/app-body.js') + '\n' + read('js/map-projection.js');
    const kexecs = [...atlas.join('\n').matchAll(/kexec\('([a-z0-9.]+)'|kexec\([^)]*?'([a-z0-9.]+)'/g)]
      .flatMap((m) => [m[1], m[2]]).filter(Boolean);
    /* Registrations come in three shapes and all three are real: a literal `IntMapOS.register('x',…)`,
       the REGL table in js/session-tabs.js (`['x', run, meta]`), and the SIM_TOOLS table in
       js/map-ui.js (`{ id:'x', … run: … }`, where `run:null` means someone else registers it).
       Reading only the first shape reported seventeen registered commands as missing. */
    const allJs = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => read('js/' + f)).join('\n');
    const registered = new Set([...allJs.matchAll(/IntMapOS\.register\('([a-z0-9._]+)'/g)].map((m) => m[1]));
    [...read('js/session-tabs.js').matchAll(/\[\s*'([a-z0-9._]+)'\s*,/g)].forEach((m) => registered.add(m[1]));
    [...read('js/map-ui.js').matchAll(/\{\s*id:\s*'([a-z0-9._]+)'[\s\S]{0,900}?run:\s*(?!null)/g)].forEach((m) => registered.add(m[1]));
    [...new Set(kexecs)].forEach((cmd) => {
      if (registered.has(cmd)) converged.push(cmd);
      else bad.push(`the dispatch runs IntMapOS command '${cmd}', which nothing registers`);
    });
    /* …and the reverse: a command something exec()s but nobody registers is a silent no-op. An
       UNGUARDED one is the defect — js/widget-layout.js asks `IntMapOS.has()` first and tells the
       reader, which is the correct shape and must not be reported as a fault. */
    fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).forEach((f) => {
      const t = codeOnly(read('js/' + f));
      const guarded = /IntMapOS\.has\(/.test(t);
      [...t.matchAll(/IntMapOS\.exec\('([a-z0-9._]+)'/g)].forEach((m) => {
        if (registered.has(m[1]) || guarded) return;
        bad.push(`js/${f}: IntMapOS.exec('${m[1]}') — nothing registers it and the call is not guarded by IntMapOS.has()`);
      });
    });
    add('ui-atlas-converge', 'the button and the sentence reach the same command', bad,
      `${converged.length} commands reached from both shells · ${registered.size} registered`);
  }

  /* ⑨ nothing in the registry is unrunnable */
  {
    const bad = [];
    J.capabilities.forEach((c) => {
      if (c.withdrawn) return;
      if (!c.legacy) { bad.push(`${c.id}: no dispatch type and no own executor`); return; }
      const g = groups.find((x) => x.names.includes(c.legacy));
      if (!g) bad.push(`${c.id}: its dispatch type '${c.legacy}' has no case in the switch`);
    });
    add('registry-runnable', 'every registered capability has real code behind it', bad);
  }

  /* ⑩ nothing implemented is missing from the registry */
  {
    const bad = [];
    groups.forEach((g) => { if (!g.names.some((n) => caps.resolve(n))) bad.push(`${g.line}: ${g.names.join('/')} is implemented and unregistered`); });
    add('nothing-unregistered', 'nothing is implemented and unregistered', bad);
  }

  /* ⑪ no alias is claimed twice */
  {
    const seen = Object.create(null), bad = [];
    J.capabilities.forEach((c) => c.aliases.forEach((a) => {
      const k = a.toLowerCase();
      if (seen[k] && seen[k] !== c.id) bad.push(`'${a}' is claimed by both ${seen[k]} and ${c.id}`);
      seen[k] = c.id;
    }));
    add('alias-unique', 'no spelling belongs to two capabilities', bad, `${Object.keys(seen).length} spellings`);
  }

  /* ⑫ a withdrawal has a reason AND is really withdrawn */
  {
    const bad = [];
    caps.withdrawn().forEach((id) => {
      const c = caps.resolve(id);
      if (!c || !c.withdrawn || !c.withdrawn.why) { bad.push(`${id}: withdrawn with no reason`); return; }
      const g = groups.find((x) => x.names.includes(c.legacy));
      if (!g) return;   /* removed entirely — that is withdrawal too */
      if (c.withdrawn.proofCode && !g.src.includes(c.withdrawn.proofCode)) {
        bad.push(`${id}: claims to answer ${c.withdrawn.proofCode} and its case does not — the withdrawal has quietly ended`);
      }
    });
    add('withdrawal-honest', 'an intentional withdrawal is real and says why', bad);
  }

  /* ⑬ the nine languages reach the same capabilities */
  {
    const bad = [];
    const CODES = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];
    const reg = read('js/lang-registry.js');
    CODES.forEach((c) => { if (!fs.existsSync(path.join(ROOT, 'js/locales/ui.' + c + '.js'))) bad.push(`no locale file for ${c}`); });
    /* the model-facing language name must be DERIVED, not a five-row literal (#R318's zh 英文 bug) */
    if (!/function englishName/.test(reg)) bad.push('js/lang-registry.js no longer derives englishName() — the five-language table is back');
    const langHints = Object.keys(caps.VERB_HINTS || {});
    langHints.forEach((cat) => {
      const hints = caps.VERB_HINTS[cat] || [];
      const cjk = hints.filter((h) => /[぀-ヿ一-鿿가-힯]/.test(h)).length;
      const latin = hints.filter((h) => /^[a-zà-ÿ' -]+$/i.test(h)).length;
      if (!cjk || !latin) bad.push(`capability search hints for "${cat}" cover only one script — a request in another language cannot rank`);
    });
    /* every user-visible result message must exist in the four non-positional locales */
    ['zh', 'zh-hans', 'fr', 'ko'].forEach((code) => {
      const loc = read('js/locales/ui.' + code + '.js');
      const missing = (caps.resultEnglish || (() => []))().filter((en) => !loc.includes(JSON.stringify(en).slice(1, -1)) && !loc.includes(en));
      if (missing.length) bad.push(`ui.${code}.js is missing ${missing.length} #R318 result message(s), e.g. "${missing[0].slice(0, 40)}"`);
    });
    add('nine-languages', 'all nine languages reach the same capabilities', bad, `${CODES.length} locales`);
  }

  /* ⑭ the planner's capability information is never truncated mid-entry */
  {
    const bad = [];
    const all = docs.text(null);
    if (!all.length) bad.push('the catalogue is empty');
    docs.blocks().forEach((b, i) => { if (!b.bytes) bad.push(`catalogue block ${i} is empty`); });
    /* a selection returns WHOLE blocks or none — never a prefix */
    const one = docs.text(['routing.route']);
    if (one && !all.includes(one)) bad.push('a selected catalogue is not a subsequence of the full one — selection is rewriting blocks');
    if (/\.\.\.$|…$/.test(all.trim())) bad.push('the catalogue ends in an ellipsis — something truncated it');
    add('catalogue-intact', 'the catalogue is sent whole or not at all', bad, `${all.length} bytes across ${docs.count()} blocks`);
  }

  /* ⑮ no capability can be lost to an order- or count-cap */
  {
    const bad = [];
    /* ⚠ (#R320) THIS USED TO BE A PROXIMITY REGEX AND IT LANDED ON ITS OWN AUTHOR'S CODE — the tenth
       time in this diary. `controlCatalog … slice(0, <digits>)` within 400 characters matched
       `controlCandidates`' unrelated `slice(0, 6)`. The question was never "is there a slice"; it is
       whether a control can disappear WITHOUT ANYONE BEING TOLD. So: the catalogue may cap (the
       prompt has a byte budget), and if it does it must SAY what it left out, and the population it
       ranks must be the whole one. */
    const cat = (controls.match(/function controlCatalog\([\s\S]*?\n    \}/) || [''])[0];
    if (!cat) bad.push('js/atlas-controls.js: controlCatalog() was not found — this check reads nothing');
    else {
      const caps2 = /slice\(0,\s*(\d+|CTL_MAX)\)/.test(cat);
      const admits = /not listed here|more on-screen control/i.test(cat);
      if (caps2 && !admits) bad.push('controlCatalog() caps its output and does not say what it dropped — a silently truncated list reads as a complete one');
      if (caps2 && !/_ctlRelevance|forRequest/.test(cat)) bad.push('controlCatalog() caps in DOM order — which controls exist must not depend on where they sit in the document');
    }
    /* ⚠ THE RULE IS ABOUT THE POPULATION, NOT ABOUT EVERY BOUNDED LIST. Capping how many NEAR-MISS
       suggestions ride along in a prompt is a budget; capping the set that is SCORED is how a
       capability stops existing. The first version of this check forbade any `slice` and immediately
       failed on the second kind — a check landing on its own author's comment, again. */
    if (/(API\.all\(\)|order)\s*\.slice\(0,\s*\d+\)/.test(capSrc)) bad.push('js/atlas-capabilities.js truncates the capability population itself');
    if (/return r\.score > 0; \}\)[\s\S]{0,120}?\.slice\(0,/.test(capSrc)) bad.push('the ranking is truncated before it is returned');
    /* the relevance search must score the WHOLE population, not a prefix of it */
    if (!/API\.all\(\)\s*\.filter/.test(capSrc) && !/API\.all\(\)\n\s*\.filter/.test(capSrc)) {
      bad.push('the relevance search no longer starts from every capability');
    }
    add('no-silent-cap', 'no capability disappears for being Nth', bad);
  }

  /* ⑯ an unconditional success right after a swallowed throw */
  {
    const bad = [];
    const scan = (rel, src) => {
      src.split(/\r?\n/).forEach((l, i) => {
        /* the shape: a swallowed catch, then a claim of success on the same line, in a file whose
           job is to REPORT what happened. The registry, executor and results modules must be clean. */
        if (/catch\s*\(\s*_\s*\)\s*\{\s*\}/.test(l) && /status:\s*'completed'|return\s+API\.completed|ok:\s*!?!?true/.test(l)) {
          bad.push(`${rel}:${i + 1}: a swallowed throw is followed by a success on the same line`);
        }
      });
    };
    scan('js/atlas-capabilities.js', capSrc);
    scan('js/atlas-executor.js', execSrc);
    scan('js/atlas-results.js', resultsSrc);
    add('no-success-after-catch', 'no success is claimed on top of a swallowed error', bad);
  }

  /* ⑰ an async capability cannot reach `completed` before its promise settles */
  {
    const bad = [];
    if (!/if \(raw && typeof raw\.then === 'function'\) raw = await raw;/.test(execSrc)) {
      bad.push('js/atlas-executor.js no longer awaits a thenable result — the #R82 defect is back');
    }
    if (!/get: function \(\) \{ return this\.status === 'completed'; \}/.test(resultsSrc)) {
      bad.push('js/atlas-results.js no longer DERIVES ok from status — a caller can write a success again');
    }
    const body = read('js/app-body.js');
    if (!/res\.then\(v=>\{ r\.pending=false;/.test(body)) {
      bad.push('js/app-body.js: IntMapOS.exec() no longer settles the log record of an async command');
    }
    add('async-honest', 'a promise cannot be reported before it settles', bad);
  }

  /* ⑱ a map-producing capability is verified by looking at the map */
  {
    /* (#R376) …and "wxModel", which reads the map layers' displayed model back out of the module */
    const MAP_OBS = ['paint', 'camera', 'layer', 'sim', 'route', 'object', 'time', 'panelPaint', 'wxModel'];
    add('map-verified', 'a capability that promises the map is checked against the map',
      J.capabilities.filter((c) => c.produces.includes('map') && !MAP_OBS.includes(c.observerKind))
        .map((c) => `${c.id}: promises "map" but its observer is "${c.observerKind}"`));
  }

  /* ⑲ a capability that can answer needs_input has a resume path */
  {
    const bad = [];
    const needsInput = J.capabilities.filter((c) => c.targetPolicy && c.targetPolicy.required);
    if (!/resumeToken/.test(resultsSrc)) bad.push('js/atlas-results.js issues no resume token — a needs_input can never be continued');
    if (!/inputRequest\.resumeToken|resumeToken: req\.resumeToken/.test(resultsSrc)) bad.push('the resume token is not carried on the input request');
    if (!/pendingArgs/.test(execSrc)) bad.push('js/atlas-executor.js does not carry the pending arguments — a resumed operation would start from nothing');
    add('resume-path', 'an operation that waits for input can be continued', bad, `${needsInput.length} capabilities require a target`);
  }

  /* ⑳ a state-dependent capability whose section has no provider */
  {
    const bad = [];
    const SECTION_OF = { camera: 'camera', layer: 'activeLayers', panel: 'panels', route: 'routing',
      object: 'objects', setting: 'settings', time: 'time' };
    const declared = new Set([...stateSrc.matchAll(/reg\('([a-zA-Z]+)'/g)].map((m) => m[1]));
    const consoleDeclared = new Set([...atlas.join('\n').matchAll(/registerStateProvider\('([a-zA-Z]+)'/g)].map((m) => m[1]));
    J.capabilities.forEach((c) => {
      const sec = SECTION_OF[c.observerKind];
      if (!sec) return;
      if (!declared.has(sec) && !consoleDeclared.has(sec)) bad.push(`${c.id}: its state section "${sec}" has no provider`);
    });
    add('state-providers', 'a state-dependent capability has someone to ask', bad,
      `${declared.size + consoleDeclared.size} sections have an owner`);
  }

  /* ㉑ (#R406) EVERY CAPABILITY DECLARES ITS ARGUMENTS. All 126 shared one literal — the
        `inputSchema: {type:'object'}` hard-coded in build() — which validates any object at all, so
        an `analyze` with no question and a `highlight` with no target both passed validation and
        failed only after execution («何を分析しますか？»). A schema with no `properties` is the
        shape that let that through, and it is what this check refuses. */
  {
    const bad = [];
    const S = (schemas && schemas.ALL) || null;
    if (!S) {
      bad.push('js/atlas-schemas.js supplied no table');
    } else {
      const known = new Set(J.capabilities.map((c) => c.id));
      Object.keys(S).forEach((id) => { if (!known.has(id)) bad.push(`${id}: a schema for a capability that does not exist`); });
      J.capabilities.forEach((c) => {
        const sc = S[c.id];
        if (!sc) { bad.push(`${c.id}: no argument schema`); return; }
        if (sc.type !== 'object') { bad.push(`${c.id}: schema is not an object schema`); return; }
        const props = sc.properties && typeof sc.properties === 'object' ? Object.keys(sc.properties) : [];
        if (!props.length) bad.push(`${c.id}: an empty object schema accepts anything`);
      });
    }
    add('argument-schemas', 'every capability declares the arguments it takes',
      bad, S ? `${Object.keys(S).length} schemas` : 'none');
  }

  /* ㉒ (#R406) …AND A CAPABILITY THAT CANNOT ACT WITHOUT A TARGET SAYS SO MECHANICALLY.
        targetPolicy.required has meant «resolveInputs will ask for it» since #R318; it never meant
        «the model must supply it», which is why an argument-less call reached execution. A schema
        that names the requirement is what makes it checkable BEFORE anything runs. */
  {
    const bad = [];
    const S = (schemas && schemas.ALL) || {};
    let n = 0;
    J.capabilities.forEach((c) => {
      if (!c.targetPolicy || !c.targetPolicy.required) return;
      n++;
      const sc = S[c.id];
      if (!sc) return;   /* ㉑ already said so */
      const hasReq = Array.isArray(sc.required) && sc.required.length;
      const hasAny = Array.isArray(sc.anyOf) && sc.anyOf.length;
      if (!hasReq && !hasAny) bad.push(`${c.id}: needs a ${c.targetPolicy.kind} and its schema demands nothing`);
    });
    add('required-arguments', 'a capability that needs a target demands it in its schema', bad,
      `${n} capabilities require a target`);
  }

  return checks;
}

export async function audit() {
  const { caps, docs, results } = await loadRegistry();
  /* the result messages the four non-positional locales must carry */
  caps.resultEnglish = () => results.messageEnglish();
  return {
    caps, docs,
    checks: auditWith({
      caps, docs,
      atlas: lines('js/atlas-console.js'),
      controls: read('js/atlas-controls.js'),
      capSrc: read('js/atlas-capabilities.js'),
      execSrc: read('js/atlas-executor.js'),
      stateSrc: read('js/atlas-state.js'),
      resultsSrc: read('js/atlas-results.js'),
      toolsSrc: read('js/atlas-toolsurface.js'),
      schemas: await loadSchemas(),
    }),
  };
}

const IS_MAIN = (() => { try { return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); } catch { return false; } })();
if (IS_MAIN) {
  const { caps, checks } = await audit();
  const failed = checks.filter((c) => c.failures.length);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ registry: caps.toJSON(), classification: caps.classify(), checks }, null, 2));
    process.exit(failed.length ? 1 : 0);
  }
  if (!process.argv.includes('--check')) {
    const cls = caps.classify();
    const byClass = {};
    cls.forEach((c) => { byClass[c.classification] = (byClass[c.classification] || 0) + 1; });
    console.log(`\n  ${cls.length} capabilities:`);
    Object.keys(byClass).sort().forEach((k) => console.log(`    ${String(byClass[k]).padStart(4)}  ${k}`));
    console.log('');
  }
  checks.forEach((c) => {
    const mark = c.failures.length ? '✗' : '✓';
    if (!process.argv.includes('--check') || c.failures.length) {
      console.log(`  ${mark} ${c.id.padEnd(24)} ${c.title}${c.note ? `  (${c.note})` : ''}`);
    }
    c.failures.slice(0, 12).forEach((f) => console.log(`      · ${f}`));
    if (c.failures.length > 12) console.log(`      · …and ${c.failures.length - 12} more`);
  });
  if (failed.length) {
    console.error(`\n✗ ${failed.length} of ${checks.length} capability checks failed.\n`);
    console.error('  A capability whose claim and whose observation disagree is how #R268, #R291, #R302 and');
    console.error('  #R309 each began. Fix the capability, or say in js/atlas-capabilities.js why it is');
    console.error('  withdrawn — do not widen the check.\n');
    process.exit(1);
  }
  console.log(`\n✓ all ${checks.length} capability checks pass\n`);
}
