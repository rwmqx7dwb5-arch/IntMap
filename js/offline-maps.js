/* ============================================================================
 *  IntMap · THE OFFLINE MAPS — a region, saved on the device, opened with no connection   (keyboard-and-offline)
 * ----------------------------------------------------------------------------
 *  A reader on a train, a ferry or a trail has the app (the installed shell, sw.js) and no network. What this
 *  adds is the map's own DATA for the place they are going: the terrain elevation tiles of the region the view
 *  holds, and the files IntMap itself has served for the layers that are on (data and code), kept in a cache the
 *  page owns (`intmap-page-offline-v1`) and answered by sw.js when the browser is offline.
 *
 *  WHAT IS SAVED, AND WHO SAID SO
 *    · IntMap's own files — a layer's data and code (data/, assets/). They are the site's, served to this very
 *      reader a moment ago; keeping them for the reader extends nothing. Discovered from what the page actually
 *      loaded (the browser's resource timing), never from a list of ours.
 *    · a supplier's tiles — ONLY where the supplier's terms were read and written down as «yes» on that host's row
 *      of the ledger (scripts/outbound-hosts.json `offline`, derived into data/offline-sources.json). Today that is
 *      the AWS terrain tiles. The base map's vector tiles are refused with their terms (OpenFreeMap: no automated
 *      collection), and a host nobody wrote anything about is refused as «not stated»: silence is not permission.
 *      The dialog says what is NOT saved, with the reason, from the same rows (js/offline-plan.js).
 *  HOW MUCH, BEFORE ANYTHING IS DOWNLOADED. Tile counts are exact (the region's tile rectangles); the size of a
 *  tile is MEASURED — a few tiles of the region are fetched and weighed — and the dialog says «about». Detail
 *  levels that would not fit the room the device says it has are not offered.
 *  ⚠ NOTHING IS REPEATED BLINDLY: a tile is asked for once; one that fails is counted and the saved region says
 *  how many are missing (.agents/rules/one-pass-or-a-reason.md §5). A save is stoppable, and it saves coarse
 *  levels first, so a stopped save holds the whole region at a lower detail, never half of it at full detail.
 *  Strings are en + jp (CONSTITUTION §7). The words of the Settings row are written by js/keyboard-shortcuts.js.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { narratorApi } from './narrator-api.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { makeDemSource } from './dem-source.js';
import { PACKS_KEY, tilesOf, fill, savableTemplate, refusals, terrainOptions, mb, packId, defaultDetail } from './offline-plan.js';

/* the renderer, as the narrator was handed it (js/app-body.js). ⚠ NOT `import … from './geo-engine.js'`: this module is lazy, and a lazy
   importer is what made the bundler cut geo-engine out of the entry chunk into a chunk of its own — one more request at start-up for every reader. */
const GE = () => narratorApi.engine();
/** the Cache Storage name the saved files live in. `intmap-page-` = the page owns it: sw.js's activate keeps every such cache across
    deploys, and sw.js reads this one (its own `OFFLINE_CACHE` is the same literal; tests/keyboard-and-offline-checks.test.mjs holds them equal) */
const OFFLINE_CACHE = 'intmap-page-offline-v1';
let _L = null;   /* the shell's host, whose `lang` is the reader's language — handed in by whoever opens the dialog or asks for a plan */
const L = IntMapLang.pick(() => { try { return _L.lang; } catch (_) { return 'en'; } });

/* ── the policy the page is handed ─────────────────────────────────────────────────────── */
let _policy = null;
async function policy() {
  if (_policy) return _policy;
  try {
    _policy = await jsonWithin('data/offline-sources.json', clockFor('data/offline-sources.json'));
  } catch (_) { return { hosts: [] }; }   /* not remembered: the next ask tries again — a network blip is not a policy */
  return _policy;
}

/* ── what is saved ─────────────────────────────────────────────────────────────────────── */
export function listPacks() {
  try { const a = JSON.parse(localStorage.getItem(PACKS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}
function writePacks(a) { try { localStorage.setItem(PACKS_KEY, JSON.stringify(a)); } catch (_) { /* a private tab: kept for this session only */ } }

/* the terrain source the map itself draws from — its owner's own object, not a copy of its addresses */
let _dem = null;
const dem = () => (_dem || (_dem = makeDemSource()));
const demTemplates = () => dem().TILES;
const demMaxZoom = () => dem().maxZoom();

/* ⚠ A READ THAT CANNOT END IS NOT ADDED UNSEEN (js/fetch-deadline.js): one file, read to its last byte INSIDE one clock
   (js/proxy-fetch.js clockFor — the host's own deadline), and stopped at once by the reader's Stop. Returns { ok, status, blob }. */
async function blobWithin(url, init, outer) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), clockFor(url));
  if (outer) { if (outer.aborted) c.abort(); else outer.addEventListener('abort', () => c.abort(), { once: true }); }
  try {
    const r = await fetch(url, Object.assign({}, init, { signal: c.signal }));
    return { ok: r.ok, status: r.status, type: r.headers.get('content-type'), blob: r.ok ? await r.blob() : null };
  } finally { clearTimeout(t); }
}

/** the box the view holds, [west, south, east, north] */
function viewBox() {
  const b = GE().camera.getBounds && GE().camera.getBounds();
  if (!b) return null;
  const g = (a, k) => (typeof b[a] === 'function' ? b[a]() : b[k]);
  const box = [g('getWest', 'west'), g('getSouth', 'south'), g('getEast', 'east'), g('getNorth', 'north')];
  return box.every((v) => typeof v === 'number' && isFinite(v)) ? box : null;
}
function activeLayerNames() {
  const sec = document.getElementById('layer-active-section');
  return sec ? Array.from(sec.querySelectorAll('.active-lyr-chip .alc-name')).map((n) => n.textContent.trim()).filter(Boolean) : [];
}

/** IntMap's own files the page has loaded, minus those the installed shell already keeps. Observed, not listed. */
async function ownFiles() {
  const here = location.origin, seen = new Map();
  for (const e of performance.getEntriesByType('resource')) {
    let u; try { u = new URL(e.name); } catch (_) { continue; }
    if (u.origin !== here || u.hash) continue;
    if (/\/sw\.js$/.test(u.pathname)) continue;
    if (!seen.has(u.href)) seen.set(u.href, e.encodedBodySize || e.decodedBodySize || 0);
  }
  let shell = [];
  try { shell = (await caches.keys()).filter((k) => k.startsWith('intmap-shell-')); } catch (_) { /* no Cache Storage */ }
  const files = [];
  for (const [url, bytes] of seen) {
    let kept = false;
    for (const k of shell) { try { if (await caches.match(url, { cacheName: k })) { kept = true; break; } } catch (_) { /* unreadable: not kept */ } }
    if (!kept) files.push({ url, bytes });
  }
  return files;
}

/** a tile of the region, weighed: the size a tile is, MEASURED at the region's centre at this zoom */
async function sampleBytes(template, box, z) {
  const n = 2 ** z, cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const x = Math.min(n - 1, Math.max(0, Math.floor(((cx + 180) / 360) * n)));
  const la = cy * Math.PI / 180, y = Math.min(n - 1, Math.max(0, Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n)));
  const r = await blobWithin(fill(template, { z, x, y }), { mode: 'cors', credentials: 'omit' });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.blob.size;
}

async function room() {
  try {
    const e = await navigator.storage.estimate();
    if (e && e.quota) return { usage: e.usage || 0, quota: e.quota, free: Math.max(0, e.quota - (e.usage || 0)) };
  } catch (_) { /* no estimate: no room is claimed */ }
  return null;
}

/**
 * Everything the dialog and Atlas say BEFORE a save: the region, what would be kept and how much, what would not and why.
 * @returns {Promise<{box, zoom, layers, terrain: {template, options, why}|null, own: {files, bytes}, refused, room, online}>}
 */
export async function plan(HOST) {
  _L = HOST;
  const box = viewBox();
  const pol = await policy();
  const out = { box, zoom: GE().camera.getZoom(), layers: activeLayerNames(), terrain: null, own: { files: [], bytes: 0 },
    refused: refusals(pol), room: await room(), online: navigator.onLine !== false };
  const files = await ownFiles();
  out.own = { files, bytes: files.reduce((n, f) => n + f.bytes, 0) };
  if (!box) { out.terrain = { template: null, options: [], why: 'no-view' }; return out; }
  const template = savableTemplate(pol, demTemplates());
  if (!template) { out.terrain = { template: null, options: [], why: 'not-permitted' }; return out; }
  const zTo = demMaxZoom(), zFrom = Math.min(zTo, Math.max(4, Math.ceil(out.zoom)));
  const probes = [...new Set([zFrom, Math.round((zFrom + zTo) / 2), zTo])];
  const got = new Map();
  await Promise.all(probes.map(async (z) => { try { got.set(z, await sampleBytes(template, box, z)); } catch (_) { /* that zoom stays unmeasured */ } }));
  if (!got.size) { out.terrain = { template, options: [], why: out.online ? 'unmeasured' : 'offline' }; return out; }
  /* between two measured zooms the mean is interpolated; outside them it is the nearest measurement — never extrapolated */
  const zs = [...got.keys()].sort((a, b) => a - b);
  const mean = (z) => {
    if (got.has(z)) return got.get(z);
    const lo = [...zs].reverse().find((k) => k < z), hi = zs.find((k) => k > z);
    if (lo != null && hi != null) return got.get(lo) + (got.get(hi) - got.get(lo)) * ((z - lo) / (hi - lo));
    return got.get(lo != null ? lo : hi);
  };
  out.terrain = { template, options: terrainOptions(box, 0, zTo, mean, out.room ? Math.floor(out.room.free * 0.5) : null)
    .filter((o) => o.zMax >= zFrom), why: null };
  if (!out.terrain.options.length) out.terrain.why = 'no-room';
  return out;
}

/**
 * Save a region. `opts` = { box, zMax, template, name, layers, files }; `onProgress({done, total, bytes, failed})`; `signal` stops it.
 * Coarse zoom levels first. A tile already saved is not fetched again.
 */
export async function save(opts, onProgress, signal) {
  const cache = await caches.open(OFFLINE_CACHE);
  const tiles = [...tilesOf(opts.box, 0, opts.zMax)];
  const total = tiles.length + opts.files.length;
  let done = 0, bytes = 0, failed = 0, i = 0, tilesOk = 0;
  const tell = () => { try { if (onProgress) onProgress({ done, total, bytes, failed }); } catch (_) { /* a renderer's failure is not the save's */ } };
  /* → true when the file is in the cache afterwards (already there, or saved now); a failure is counted, not retried */
  const put = async (key, url, init) => {
    if (await cache.match(key)) { done++; return true; }
    try {
      const r = await blobWithin(url, init, signal);
      if (!r.ok) throw new Error('http ' + r.status);
      const b = r.blob, h = new Headers(); if (r.type) h.set('content-type', r.type);
      await cache.put(key, new Response(b, { status: 200, headers: h }));
      bytes += b.size; done++; return true;
    } catch (_) { if (!(signal && signal.aborted)) failed++; done++; return false; }
  };
  const jobs = [
    ...tiles.map((t) => async () => { const u = fill(opts.template, t); if (await put(u, u, { mode: 'cors', credentials: 'omit' })) tilesOk++; }),
    ...opts.files.map((f) => () => put(f.url, f.url, { credentials: 'same-origin' })),
  ];
  const lane = async () => { while (i < jobs.length && !(signal && signal.aborted)) { const j = jobs[i++]; await j(); if ((done & 15) === 0) tell(); } };
  await Promise.all([lane(), lane(), lane(), lane()]);
  tell();
  const stopped = !!(signal && signal.aborted);
  const pack = { id: packId(opts.box, opts.zMax), name: opts.name || '', box: opts.box, zMax: opts.zMax, template: opts.template,
    tiles: tilesOk, tilesWanted: tiles.length, files: opts.files.map((f) => f.url), layers: opts.layers || [],
    bytes: (listPacks().find((p) => p.id === packId(opts.box, opts.zMax)) || { bytes: 0 }).bytes + bytes,
    savedAt: new Date().toISOString(), missing: tiles.length - tilesOk, stopped };
  writePacks(listPacks().filter((p) => p.id !== pack.id).concat([pack]));
  return pack;
}

/** delete a saved region: the files nothing else saved needs are removed from the cache with it */
export async function remove(id) {
  const all = listPacks(), gone = all.find((p) => p.id === id);
  if (!gone) return false;
  const rest = all.filter((p) => p.id !== id), cache = await caches.open(OFFLINE_CACHE);
  const keep = new Set();
  for (const p of rest) { for (const t of tilesOf(p.box, 0, p.zMax)) keep.add(fill(p.template, t)); for (const f of p.files) keep.add(f); }
  for (const t of tilesOf(gone.box, 0, gone.zMax)) { const u = fill(gone.template, t); if (!keep.has(u)) await cache.delete(u); }
  for (const f of gone.files) if (!keep.has(f)) await cache.delete(f);
  writePacks(rest);
  return true;
}

/* ── the dialog ───────────────────────────────────────────────────────────────────────── */
const CARD = 'background:var(--card-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:16px;box-shadow:var(--shadow);width:min(460px,calc(100vw - 32px));max-height:84vh;overflow-y:auto;padding:18px 20px;';
const BTN = 'min-height:44px;border-radius:12px;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--card-bg);color:var(--text-main);font-size:14px;padding:0 14px;cursor:pointer;';
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in (props || {})) { if (k === 'style') e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}

export async function openOfflineMaps(HOST) {
  _L = HOST;
  const old = document.getElementById('offline-maps-modal'); if (old) old.remove();
  const root = el('div', { id: 'offline-maps-modal', className: 'modal', style: 'position:fixed;inset:0;z-index:calc(var(--z-toast) + 3000);display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);' });
  const card = el('div', { style: CARD });
  root.append(card);
  const title = el('b', { id: 'offline-maps-title', style: 'font-size:16px;' }, L('Offline maps', '持ち歩ける地図（オフライン）'));
  const close = el('button', { type: 'button', id: 'offline-maps-x', 'aria-label': L('Close', '閉じる'), style: 'background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;min-width:44px;min-height:44px;' }, '×');
  const body = el('div', { id: 'offline-maps-body', 'aria-live': 'polite' });
  card.append(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;' }, title, close), body);
  let ctl = null;
  const handle = window.IntMapDialog.open(root, { panel: card, labelledby: 'offline-maps-title', close: () => { if (ctl) ctl.abort(); root.remove(); } });
  close.onclick = () => { if (handle && handle.close) handle.close(); else { if (ctl) ctl.abort(); root.remove(); } };

  const p = (text, style) => el('p', { style: 'margin:6px 0;font-size:13px;line-height:1.45;' + (style || '') }, text);
  const h = (text) => el('div', { style: 'font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted);margin:16px 0 6px;' }, text);

  async function paint() {
    body.replaceChildren(p(L('Measuring this view…', 'いまの表示範囲を測っています…')));
    let pl; try { pl = await plan(HOST); } catch (_) { pl = null; }
    if (!document.body.contains(root)) return;
    const kids = [];
    kids.push(p(L('Keep the area on screen on this device so it opens with no connection. You are shown the size first; nothing is downloaded until you press Save.',
      '画面に映っている地域をこの端末に保存し、回線がなくても開けるようにします。保存するまえに大きさを表示します。「保存」を押すまで何もダウンロードしません。'), 'color:var(--text-muted);'));
    if (!pl || !pl.box) kids.push(p(L('The map is not ready yet — try again in a moment.', '地図の準備がまだできていません。少し待ってからもう一度開いてください。')));
    else {
      const [w, s, e, n] = pl.box, r1 = (v) => (Math.round(v * 100) / 100);
      kids.push(h(L('This view', 'いまの表示')));
      kids.push(p(L('Area: ' + r1(s) + '° to ' + r1(n) + '° N, ' + r1(w) + '° to ' + r1(e) + '° E', '範囲: 北緯 ' + r1(s) + '° 〜 ' + r1(n) + '°、東経 ' + r1(w) + '° 〜 ' + r1(e) + '°')));
      kids.push(p(pl.layers.length ? L('Layers on: ' + pl.layers.join(', '), '表示中のレイヤー: ' + pl.layers.join('、')) : L('No layers are on.', '表示中のレイヤーはありません。')));
      kids.push(h(L('What would be saved', '保存するもの')));
      const t = pl.terrain;
      let sel = null;
      if (t && t.options.length) {
        sel = el('select', { id: 'offline-detail', 'aria-label': L('Terrain detail', '地形の細かさ'), style: 'width:100%;min-height:44px;border-radius:12px;margin:4px 0;' });
        const pick = defaultDetail(t.options, pl.zoom);
        for (const o of t.options) sel.append(el('option', { value: String(o.zMax), selected: o === pick },
          L('Terrain elevation, detail ' + o.zMax + ' — ' + o.tiles + ' tiles, about ' + mb(o.bytes) + ' MB', '地形（標高）、細かさ ' + o.zMax + ' — ' + o.tiles + ' タイル、約 ' + mb(o.bytes) + ' MB')));
        kids.push(sel);
      } else {
        const why = { 'not-permitted': L('No terrain source states that it may be saved.', '保存してよいと述べている地形の取得元がありません。'),
          'offline': L('Terrain cannot be measured while you are offline.', 'オフラインのため地形の大きさを測れません。'),
          'unmeasured': L('The terrain source did not answer, so its size is unknown.', '地形の取得元が応答せず、大きさが分かりません。'),
          'no-room': L('This device does not have room for the terrain of this area.', 'この端末には、この地域の地形を保存する空きがありません。'),
          'no-view': L('The map is not ready.', '地図の準備ができていません。') }[(t && t.why) || 'no-view'];
        kids.push(p(why));
      }
      kids.push(p(pl.own.files.length
        ? L('IntMap’s own data and code for the layers you have opened: ' + pl.own.files.length + ' files, about ' + mb(pl.own.bytes) + ' MB', '開いたレイヤーの IntMap 自身のデータとコード: ' + pl.own.files.length + ' ファイル、約 ' + mb(pl.own.bytes) + ' MB')
        : L('No more of IntMap’s own files than the installed app already keeps.', 'インストール済みのアプリがすでに持っているもの以外に、IntMap 自身のファイルはありません。')));
      if (pl.refused.length) {
        kids.push(h(L('Not saved, and why', '保存しないものと、その理由')));
        for (const r of pl.refused) kids.push(el('p', { style: 'margin:6px 0;font-size:13px;line-height:1.45;' }, r.host + ' — ' + L(r.why, r.whyJp) + ' ',
          el('a', { href: r.basis, target: '_blank', rel: 'noopener' }, L('terms', '規約'))));
      }
      kids.push(p(L('Live services — weather, flights, news, the satellite picture — need a connection and are not kept.', '天気・航空機・ニュース・衛星画像などの生きたデータは回線が必要で、保存しません。'), 'color:var(--text-muted);'));
      const nameIn = el('input', { type: 'text', id: 'offline-name', maxLength: 60, placeholder: L('Name (optional)', '名前（任意）'), 'aria-label': L('Name', '名前'), style: 'width:100%;min-height:44px;border-radius:12px;box-sizing:border-box;margin:8px 0;padding:0 12px;' });
      const prog = el('div', { id: 'offline-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', style: 'height:8px;border-radius:4px;background:rgba(128,128,128,0.2);overflow:hidden;display:none;margin:8px 0;' }, el('div', { style: 'height:100%;width:0;background:var(--primary-color);' }));
      const msg = el('div', { id: 'offline-msg', style: 'font-size:13px;margin:6px 0;min-height:18px;' });
      const go = el('button', { type: 'button', id: 'offline-save', style: BTN + 'background:var(--primary-color);color:#fff;border:none;width:100%;font-weight:600;' }, L('Save', '保存'));
      go.disabled = !(sel && pl.online) && !(pl.own.files.length && pl.online);
      go.onclick = async () => {
        go.disabled = true; ctl = new AbortController(); prog.style.display = 'block';
        const zMax = sel ? +sel.value : -1;
        const cancel = el('button', { type: 'button', id: 'offline-cancel', style: BTN + 'width:100%;margin-top:6px;' }, L('Stop saving', '保存を中止'));
        cancel.onclick = () => ctl.abort(); go.after(cancel);
        let pack;
        try {
          pack = await save({ box: pl.box, zMax, template: t && t.template, name: nameIn.value.trim(), layers: pl.layers,
            files: pl.own.files }, (s) => {
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 100;
            prog.firstChild.style.width = pct + '%'; prog.setAttribute('aria-valuenow', String(pct));
            msg.textContent = L('Saving… ' + s.done + ' of ' + s.total + ' (' + mb(s.bytes) + ' MB)', '保存中… ' + s.done + ' / ' + s.total + '（' + mb(s.bytes) + ' MB）');
          }, ctl.signal);
        } catch (_) { pack = null; }
        cancel.remove(); ctl = null;
        if (!pack) { msg.textContent = L('Saving failed. Nothing was kept that is not listed below.', '保存に失敗しました。下の一覧にないものは保存されていません。'); go.disabled = false; }
        else { await paint(); const m2 = document.getElementById('offline-msg'); if (m2) m2.textContent = pack.stopped ? L('Stopped. The coarse levels are saved.', '中止しました。粗い細かさまでは保存されています。') : pack.missing ? L(pack.missing + ' tile(s) could not be saved.', pack.missing + ' タイルを保存できませんでした。') : L('Saved.', '保存しました。'); }
      };
      kids.push(nameIn, prog, msg, go);
    }
    kids.push(h(L('Saved on this device', 'この端末に保存済み')));
    const packs = listPacks();
    if (!packs.length) kids.push(p(L('Nothing is saved yet.', 'まだ何も保存していません。')));
    for (const k of packs) {
      const row = el('div', { class: 'offline-pack', 'data-pack': k.id, style: 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(128,128,128,0.15);' });
      const info = el('div', { style: 'flex:1;min-width:0;font-size:13px;line-height:1.4;' },
        el('div', { style: 'font-weight:600;' }, k.name || L('Saved area', '保存した地域')),
        el('div', { style: 'color:var(--text-muted);' }, mb(k.bytes) + ' MB · ' + k.tiles + ' ' + L('tiles', 'タイル') + ' · ' + k.files.length + ' ' + L('files', 'ファイル') + ' · ' + new Date(k.savedAt).toLocaleDateString(IntMapLang.locale(HOST.lang, 'en'))),
        k.missing ? el('div', { style: 'color:var(--text-muted);' }, L(k.missing + ' tile(s) missing', '欠けているタイル ' + k.missing)) : null);
      const del = el('button', { type: 'button', style: BTN, 'aria-label': L('Delete ' + (k.name || 'saved area'), (k.name || '保存した地域') + ' を削除') }, L('Delete', '削除'));
      del.onclick = async () => { del.disabled = true; await remove(k.id); await paint(); };
      row.append(info, del); kids.push(row);
    }
    if (packs.length && pl && pl.room) kids.push(p(L('This device: ' + mb(pl.room.usage) + ' MB used of about ' + mb(pl.room.quota) + ' MB the browser allows.', 'この端末: ブラウザが許可する約 ' + mb(pl.room.quota) + ' MB のうち ' + mb(pl.room.usage) + ' MB を使用中。'), 'color:var(--text-muted);'));
    body.replaceChildren(...kids);
  }
  await paint();
  return root;
}
