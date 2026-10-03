/* ============================================================================
 *  IntMap · EMBED CLIENT — the host page's half of the embed API   (developer-embed)
 * ----------------------------------------------------------------------------
 *  「IntMap を他所のサイト・授業資料・記事の中で生かす流通経路。」 An embed (js/embed-mode.js) was a picture
 *  another page could show and the reader could pan: the page around it could neither move it nor know
 *  where the reader had taken it. A story that says «now look at 1914» beside the map, a lesson whose
 *  buttons step through three dates, a dashboard that keeps two frames on the same place — each needed
 *  the host page to SPEAK to the frame. This file is the protocol both halves speak, and the small
 *  client a host page imports:
 *
 *      <div id="map"></div>
 *      <script type="module">
 *        import { mount } from 'https://…/IntMap/js/embed-client.js';
 *        const m = mount('#map', { hash: '#v=13.4000,52.5000,4.00,0,0,f&tt=1914-07-01' });
 *        await m.ready;                                  // the frame has applied its link
 *        m.setTime('1939-09-01');                        // the same map, another instant
 *        m.on('state', (s) => console.log(s.view));      // where the reader has taken it
 *      </script>
 *
 *  ══ ONE GRAMMAR — THE SHARE LINK'S ═══════════════════════════════════════════════════════════
 *  Every command the host sends becomes ONE share-link fragment (js/map-state.js encode/decode), and the
 *  frame applies it by the path a pasted link takes (IntMapBookmark.restore through `hashchange`, which
 *  queues a link that arrives during a restore instead of dropping it). So there is no second way to
 *  describe a map to keep in step with the first, and whatever a share link can carry — layers, the
 *  comparison window, the simulators' inputs, a caption — a host can set, by sending the link.
 *
 *  ══ WHAT THE HOST MAY DO (and why it is safe) ═══════════════════════════════════════════════
 *  Change what the frame SHOWS, and read the state the frame is in. Nothing else: there is no command
 *  that signs in, writes, spends or opens anything, because an embed has none of those (js/embed-mode.js
 *  header — read-only). A host that can set the frame's `src` could already show any of these maps;
 *  the API gives it no power the `src` attribute did not. What it adds is the READ: the frame reports
 *  the view the reader panned to. That is the map's public state (the same fragment its 「Open in
 *  IntMap」 link carries), never anything about the reader, and it is posted only to the page that
 *  framed it (`window.parent`). docs/SECURITY-ARCHITECTURE.md §6 records both halves.
 *
 *  ⚠ THIS FILE IMPORTS NOTHING AND IS SERVED AS IT IS. A host page on another origin imports it by URL
 *  (vite.config.js copies it beside the app; GitHub Pages answers with Access-Control-Allow-Origin: *,
 *  which a cross-origin module script needs — measured 2026-10-01, js/embed-mode.js FRAMING). The frame
 *  side (js/embed-mode.js) imports PROTOCOL from here, so the two halves cannot spell a message
 *  differently. No `window` global: a host imports `mount` by name.
 * ==========================================================================*/

/* ══ THE PROTOCOL ═════════════════════════════════════════════════════════════════════════════
   Every message, both ways, is a plain object `{ protocol: 'intmap-embed', v: 1, type, … }` — the two
   first fields let either side ignore everything else that is posted on the same window (analytics
   frames, browser extensions). `v` changes only when a message changes meaning; a frame answers a
   version it does not speak with an error naming the one it does.
   ⚠ THE TYPES ARE STATED ONCE, HERE, AS DATA: scripts/landing.mjs prints this table on the developer
   page, scripts/public-api.mjs writes it into api/v1/embed.json, and tests/developer-embed-checks.test.mjs holds
   the frame's handlers to it. What each message DOES is written for readers in scripts/landing-text.mjs
   (developers.api.does — en + jp, CONSTITUTION.md §7), keyed by these names and held to them by the same test:
   this file is code a host page loads, and carries no prose to translate. */
export const PROTOCOL = Object.freeze({
  name: 'intmap-embed',
  v: 1,
  /* host → frame: the fields each command reads */
  commands: Object.freeze({
    get: '{}',
    state: '{ hash }',
    view: '{ lng, lat, zoom, bearing?, pitch? }',
    time: "{ at: 'YYYY-MM-DD' | year | 'live' }",
  }),
  /* frame → host: the fields each event carries */
  events: Object.freeze({
    ready: '{ state, hash, link }',
    state: '{ cause, state, hash, link }',
    reply: '{ id, ok, error?, state, hash, link }',
  }),
});

/** Is `m` a message of this protocol? (any version — the version is checked by the receiver) */
export function isMessage(m) {
  return !!(m && typeof m === 'object' && m.protocol === PROTOCOL.name && typeof m.type === 'string');
}
/** A message of this protocol. */
export function message(type, fields) {
  return Object.assign({ protocol: PROTOCOL.name, v: PROTOCOL.v, type }, fields || {});
}

/* The site this file is served from: it lives at <site>/js/embed-client.js. Read lazily, so importing
   the protocol (the frame does, from inside the app's bundle) never asks where the module is. */
function siteOf(explicit) {
  if (explicit) return new URL(String(explicit), typeof location !== 'undefined' ? location.href : undefined).href;
  return new URL('../', import.meta.url).href;
}

/* ══ mount(target, options) — put a map on the page and return its controller ═════════════════
   target   an element, or a selector for one; the frame is appended to it.
   options  hash         a share-link fragment ('#v=…'); omitted, the app opens where it opens.
            interactive  false for a still picture (no pan, no zoom) — the embed's own `interactive=0`.
            width/height the frame's size (CSS lengths or pixel numbers); default 100% × 450.
            title        the frame's accessible name (WCAG 4.1.2); default 'IntMap'.
            site         the IntMap site to embed; default the one this file was loaded from.
   ⚠ The URL written is the one js/embed-mode.js embedUrl writes (`?embed=1`, `&interactive=0`), spelled
   here because this file may import nothing; tests/developer-embed-checks.test.mjs holds the two equal. */
export function mount(target, options) {
  const o = options || {};
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('IntMap embed: no element ' + String(target));
  const site = siteOf(o.site);
  const origin = new URL(site).origin;
  const src = new URL('index.html', site);
  src.searchParams.set('embed', '1');
  if (o.interactive === false) src.searchParams.set('interactive', '0');
  if (o.hash) src.hash = String(o.hash).charAt(0) === '#' ? String(o.hash).slice(1) : String(o.hash);
  const frame = document.createElement('iframe');
  frame.src = src.href;
  frame.title = o.title || 'IntMap';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  const len = (v, d) => (v == null ? d : (typeof v === 'number' ? v + 'px' : String(v)));
  frame.style.cssText = 'border:0;max-width:100%;width:' + len(o.width, '100%') + ';height:' + len(o.height, '450px') + ';';
  host.appendChild(frame);

  const subs = { ready: new Set(), state: new Set() };
  const waiting = new Map();
  let seq = 0, last = null, readyDone = false, resolveReady;
  const ready = new Promise((ok) => { resolveReady = ok; });
  function onMessage(e) {
    if (e.source !== frame.contentWindow || e.origin !== origin) return;
    const m = e.data;
    if (!isMessage(m)) return;
    if (m.state) last = { state: m.state, hash: m.hash, link: m.link };
    if (m.type === 'ready' && !readyDone) { readyDone = true; resolveReady(last); subs.ready.forEach((f) => { try { f(last); } catch (_) { } }); return; }
    if (m.type === 'state') { subs.state.forEach((f) => { try { f(Object.assign({ cause: m.cause }, last)); } catch (_) { } }); return; }
    if (m.type === 'reply' && waiting.has(m.id)) {
      const w = waiting.get(m.id); waiting.delete(m.id);
      if (m.ok) w.ok(last); else w.fail(new Error(m.error || 'IntMap embed: the command was refused'));
    }
  }
  window.addEventListener('message', onMessage);
  /* a command waits for the frame to be ready: before that, nothing in it is listening */
  function send(type, fields) {
    return ready.then(() => new Promise((ok, fail) => {
      const id = 'c' + (++seq);
      waiting.set(id, { ok, fail });
      frame.contentWindow.postMessage(message(type, Object.assign({ id }, fields || {})), origin);
    }));
  }
  return {
    frame,
    ready,
    /** the last state the frame reported (null before `ready`) */
    current: () => last,
    get: () => send('get'),
    setState: (hash) => send('state', { hash: String(hash || '') }),
    setView: (view) => send('view', Object.assign({}, view)),
    setTime: (at) => send('time', { at: at == null ? 'live' : String(at) }),
    on(type, fn) { const s = subs[type]; if (!s || typeof fn !== 'function') return () => { }; s.add(fn); return () => s.delete(fn); },
    destroy() { window.removeEventListener('message', onMessage); waiting.clear(); frame.remove(); },
  };
}
