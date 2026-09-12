/* ============================================================================
 *  #R664 — 「スマホでズームやホバーが遅い。操作によってはブラウザが落ちる」
 *          A phone held sideways was taking the desktop budget, thirty-nine times over
 * ----------------------------------------------------------------------------
 *  #R232 established the rule: 「携帯か」 is a question about the DEVICE, and `isMobile()` — a
 *  `(max-width:768px)` media query — answers it WRONG the moment the phone is turned sideways,
 *  because an iPhone in landscape is 844 px. #R498 swept it a second time. Both swept SITES.
 *
 *  ⚠⚠⚠ AND THE CHECK THAT WAS SUPPOSED TO HOLD THE RULE COULD ONLY SEE ONE FILE.
 *  tests/r498-checks ③ is eight `assert.match` calls against the SOURCE STRING of js/app-body.js:
 *
 *      assert.match(b, /antialias:!_imPhoneClass\(\)/, 'MSAA follows the device');
 *
 *  Every one of them passes today. They passed all through #R499…#R650 as well — while thirty-nine
 *  cost decisions in eighteen OTHER files went on asking the width, because those files were never
 *  in the check's population at all. That is #R429's shape exactly (「1 ファイルに向けて書いた検査
 *  が、そのファイルだけを守っていた」) and `.agents/rules/no-ad-hoc-hardcoding.md` §3's second
 *  question — 「この規則は、次に同じ経路を通る新しいコードにも効くか」 — answered 「いいえ」 for
 *  three rounds running.
 *
 *  What a landscape iPhone was taking, all at once, measured from the source in that state:
 *      · NO memory-pressure guard at all              (js/label-occlusion.js — the guard's own gate)
 *      · Köppen highlight canvas 16 MB → 67 MB        (js/data-layers.js)
 *      · seismic far raster 6.6 MB → 48 MB            (js/seismic.js)
 *      · tsunami solver grid ×2.8                     (js/tsunami.js)
 *      · wind particles 2,200 → 6,000                 (js/weather.js)
 *      · water solver 9,000 → 120,000 steps, 2.5 s → 6 s of main thread   (js/terrain-water.js)
 *
 *  ══ SO THIS FILE CHECKS THE FACT, NOT THE SPELLING ════════════════════════════════════════════
 *  ① and ② EVALUATE js/mem-budget.js — the arithmetic of the budget, and the rule that an unknown
 *     device is the SMALL one. Reading the source cannot tell you what a function returns (#R505).
 *  ③ is the one that would have caught all three rounds: it scans **every tracked js/ and src/
 *     file** for a number chosen by a width test, and DEFAULTS TO FAILING. A site is allowed only
 *     by appearing in `WIDTH_IS_CORRECT` with a written reason. A new cost decision added tomorrow
 *     is not in that list, so it fails — which is what "the rule holds for the next code through
 *     the path" has to mean.
 *  ④ forbids a fourth hand-written copy of the predicate. Three files had already copied it and all
 *     three dropped the clause #R499 added, so a phone with a stylus or a Bluetooth mouse read as a
 *     desktop. A predicate that is copied is a predicate that drifts.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/* the shipped module, evaluated. It attaches to whatever object it is given as `globalThis`, so a
   plain sandbox is enough — it touches no DOM, which is the property that lets the worker use it. */
function budget(pageAnswer) {
  const sandbox = {};
  if (pageAnswer !== undefined) sandbox._imPhoneClass = () => pageAnswer;
  vm.createContext(sandbox);
  vm.runInContext(R('js/mem-budget.js'), sandbox);
  return sandbox.IntMapMemBudget;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ① ONE TILE HAS ONE PRICE, AND THE FIVE STORES DIVIDE ONE BUDGET
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R664 ① the DEM budget is a budget: shares of one total, derived from what a tile costs', () => {
  const B = budget(false);

  /* the price is the decoded tile, not the PNG it arrived as */
  assert.equal(B.DEM_TILE_BYTES, 256 * 256 * 4,
    'a decoded terrarium tile is Float32Array(65536); if this moved, every ceiling below moved with it');

  /* ⚠ THE DEFECT IN ONE ASSERTION: the ceilings must differ by device. Before #R664 four of the
     five stores used the same number on both, which is what authorised ~600 MB on a phone. */
  for (const store of ['photoSearch', 'cesium', 'terrainEdit', 'readout']) {
    const phone = budget(true).demTiles(store);
    const desk = budget(false).demTiles(store);
    assert.ok(phone < desk,
      `${store} holds the same number of tiles on a phone as on a workstation — that is the #R664 defect`);
    assert.ok(phone >= B.MIN_TILES,
      `${store} is below MIN_TILES on a phone; it would thrash instead of cache`);
  }

  /* the shares are shares — they may not add up to more than the budget, or "one budget" is a story */
  const sum = Object.keys(B.SHARE).reduce((n, k) => n + B.SHARE[k], 0);
  assert.ok(sum <= 1.0000001, `the shares total ${sum} — that is not one budget divided, it is five ceilings again`);

  /* and the total actually authorised on a phone has to be inside what a phone tab survives.
     ⚠ the floor (MIN_TILES) can push it above the nominal budget; that is deliberate and bounded,
     so the assertion is against the real sum rather than against BUDGET_BYTES. */
  const held = Object.keys(B.SHARE).reduce((n, k) => n + budget(true).demTiles(k) * B.DEM_TILE_BYTES, 0);
  assert.ok(held <= 96 * 1024 * 1024,
    `a phone may hold ${(held / 1048576).toFixed(0)} MB of decoded elevation — the whole point was that it may not`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ② AN UNKNOWN DEVICE IS THE SMALL ONE — AND THE CALLER'S OLD TEST IS THE FALLBACK, NOT `true`
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R664 ② nobody who fails to answer gets the workstation ceiling', () => {
  /* a worker is created before anyone tells it anything, and `navigator.deviceMemory` is `undefined`
     on every iPhone, always — #R651's rule, and the same rule here. */
  const unknown = budget(undefined);
  assert.equal(unknown.isPhone(), true,
    'a store that nobody has told what device it is on took the DESKTOP budget — an unknown device is not a spacious one');
  assert.equal(unknown.demTiles('photoSearch'), budget(true).demTiles('photoSearch'),
    'the unknown-device ceiling is not the phone ceiling');

  /* …but `adopt` is what a worker is given, and it must win over the default */
  const told = budget(undefined); told.adopt(false);
  assert.ok(told.demTiles('photoSearch') > unknown.demTiles('photoSearch'),
    'the page told the worker it was a desktop and the worker kept the phone ceiling');

  /* ⚠ AND THE PAGE-SIDE PREDICATE FALLS BACK TO THE CALLER, NOT TO "phone". This runs during boot,
     before js/app-body.js publishes `_imPhoneClass`; answering "phone" to a desktop that merely
     asked early would shrink a workstation's budgets for no reason. Never worse than today. */
  const early = budget(undefined);
  assert.equal(early.deviceIsPhone(() => false), false,
    'deviceIsPhone ignored the caller fallback before the shell was up — that is a behaviour change, not a fix');
  assert.equal(early.deviceIsPhone(() => true), true, 'and it must honour a fallback that says phone');
  /* once the shell IS up, the real answer wins over whatever the caller used to do */
  assert.equal(budget(true).deviceIsPhone(() => false), true,
    'the shell said phone and deviceIsPhone still returned the caller old width answer');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ③ ⚠⚠⚠ THE POPULATION CHECK — every tracked file, and the default is FAIL
   ══════════════════════════════════════════════════════════════════════════════════════════════
   A number chosen by a width test is a cost decision asked the wrong question. This walks every
   tracked js/ and src/ file rather than one named file, which is the whole difference between this
   check and the one it replaces.

   ⚠ WHY AN ALLOWLIST AND NOT A HEURISTIC. A classifier that tried to decide "is this cost or
   layout?" from the text would be wrong quietly, and a check that is wrong quietly is #R488. So the
   rule is mechanical — «a width test picking between two numbers» — and the few places where the
   WIDTH IS GENUINELY THE RIGHT QUESTION are named here with the reason. Being named is cheap;
   being named silently is what this forbids, so each entry carries why. */
const WIDTH_IS_CORRECT = {
  /* js/app-body.js:145-146 records the decision: taking a zoom level away from a landscape phone
     would be a CAPABILITY change, and the answer to 「横向きで1段減らしてよいか」 was no. */
  'js/app-body.js': [/isMobile\(\)\?18:19/],
  'js/compare.js': [/isMobile\(\)\)?\?18:19/],
  /* 「世界全体がビューポートに収まるか」 really is a question about the viewport. #R7-mobile-zoom set
     the flat-map floor to 0 because at 1.4 the world was wider than a PORTRAIT phone and the map
     felt stuck; turn that phone sideways and the world does fit, so 1.2 is the right answer there.
     The width is not a proxy for the device here — it is the thing being asked about. */
  'js/map-projection.js': [/isMobile\(\)\?0:1\.2/],
  /* The water panel's own CSS: `TW_INSET` is the column's left edge in px, and it sits in a run of
     font sizes, row heights and paddings that all ask `_mob()` for the same reason. How wide the
     VIEWPORT is genuinely decides these — a desktop window dragged narrow wants the bigger touch
     targets too, and a landscape phone with room for the wider layout should get it. #R664 split
     this file's predicate in two precisely so that the cost sites could move to the device while
     these stayed: `_mob()` is now layout-only here. */
  'js/terrain-water.js': [/_mob\(\)\?12:10/],
};

function trackedSources() {
  const out = execFileSync('git', ['ls-files', 'js/*.js', 'src/*.js'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

test('R664 ③ no cost decision anywhere picks its number from a width — the whole tree, not one file', () => {
  const NUM = '-?[\\d_]+(?:\\.\\d+)?(?:e[+-]?\\d+)?';
  /* the width oracles themselves, named directly */
  const DIRECT = new RegExp(`(?:isMobile\\(\\)|\\(max-width:\\s*\\d+px\\)[^?\\n]{0,80})\\s*\\)?\\s*\\?\\s*${NUM}\\s*:\\s*${NUM}`, 'gi');

  /* ⚠⚠ AND THE ALIASES, WHICH ARE HOW EVERY ONE OF THE THIRTY-NINE ACTUALLY HID.
     Almost none of them wrote `isMobile()?110:420`. They wrote

         const _mob = (typeof isMobile==='function' && isMobile());
         …
         const budget = _mob ? 110 : 420;

     — and a check that only knew the oracle's own spelling saw nothing, which is the same way the
     spelling-based check this file replaces saw nothing. So the local name is RESOLVED first: any
     identifier in this file whose declaration mentions a width oracle is itself a width oracle, and
     a number chosen by it is a number chosen by a width.

     ⚠ AND DELEGATION IS THE SANCTIONED FORM, so it is not an offence. After the fix these predicates
     read `deviceIsPhone(oldTest)` — the owner's answer, with the caller's previous test kept only as
     the fallback for the moment before js/app-body.js has published `_imPhoneClass`. The old test is
     therefore still spelled in the declaration, and a check that looked only for that spelling would
     now flag every CORRECTED site. What makes a name a width oracle is that it decides by width;
     one that hands the decision to the owner does not, however it spells its fallback. */
  const aliasNames = (code) => {
    const names = new Set();
    /* ⚠ THE WINDOW SPANS LINES ON PURPOSE. Every delegating predicate in this tree is written as a
       small multi-line arrow — the old test preserved as `own()` on the first line, the handover to
       the owner on the second — so a window that stopped at the newline saw only the fallback and
       called the CORRECTED site an offence. Read a few hundred characters of the declaration body
       instead, newlines included, and ask whether the decision is handed over anywhere in it. */
    const decl = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
    for (let m; (m = decl.exec(code));) {
      /* ⚠ AND THE WINDOW STOPS AT THE NEXT DECLARATION. Otherwise it bleeds into whatever is
         defined below — and since the fix put a delegating `_phoneDev` helper next to several of
         these, a window that ran on would read that neighbour's `deviceIsPhone` and clear the name
         above it. That is a check reporting "no offence" because of a line it was not looking at,
         which is the failure mode this whole file exists to stop. */
      let body = code.slice(m.index, m.index + 400);
      const next = body.slice(1).search(/\n\s*(?:const|let|var|function)\s/);
      if (next > -1) body = body.slice(0, next + 1);
      /* a predicate that IS the device question — `_imPhoneClass` and its kin name the pointer —
         is the answer, not an offence; it keeps a width test only as its own last-resort catch. */
      if (/deviceIsPhone|pointer:\s*coarse/.test(body)) continue;
      if (/isMobile\s*\(|\(max-width:\s*\d+px\)/i.test(body)) names.add(m[1]);
    }
    return names;
  };

  const offenders = [];
  for (const rel of trackedSources()) {
    /* ⚠ read through codeOnly so this file's own prose — and every explanatory comment the fix
       added — can never be what the check matches (#R345). */
    const code = codeOnly(R(rel));
    const allowed = WIDTH_IS_CORRECT[rel] || [];
    const hits = [...(code.match(DIRECT) || [])];
    for (const name of aliasNames(code)) {
      const viaAlias = new RegExp(`\\b${name}\\b\\s*\\(?\\)?\\s*\\?\\s*${NUM}\\s*:\\s*${NUM}`, 'g');
      hits.push(...(code.match(viaAlias) || []));
    }
    for (const hit of hits) {
      if (allowed.some((re) => re.test(hit))) continue;
      offenders.push(`${rel}  ${hit.replace(/\s+/g, ' ').slice(0, 110)}`);
    }
  }

  assert.deepEqual(offenders, [],
    'a budget is being chosen by a media query, so a phone held sideways takes the desktop number.\n'
    + '「携帯か」 asks the DEVICE: window.IntMapMemBudget.deviceIsPhone(isMobile).\n'
    + 'If the width really is the right question here, add it to WIDTH_IS_CORRECT above WITH THE REASON.\n'
    + offenders.join('\n'));
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ④ THE PREDICATE HAS ONE OWNER — A COPY IS A COPY THAT WILL DRIFT
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R664 ④ nobody re-derives the device predicate; three copies had already lost a clause', () => {
  /* the canonical predicate is (pointer:coarse) AND NOT (any-pointer:fine) OR screen short side ≤500.
     js/dem-source.js, js/precip-annual.js and js/vs30-mask.js each carried the first two clauses and
     not the third (#R499's), so a phone with a stylus or a paired mouse read as a workstation and
     took the workstation's download and tile budgets. */
  const OWNERS = new Set(['js/app-body.js', 'js/mem-budget.js', 'js/geo-engine.js']);
  const copies = [];
  for (const rel of trackedSources()) {
    if (OWNERS.has(rel)) continue;
    const code = codeOnly(R(rel));
    /* ⚠ A FILE THAT DELEGATES IS NOT A COPY. The three that were copies now read
       `deviceIsPhone(own)`, keeping their old two-clause test ONLY as the fallback for the moment
       before js/app-body.js has published the real predicate — which is what makes the change
       strictly an improvement rather than a behaviour change. The owner is imported on the first
       line of src/main.js, so in practice that fallback is not reached; it is kept because "never
       worse than today" is cheaper to guarantee than load-order reasoning.
       What must never come back is a file that DECIDES by its own copy. */
    if (/deviceIsPhone/.test(code)) continue;
    if (/any-pointer:\s*fine/i.test(code) && /pointer:\s*coarse/i.test(code)) copies.push(rel);
  }
  assert.deepEqual(copies, [],
    'the device predicate has been re-derived outside its owner. Every previous copy dropped a clause.\n'
    + 'Ask window.IntMapMemBudget.deviceIsPhone(...) instead.\n' + copies.join('\n'));

  /* …and the owner still has all three clauses, so delegating to it is worth something */
  const b = CODE('js/app-body.js');
  assert.match(b, /pointer:coarse/, 'the canonical predicate lost its pointer clause');
  assert.match(b, /any-pointer:fine/, 'the canonical predicate lost its fine-pointer clause');
  assert.match(b, /m>0&&m<=500/, "the canonical predicate lost #R499's screen-size clause");
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ THE GUARD THAT EXISTS TO SAVE THE TAB IS INSTALLED ON THE DEVICE IT EXISTS FOR
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R664 ⑤ the memory-pressure guard asks the device, and reaches the stores by enrolment', () => {
  const lo = CODE('js/label-occlusion.js');
  assert.match(lo, /_imPhoneClass/,
    'the memory-pressure guard still gates on the width — a landscape iPhone installs no guard at all');
  assert.match(lo, /IntMapMemBudget\s*&&\s*window\.IntMapMemBudget\.relieve\(\)|IntMapMemBudget\.relieve\(\)/,
    'pressure no longer reaches the enrolled stores');
  assert.match(lo, /IntMapMemBudget\.adopt\(/,
    'the page never tells the budget what device this is, so the worker keeps guessing');

  /* ⚠ enrolment, not a list of names: a store added tomorrow has to be told without anybody
     remembering to add a listener. Each of these enrols itself where it is defined. */
  for (const [file, name] of [['js/cesium-layers.js', 'cesium'], ['js/terrain-water.js', 'terrainEdit'],
    ['src/photo-geo-worker-client.js', 'photoSearch.page']]) {
    /* A store may be owned by more than one view; each instance needs its own suffix. */
    assert.match(codeOnly(R(file)), new RegExp(`register\\('${name.replace('.', '\\.')}(?::[^']*)?'`),
      `${file} does not enrol with the budget, so memory pressure cannot reach it`);
  }

  /* the registry actually dispatches — evaluated, not read */
  const B = budget(true);
  let freed = 0;
  B.register('probe', { bytes: () => 1024, release: () => { freed++; } });
  assert.equal(B.heldBytes(), 1024, 'the ledger does not add up what its stores report');
  assert.equal(B.relieve(), 1, 'relieve() did not reach the enrolled store');
  assert.equal(freed, 1, 'relieve() reported a store it did not actually call');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ THE CHEAP ANSWER IS ASKED FIRST — a 200,000-node walk in front of one `===`
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R664 ⑥ skipData consults the revision before it walks the payload', () => {
  const g = CODE('js/geo-command-log.js');
  const fn = g.slice(g.indexOf('function skipData('));
  const revAt = fn.indexOf('opts.revision');
  const walkAt = fn.indexOf('_sourceHolds');
  assert.ok(revAt > -1 && walkAt > -1, 'skipData no longer has both tests — read the header before changing this');
  assert.ok(revAt < walkAt,
    'the 200,000-node comparison is still performed in front of the O(1) revision test, on the source-update path');
  /* ⚠ and the walk must still happen when there IS no revision, or commands would be applied that
     used to be skipped — the order is the only thing #R664 changed. */
  assert.match(fn, /if\s*\(!rev\s*\|\|\s*CMD\.on\)/,
    'the payload walk is now conditional on something other than «no revision, or the census is on» — '
    + 'that changes WHAT is skipped, and #R664 changed only WHEN it is asked');
});
