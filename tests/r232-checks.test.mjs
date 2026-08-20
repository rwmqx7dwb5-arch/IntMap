// R232 source-level regression checks (deterministic, no browser).
// Guards this round's batch:
//   ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
//   ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
//   ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
//   ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
//       observation points that are major cities which actually shake
//   ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
//       source card must be about the topic
//   ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
//   ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
//       locate button is outlined until it is following you
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readLF } from '../scripts/eol.mjs';

const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */
const read = (p) => readLF(new URL(p, ROOT));
const R = (p) => join(new URL('.', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), p);

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK. #R231 hit this five times and #R208/#R229
   before it: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax,
   never prose. */
const noJs = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const noHtml = (s) => String(s).replace(/<!--[\s\S]*?-->/g, ' ');
const noCss = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── ① adding a language is ONE FILE ─────────────────────────────────────────────────────────── */
test('R232 i18n: the locale directory IS the language list, and the generated copy follows it', () => {
  const boot = read('src/locale-boot.js');
  assert.match(boot, /import\.meta\.glob\('\.\.\/js\/locales\/ui\.\*\.js'\)/,
    'the language set is the set of files in js/locales/');
  assert.doesNotMatch(noJs(boot), /\{\s*eager:\s*true\s*\}/,
    'the glob must stay lazy — eager would ship all seven locales again');

  /* the generated list and the directory agree */
  const listed = (read('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z0-9-]+"/g) || [])
    .map((x) => x.replace(/"/g, '')).sort();
  const onDisk = readdirSync(new URL('js/locales/', ROOT))
    .map((f) => /^ui\.([a-z0-9-]+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]).sort();
  assert.deepEqual(listed, onDisk, 'run `node scripts/i18n-langs.mjs` — the generated list is stale');

  /* …and regenerating it changes nothing, which is what `prebuild` guarantees on every build */
  execFileSync(process.execPath, [R('scripts/i18n-langs.mjs'), '--check'], { stdio: 'pipe' });

  /* the registry derives a row it was not given */
  const reg = read('js/lang-registry.js');
  assert.match(reg, /function derive\(code\)/, 'a code alone is enough to build a row');
  assert.match(reg, /Intl\.DisplayNames/, "the label is the language's own name");
  assert.match(reg, /function declare\(codes, load\)/, 'discovery appends; it never reorders');

  /* the first five never move — they ARE the argument order of every L(…) call site */
  const rows = [...reg.matchAll(/\{\s*code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(rows.slice(0, 5), ['en', 'jp', 'de', 'ru', 'es']);

  /* the two reading pages get the same list, because they have no bundler */
  for (const p of ['sources.html', 'science.html']) {
    assert.match(read(p), /<script src="\.\/js\/locales\/_langs\.js"><\/script>/,
      `${p} loads the generated language list`);
  }
  const { STATIC_ASSETS } = JSON.parse(JSON.stringify({ STATIC_ASSETS: [] }));   /* shape only */
  void STATIC_ASSETS;
  assert.ok(read('vite.config.js').includes("'js/locales'"), 'js/locales ships whole');
});

test('R232 i18n: French and Korean exist, and cost nothing but their own files', () => {
  for (const c of ['fr', 'ko']) {
    assert.ok(existsSync(new URL(`js/locales/ui.${c}.js`, ROOT)), `js/locales/ui.${c}.js`);
    const src = read(`js/locales/ui.${c}.js`);
    assert.match(src, new RegExp(`window\\.IntMapLang\\.define\\('${c}',`), 'it registers itself');
    assert.match(src, /inline:\s*\{/, 'both tables are present');
  }
  /* ⚠ THE POINT OF THE ROUND: neither language is named anywhere else. */
  const reg = read('js/lang-registry.js');
  for (const c of ['fr', 'ko']) {
    assert.doesNotMatch(noJs(reg), new RegExp(`code:\\s*'${c}'`), `${c} needs no registry row`);
    assert.doesNotMatch(noJs(read('src/main.js')), new RegExp(`locales/ui\\.${c}\\.js`), `${c} needs no import line`);
  }
  /* …and the launch screen, which cannot import anything, still has a word for every language */
  const boot = read('index.html');
  const table = boot.slice(boot.indexOf('var L={en:'), boot.indexOf('var L={en:') + 400);
  for (const c of (read('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"([a-z0-9-]+)"/g) || [])) {
    const code = c.replace(/"/g, '');
    assert.ok(new RegExp(`(^|[{,])\\s*'?${code.replace('-', '\\-')}'?\\s*:`).test(table),
      `the launch screen has a word for '${code}'`);
  }
});

test('R232 i18n: (beta) is MEASURED, and DE/RU/ES no longer wear it', () => {
  const gen = read('js/locales/_langs.js');
  assert.match(gen, /window\.IntMapLangBeta\s*=/, 'the beta list is generated, not typed');
  const beta = JSON.parse(gen.slice(gen.indexOf('IntMapLangBeta')).match(/\[[^\]]*\]/)[0]);
  for (const c of ['en', 'jp', 'de', 'ru', 'es']) assert.ok(!beta.includes(c), `${c} is positional — never beta`);
  /* ⚠ (#R239) fr and ko were 25 % when this line was written and are 100 % on every surface now, so
     the measured list is empty — which is the POINT of measuring it rather than typing it. What is
     load-bearing is that the mark follows the measurement in both directions, and that is what is
     asserted: a language below the threshold must wear it, one at or above it must not. */
  const rep = JSON.parse(execFileSync(process.execPath,
    [new URL('scripts/i18n-report.mjs', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--json'], { encoding: 'utf8', maxBuffer: 64e6 }));
  for (const r of rep.rows) {
    if (r.positional) continue;
    const done = r.inline >= 0.98 * rep.inlineWant;
    assert.equal(!beta.includes(r.code), done, `${r.code}: the (beta) mark must follow the measurement`);
  }
  /* the ES pill's tooltip was the last (beta) mark on the five */
  assert.doesNotMatch(noHtml(read('index.html')), /Español \(beta\)/, 'Spanish is complete');
});

/* ── ② the locales are lazy, and the app waits for the reader's own ──────────────────────────── */
test('R232 startup: only English is eager, and the boot barrier waits for the rest', () => {
  const main = noJs(read('src/main.js'));
  assert.match(main, /import '\.\.\/js\/locales\/ui\.en\.js';/, 'the fallback prototype stays eager');
  assert.doesNotMatch(main, /locales\/ui\.(?!en\.js)[a-z0-9-]+\.js/, 'nothing else is imported by name');
  const body = read('js/app-body.js');
  assert.match(body, /window\.IntMapLocalePending/, 'the boot barrier knows about the locale');
  assert.match(body, /_l\.then\(_afterLocale,_afterLocale\)/,
    'then(go,go) — a locale that fails still gives the reader the app');
});

/* ── ③ the day/night switch ──────────────────────────────────────────────────────────────────── */
test('R232 layers: the flat night layer is gone and the shading has one owner', () => {
  const dl = noJs(read('js/data-layers.js'));
  assert.doesNotMatch(dl, /function buildNight\(/, 'the turf disc is deleted');
  assert.doesNotMatch(dl, /'lyr-night'/, 'and so is its layer');
  assert.doesNotMatch(dl, /\['night','lyrNight'\]/, 'and its row');
  assert.match(dl, /\['nightside','lyrNightSide'\]/, 'the row that replaced it drives the shading');
  assert.match(dl, /function _setNightSide\(on\)/, 'ONE place writes the boolean');
  assert.match(dl, /window\._imSyncNightSideRow/, '…and the other two surfaces re-read it');
  assert.match(read('js/app-body.js'), /_imSyncNightSideRow/, 'Settings follows');
  assert.match(read('js/atlas-console.js'), /_imSyncNightSideRow/, 'Atlas follows');
  assert.match(read('js/session-tabs.js'), /'dl-night':'dl-nightside'/, 'a saved session is migrated');
});

/* ── ④ the seismic simulator ─────────────────────────────────────────────────────────────────── */
test('R232 seismic: past earthquakes carry published parameters AND the observed outcome', () => {
  const ev = read('js/seismic-events.js');
  for (const id of ['tohoku2011', 'valdivia1960', 'alaska1964', 'sumatra2004', 'kobe1995',
                    'kanto1923', 'turkiye2023', 'wenchuan2008', 'haiti2010']) {
    assert.match(ev, new RegExp(`id: '${id}'`), `${id} is in the catalogue`);
  }
  /* every row is a full source: mechanism, dimensions, where it nucleated, and where it came from */
  const rows = ev.split('id:').slice(1);
  for (const r of rows) {
    for (const k of ['lat:', 'lng:', 'depthKm:', 'mw:', 'strike:', 'dip:', 'rake:', 'lenKm:', 'widKm:', 'nucAlong:', 'src:', 'obs:']) {
      assert.ok(r.includes(k), `a catalogue row is missing ${k}`);
    }
  }
  assert.match(ev, /export function ruptureRing/, 'the published rectangle becomes a surface projection');
  const s = read('js/seismic.js');
  assert.match(s, /function applyEvent\(id\)/, 'loading one sets every input');
  assert.match(s, /momentOf\(ev\.mw\)\/\(MU\*A3\)/, 'the slip is derived from the PUBLISHED moment');
  assert.match(s, /function evObsHtml\(ev\)/, '「実測値も併記する」');
});

test('R232 seismic: rupture directivity is kinematic, and the field is not a circle', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const VR_BETA=0\.75;/, 'Vr/β — the rupture runs at 0.75 of the shear speed');
  assert.match(s, /1-VR_BETA\*X\*cosT/, 'Fd = 1 − (Vr/β)·X·cos θ — Ben-Menahem / Somerville');
  assert.match(s, /function rupAxis\(\)/, 'the axis is the rupture, not a corner of its outline');
  assert.match(s, /function fdAt\(lng,lat\)/, 'every receiver has its own Fd');
  /* ⚠⚠ (#R234) THIS ASSERTION WAS INVERTED, AND THAT IS THE POINT OF IT NOW.
     #R232 pinned `const fc=fc0/f;` as the proof that "the apparent corner frequency moves with it" —
     and that division is precisely the defect the reader reported as 「震度計算に大幅な誤差」. It
     slides the whole ω⁻² spectrum, so the high-frequency acceleration plateau (∝ M₀·f_c²) is
     multiplied by 1/Fd² — a factor of 11 at the floor, and the RADIATED ENERGY ∫A²df by a hundred.
     A test that requires the bug is a test that stops the fix (#R229's five «negative» checks), so
     it is reversed rather than deleted: the corner must NOT move, and Fd must live in the apparent
     DURATION that random-vibration theory divides the energy by. See tests/r234-checks ②. */
  assert.doesNotMatch(s, /const fc=fc0\/f;/, 'the source spectrum is the same earthquake from every side');
  assert.match(s, /durS:f\/fc0/, '…and Fd is the apparent source duration instead');
  assert.match(s, /profBank/, 'the painted field carries one profile per azimuth');
  assert.match(s, /const profAt=profBank/, '…and a cell reads its own');
});

test('R232 seismic: the wavefronts are named, and the observation points are cities that shake', () => {
  const s = read('js/seismic.js');
  for (const n of ['P wave', 'S wave', 'Rayleigh wave', 'Love wave']) {
    assert.ok(s.includes(`'${n}'`), `the ${n} front says what it is`);
  }
  assert.match(s, /kind:'frontLabel'/, 'the name is drawn on the ring');
  assert.match(s, /id:'seis-front-lbl'/, '…by a layer of its own');
  /* the cut is the instruction's: JMA 3 or MMI IV and below are not observation points */
  assert.match(s, /function obsCut\(a\)/, 'the intensity filter exists');
  assert.match(s, /\(scale==='jma'\) \? \(a\.jma>=3\.5\) : \(a\.mmi>=4\.5\)/, '震度4以上 / MMI V以上 のみ');
  assert.match(s, /a\.km<=MMI_CALIB_KM/, 'and only where the model will answer at all');
  assert.match(s, /OBS_MIN_SEP_KM/, 'a metropolis is not ten rows of its own wards');
  assert.doesNotMatch(noJs(s), /r\[0\]==='capital'\)\s*$/m, 'capitals are no longer the source');
  /* the population the ranking needs is kept by the gazetteer */
  assert.match(read('js/gazetteer.js'), /out\.push\(\[pop>=250000\?'city':'town', terms, lng, lat, en, ja\|\|en, pop\]\)/,
    'the row carries its population');
});

test('R232 seismic + tsunami: the method folds away, the warning does not', () => {
  /* ⚠ (#R245) the SENTENCE is the reader's, not this test's — 「これは文言を整えて」 reworded the
     seismic panel's line, and a test that pins prose it does not own turns an editorial change into a
     failure. What this test is about is WHERE the line is (above the fold), so each file names its own
     opening words and the position check is unchanged. */
  const OPENER = { 'js/seismic.js': 'An educational model. In a real emergency,',
                   'js/tsunami.js': 'Educational model — in a real emergency follow the official authorities.' };
  for (const f of ['js/seismic.js', 'js/tsunami.js']) {
    const s = read(f);
    assert.match(s, /<details class="(?:sq|tsu)-meth"/, `${f} folds its method + sources`);
    assert.match(s, /Method & sources/, `${f} names the fold`);
    assert.ok(s.includes(OPENER[f]), `${f} keeps the safety line OUTSIDE the fold`);
    /* the safety line must not be inside the <details> */
    /* ⚠ against the METHOD fold specifically — the seismic panel has an earlier <details> of its
       own (the fault-geometry overrides), and matching the first one made this pass for the wrong reason. */
    const i = s.indexOf(OPENER[f]);
    const j = s.search(/<details class="(?:sq|tsu)-meth"/);
    assert.ok(i > 0 && j > 0 && i < j, `${f}: the warning is above the fold, not in it`);
  }
  assert.doesNotMatch(noJs(read('js/seismic.js')), /🌐 '\+L\('Seismic waves'/, 'the globe emoji is gone');
});

/* ── ⑤ Atlas ─────────────────────────────────────────────────────────────────────────────────── */
test('R232 Atlas: the place name is printed once, not twice', () => {
  const k = noJs(read('js/atlas-console.js'));
  assert.doesNotMatch(k, /<div style="font-weight:600;margin:2px 0 5px;">'\+esc\(nm3\)/,
    "the brief no longer prints the place name above a bubble that already says it");
  assert.match(k, /const bodyB=dropLeadTitle\(txtB,nm3\)/, "…and the model's own copy is stripped");
  assert.match(read('js/atlas-reply.js'), /function dropLeadTitle\(text, name\)/, 'the helper lives with the text pipeline');
});

test('R232 Atlas: a heading is not spaced twice, and a source card must be about the topic', () => {
  const rep = read('js/atlas-reply.js');
  assert.match(rep, /<div class="atl-h"/, 'headings are marked');
  assert.match(rep, /<div class="atl-gap"/, 'so are paragraph spacers');
  assert.match(rep, /atl-gap"\[\^>\]\*><\\\/div>\(\?=<div class="atl-h"\)/,
    'the spacer BEFORE a heading is dropped');
  assert.match(rep, /function _atlTopicKeys\(topic\)/, 'relevance judges against the topic');
  assert.match(rep, /cross-script: TWO tokens/, 'the cross-script fallback needs two, not none');
  assert.match(read('js/atlas-console.js'), /linkCards\(srcSink,txtB,nm3\+' \/ '\+String\(a\.place\|\|''\)\)/,
    'the brief passes both spellings of the topic');
});

test('R232 Atlas: a sent picture opens full-screen, from its own module', () => {
  const m = read('js/atlas-attach.js');
  assert.match(m, /export function attachLightbox/, 'one entry point');
  assert.match(m, /el.className = 'atl-lightbox';/, 'the overlay');
  assert.match(m, /history\.pushState/, 'Back closes the picture, not the map');
  assert.match(m, /document\.body\.appendChild\(el\)/, 'it lives on <body>, not inside the panel');
  assert.match(read('js/atlas-console.js'), /attachLightbox\(chatEl,/, 'the chat delegates to it');
});

/* ── ⑥ the phone's layer sheet ───────────────────────────────────────────────────────────────── */
test('R232 mobile: the layer sheet is the SAME tile grid the desktop browses with', () => {
  const ui = read('js/map-ui.js');
  assert.match(ui, /function mountInto\(container\)/, 'the grid can be mounted anywhere');
  assert.match(ui, /const _hosts=\[\]/, '…and every mounted grid stays in sync');
  assert.match(read('js/mobile-ui.js'), /IntMapLayerSidebar\.mountInto\(moMountLayers\)/, 'the sheet mounts it');
  assert.match(read('js/mobile-ui.js'), /classList\.add\('m-lyr-tiles'\)/, 'the classic rows become the data source');
  const css = noCss(read('css/intmap.css'));
  assert.match(css, /body\.m-lyr-tiles \.m-sheet #layer-dropdown \.lyr-row/, 'the rows are hidden, not removed');
  /* (#R233) 「モバイル版のレイヤー選択欄は、横に3つタイルを置く形式に。」 — #R232 pinned TWO here and
     argued three would put the caption below readable width. Three is what was asked for, so the pin
     follows the instruction; the gap tightens with it (9px → 7px) to buy the tiles back some width. */
  assert.match(css, /\.m-sheet \.lsr-mount \.lst-grid\{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\); /,
    'three columns on a phone, per #R233');
});

/* ── ⑦ the three small ones ──────────────────────────────────────────────────────────────────── */
test('R232 「戻る」 returns to the tab the reader came from', () => {
  const pi = read('js/page-i18n.js');
  assert.match(pi, /window\.opener && !window\.opener\.closed/, 'rung ①: the map is in the opener');
  assert.match(pi, /window\.close\(\)/, '…so this tab closes');
  assert.match(pi, /history\.back\(\)/, 'rung ②: a same-tab navigation still goes back');
  /* and index.html must hand the opener over, or rung ① can never fire */
  const idx = noHtml(read('index.html'));
  for (const id of ['link-sources', 'link-science', 'sources-page-link']) {
    assert.match(idx, new RegExp(`<a id="${id}"[^>]*rel="opener"`), `${id} hands over the opener`);
  }
});

test('R232 the coordinate readout stays out of screenshots', () => {
  assert.match(noCss(read('css/intmap.css')), /body\.capture-mode \.coord-readout\{ visibility:hidden !important; \}/);
});

test('R232 the locate button is outlined until the map is ON the fix', () => {
  const css = noCss(read('css/intmap.css'));
  assert.match(css, /\.m-fab-locate svg polygon\{ fill:none;/, 'not following → outline');
  assert.match(css, /\.m-fab-locate\.on svg polygon\{ fill:currentColor; \}/, 'following → solid');
  assert.match(noHtml(read('index.html')), /<polygon points="20\.6,3\.4 3\.4,10\.2 11\.1,12\.9 13\.8,20\.6" fill="none"/,
    'the markup no longer hard-codes the fill');
  assert.match(read('js/map-extras.js'), /E0\.events\.on\('moveend',_syncFab\)/,
    'the badge updates when the CAMERA moves, not only when the fix does');
});

test('R232 Companies and Countries do not drift sideways', () => {
  assert.match(noCss(read('css/intmap.css')),
    /#countries-feed, #info-dashboard\{ overflow-x:hidden; overscroll-behavior-x:contain; \}/);
});

test('R232 mobile: the renderer quality gate asks the device, not the viewport width', () => {
  const b = read('js/app-body.js');
  assert.match(b, /const _imPhoneGPU=\(\)=>/, 'a device test exists');
  assert.match(b, /antialias:!_imPhoneGPU\(\)/, 'MSAA follows the device');
  assert.match(b, /pixelRatio:\(_imPhoneGPU\(\)\?Math\.min\(2,window\.devicePixelRatio\|\|1\)/, 'so does the DPR cap');
  assert.doesNotMatch(noJs(b), /antialias:!isMobile\(\)/, 'width no longer decides quality');
});
