/* ============================================================================
 *  The Layers panel: shelves, base display, default-on rows and what the panel counts
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r469-checks.test.mjs, tests/r439-checks.test.mjs, tests/r476-checks.test.mjs, tests/r268-checks.test.mjs, tests/r254-checks.test.mjs, tests/r271-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as LM from '../js/layer-manifest.js';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { GROUPS, named as namedOf, rest as restOf, publishedList, byKey, OTHERS_IDS } from './helpers/layer-groups.mjs';
import { uiLocale, uiLocaleCodes } from './helpers/layer-locale-tables.mjs';
import { wbRows, wbRowSeries } from './helpers/wb-rows.mjs';   /* (country-analysis-unify) the World Bank rows as js/wb-layers.js builds them */
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R187) the round's header note is kept with its largest block, in tests/layer-globe-rendering-checks.test.mjs */

/* ── 4. the numbers the user named ───────────────────────────────────────────────────────────── */
test('R187 sea level: the default opacity is 60 %', () => {
  const src = read('js/data-layers.js');
  const m = /sealevel:([0-9.]+)/.exec(src);
  assert.ok(m, 'the sealevel default must be in the opacities table');
  assert.equal(+m[1], 0.60);
});
}

/* ══════════ from tests/r469-checks.test.mjs — 8 of its 8 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない（棚の中身は js/layer-manifest.js の値として評価している） */
/* ============================================================================
 *  IntMap · #R469 — source-level checks
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
/* (on the import of '../js/layer-manifest.js') */ /* (layer-manifest) the registry's facts */
/* the comments here carry the reasoning and QUOTE the spellings that were replaced, so a grep over
   the raw file proves nothing — 24 rounds of exactly that ([[intmap-recurring-lessons]]) */
const code = (p) => codeOnly(read(p));
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
test('#R469 ① the time-zone overlay is a layer of a category, and is counted as one', () => {
  const basics = listOf('IntMapBasicLayers').join(',');   /* (layer-manifest) the manifest's `base` shelf, as published */
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
test('#R469 ② the three modes are exclusive, and the state has ONE owner', () => {
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
test('#R469 ③ a hidden row keeps its checkbox, and every sweep is told about it', () => {
  const hidden = listOf('IntMapHiddenLayerRows');
  assert.deepEqual(hidden, ['cb-countries', 'dl-contours'],
    'the two rows the panel stops drawing while the layers go on working');
  /* the checkbox itself must SURVIVE — Atlas's countryInfo action, _wsCountryInfo and the session
     snapshot all resolve it by id, and 「レイヤー行だけ隠す」 is what the reader narrowed ③ to */
  /* (layer-manifest) the registry's own rows are written from js/layer-manifest.js (they were index.html markup) */
  const cc = LM.LAYERS.find((l) => l.id === 'cb-countries');
  assert.ok(cc && cc.html && /id="cb-countries"/.test(LM.rowHTML(cc)), 'cb-countries is still in the registry');
  assert.ok(/'countryInfo'/.test((code('js/atlas-console.js') + '\n' + capsSource())), "…and Atlas's door to it still exists");
  assert.ok(!listOf('IntMapBasicLayerRows').includes('cb-countries'),
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
test('#R469 ④ every category names its rows first and folds the remainder', () => {
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

test('#R469 ⑥ the two promoted rows are in their new category, past its named rows', () => {
  const cape = groupOf('ec-cape');
  assert.ok(cape && cape[0] === 'lyrGrpClimate', 'CAPE不安定度 is a climate row now');
  assert.ok(rest(cape).indexOf('ec-cape') >= 0, '…in 「その他」, as the reader wrote');
  const pop = groupOf('pop');
  assert.ok(pop && pop[0] === 'lyrGrpDemo', '人口密度（国別） is a population row now');
  assert.ok(rest(pop).indexOf('pop') >= 0, '…in 「その他」, as the reader wrote');
  /* and they must have LEFT the beta list, or the safety sweep never sees them */
  const others = LM.betaKeys().join(',');   /* (layer-manifest) the Beta list is the manifest's, as reorganizeLayerPanel reads it */
  assert.ok(!/ec-cape/.test(others), 'ec-cape is no longer routed to Beta by name');
});

/* ══════════════════ ⑤ 等高線は3つの凡例の中のトグル / 傾斜は消えた ═══════════════════════ */
test('#R469 ⑤ 等高線 is a switch inside three legends, and 傾斜・斜面方向 is gone', () => {
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
test('#R469 ⑦ the Tools section collapses, and a search still reaches into it', () => {
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
test('#R469 ⑧ the active-layers bar wears the material of the surface it sits on', () => {
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
}

/* ══════════ from tests/r439-checks.test.mjs — 1 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R439) the round's header note is kept with its largest block, in tests/layer-weather-ecmwf-checks.test.mjs */
/* (on the import of './helpers/layer-groups.mjs') */ /* (layer-manifest) the taxonomy is js/layer-manifest.js */
const DL = read('js/data-layers.js');          /* the CSS lives in a template literal — keep comments out only where it matters */
const DLC = codeOnly(DL);

/* ── ⑨ THE FOUR PROMOTED ROWS ─────────────────────────────────────────────────────────────────
   「気圧レイヤー、最大瞬間風速レイヤーは気象レイヤーに昇格」＋「降水量、露点も…気候・気象レイヤーに」.
   A row placed in a GROUP must leave the beta list, because `order.push` MOVES the element and an
   id in two lists renders only in the last one. */
test('R439 ⑨ the promoted rows are in 気候・気象 and in no other list', () => {
  /* (layer-manifest) the shelves and the Beta list are js/layer-manifest.js — read as values, in the shape the
     old slices of the GROUPS / OTHERS_IDS literals produced */
  const g = byKey.lyrGrpClimate.map((k) => "'" + k + "'").join(',');
  for (const id of ['ec-slp', 'ec-gust', 'ec-precip', 'ec-dew']) {
    assert.ok(g.includes("'" + id + "'"), id + ' is on the 気候・気象 shelf');
  }
  const others = OTHERS_IDS.map((k) => "'" + k + "'").join(',');
  for (const id of ['ec-slp', 'ec-gust', 'ec-precip', 'ec-dew', 'ec-isobars']) {
    assert.ok(!others.includes("'" + id + "'"), id + ' is not also in the beta list');
  }
  /* the two rows the instruction did NOT name stay where they were — 再編 is not a licence (#R273) */
  /* ⚠⚠ (#R469) 「ベータからはCAPE不安定度レイヤーを気象に昇格。」 #R439 asserted that `ec-wind` and
     `ec-cape` stay in Beta because the reader had not NAMED them — the #R273 rule that a
     reorganisation is not a licence to overturn a beta judgement of the reader's. That rule is
     untouched; its PREMISE changed, because `ec-cape` has now been named. `ec-wind` still has not,
     and is still asserted to be where it was. */
  assert.ok(others.includes("'ec-wind'"),
    'the row nobody asked to promote is untouched — ec-wind was not named, then or now');
  /* and no group anywhere still names the retired id */
  assert.ok(!/'ec-isobars'/.test(DLC), 'the Layers panel knows nothing about the retired row');
  assert.ok(!LM.layerFor('ec-isobars') && !LM.layerFor('dl-ec-isobars'), '…and neither does the manifest (layer-manifest)');
});
}

/* ══════════ from tests/r476-checks.test.mjs — 4 of its 4 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない・js/session-tabs.js も DOM に閉じている。文書は 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である */
/* ============================================================================
 *  IntMap · R476 — 「Coastlines & shoresはデフォルトでオンにして」
 * ----------------------------------------------------------------------------
 *  The coastline row (`cb-coast` → js/coast-line.js) shipped OFF since #R289 and was offered once
 *  by the wind/temperature layers. It now ships ON.
 *
 *  ══ ⚠⚠⚠ «DEFAULT ON» IS TWO EDITS AND ONLY ONE OF THEM HAD A GATE ═══════════════════════════
 *  A row is default-on when BOTH of these are true, and neither implies the other:
 *
 *      index.html            the <input> carries `checked`
 *      js/data-layers.js     the id is in window.IntMapDefaultOn
 *
 *  Half the edit is silent in both directions, which is the whole reason this file exists:
 *
 *    · `checked` WITHOUT the id — the layer paints (js/app-body.js dispatches `change` for boxes
 *      that are already ticked), but IntMapBaseDisplay.matches() compares the live ticks against
 *      defOn(), disagrees, and 400 ms after every single boot demotes 基本表示 from 「デフォルト」
 *      to 「カスタム」 (#R469). Nothing errors. The panel just quietly stops claiming a mode.
 *    · the id WITHOUT `checked` — js/app-body.js's boot dispatcher only fires `change` on boxes it
 *      finds ticked, so the box stays clear and the layer paints nothing: #R34's defect exactly.
 *      Worse, js/session-tabs.js's off-sweep then reads the id as default-on and actively unticks
 *      it on every restore.
 *
 *  tests/r225-checks ⑤ already walked list → markup. NOTHING walked markup → list, so a `checked`
 *  added to index.html alone was invisible to the suite. ① below closes the loop in both
 *  directions, and derives BOTH sides — no hand-written copy of the membership lives in this file,
 *  because a copy is the shape #R309 spent a round deleting from the product.
 *
 *  ══ ⚠ WHAT THIS ROUND DELIBERATELY DID NOT DO ══════════════════════════════════════════════════
 *  It reaches FIRST-TIME readers only. Every saved session predates the change, so `cb-coast` is
 *  absent from it, and js/session-tabs.js:143 reads an absent default-on id as 「the reader
 *  switched it off」 (#R186/#R225) and switches it back off. Healing that is a `defv` generation
 *  bump (#R189/#R190) and was not asked for. ③ therefore pins the off-sweep's rule intact — the
 *  wrong way to widen the reach would be to weaken it, which would make every deliberate opt-out
 *  unkeepable across a reload.
 * ==========================================================================*/
/* (on the import of '../js/layer-manifest.js') */ /* (layer-manifest) the rows and their tick are the manifest's */

/* ⚠ (layer-manifest) THE TWO EDITS ARE ONE FIELD NOW. index.html's rows are written from js/layer-manifest.js
   (js/layer-rows.js), and window.IntMapDefaultOn is published from the same manifest — the `on` of a
   row both ticks the generated box and names the id. Both sides below are still DERIVED from what
   ships (the generated markup, the published list), so the loops keep proving the equality rather than
   assuming it: a future change that ticks a box some other way still turns them red. */
const shippedMarkup = () => LM.htmlRows().map((l) => LM.rowHTML(l)).join('\n');

/* the ids window.IntMapDefaultOn names for the markup rows (its thematic half — dl-* rows that no
   markup ships checked — is not part of this comparison) */
function declaredDefaultOn() {
  const all = publishedList('IntMapDefaultOn');
  const thematic = publishedList('IntMapDefaultLayers');
  return all.filter((id) => thematic.indexOf(id) < 0);
}

/* every base-display checkbox the markup ships, and whether it carries `checked` */
function shippedCheckboxes(html) {
  const out = new Map();
  for (const m of html.matchAll(/id="(cb-[a-z0-9]+)"([^>]*)>/g)) out.set(m[1], /\bchecked\b/.test(m[2]));
  return out;
}

/* ── ① THE TICK AND THE LIST AGREE, IN BOTH DIRECTIONS ────────────────────────────────────────── */
test('R476 ① every cb-* that ships checked is in IntMapDefaultOn, and vice versa', () => {
  const declared = declaredDefaultOn();
  const shipped = shippedCheckboxes(shippedMarkup());

  assert.ok(shipped.size >= 10, `index.html should ship the base-display rows, found ${shipped.size}`);
  /* ⚠ (#R719) THIS FLOOR IS A «THE REGEX MATCHED SOMETHING» GUARD, NOT A POLICY. It was written as
     `>= 8` when eight ids happened to be default-on, so the reader's first request to switch one
     OFF (「Coastlines & shoresはdefault base map & labelsから除外」) failed a test that was never
     about how many there are — the two loops below are. Stated as what it means, it cannot fail
     for a lawful change again, and it still catches an empty or malformed array literal. */
  assert.ok(declared.length > 0, `IntMapDefaultOn should name the base half, found ${declared.length}`);

  /* list → markup: an id in the default-on list that the markup does not tick paints nothing */
  for (const id of declared) {
    assert.ok(shipped.has(id), `IntMapDefaultOn names ${id}, which index.html does not ship at all`);
    assert.equal(shipped.get(id), true,
      `${id} is in IntMapDefaultOn but index.html ships it UNCHECKED — js/app-body.js only dispatches ` +
      `change for ticked boxes (#R34), so the layer would never paint and the restore would untick it`);
  }
  /* markup → list: a tick with no id demotes 基本表示 to 「カスタム」 400 ms after every boot */
  for (const [id, checked] of shipped) {
    if (!checked) continue;
    assert.ok(declared.includes(id),
      `index.html ships ${id} checked but IntMapDefaultOn does not name it — IntMapBaseDisplay.matches() ` +
      `would disagree with the live state and drop 基本表示 to 「カスタム」 on every load (#R469)`);
  }
});

/* ── ② THE COASTLINE IS OFF BY DEFAULT, ON BOTH SIDES, AND IS STILL A VIEW RATHER THAN A LAYER ──
   ⚠ (#R719) THE VERDICT HERE IS REVERSED FROM #R476'S AND THE INVARIANT IS NOT. The reader asked
   for 「Coastlines & shoresはdefault base map & labelsから除外」, so the row is no longer ticked —
   but the thing this test was written to hold is the EQUALITY of the two sides, which is silent in
   both directions (§ the header above). Turning it off is still one edit in two files, and the row
   itself is untouched: it stays in 基本表示, keeps its handler, its legend and its session entry. */
test('R476 ② cb-coast ships off, on both sides, and stays inside 基本表示', () => {
  const dl = read('js/data-layers.js');
  const html = shippedMarkup();

  assert.match(html, /<input type="checkbox" id="cb-coast">/, 'the row ships unchecked');
  assert.ok(!declaredDefaultOn().includes('cb-coast'), 'and the id is NOT in window.IntMapDefaultOn');

  /* ⚠ it must NOT start being counted as an overlay. js/data-layers.js's chip counter and
     js/widget-core.js's 「N layers on」 card both skip window.IntMapBasicLayers (#R309/#R233), and
     cb-coast has been a member since #R289 — being default-on must not move it out. */
  assert.ok(publishedList('IntMapBasicLayerRows').includes('cb-coast'),
    'cb-coast stays in the 基本表示 membership, so switching it on adds no chip and no FAB accent');
  assert.match(dl, /const skip=new Set\(window\.IntMapBasicLayers\);/,
    'and the chip counter still derives its skip set from that one list');
});

/* ── ③ THE OFF-SWEEP'S RULE IS UNTOUCHED ──────────────────────────────────────────────────────── */
test('R476 ③ an absent default-on id still means the reader switched it off', () => {
  const st = read('js/session-tabs.js');
  assert.match(st, /const defOff=\(window\.IntMapDefaultOn\|\|window\.IntMapDefaultLayers\|\|\[\]\)\.filter\(id=>want\.indexOf\(id\)<0\);/,
    'the restore still switches OFF every default-on id the saved session omits (#R186/#R225) — ' +
    'reaching existing readers is a defv bump (#R189/#R190), never a weakening of this rule');
  /* and the wind/temperature offer survives as the one path back for those sessions */
  assert.match(read('js/coast-line.js'), /if \(!c \|\| c\.__windAuto\) return false;/,
    'window._imCoastAuto is still a spent-once latch, not a coupling (#R85/#R289)');
});

/* ── ④ THE DOCUMENTS DO NOT STILL SAY «OFF» ───────────────────────────────────────────────────── */
test('R476 ④ docs/MAP-LAYERS.md and PRODUCT.md state the new default', () => {
  const ml = read('docs/MAP-LAYERS.md');
  /* ⚠ (#R719) the default moved back to OFF, so this states THAT — and it is still the same
     question: do the two documents that describe the row agree with the two files that set it? */
  assert.ok(!/既定は ON/.test(ml.slice(ml.indexOf('cb-coast'), ml.indexOf('cb-coast') + 1400)),
    'docs/MAP-LAYERS.md (the layer spec, per docs/README.md) must not still call the coastline 既定 ON');
  assert.match(ml, /海岸線[\s\S]{0,1400}?既定は OFF/, 'it states the current default where it states the layer');
  const pr = read('PRODUCT.md');
  const at = pr.indexOf('**海岸線・湖岸線**');
  assert.ok(at > 0, 'PRODUCT.md lists the coastline');
  assert.ok(!/既定でオン/.test(pr.slice(at, at + 400)),
    'PRODUCT.md must not still call the coastline on by default');
  assert.ok(!/1回だけ既定でオンになる/.test(pr.slice(at, at + 400)),
    'PRODUCT.md must not still describe the wind layer as what turns the coastline on');
});
}

/* ══════════ from tests/r268-checks.test.mjs — 1 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R268) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

/* ── ⑩ the layer taxonomy ──────────────────────────────────────────────────────────────────── */
test('R268 ⑩ the four moved rows are on their new shelf, and no id is on two', () => {
  const s = read('js/data-layers.js');
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  const groups = byKey;
  assert.ok(Object.keys(groups).length > 10, 'the taxonomy must parse');
  assert.ok(groups.lyrGrpAgri.includes('wbagri'), '農地率 belongs with agriculture');
  assert.ok(groups.lyrGrpAgri.includes('gxsoil'), '土壌水分 belongs with agriculture');
  /* ⚠ (#R271) 森林面積率 IS land cover, and that is now a shelf of its own. #R268 moved it OUT of
     Climate on the argument that it is a land-cover share; #R271 gave land cover its own heading
     (`lyrGrpNature`: 土地被覆・エコリージョン・植生指数・森林面積率) because 「地形・標高」 is about
     the SHAPE of the ground. The property #R268 asserted — that it is filed with land cover and not
     with CO₂ — is unchanged. */
  assert.ok(groups.lyrGrpNature.includes('wbforest'), '森林面積率 is land cover');
  assert.ok(groups.lyrGrpClimate.includes('wbpm25'), 'PM2.5 belongs with the air-composition rasters');
  assert.ok(!groups.lyrGrpTerrain.includes('wbagri') && !groups.lyrGrpTerrain.includes('gxsoil'), 'and they left Terrain');
  assert.ok(!groups.lyrGrpClimate.includes('wbforest'), '…and forest left Climate');
  assert.ok(!groups.lyrGrpHealth.includes('wbpm25'), '…and PM2.5 left Health');
  /* ⚠ `order.push` MOVES the row, so an id in two groups renders only in the last one */
  const seen = new Map();
  for (const [g, ids] of Object.entries(groups)) for (const id of ids) {
    assert.ok(!seen.has(id), `${id} is in both ${seen.get(id)} and ${g}`);
    seen.set(id, g);
  }
});
}

/* ══════════ from tests/r254-checks.test.mjs — 1 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R254) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
/* (on the import of '../js/layer-manifest.js') */ /* (layer-manifest) which layers exist, and their facts */

/* ── ⑦ THE TAXONOMY ──────────────────────────────────────────────────────────────────────────── */
test('#R254 ⑦ Others is a real category, Beta means beta, and energy mix is promoted', () => {
  const dl = code(read('js/data-layers.js'));
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  assert.ok(byKey.lyrGrpOthersReal, 'the Others group is gone');
  const ids = byKey.lyrGrpOthersReal;
  /* ⚠ (#R255) THIS WAS `assert.equal(ids.length, 61)`, AND THAT MADE THE NEXT INSTRUCTION LOOK LIKE
     A REGRESSION — the same trap #R254 itself removed from tests/r233 ⑤. 「政治、軍事、医療・衛生、
     IT・テックレイヤーカテゴリを追加し、レイヤーの再編や追加を行うように」 moved twenty-eight of the
     sixty-one World-Bank rows out of «Others» and into the four new categories, which is exactly
     what «Others» is for: the indicators that have no better shelf. So the assertion is now the
     PROPERTY #R254 was really asserting — Others holds World-Bank indicator rows and only those —
     plus a floor, so the group cannot be quietly emptied out. */
  /* ⚠⚠ (#R261) …AND THE FLOOR HAD TO GO, FOR THE SECOND TIME, FOR THE SAME REASON. #R255 already
     replaced «exactly 61» with «at least 25» after an instruction legitimately moved rows out; this
     round 「Others, Betaも含め既存レイヤーの再編」 named that shelf and moved ALL of them into named
     families (経済・貿易 / 社会・教育 / エネルギー・資源 / 気候 / 農業・食料). A count floor on a shelf
     whose whole purpose is «what is left over» will keep turning the next instruction into a red
     test — the thing worth asserting is not how full it is, it is that NOTHING WAS LOST.
     So: every id #R254 listed is still somewhere in GROUPS, and Others still holds only World-Bank
     rows if it holds any. */
  assert.ok(ids.every(i => /^wb/.test(i)), 'Others holds something that is not a World-Bank indicator row');
  const R254_OTHERS = ['wburb','wbelec','wbrenew','wbinfl','wbgdpgrow','wblit','wbpov','wbgini','wbtrade',
    'wbtax','wbschool','wbelecuse','wbrenelec','wbfdi','wbunemp','wbdebt','wbmanuf','wbpopgrow','wbenergy',
    'wbtour','wbref','wbflfp','wbtert','wbrural','wbgni','wbaging','wbremit',
    /* ⚠ (#R289) 'wbco2t' IS GONE FROM THIS LIST FOR THE SAME REASON 'wburban'/'wbtourism' ARE:
       「1人当たりCO₂排出レイヤーとCO₂排出量（百万t）レイヤーは一つに統合し」. The two rows are one row
       with a mode switch, so the QUANTITY is still on a shelf and it is the second ROW that left.
       The check below proves the merge (both indicators, declared once, inside one entry). */
    /* ⚠ (#R266) 'wburban' and 'wbtourism' ARE GONE, BY INSTRUCTION, AND THAT IS NOT A LOSS.
       They were byte-for-byte the same World-Bank indicators as 'wburb' (SP.URB.TOTL.IN.ZS)
       and 'wbtour' (ST.INT.ARVL) with a different colour ramp — 「都市人口率と都市人口比率 %
       は何が違うか」 was the report, and the answer was «nothing». The survivors keep the
       clearer name and the better ramp, so the QUANTITY is still on a shelf; it is the second
       copy that left. The check below proves the merge rather than the removal. */
    'wbdensity','wbedu','wbagremp'];
  /* (layer-manifest) the taxonomy is js/layer-manifest.js — asked as a value through the shared reader */
  const groups = Object.values(byKey).flat().map((k) => "'" + k + "'").join(',');
  R254_OTHERS.forEach(k => assert.ok(groups.includes("'" + k + "'"),
    k + ' left Others and is on NO shelf — #R254 listed it and nothing may be lost'));
  const wb = read('js/wb-layers.js');
  ['wburban', 'wbtourism'].forEach(k => assert.ok(!wb.includes("{id:'" + k + "'"),
    k + ' came back — it is an exact duplicate of another row and was merged away in #R266'));
  /* (country-analysis-unify) EVALUATED: what each row paints is its indicator in js/wb-indicators.js, joined by the
     shipped `_wbInd` (tests/helpers/wb-rows.mjs) — the series are no longer written in js/wb-layers.js at all */
  const rows = wbRows(), series = wbRowSeries(), painted = series.flatMap((r) => [].concat(r.code));
  ['SP.URB.TOTL.IN.ZS', 'ST.INT.ARVL'].forEach((ind) => {
    const n = painted.filter((c) => c === ind).length;
    assert.equal(n, 1, ind + ' is declared by exactly one layer — that is what «merged» means');
  });
  /* (#R289) the CO₂ merge, stated the same way: both indicators are painted exactly once, and both
     live inside ONE entry — the second half is what makes it a merge rather than a deletion. */
  const CO2 = ['EN.GHG.CO2.MT.CE.AR5', 'EN.GHG.CO2.PC.CE.AR5'];
  CO2.forEach((ind) => assert.equal(painted.filter((c) => c === ind).length, 1, ind + ' must be declared exactly once'));
  const co2 = rows.find((r) => r.id === 'wbco2');
  assert.ok(co2 && co2.modes, 'the CO2 row must be the modal entry');
  CO2.forEach((ind) => assert.ok(co2.modes.some((m) => m.code === ind), ind + ' is not inside the merged CO2 entry'));
  assert.ok(!rows.some((r) => r.id === 'wbco2t'), 'the separate total-CO2 row came back');
  /* the two indicators the World Bank retired: the API answers «not found» for these, which is
     what 「難民受入数レイヤーはデータを取得できませんでした」 was */
  ['SM.POP.REFG', 'SH.STA.OWAD.ZS'].forEach(id => assert.ok(!painted.includes(id),
    id + ' is archived by the World Bank — a layer pointing at it can only ever fail'));
  /* the World-Bank rows that are NOT in Others are the ones filed in a real group */
  ['wbco2', 'wbforest', 'wbagri', 'wbhealth', 'wbnet', 'wbmilgdp', 'wbwomparl']
    .forEach(k => assert.ok(!ids.includes(k), `${k} is filed in a real group already and must not be duplicated into Others`));

  /* ⚠ (#R271) 「エネルギー構成レイヤーは昇格」 is about the row LEAVING Beta, which is what this
     asserts. The shelf it landed on was this file's choice at the time (there was no energy shelf
     until #R258 built one); #R271's reorganisation moved it there, so the assertion is «promoted,
     onto a curated shelf», not «on the shelf #R254 happened to pick». */
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  const grp = byKey;
  const energyShelf = Object.keys(grp).filter((g) => grp[g].includes('energy'));
  assert.equal(energyShelf.length, 1, 'the energy-mix row must be on exactly one shelf');
  assert.ok(!/Others|Beta/i.test(energyShelf[0]),
    'the energy-mix row is not promoted out of Beta — it is on ' + energyShelf[0]);
  /* (layer-manifest) rowFor resolves a short name through the checkbox id the manifest names (no prefix table) */
  assert.ok(/^wp-dl-/.test(LM.layerFor('energy').id), 'rowFor cannot find a world-packs row, so the promotion resolves to nothing');

  /* every language says «beta» without «others», and every language has the new group */
  /* (consolidation) EVALUATED: every table js/locales/ holds, as IntMapLang.define receives it —
     a key-shaped spelling in a comment or in the wrong block no longer answers for the label */
  const LOCALES = uiLocaleCodes();
  assert.ok(LOCALES.length >= 9, 'all nine UI tables are found (' + LOCALES.join(',') + ')');
  LOCALES.forEach(c => {
    const t = uiLocale(c).ui;
    assert.ok(typeof t.lyrGrpOthersReal === 'string' && t.lyrGrpOthersReal.length > 0, `ui.${c}.js has no label for the new Others group`);
    const beta = t.lyrGrpOthers;
    assert.ok(typeof beta === 'string' && beta.length > 0, `ui.${c}.js lost lyrGrpOthers`);
    assert.ok(!/other|weitere|autres|otras|прочее|기타|その他|其他/i.test(beta),
      `ui.${c}.js still calls the beta group «${beta}» — the instruction is that it is simply «beta»`);
  });
});
}

/* ══════════ from tests/r271-checks.test.mjs — 3 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R271) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */

/* ── ⑦ the taxonomy ─────────────────────────────────────────────────────────────────────────── */
test('R271 ⑦ every layer id is in exactly one group, and the moved rows are where they were sent', () => {
  const s = read('js/data-layers.js');
  /* ⚠ (#R469) THE OLD PARSE WAS A REGEX AND IT DIED THE DAY THE TUPLE GREW A THIRD ELEMENT.
     `/\['(lyrGrp\w+)',\[([^\]]*)\]\]/` needs the id list to be followed immediately by `]]`;
     #R469 gave every shelf a count of the rows the reader named, and the pattern matched NOTHING —
     so this check reported 「the panel has more than a handful of shelves」 about a panel with
     eighteen of them. A regex over a literal asks about spelling. The shared reader evaluates the
     literal and answers about the value, which is the question every assertion below is asking. */
  const groups = byKey;
  assert.ok(Object.keys(groups).length >= 15, 'the panel has more than a handful of shelves');
  /* ⚠ an id in two groups renders only in the last one — `order.push` MOVES the element (#R255) */
  const seen = new Map();
  for (const [name, ids] of Object.entries(groups)) {
    for (const id of ids) {
      assert.ok(!seen.has(id), 'layer "' + id + '" is in both ' + seen.get(id) + ' and ' + name);
      seen.set(id, name);
    }
  }
  const where = (id) => seen.get(id);
  assert.equal(where('dem'), 'lyrGrpPolitics', 'the Democracy Index belongs with governance');
  assert.equal(where('cpi'), 'lyrGrpPolitics', 'so does the corruption index');
  assert.equal(where('lifeexp'), 'lyrGrpHealth', 'life expectancy belongs with health');
  assert.equal(where('energy'), 'lyrGrpEnergy', 'the energy mix belongs on the energy shelf');
  assert.equal(where('aurora'), 'lyrGrpOrbit', 'an aurora forecast is space weather');
  assert.equal(where('nightsat'), 'lyrGrpDemo', 'night lights show where people are');
  /* ⚠⚠ (#R273) 「レイヤーのカテゴリ分類があきらかに不適切なレイヤーが大量にある。大規模に…再編しろ。」
     — asked whether the hand-written lists were included, the answer was 「全部動かしてよい」. One
     rule for all 167 rows: a layer belongs to the SUBJECT IT MEASURES. These are the fourteen. */
  assert.equal(where('gdppc'), 'lyrGrpEconomy', 'GDP per capita measures the economy');
  assert.equal(where('hdi'), 'lyrGrpSociety', 'HDI is a human-development composite');
  assert.equal(where('wbadofert'), 'lyrGrpDemo', 'adolescent fertility is a fertility rate');
  assert.equal(where('pharma'), 'lyrGrpEconomy', 'pharma hubs are factories');
  assert.equal(where('wbcook'), 'lyrGrpEnergy', 'clean cooking fuel access is an energy-access rate');
  assert.equal(where('wbunder'), 'lyrGrpAgri', 'undernourishment measures food');
  for (const id of ['wbpov', 'wbgini', 'wbflfp', 'wbhitech']) {
    assert.equal(where(id), 'lyrGrpEconomy', id + ' measures income, labour or trade');
  }
  assert.equal(where('eez'), 'lyrGrpPolitics', 'an EEZ is a jurisdiction drawn on water');
  /* ⚠ (#R469) THE SLOPE ROW IS NOT ON A SHELF BECAUSE THERE IS NO SLOPE ROW. #R273 promoted it
     here out of Beta on the argument that it is computed from the elevation model; 「⛰ 傾斜・斜面方向
     レイヤーは完全削除。」 removed the layer itself. Asserting a shelf for it would be asserting that a
     deleted feature is correctly filed. */
  assert.equal(where('slope'), undefined, 'the slope/aspect layer is deleted, not re-shelved');
  assert.equal(where('webcams'), 'lyrGrpTransport', 'the camera feeds are road and traffic cameras');
  /* ⚠ (#R273) 3-D buildings LEFT the shelves entirely: it is a way of DRAWING the map, like Roads
     and Place names, and it now sits with the always-on view switches at the top — the same move
     #R233 made for the day/night shading and #R271 for the time zones. */
  assert.equal(where('bldg3d'), undefined, '3-D buildings is a view switch, not a subject shelf');
  assert.match(codeOnly(s), /rowFor\('bldg3d'\)/, '…and it must be pushed into the always-on block');
  assert.match(codeOnly(s), /if\(b3Row\) placed\.add\(b3Row\)/, '…and marked placed, or the sweep files it in Beta');
  for (const id of ['worldcover', 'ecoregions', 'gxndvi', 'wbforest']) {
    assert.equal(where(id), 'lyrGrpNature', id + ' is land cover, not elevation');
  }
  for (const id of ['wbpopgrow', 'wbaging', 'wbfert', 'wburb', 'wbrural', 'wbdensity', 'wbref']) {
    assert.equal(where(id), 'lyrGrpDemo', id + ' is a population series');
  }
  assert.ok(!(groups.lyrGrpIndic || []).length, 'the one-row shelf is empty; its key is kept');
  const code = codeOnly(s);
  /* ══ ⚠⚠ (#R469) THIS ROW WENT BACK, BY INSTRUCTION — 「基本表示の『タイムゾーン（現在時刻）』
     レイヤーは、基本表示ではなく普通のレイヤーにして。」 #R271 filed it with the always-on switches on
     the argument that a live-clock overlay of the whole planet is a view of the map rather than data
     about a subject; the reader has now said it is a layer. It is a row of 政治・統治 — time zones are
     a thing governments legislate — and `window.IntMapBasicLayers` no longer subtracts it, so
     「表示中のレイヤー」 counts it, which is what being a layer means.
     ⚠ THE PROPERTY #R271 WAS DEFENDING SURVIVES, POINTING THE OTHER WAY. Its point was that a row is
     claimed EXACTLY ONCE: pushed into the always-on block without `placed.add`, the safety sweep
     re-filed it and `order.push` MOVED it — MEASURED then, 🕒 タイムゾーン came out in Beta. So the
     assertion is now that the block does NOT claim it while a group does; one claim too many and one
     claim too few fail the same way. */
  assert.equal(where('tz'), 'lyrGrpPolitics', 'the time-zone overlay is a row of a category now');
  assert.ok(!/rowFor\('tz'\)/.test(code), '…and the always-on block does not also claim it');
  assert.ok(!/tzRow/.test(code), '…so there is no tz row left for the block to mark placed');
  assert.match(code, /if\(nsRow\) placed\.add\(nsRow\)/, '…the same way the day/night row is');
});

test('R271 ⑦ every group key the panel uses has a heading in all nine languages', () => {
  const keys = GROUPS.map(([k]) => k);   /* (#R469) the value, not the spelling — see ⑦ above */
  /* (consolidation) EVALUATED: the heading is a string in the table the language hands to
     IntMapLang.define — not a key-shaped spelling somewhere in the file */
  const files = uiLocaleCodes();
  assert.ok(files.length >= 9, 'all nine UI tables are found (' + files.join(',') + ')');
  for (const f of files) {
    const t = uiLocale(f).ui;
    for (const k of keys) {
      assert.ok(typeof t[k] === 'string' && t[k].length > 0,
        'ui.' + f + '.js has no heading for ' + k);
    }
  }
});

/* ── the three rows that were Japanese in every other language ──────────────────────────────── */
test('R271 the beta row labels are resolved through the language table, not a two-way ternary', () => {
  const s = codeOnly(read('js/beta-overlays.js'));
  assert.ok(!/jp\(\)\?BLBL\[k\]\[0\]:BLBL\[k\]\[1\]/.test(s),
    'a two-branch ternary over a five-slot table cannot serve nine languages, and this one was reversed');
  assert.match(s, /function relabel\(\)\{[\s\S]*?L\.arr\(BLBL\[k\]\)/,
    'the label must be resolved the same way buildUI resolves it');
});
}
