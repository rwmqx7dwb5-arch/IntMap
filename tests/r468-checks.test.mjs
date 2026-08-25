/* ============================================================================
 *  IntMap · #R468 — source-level checks
 * ----------------------------------------------------------------------------
 *  One message, eight requests:
 *    ①「基本表示の『タイムゾーン（現在時刻）』レイヤーは、基本表示ではなく普通のレイヤーにして。」
 *    ②「もとは基本表示があった場所をデフォルト/クリーン/カスタムとして、カスタムを選択すれば今の
 *        基本表示の一覧が出てくるように。…複数選択ではないです。どれか一つ。」
 *    ③「国境・国情報レイヤーは完全削除して。」→ 読者が「レイヤー行だけ隠す」に絞った
 *    ④「以下に指定されたレイヤー以外は、『その他N件』と、各カテゴリの中で畳むようにして。
 *        また、提示した順番はカテゴリ内での新たな並び順に対応します。」
 *    ⑤「等高線レイヤーは廃止し、標高（カラー段彩）、陰影起伏（標高）、カラー段彩・陰影（ASTER）の
 *        凡例内でトグルでオンオフできるように統合。⛰ 傾斜・斜面方向レイヤーは完全削除。」
 *    ⑥「ベータからはCAPE不安定度レイヤーを気象に昇格。人口密度（国別）を昇格。」
 *    ⑦「ツールも、レイヤーカテゴリと同様に畳めるように。また、レイヤー検索欄が、ツールにも効くように。」
 *    ⑧「フロストガラス時に、『表示中のレイヤー』の背景の色が濃すぎ。」
 *
 *  ⚠ ④ AND ⑥ ARE THE SAME ARRAY, SO THEY ARE ASKED BY RUNNING IT, NOT BY GREPPING IT. `GROUPS` is
 *  extracted and evaluated, and the questions put to the VALUE — 「is 等高線 in any group」, 「is
 *  CAPE in the climate group and past its named rows」 — which is a thing no reworded comment can
 *  satisfy and no reordering can accidentally pass. [[intmap-r462-lessons]]: an instrument that
 *  reads spelling instead of value is an instrument that prints a number about itself.
 *
 *  ⚠ AND THE COUNT GUARD IN ⑦ IS THE ONE THAT WOULD HAVE GONE UNNOTICED. Nothing looks wrong when
 *  `have !== want` forever — the panel is CORRECT, it is merely rebuilt from scratch on every open,
 *  which is precisely the 「layersをクリックしたときの反応が非常に遅い」 #R72 wrote that gate for.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, named as namedOf, rest as restOf, publishedList } from './helpers/layer-groups.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* the comments here carry the reasoning and QUOTE the spellings that were replaced, so a grep over
   the raw file proves nothing — 24 rounds of exactly that ([[intmap-recurring-lessons]]) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const DL = read('js/data-layers.js');
const DLC = code('js/data-layers.js');
const MU = read('js/map-ui.js');
const MUC = code('js/map-ui.js');

/* a brace/bracket-balanced literal starting at `needle` */
function balanced(src, needle, open, close) {
  const start = src.indexOf(needle);
  assert.notEqual(start, -1, 'found ' + needle);
  const from = src.indexOf(open, start);
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (!depth) return src.slice(from, i + 1); }
  }
  throw new Error('unbalanced ' + open + ' after ' + needle);
}
/* the body of a named function declaration */
function fnBody(src, name) {
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) { const m = new RegExp('\\b' + name + '\\s*=\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>)').exec(src); if (m) start = m.index; }
  assert.notEqual(start, -1, 'a function called ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* ⚠ EVALUATED, not parsed with a regex — and through the SHARED reader, because this round is what
   proved the regexes wrong. Half a dozen checks pinned `/\['(lyrGrp\w+)',\[([^\]]*)\]\]/`, which
   requires the id list to be followed immediately by `]]`; giving each shelf a third element made
   every one of them match ZERO shelves and report 「sats is in its own group」 as false. A regex over
   a literal asks about SPELLING. tests/helpers/layer-groups.mjs asks about the value. */
const groupOf = (id) => GROUPS.find(([, ids]) => ids.indexOf(id) >= 0);
const named = ([key]) => namedOf(key);
const rest = ([key]) => restOf(key);
const listOf = publishedList;

/* ══════════════════ ① 🕒 タイムゾーンは普通のレイヤーになった ══════════════════════════════ */
test('① the time-zone overlay is a layer of a category, and is counted as one', () => {
  const basics = balanced(DLC, 'window.IntMapBasicLayers=', '[', ']');
  assert.ok(!/dl-tz/.test(basics),
    'dl-tz has left window.IntMapBasicLayers — that list is what every counter SUBTRACTS, so a row ' +
    'still named there is a layer that 「表示中のレイヤー」 refuses to count');
  const g = groupOf('tz');
  assert.ok(g, "'tz' is a row of a real category now, not of the always-on block");
  assert.equal(g[0], 'lyrGrpPolitics', 'time zones are filed under 政治・統治');
  /* ⚠ THE OTHER HALF, AND THE ONE #R271 GOT WRONG IN THE OTHER DIRECTION: a row that is neither in a
     group nor marked `placed` is MOVED by order.push into Beta. Now that tz is in a group, the
     always-on block must not also claim it. */
  const reorg = fnBody(DLC, 'reorganizeLayerPanel');
  assert.ok(!/tzRow/.test(reorg),
    'reorganizeLayerPanel no longer pushes a tz row into the basic-display block');
});

/* ══════════════════ ② 基本表示 = デフォルト / クリーン / カスタム ═══════════════════════════ */
test('② the three modes are exclusive, and the state has ONE owner', () => {
  assert.ok(/window\.IntMapBaseDisplay\s*=/.test(DLC), 'the mode has a published owner');
  const bd = balanced(DLC, 'window.IntMapBaseDisplay=', '{', '}');
  /* ⚠ EXCLUSIVITY IS A CONSEQUENCE OF STORING ONE VALUE, not of code that unticks the other two.
     「どれかをオンにしたら、それまでのやつが勝手にトグルがオフになる」 is satisfied by there being
     exactly one `mode`; a set of three booleans would need three places kept in step. */
  assert.ok(/localStorage\.setItem\(KEY,\s*m\)|put\(m\)/.test(bd), 'the mode is one stored value');
  assert.ok(/MODES\s*=\s*\['default','clean','custom'\]/.test(bd), 'and it is one of exactly three');
  /* ⚠ THE DEFAULT SET IS DERIVED. #R309 spent a round reducing four hand-written copies of this
     section's MEMBERSHIP to one list; a hand-written copy of its DEFAULTS is the same defect one
     field over, and it would go stale the first time a row's shipped state changed. */
  assert.ok(/IntMapDefaultOn/.test(bd),
    'the 「デフォルト」 state is read from window.IntMapDefaultOn, not copied into a second list');
  assert.ok(/rows\(\)/.test(bd) && /IntMapBasicLayers/.test(bd),
    'and the rows it applies to are window.IntMapBasicLayers, the one published membership');
  /* ⚠ A MODE IS A CLAIM ABOUT THE STATE. Anything may flip a base toggle — Atlas, the wind layer's
     one-shot coastline offer (#R289), a restored session — and a section headed 「デフォルト」 over a
     map that is not is the instrument lying. */
  assert.ok(/function reconcile\(/.test(bd), 'the mode demotes itself to 「カスタム」 when the state disagrees');
  assert.ok(/setTimeout\(reconcile/.test(bd),
    'and it judges the SETTLED state: a restore is a sequence of change events, and the states in ' +
    'between it are not states the reader ever chose');
  /* the view side */
  assert.ok(/function modeRows\(/.test(MUC), 'the browser draws the three rows');
  assert.ok(/IntMapBaseDisplay/.test(MUC), 'and reads the owner rather than keeping a second copy');
  const sync = fnBody(MUC, 'syncModes');
  assert.ok(/custom-open/.test(sync), 'カスタム is what reveals the eleven rows');
});

/* ══════════════════ ③ 行を隠すことと、レイヤーを消すことは別 ════════════════════════════════ */
test('③ a hidden row keeps its checkbox, and every sweep is told about it', () => {
  const hidden = listOf('IntMapHiddenLayerRows');
  assert.deepEqual(hidden, ['cb-countries', 'dl-contours'],
    'the two rows the panel stops drawing while the layers go on working');
  /* the checkbox itself must SURVIVE — Atlas's countryInfo action, _wsCountryInfo and the session
     snapshot all resolve it by id, and 「レイヤー行だけ隠す」 is what the reader narrowed ③ to */
  assert.ok(/id="cb-countries"/.test(read('index.html')), 'cb-countries is still in the registry');
  assert.ok(/'countryInfo'/.test(code('js/atlas-console.js')), "…and Atlas's door to it still exists");
  assert.ok(!/'cb-countries'/.test(balanced(DLC, 'window.IntMapBasicLayerRows=', '[', ']')),
    'but it is no longer part of 基本表示');
  /* ⚠ EVERY SWEEP THAT FILES ROWS. `order.push` MOVES an element, so a row nobody claims lands in
     Beta — MEASURED in #R271, when 🕒 タイムゾーン came out exactly there. */
  const reorg = fnBody(DLC, 'reorganizeLayerPanel');
  assert.ok(/IntMapHiddenLayerRows/.test(reorg) && /placed\.add/.test(reorg),
    'reorganizeLayerPanel marks the hidden rows `placed` so the Beta sweep cannot adopt them');
  assert.ok(/IntMapHiddenLayerRows/.test(fnBody(MUC, 'rowsFromDropdown')),
    'and the tile browser refuses to build a tile for them');
});

/* ══════════════════ ④⑥ カテゴリ内の順序と「その他N件」 ═══════════════════════════════════ */
test('④ every category names its rows first and folds the remainder', () => {
  const seen = new Map();
  for (const g of GROUPS) {
    const [key, ids, n] = g;
    assert.equal(typeof n, 'number', key + ' declares how many of its ids the reader named');
    assert.ok(n >= 0 && n <= ids.length, key + ' names between 0 and all of its ' + ids.length + ' ids');
    /* ⚠ ONE ID, ONE GROUP — `order.push` MOVES the element, so an id written twice renders only in
       the last group that claims it (#R255). The reorder in ④ is exactly the edit that risks this. */
    for (const id of ids) {
      assert.ok(!seen.has(id), "'" + id + "' is in one group only (also in " + seen.get(id) + ')');
      seen.set(id, key);
    }
  }
  /* the reader's lists, verbatim, for the categories where the order was the whole point */
  assert.deepEqual(named(groupOf('climate')),
    ['climate', 'wind', 'annprecip', 'ec-temp', 'ec-precip', 'radar', 'ec-slp', 'ec-gust', 'snow'],
    '気候・気象: ケッペン→風→年降水量→気温→降水量（予報）→降水レーダー→海面気圧→最大瞬間風速→積雪・海氷');
  assert.deepEqual(named(groupOf('dem')), ['dem', 'cpi', 'eez', 'uselect', 'eu', 'ww2'],
    '政治・統治: 民主主義指数→汚職→領海・EEZ→アメリカ大統領選挙→EU加盟国→第二次世界大戦');
  assert.deepEqual(named(groupOf('lifeexp')),
    ['lifeexp', 'wbinfmort', 'wbsuicide', 'wbsmoke', 'wbalcohol', 'wbwater'],
    '医療・衛生: 平均寿命→乳幼児死亡率→自殺率→喫煙率→一人当たり飲酒量→安全な水');
  assert.deepEqual(named(groupOf('subcables')), ['subcables'], 'IT・技術インフラ: 海底ケーブルだけ');
  assert.deepEqual(named(groupOf('plates')), ['plates', 'relief', 'sealevel'],
    '地形・標高: プレート境界→標高（カラー段彩）→海面変動');
  /* ⚠ BETA IS NOT FOLDED. The reader's category list does not name it, and every row in it would be
     behind the one 「その他N件」 line if the rule were applied there. */
  const reorg = fnBody(DLC, 'reorganizeLayerPanel');
  const betaBlock = reorg.slice(reorg.indexOf('otherRows.forEach'));
  assert.ok(/_markRest\(r,false\)/.test(betaBlock),
    'a row swept into Beta has its fold mark CLEARED — this function is idempotent, and a row that ' +
    'moved out of a group would otherwise carry a stale attribute into a section that never folds');
});

test('⑥ the two promoted rows are in their new category, past its named rows', () => {
  const cape = groupOf('ec-cape');
  assert.ok(cape && cape[0] === 'lyrGrpClimate', 'CAPE不安定度 is a climate row now');
  assert.ok(rest(cape).indexOf('ec-cape') >= 0, '…in 「その他」, as the reader wrote');
  const pop = groupOf('pop');
  assert.ok(pop && pop[0] === 'lyrGrpDemo', '人口密度（国別） is a population row now');
  assert.ok(rest(pop).indexOf('pop') >= 0, '…in 「その他」, as the reader wrote');
  /* and they must have LEFT the beta list, or the safety sweep never sees them */
  const others = balanced(DLC, 'const OTHERS_IDS=', '[', ']');
  assert.ok(!/ec-cape/.test(others), 'ec-cape is no longer routed to Beta by name');
});

/* ══════════════════ ⑤ 等高線は3つの凡例の中のトグル / 傾斜は消えた ═══════════════════════ */
test('⑤ 等高線 is a switch inside three legends, and 傾斜・斜面方向 is gone', () => {
  assert.equal(groupOf('contours'), undefined, '等高線 is no longer a row of any category');
  assert.equal(groupOf('slope'), undefined, '傾斜・斜面方向 is no longer a row of any category');
  /* ⚠ AND THE SLOPE LAYER IS ACTUALLY DELETED, not merely unfiled — 「完全削除」. A row swept out of
     GROUPS but still built would simply reappear in Beta. */
  assert.ok(!/IntMapModules\.slope\s*=/.test(code('js/sims.js')), 'the slope module is deleted');
  assert.ok(!/dl-slope/.test(code('js/sims.js')), '…and so is the checkbox it built');
  /* the contour switch: ONE builder, three legends */
  assert.ok(/const CONTOUR_HOSTS=\['relief','hillshade','gxrelief'\]/.test(DLC),
    'the three legends named by the instruction are the three that carry the switch');
  const sw = fnBody(DLC, 'ensureContourSwitch');
  assert.ok(/CONTOUR_HOSTS\.indexOf\(legendIdOf\(el\)\)</.test(sw), 'and it refuses any other legend');
  assert.ok(/getElementById\('dl-contours'\)/.test(sw),
    'the STATE is still the dl-contours checkbox — the toggle path, the opacity, the self-repair ' +
    'audit and the session snapshot are the ones that already existed');
  /* ⚠ BOTH HOOK POINTS. A legend reaches the reader through two doors — `tileLegends` re-furnishes
     every visible legend, `_registerLayerOpacity` furnishes a generic one the moment it is shown —
     and a switch wired into only one of them appears in some legends and not others. */
  const hooks = DLC.split('\n').filter((l) => /ensureLegendOpacity\(el\)/.test(l) && !/function ensureLegendOpacity/.test(l));
  assert.ok(hooks.length >= 2, 'there are still two places that furnish a shown legend');
  hooks.forEach((l) => assert.ok(/ensureContourSwitch\(el\)/.test(l),
    'each of them furnishes the contour switch too — ' + l.trim().slice(0, 90)));
  /* ⚠ THE TRAP THE INTEGRATION WOULD OTHERWISE OPEN: contours on, every host off, and no legend
     anywhere left to reach the switch in. */
  assert.ok(/function _contourHostOn\(/.test(DLC) && /if\(_contourHostOn\(\)\) return;/.test(DLC),
    '等高線 goes off with the last of its three hosts');
  assert.ok(/if\(id!=='contours'\)\{[^}]*ensureGenericLegend/.test(DLC),
    'and it no longer raises a floating legend of its own');
});

/* ══════════════════ ⑦ ツールは畳めて、検索はそこまで届く ══════════════════════════════════ */
test('⑦ the Tools section collapses, and a search still reaches into it', () => {
  const tb = fnBody(MUC, 'toolsBlock');
  /* ⚠ THE OLD HEADER LOOKED EXACTLY LIKE A CATEGORY HEADER AND DID NOTHING: a bare `.lst-sech` with
     a `:hover` rule, no chevron, no listener, no count. */
  assert.ok(/lst-chev/.test(tb), 'the header has the same chevron a category header has');
  assert.ok(/addEventListener\('click'/.test(tb), '…and it is pressable');
  assert.ok(/_secClosed\[TOOLS_SEC\]/.test(tb), '…and remembers its state the way a category does');
  assert.ok(/lst-cnt/.test(tb), '…and says how many tools are behind it');
  assert.ok(/lst-toolbody/.test(tb), 'the rows live in a body that can be hidden');
  assert.ok(/body\.appendChild\(b\)/.test(tb),
    'the rows go INTO that body — appended to the wrapper they would stay visible when it closes');
  /* ⚠ A COLLAPSIBLE SECTION IS EXACTLY WHAT TURNS A WORKING FILTER INTO A DEAD ONE: the rows would
     be narrowed correctly inside a body the reader cannot see, which reads as 「検索が効かない」. */
  const ft = fnBody(MUC, 'filterTiles');
  assert.ok(/lst-toolrow/.test(ft), 'the filter reaches the tool rows (#R291)');
  assert.ok(/tb\.style\.display=q\?'flex':''/.test(ft), '…and forces the section open while searching');
  /* the same rule for the two folds this round added */
  assert.ok(/const folded=!q&&/.test(ft),
    'a query overrides both folds — a reader who types 「道路」 is looking for that row, and ' +
    'answering 「no such layer」 because the section happens to be folded is the panel lying');
  /* ⚠ THE GATE THAT WOULD HAVE GONE UNNOTICED. The three mode rows are `.lst-tile`s with no
     `data-lid`, so a count that includes them is permanently `want + 3` and the whole grid is
     rebuilt on every open — #R72's 「反応が非常に遅い」, with a correct-looking panel. */
  const gates = MUC.split('\n').filter((l) => /\.lst-tile/.test(l) && /(rowsFromDropdown|const have=)/.test(l));
  assert.ok(gates.length >= 4, 'the cheap-open gates are still there (' + gates.length + ' found)');
  gates.forEach((l) => assert.ok(/\.lst-tile\[data-lid\]/.test(l),
    'a gate that compares the drawn tiles against rowsFromDropdown() says which tiles it means — ' + l.trim().slice(0, 90)));
  /* …and the section count badge answers 「how many layers are in this category」, not 「how many
     boxes did we draw」: the basics section is three choices and a fold button is not a layer. */
  const bt = fnBody(MUC, 'buildTiles');
  assert.ok(/lst-mode'\)\) return;/.test(bt), 'the basics section carries no count');
});

/* ══════════════════ ⑧ フロストガラス時の「表示中のレイヤー」 ═════════════════════════════ */
test('⑧ the active-layers bar wears the material of the surface it sits on', () => {
  /* MEASURED before this round, frosted + dark, same moment: the bar computed to rgb(28,28,30) —
     fully opaque — on a panel computed at rgba(28,28,30,0.85). `--panel-bg` is declared only under
     body:not(.sidebar-translucent):not(.sidebar-glass2), so in the two frosted appearances the
     fallback fired and painted the one strip of that panel the map cannot show through. */
  const rule = /body\.sidebar-translucent #layer-sidebar-r #layer-active-section,body\.sidebar-glass2 #layer-sidebar-r #layer-active-section\{([^}]*)\}/.exec(MU);
  assert.ok(rule, 'the right sidebar bar has a rule for the two frosted appearances');
  assert.ok(/background:var\(--sidebar-bg\)/.test(rule[1]),
    'and it is the panel\'s OWN material — the same token #layer-sidebar-r itself is painted with, ' +
    'so the two can no longer disagree');
  /* ⚠ #R115's ACTUAL REQUIREMENT SURVIVES: rows scrolling under a sticky bar must not read through
     it. A blur over a translucent fill hides them; dropping the fill would not. */
  assert.ok(/backdrop-filter:saturate\(var\(--glass-sat\)\) blur\(var\(--glass-blur\)\)/.test(rule[1]),
    'the bar keeps a backdrop-filter of its own');
  /* the phone has the same strip for the same reason */
  assert.ok(/body\.sidebar-translucent \.m-sheet #layer-active-section, body\.sidebar-glass2 \.m-sheet #layer-active-section\{ background:var\(--glass-fill\); \}/.test(read('css/intmap.css')),
    'and so does the sheet, with the material `.m-sheet` is painted with');
  /* Solid mode is untouched — `--panel-bg` is declared there and the base rule still wins */
  assert.ok(/#layer-sidebar-r #layer-active-section\{[^}]*background:var\(--panel-bg,var\(--card-bg\)\)/.test(MU),
    'Solid still paints the recessed --panel-bg the sidebar uses (#R252)');
});
