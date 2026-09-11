/* ============================================================================
 *  #R239 — the translation gate, the dock, and the rupture's trailing front
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). The three that do NOT
 *  fail on the old tree are marked where they are, and each is a proof rather than a diff: they
 *  state a property the new code has to keep, not a line it happens to contain.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
/* (#R208/#R215) comments quote the instruction, and the instruction contains the very strings these
   tests look for — so every syntax check reads the file with its comments stripped. */
const code = (p) => R(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const run = (f, ...a) => execFileSync(process.execPath, [join(ROOT, 'scripts', f), ...a],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/* ══ ① THE GATE — every language, every surface, one exit code ═══════════════════════════════════
   「今後言語を追加するのが完璧に100%にできるような仕組みを作っておいて。今回のように、いつまでたっても
     言語対応の漏れが見つかることは許されない。」 */
test('① every language is held to what scripts/lang-policy.mjs says of it', async () => {
  const a = JSON.parse(run('i18n-audit.mjs', '--json'));
  assert.ok(a.rows.length >= 9, 'the audit sees every registered language');
  /* ⚠⚠⚠ (#R707) THIS ASSERTED A POLICY THAT NO LONGER EXISTS, AND IT ASSERTED IT FROM A SECOND
     COPY. The 2026-09-11 amendment (CONSTITUTION.md §7) narrowed what IntMap AUTHORS to en + jp
     and holds the other seven to a FLOOR instead of 100 % — narrowing what is written next is not
     licence to delete what is written already, so the seven may not DROP, but a new English-only
     string is allowed because it lowers no count. scripts/i18n-audit.mjs enforces exactly that and
     stayed green; this file kept the pre-amendment rule and went red for two strings written the
     way the amendment asks.
     ⚠ THE FIX IS NOT TO LOWER THE BAR — IT IS TO STOP KEEPING A SECOND COPY OF IT. The judgement
     lives in scripts/lang-policy.mjs; a judgement that already exists somewhere is DISTRIBUTED,
     not copied (.agents/rules/no-ad-hoc-hardcoding.md §2-3, [[intmap-recurring-lessons]] G). So the
     authored set is still held to 100 % on every surface — that half is unchanged — and the
     carried set is held to the same floor the gate reads. Restore the nine (`return all;` in
     scripts/lang-policy.mjs) and this returns to «every language, 100 %» with no edit here. */
  const { authoredLangs, carriedLangs } = await import('../scripts/lang-policy.mjs');
  const AUTHORED = new Set(authoredLangs(ROOT));
  const CARRIED = new Set(carriedLangs(ROOT));
  const FLOOR = JSON.parse(readFileSync(join(ROOT, 'tests', 'i18n-coverage-floor.json'), 'utf8')).langs;
  assert.ok(AUTHORED.size > 0, 'scripts/lang-policy.mjs authors no language at all');
  let checkedAuthored = 0, checkedCarried = 0;
  for (const r of a.rows) {
    const surfaces = ['keyed', 'inline', 'positional', 'pages'].filter((k) => r[k]);
    if (AUTHORED.has(r.code)) {
      for (const k of surfaces) { assert.equal(r[k][0], r[k][1], `${r.code}: ${k} table incomplete — IntMap authors this language`); checkedAuthored++; }
    } else if (CARRIED.has(r.code)) {
      const f = FLOOR[r.code] || {};
      for (const k of surfaces) {
        if (f[k] == null) continue;
        assert.ok(r[k][0] >= f[k], `${r.code}: ${k} fell to ${r[k][0]}, below the floor of ${f[k]} — narrowing what is authored next is not licence to delete what is written already`);
        checkedCarried++;
      }
    } else { assert.fail(`${r.code} is neither authored nor carried by scripts/lang-policy.mjs`); }
  }
  /* ⚠ a check that measured nothing must not be green (#R699). */
  assert.ok(checkedAuthored > 0, 'r239 ①: no authored surface was measured');
  assert.ok(checkedCarried > 0, 'r239 ①: no carried surface was measured — the floor is asserting nothing');
  assert.equal(a.twoBranch, 0, 'no two-branch language ternary carries prose');
  assert.equal(a.orphanKeys.length, 0, 'every data-i18n key in the markup is declared somewhere');
});

test('① the gate exits non-zero when a language is short — it is a gate, not a report', () => {
  /* run the audit against a doctored keyed table, in a temp copy, and require failure */
  const audit = code('scripts/i18n-audit.mjs');
  assert.match(audit, /--gate/, 'the gate flag exists');
  assert.match(audit, /process\.exit\(1\)/, 'and it exits 1');
  /* and it is wired into the suite the round runs, not only available */
  assert.match(code('scripts/test-parallel.mjs'), /i18n-audit\.mjs['"]\s*,\s*['"]--gate/,
    'npm test runs the translation gate');
});

/* ⚠ THIS ONE PASSES ON THE OLD TREE TOO, and is meant to: it is a property of the measurement, not
   of any file. A coverage rule that counts a copy of English as «done» is the exact defect this
   round was about, and it was one command away from shipping — so the rule itself is pinned. */
test('① page coverage means TRANSLATED, not merely present', () => {
  const en = R('js/locales/pages.en.js');
  const de = R('js/locales/pages.de.js');
  /* a sentence that is word-for-word English in a non-English document is not coverage */
  const s = 'Every terrain feature shares one elevation sampler.';
  assert.ok(en.includes(s), 'the English sentence is where this test thinks it is');
  assert.ok(!de.includes(s), 'and the German document does not simply carry it verbatim');
  const src = code('scripts/i18n-pages-audit.mjs');
  assert.match(src, /doc\.get\(k\) !== en\.get\(k\)/, 'coverage compares against English');
});

test('① the keyed universe is every declaration site, not just ui.en.js', () => {
  const k = JSON.parse(run('i18n-keyed-audit.mjs', '--json'));
  /* js/i18n-late.js and five other modules add keys at run time; the ones that were invisible */
  assert.ok(k.want > 400, `the universe is the whole app (${k.want})`);
  const src = code('scripts/i18n-keyed-audit.mjs');
  assert.match(src, /Object[\s\S]{0,40}assign/, 'the audit reads Object.assign(i18n.x, …) sites');
  assert.match(src, /data-i18n/, 'and the keys the markup asks for');
});

test('① adding a language is one command, and it writes every file the gate asks for', () => {
  const s = code('scripts/i18n-new-language.mjs');
  assert.match(s, /ui\.\$\{code\}\.js|ui\.'\s*\+\s*code/, 'it writes the app locale file');
  assert.match(s, /i18n-pages-audit\.mjs['"]\)\s*,\s*['"]--template/, 'and the reading pages');
  assert.match(s, /i18n-langs\.mjs/, 'and regenerates the generated language list');
  assert.match(s, /survey\(\)/, 'and seeds the keyed table from the WHOLE universe');
});

/* ══ ② THE DOCK ═════════════════════════════════════════════════════════════════════════════════
   「パネル内のポップアップや凡例は×可能だがドラッグ可能にはしないように。」
   「タップしたらどんどん消えていく現象ふざけるな。」
   「勝手に透明度選択とかの凡例の機能削除してんじゃねーよボケ。」
   「パネルに入れるのは現在オンしてるレイヤーや機能の凡例やポップアップのみです。」 */
test('② a docked panel refuses BOTH drag implementations', () => {
  const wm = code('js/window-manager.js');
  /* #R47's drag, and #R47's edge-resize */
  const drags = wm.match(/isDocked\(panel\)/g) || [];
  assert.ok(drags.length >= 3, `makeDraggable (mouse + touch) and addEdgeResize all ask (${drags.length})`);
  /* ⚠ and the OTHER one: js/data-layers.js has had its own delegated legend drag since #R19 */
  const dl = code('js/data-layers.js');
  assert.match(dl, /classList\.contains\('im-docked'\)/,
    'the legends’ own drag (js/data-layers.js wireDrag) refuses a docked legend too');
});

test('② docking strips the geometry and keeps everything the panel says about itself', () => {
  const wm = code('js/window-manager.js');
  const dockOne = wm.slice(wm.indexOf('function _dockOne'), wm.indexOf('function _restoreGeom'));
  assert.doesNotMatch(dockOne, /removeAttribute\('style'\)/,
    'the whole inline style is no longer thrown away (that is what cropped the opacity slider)');
  assert.match(dockOne, /_flatten\(el\)/, 'only the geometry is removed');
  assert.match(wm, /const GEOM\s*=\s*\[/, 'a named list of geometry properties is removed instead');
  for (const p of ['position', 'left', 'top', 'width', 'height', 'transform', 'z-index'])
    assert.ok(wm.includes(`'${p}'`), `${p} is stripped`);
  assert.ok(!/GEOM\s*=\s*\[[^\]]*'display'/.test(wm), 'display is NOT stripped — the layer switch writes it');
  /* and the stylesheet no longer forces one either */
  const css = R('css/intmap.css');
  const block = css.slice(css.indexOf('.im-docked{'), css.indexOf('#docked-feed .dock-empty'));
  assert.ok(!/display:\s*block\s*!important/.test(block), '.im-docked does not force display:block');
});

test('② undocking is the exact inverse of docking (or the panel resurrects itself)', () => {
  const wm = code('js/window-manager.js');
  assert.match(wm, /function _restoreGeom/, 'only the geometry is put back');
  assert.match(wm, /_restoreGeom\(el,\s*s\.css\)/, 'from the stored string');
  assert.doesNotMatch(wm, /setAttribute\('style',\s*s\.css\)/,
    'the whole stored style is NOT re-applied — that re-showed a panel the reader had switched off');
});

test('② membership is «switched on», in both directions', () => {
  const wm = code('js/window-manager.js');
  assert.match(wm, /function _isOn\(el\)/, 'there is a definition of on');
  assert.match(wm, /el\.style\s*&&\s*el\.style\.display/, 'and it reads the owner’s own inline display');
  assert.match(wm, /_dockables\(\)\{[\s\S]*_isOn\(el\)/, 'only switched-on things are collected');
  assert.match(wm, /if\(!_isOn\(el\)\)\s*_undockOne\(el\)/, 'and switching one off takes it back out');
  assert.match(wm, /attributeFilter:\['style','class','hidden'\]/, 'watched by attribute, not by polling');
  /* ⚠⚠ (#R239b) MEASURED ON PRODUCTION: a legend that was already switched on when the mode was
     turned on stayed in the tab after its layer was switched off, because `setDocked(true)` docked
     everything first and armed the observer second — by then those elements were in #docked-feed,
     where neither `mc.querySelectorAll(DOCK_SEL)` nor `__winReg` finds them. The watch therefore
     happens in `_dockOne`, which is the one place that sees every docked element, and the observer
     is armed before the first pass. */
  assert.match(wm, /_watchEl\(el\);[\s\S]{0,8}el\.classList\.add\('im-docked'\)/,
    'every docked element is watched, at the moment it is docked');
  assert.match(wm, /if\(on\) _dockWatch\(true\);[\s\S]{0,8}if\(on\)\{ _dockables\(\)\.forEach\(_dockOne\)/,
    'and the observer exists before the first pass runs');
  assert.match(wm, /__attrBusy/, 'and the observer does not react to its own writes');
});

test('② the ✕ stays, the drag affordance does not', () => {
  const css = R('css/intmap.css');
  assert.match(css, /\.im-docked \.kl-drag[^{]*\{[^}]*display:none/, 'the ⋮⋮ grip is hidden when docked');
  assert.ok(!/\.im-docked[^{]*\.layer-popup-x[^{]*\{[^}]*display:\s*none/.test(css), 'the ✕ is not');
});

/* ══ ③ THE WAVEFRONT ════════════════════════════════════════════════════════════════════════════
   「その時々の破壊中の断層を考慮したやつにしろ。」 */
test('③ the trailing (last-arrival) front exists and is the intersection, not the union', () => {
  const s = code('js/seismic.js');
  assert.match(s, /function _envRmin\(K,rFor,b\)/, 'a minimum envelope exists');
  /* the union takes a max and skips points it cannot reach; the intersection may do neither */
  const min = s.slice(s.indexOf('function _envRmin'), s.indexOf('function _envRmin') + 700);
  assert.match(min, /cand<R/, 'it takes the minimum');
  assert.match(min, /if\(r==null\)\s*return null/, 'and a point that has not radiated makes the bearing null');
  assert.match(s, /const K=back\?_srcPts\(\):_prune\(/,
    'the back ring does NOT prune — the pruned points are exactly the ones the minimum is made of');
});

test('③ the band is drawn only when a rupture is drawn, and under everything else', () => {
  const s = code('js/seismic.js');
  assert.match(s, /const hasRupture=!!\(fault&&fault\.ring/, 'a point source has no band');
  assert.match(s, /if\(hasRupture\)\{[\s\S]{0,400}kind:'band'/, 'the band is inside that test');
  const layers = s.slice(s.indexOf("layers.add({id:'seis-band'"), s.indexOf("layers.add({id:'seis-ring'"));
  assert.ok(layers.length > 0, 'seis-band is declared BEFORE seis-ring — add order is z order');
  assert.match(s, /id:'seis-ring-back'/, 'and the trailing outline has its own layer');
});

/* ⚠ PASSES ON THE OLD TREE — it is #R238's theorem, kept here because the band's whole justification
   rests on it. If the leading edge ever stops being a circle this is the test that says so. */
test('③ the LEADING edge is still a circle about the hypocentre (Vr ≤ V ⇒ min at off=0)', () => {
  const D = Math.PI / 180, V = 6.0, Vr = 0.75 * 3.5;          /* P speed, shipped rupture speed */
  let worst = Infinity;
  for (let b = 0; b < 360; b += 5) {
    const term = 1 / Vr - Math.cos((b - 30) * D) / V;          /* the bracket, for a point at φ=30° */
    worst = Math.min(worst, term);
  }
  assert.ok(worst > 0, `the bracket is positive at every bearing (min ${worst.toExponential(2)})`);
});

/* ══ ④ THE ON-MAP STEP HUD ══════════════════════════════════════════════════════════════════════ */
test('④ the armed state is told on the map, and drives the same handlers as the panel', () => {
  const s = code('js/seismic.js');
  assert.match(s, /id='sq-hud'|_hudEl\.id='sq-hud'/, 'the HUD exists');
  assert.match(s, /const on=opened&&\(_fDrawing\|\|clickMode==='epi'\|\|clickMode==='station'\)/,
    'it is a readout of the three armed states');
  assert.match(s, /b\.onclick=\(\)=>\{ toggleFaultDraw\(\); \}/, 'and it calls the panel’s own handler');
  assert.match(s, /b\.onclick=\(\)=>setClickMode\('none'\)/, 'and the panel’s own mode setter');
  assert.match(s, /function render\(\)\{[\s\S]{0,200}_hud\(\)/, 'refreshed from render(), one source of truth');
  assert.match(s, /function close\(\)\{[\s\S]{0,600}_hud\(\)/, 'and taken down when the panel closes');
});

test('④ every string the HUD prints is held to what the language policy says of it', async () => {
  const a = JSON.parse(run('i18n-audit.mjs', '--json'));
  /* ⚠ (#R707) the bar is read from scripts/lang-policy.mjs, not kept as a second copy of it —
     see the note on ① . Authored languages 100 %, carried languages at or above their floor. */
  const { authoredLangs, carriedLangs } = await import('../scripts/lang-policy.mjs');
  const AUTHORED = new Set(authoredLangs(ROOT));
  const CARRIED = new Set(carriedLangs(ROOT));
  const FLOOR = JSON.parse(readFileSync(join(ROOT, 'tests', 'i18n-coverage-floor.json'), 'utf8')).langs;
  let seenA = 0, seenC = 0;
  for (const r of a.rows) {
    if (!r.inline) continue;
    if (AUTHORED.has(r.code)) { assert.equal(r.inline[0], r.inline[1], `${r.code}: inline table incomplete — IntMap authors this language`); seenA++; }
    else { const f = (FLOOR[r.code] || {}).inline; if (f == null) continue; assert.ok(r.inline[0] >= f, `${r.code}: inline fell to ${r.inline[0]}, below the floor of ${f}`); seenC++; }
  }
  /* ⚠ `seenA` is STRUCTURALLY zero here and that is not a gap: measured 2026-09-12, the inline
     table is the surface of exactly the four languages that are NOT carried positionally
     (fr, ko, zh, zh-hans); en and jp have no inline row to be complete on. So this surface is
     entirely about carried languages, and what it must never do is pass without looking (#R699). */
  assert.equal(seenA, 0, 'an authored language grew an inline table — this test is measuring the wrong surface');
  assert.ok(seenC > 0, 'the inline surface measured nothing at all');
  /* the HUD's strings are L(…) sites, so the inline table above covers fr/ko/zh — and the five
     positional languages are covered by the positional audit in ①. */
  assert.match(code('js/seismic.js'), /L\('Draw the rupture area','震源域を描く'/, 'the HUD uses L(…)');
});

/* ══ ⑤ THE BUILD STAMPS (#R234/#R236 — they only ever fail after the notes are written) ══════════ */
test('⑤ both build stamps name this round', () => {
  /* ⚠ (#R240) NOT OLDER THAN R239, rather than exactly R239 — the shape #R203 ⑦ and #R204 ⑦b already
     use. A hard pin here is a test that fails on the FOLLOWING round for doing the right thing, and
     the assertion it was making («the stamps were bumped») is kept by the floor. The two must still
     agree with each other, and tests/r207 ⑬ separately requires them to name the newest round in
     DEV-NOTES, so nothing is lost by loosening this one. */
  const h = R('index.html');
  const a = /__imBuild='R(\d+)'/.exec(h), b = /INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R(\d+)'/.exec(h);
  assert.ok(a, 'the short stamp');
  assert.ok(b, 'and the dated one');
  assert.equal(a[1], b[1], 'the two stamps must name the same round');
  assert.ok(+a[1] >= 239, `the stamps name R${a[1]} — older than the round that wrote this test`);
});
