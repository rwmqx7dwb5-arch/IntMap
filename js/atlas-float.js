/* ============================================================================
 *  IntMap · Atlas — THE CONVERSATION, FLOATING ON THE MAP   (ui-feedback-nov17)
 *  window-less module, loaded by the Settings code in js/app-body.js and called by js/atlas-console.js
 * ----------------------------------------------------------------------------
 *  Settings 「Atlas の回答の表示」 has two values:
 *    · tab   (default) — Atlas lives in its sidebar tab, as it always has.
 *    · float           — the SAME panel (#atlas-panel, js/atlas-console.js ensure()) is carried onto the
 *                        left of the map, the answer as text lying on the map itself: the conversation above, the
 *                        input below. A whole round trip happens without opening the tab.
 *
 *  ⚠ ONE PANEL, NOT TWO. Nothing here renders a message, owns an input or talks to a model. The node
 *  that moves is the console's own panel, so the conversation, the capabilities, attachments, voice,
 *  the trace and the stop button are the ones the tab has — re-parented, the way mountTab() moves it
 *  into #atlas-feed. Choosing the Atlas tab while floating moves it back (mountTab); leaving the tab
 *  brings it here again. Whoever holds the panel is decided by sync(), from what is on screen.
 *
 *  ⚠ NOT ON A PHONE-WIDTH LAYOUT (js/ui-device.js compact()). There the sidebar is a bottom sheet that
 *  already lies over the map, and a second card plus the on-screen keyboard would leave no map at all;
 *  Atlas stays in its sheet and the setting's hint says so. Not in the workspace either — Atlas is its
 *  own window there — nor in an embed (no Atlas in a frame, js/atlas-loader.js).
 *
 *  ⚠ THE CARD BLOCKS ONLY ITS OWN RECTANGLE. The positioned box spans the left column of the map so the
 *  card can grow upward, but it is pointer-events:none; only the card itself takes the pointer.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';   /* the reader's language for the card's three buttons */

const D = () => (typeof window !== 'undefined' && window.IntMapDevice) || null;

/* ⚠ A CHOSEN DURATION, NOT A MEASURED ONE: long enough to read the first lines of a short answer before
   the card thins. Idle never makes it unreadable (opacity .86, below: a reader still reading must not watch the words thin) and hover or focus restores it at
   once, so the number only decides when the map shows through more. Nothing else reads it. */
const IDLE_MS = 6000;

let mode = 'tab';
let root = null, card = null;
let gone = false;          /* the reader hid the card with its × — brought back by open/toggle (the A key, the Atlas button) */
const BG_KEY = 'intmap.atlas.floatBg';
let bg = false;            /* the conversation sits on a rounded frosted pane (and loses its glow) — the reader's switch, kept across visits */
try { bg = localStorage.getItem(BG_KEY) === '1'; } catch (_) { /* private window: off */ }
let folded = false;        /* the conversation is folded away; the input stays */
let idleT = 0, queued = false, wired = false, chatSeen = null, chatObs = null, warmed = false;

const kt = (key, fb) => { try { return IntMapLang.keyedText(null, key, fb); } catch (_) { return fb; } };

/* ⚠ CSS IN QUOTED STRINGS ONLY (CONSTITUTION §2 — a back-tick here would blank the site). */
const CSS =
  '#atlas-float{position:absolute;left:16px;top:36px;bottom:6px;width:min(380px,calc(100% - 32px));z-index:calc(var(--z-map-overlay) + 50);'
  + 'display:flex;flex-direction:column;justify-content:flex-end;pointer-events:none;}'
  /* the sidebar lies OVER the map in the glass styles, so the card stands right of it there */
  + 'body.sidebar-glass #atlas-float{left:calc(var(--sidebar-w) + 16px);width:min(380px,calc(100% - var(--sidebar-w) - 32px));}'
  + 'body.sidebar-glass:has(#sidebar.collapsed) #atlas-float{left:16px;width:min(380px,calc(100% - 32px));}'
  /* THE CARD IS NOT A SURFACE (2026-11-18): answers lie directly on the map as text (no surface
     at all — see THE ANSWER IS TEXT ON THE MAP below), the bar is a small pill and only the input row becomes a surface. So the card has no background, border, shadow or backdrop-filter, and it does not take the pointer — the map
     under the empty parts of it stays draggable; the pieces that are content (bar, answers, input) take it themselves. */
  + '#atlas-float{--atl-ink-main:var(--text-main);--atl-ink-muted:var(--text-muted);}'
  + '#atlas-float .atl-float-card{pointer-events:none;display:flex;flex-direction:column;min-height:0;max-height:100%;overflow:hidden;color:var(--text-main);'
  + 'opacity:0;transform:translateY(12px) scale(.985);'
  + 'transition:opacity .5s cubic-bezier(.2,.8,.2,1),transform .5s cubic-bezier(.2,.8,.2,1);}'
  + '#atlas-float.on .atl-float-card{opacity:1;transform:none;}'
  /* idle: the map shows through more; the reader's hand or focus brings it back at once */
  + '#atlas-float.on.idle .atl-float-card{opacity:.86;}'
  + '#atlas-float.on .atl-float-card:hover,#atlas-float.on .atl-float-card:focus-within{opacity:1;}'
  + '#atlas-float:not(.on){visibility:hidden;transition:visibility 0s linear .5s;}'
  /* the bar is a control, so it is a small glass pill: the popup colour at 45%, blurred behind */
  + '#atlas-float .atl-float-bar{'
  + 'background:color-mix(in srgb,var(--popup-bg) 45%,transparent);backdrop-filter:saturate(170%) blur(14px);-webkit-backdrop-filter:saturate(170%) blur(14px);}'
  + '#atlas-float .atl-float-bar{pointer-events:auto;align-self:flex-start;border-radius:999px;margin-bottom:6px;display:flex;align-items:center;gap:2px;padding:3px 6px;flex:0 0 auto;}'
  + '#atlas-float .atl-float-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:9px;'
  + 'background:none;color:var(--text-muted);cursor:pointer;transition:background-color .15s ease,color .15s ease,transform .2s ease;}'
  + '#atlas-float .atl-float-btn:hover{background:var(--input-bg);color:var(--text-main);}'
  + '#atlas-float.folded .atl-float-fold svg{transform:rotate(180deg);}'
  + '#atlas-float .atl-float-fold svg{transition:transform .2s ease;}'
  /* the panel inside: no window chrome of its own — the card is the window */
  + '#atlas-float #atlas-panel{position:relative !important;inset:auto !important;left:auto !important;top:auto !important;right:auto !important;bottom:auto !important;'
  + 'width:100% !important;height:auto !important;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;flex:0 1 auto;'
  + 'transform:none !important;border:none !important;border-radius:0 !important;box-shadow:none !important;background:transparent !important;'
  + 'backdrop-filter:none !important;-webkit-backdrop-filter:none !important;resize:none !important;z-index:auto !important;overflow:hidden;}'
  + '#atlas-float #atlas-panel .atl-head,#atlas-float #atlas-panel .atl-sub,#atlas-float #atlas-panel .atl-ex{display:none !important;}'
  + '#atlas-float #atlas-panel .atl-chat{flex:0 1 auto;min-height:0;padding:56px 4px 30px;gap:8px;overscroll-behavior:contain;pointer-events:none;'
  /* THE CONVERSATION FADES, IT IS NOT CLIPPED: an answer that scrolls past the top dissolves over its first 56px instead of ending on a
     hard edge, and one that rises from below appears over its last 30px. The padding is the same length as the fade, so at rest no
     line of text sits inside a fade and the last line stops 30px above the input (the gap in which the bottom fade works). */
  + '-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 56px,#000 calc(100% - 30px),transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 56px,#000 calc(100% - 30px),transparent 100%);}'
  /* THE ANSWER IS TEXT ON THE MAP (2026-11-18, chosen by the reader from three shots: one glass sheet / a feathered shade / text only).
     No piece of an answer paints a surface — no per-line run, no chip, no legend card. What keeps it legible is the halo each glyph
     carries: a tight edge, a soft drop and a wide falloff, in the colour opposite the ink (light ink + dark halo in the dark theme,
     dark ink + light halo in the light one). text-shadow is inherited, so it is set once on the conversation; the reader's own
     question keeps its bubble and so needs no halo. */
  /* THE INK IS WHITE, AND IT CARRIES ITS OWN GLOW (2026-11-26, the reader: no grey text on the map). The tokens the conversation reads its colours
     from are re-pointed to white inside it, so every piece that used the muted grey (labels, step lines, the time, sources) turns white with
     the rest instead of each rule being found one by one. The glow is a dark falloff on the GLYPHS (text-shadow), never a box or a
     filter on a block: a shadow on a rectangle reads as a rectangle. text-shadow is inherited, so it is set once here. */
  + '#atlas-float{--atl-halo:0,0,0;}'
  + '#atlas-float #atlas-panel .atl-chat{text-shadow:0 0 2px rgba(var(--atl-halo),.95),0 0 4px rgba(var(--atl-halo),.9),0 0 8px rgba(var(--atl-halo),.85),0 0 14px rgba(var(--atl-halo),.78),0 0 24px rgba(var(--atl-halo),.65),0 0 40px rgba(var(--atl-halo),.5);--text-main:#fff;--text-muted:#fff;color:#fff;}'
  /* (atlas-float-typography) THE READER OWN MESSAGE IS TEXT TOO. Off the pane it has no bubble: a gradient rectangle with a shadow was a
     box standing in for a glow (the reader: no rectangle may stand in for the glow). It lies on the map like the answer — same white ink,
     same halo on the glyphs — and only its alignment says whose it is. On the frosted pane (.bg, below) it is a plain tinted bar inside it. */
  + '#atlas-float:not(.bg) #atlas-panel .atl-chat .atl-b.u:not(.atl-imgrow){background:none;border-color:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;padding:2px 4px;}'
  /* the input row and the bar are surfaces, so their words carry the glow in the own colour of the surface (opposite the ink), not the black of the map */
  + '#atlas-float:not(.bg) #atlas-panel .atl-inbar :is(.atl-in,button,.m-clock){text-shadow:0 0 3px color-mix(in srgb,var(--popup-bg) 95%,transparent),0 0 8px color-mix(in srgb,var(--popup-bg) 80%,transparent),0 0 16px color-mix(in srgb,var(--popup-bg) 60%,transparent);}'
  + '#atlas-float:not(.bg) #atlas-panel .atl-in::placeholder{text-shadow:0 0 3px color-mix(in srgb,var(--popup-bg) 95%,transparent),0 0 8px color-mix(in srgb,var(--popup-bg) 80%,transparent);}'
  /* THE CONVERSATION CAN BE REACHED. The rectangle used to be pointer-events:none all the way down, with a few inner pieces opting back in, so a
     wheel over a bubble, its copy/edit buttons or the gaps between lines went to the map (it zoomed, the answer did not scroll). The structure
     is now: the empty column stays transparent to the pointer (the fades and padding), and everything the conversation is made of takes it. */
  + '#atlas-float #atlas-panel .atl-chat>.atl-b,#atlas-float #atlas-panel .atl-chat>.atl-msgt,#atlas-float #atlas-panel .atl-chat>:not(.atl-b){pointer-events:auto;}'
  + '#atlas-float #atlas-panel .atl-chat .atl-b.u{pointer-events:auto;}'
  /* THE BACKGROUND SWITCH (the bar's third button). On: the conversation sits on one rounded frosted pane in the app's own glass tokens, the
     ink goes back to the theme's and the glow is off (the pane is what keeps it legible). Off: text on the map. */
  + '#atlas-float.bg #atlas-panel .atl-chat{--text-main:var(--atl-ink-main);--text-muted:var(--atl-ink-muted);color:var(--atl-ink-main);text-shadow:none;pointer-events:auto;'
  + 'background:color-mix(in srgb,var(--popup-bg) 34%,transparent);backdrop-filter:saturate(170%) blur(22px);-webkit-backdrop-filter:saturate(170%) blur(22px);'
  + 'border:1px solid color-mix(in srgb,var(--text-main) 12%,transparent);border-radius:14px;padding:14px 12px 14px;margin-bottom:8px;-webkit-mask-image:none;mask-image:none;}'
  + '#atlas-float.bg #atlas-panel .atl-chat .atl-b.u{--atlas-glass:linear-gradient(135deg,rgba(0,122,255,.34),rgba(94,92,230,.30) 56%,rgba(191,90,242,.28));}'
  + '#atlas-float .atl-float-bg[aria-pressed="true"]{background:var(--input-bg);color:var(--text-main);}'
  + '#atlas-float .atl-b.a :is(.atl-md,.atl-md>*,.atl-cmp,.atl-actrow,.atl-srcs,.atl-fold,.atl-interim){background:none;border-color:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;}'
  + '#atlas-float .atl-b.a .atl-md{display:block;pointer-events:auto;padding:0;color:var(--text-main);font-size:15px;line-height:1.75;}'
  + '#atlas-float .atl-b.a .atl-md>p+p{margin-top:.75em;}'
  + '#atlas-float .atl-b.a .atl-cmp{pointer-events:auto;padding:0;margin:12px 0 4px;border-radius:0;font-size:.92em;}'
  + '#atlas-float .atl-b.a .atl-actrow,#atlas-float .atl-b.a .atl-srcs,#atlas-float .atl-b.a .atl-fold,#atlas-float .atl-b.a .atl-interim{pointer-events:auto;display:block;width:fit-content;max-width:100%;box-sizing:border-box;padding:4px 0;}'
  + '#atlas-float .atl-b.a .atl-actrow{display:flex;}'
  + '#atlas-float .atl-b.a .atl-md :is(.atl-ctl-row,.atl-row){pointer-events:auto;}'
  + '#atlas-float #atlas-panel .atl-chat:empty,#atlas-float.folded #atlas-panel .atl-chat{display:none;}'
  /* the input row: the one surface, bottom-left, and it only becomes one when it is used — quiet at rest (a faint glass and a
     hairline), its edge on hover, a full surface with a shadow while the caret is in it */
  + '#atlas-float #atlas-panel .atl-inbar{pointer-events:auto;border:1px solid color-mix(in srgb,var(--text-main) 12%,transparent);border-radius:26px;padding:6px 8px;'
  + 'background:color-mix(in srgb,var(--popup-bg) 30%,transparent);backdrop-filter:saturate(170%) blur(22px);-webkit-backdrop-filter:saturate(170%) blur(22px);'
  + 'box-shadow:none;transition:background-color .25s ease,border-color .25s ease,box-shadow .25s ease;}'
  + '#atlas-float #atlas-panel .atl-inbar:hover{border-color:color-mix(in srgb,var(--text-main) 24%,transparent);}'
  + '#atlas-float #atlas-panel .atl-inbar:focus-within{background:color-mix(in srgb,var(--popup-bg) 72%,transparent);border-color:color-mix(in srgb,var(--text-main) 28%,transparent);box-shadow:0 10px 30px rgba(0,0,0,0.28);}'
  + '#atlas-float #atlas-panel .atl-in{background:transparent;}'
  + '@media (prefers-reduced-motion:reduce){#atlas-float #atlas-panel .atl-inbar{transition:none;}}'
  /* what arrives while the card is on the map comes in softly */
  + '#atlas-float .atl-float-new{animation:atl-float-in .55s cubic-bezier(.2,.8,.2,1) both;}'
  + '@keyframes atl-float-in{from{opacity:0;transform:translateY(8px);filter:blur(3px);}to{opacity:1;transform:none;filter:none;}}'
  + '@media (prefers-reduced-motion:reduce){#atlas-float .atl-float-card{transition:opacity .01s linear;transform:none;}'
  + '#atlas-float .atl-float-new{animation:none;}#atlas-float .atl-float-fold svg{transition:none;}}';

const SVG_FOLD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const SVG_BG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="4.5"/><path d="M8 10h8M8 14h5"/></svg>';
const SVG_X = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function ensureCss() {
  if (document.getElementById('atlas-float-css')) return;
  const s = document.createElement('style'); s.id = 'atlas-float-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

function btn(cls, svg, key, fb, on) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'atl-float-btn ' + cls; b.innerHTML = svg;
  b.setAttribute('data-i18n-title', key); b.setAttribute('data-i18n-aria', key);
  b.title = kt(key, fb); b.setAttribute('aria-label', b.title);
  b.addEventListener('click', on);
  return b;
}

function ensureRoot() {
  if (root && root.isConnected) return root;
  const host = document.getElementById('map-container') || ((document.getElementById('map') || {}).parentElement);
  if (!host) return null;
  ensureCss();
  root = document.createElement('section');
  root.id = 'atlas-float'; root.setAttribute('aria-label', 'Atlas');
  card = document.createElement('div'); card.className = 'atl-float-card';
  const bar = document.createElement('div'); bar.className = 'atl-float-bar';
  bar.appendChild(btn('atl-float-fold', SVG_FOLD, 'atlFloatFold', 'Collapse conversation', () => setFolded(!folded)));
  bar.appendChild(btn('atl-float-bg', SVG_BG, 'atlFloatBg', 'Frosted background behind the conversation', () => setBg(!bg)));
  bar.appendChild(btn('atl-float-x', SVG_X, 'atlFloatHide', 'Hide (press A to bring it back)', () => { gone = true; paint(); }));
  card.appendChild(bar);
  root.appendChild(card);
  /* the idle clock restarts when the hand or the focus leaves the card */
  card.addEventListener('pointerleave', wake);
  card.addEventListener('focusout', wake);
  host.appendChild(root);
  /* a panel that leaves the card (mountTab, the workspace) leaves the card empty — repaint */
  try { new MutationObserver(paint).observe(card, { childList: true }); } catch (_) { }
  return root;
}

function setBg(v) {
  bg = !!v;
  try { localStorage.setItem(BG_KEY, bg ? '1' : '0'); } catch (_) { /* a convenience, not a record */ }
  paint(); wake();
}

function setFolded(v) {
  folded = !!v;
  if (!root) return;
  root.classList.toggle('folded', folded);
  const b = root.querySelector('.atl-float-fold');
  if (b) {
    const key = folded ? 'atlFloatUnfold' : 'atlFloatFold';
    b.setAttribute('data-i18n-title', key); b.setAttribute('data-i18n-aria', key);
    b.title = kt(key, folded ? 'Show conversation' : 'Collapse conversation'); b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-expanded', folded ? 'false' : 'true');
  }
  wake();
}

/* ── where the panel belongs right now ─────────────────────────────────────────────────────── */
function compact() { try { return !!(D() && D().compact()); } catch (_) { return false; } }
function embedded() { try { return !!(D() && D().embedded && D().embedded()); } catch (_) { return false; } }
function ws() { return document.body.classList.contains('ws-mode'); }
function eligible() { return mode === 'float' && !compact() && !ws() && !embedded(); }
function feed() { return document.getElementById('atlas-feed'); }
function panelEl() { return document.getElementById('atlas-panel'); }
/* the Atlas tab is what the reader is looking at: its content area is shown and the sidebar is open */
function tabShown() {
  const af = feed(); if (!af || !af.isConnected) return false;
  if (af.style.display === 'none') return false;
  const sb = document.getElementById('sidebar'); if (sb && sb.classList.contains('collapsed')) return false;
  try { return getComputedStyle(af).display !== 'none'; } catch (_) { return true; }
}
function holds(p) { return !!(p && card && p.parentNode === card); }

function claim(p) {
  if (!ensureRoot()) return;
  if (p.parentNode !== card) card.appendChild(p);
  /* ⚠ `atl-tab` STAYS: js/window-manager.js reads it as 「not a free window」 and gives the panel no
     edge-resize zone — the card, not the panel, is what has a size here. This file's rules outrank the
     tab's (two ids against one), so it does not draw as the tab. */
  p.classList.add('atl-tab'); p.classList.remove('atl-min');
  ['left', 'top', 'width', 'height', 'transform'].forEach((k) => { try { p.style.removeProperty(k); } catch (_) { } });
  p.style.display = 'flex';
  watchChat(p);
}
function release(p) {
  if (ws()) {
    /* the workspace opens Atlas as its own window from where ensure() first put it */
    const mc = document.getElementById('map-container') || document.body;
    mc.appendChild(p); p.style.display = 'none';
    return;
  }
  /* the tab (or the phone sheet) is where the panel lives otherwise — as mountTab() leaves it */
  const af = feed();
  if (af) { af.appendChild(p); p.classList.add('atl-tab'); p.style.display = 'flex'; }
}

function sync() {
  queued = false;
  const p = panelEl();
  if (p) {
    /* going to the Atlas tab is reaching for Atlas: a card hidden with × comes back when the tab is left */
    if (tabShown()) gone = false;
    if (eligible() && !tabShown()) claim(p);
    else if (holds(p)) release(p);
  }
  paint();
}
function soon() { if (queued) return; queued = true; queueMicrotask(sync); }

function paint() {
  if (!root) return;
  const on = eligible() && !gone && holds(panelEl());
  const was = root.classList.contains('on');
  root.classList.toggle('on', on);
  root.classList.toggle('folded', folded);
  root.classList.toggle('bg', bg);
  const bb = root.querySelector('.atl-float-bg'); if (bb) bb.setAttribute('aria-pressed', String(bg));
  if (on && !was) wake();
}

/* ── idle and arrival ──────────────────────────────────────────────────────────────────────── */
function busy() { const p = panelEl(); return !!(p && p.querySelector('.atl-go.busy')); }
function wake() {
  if (!root) return;
  root.classList.remove('idle');
  clearTimeout(idleT);
  idleT = setTimeout(goIdle, IDLE_MS);
}
function goIdle() {
  if (!root || !root.classList.contains('on')) return;
  if (busy() || (card && (card.matches(':hover') || card.matches(':focus-within')))) { wake(); return; }
  root.classList.add('idle');
}
/* whatever lands in the conversation while the card is on the map wakes it, and a new message or trace
   fades in. A new turn also unfolds a folded card: the reader asked for this answer. */
function watchChat(p) {
  const chat = p.querySelector('.atl-chat');
  if (!chat || chatSeen === chat) return;
  chatSeen = chat;
  try { if (chatObs) chatObs.disconnect(); } catch (_) { }
  try {
    chatObs = new MutationObserver((recs) => {
      if (!holds(panelEl()) || !root || !root.classList.contains('on')) return;
      let fresh = false;
      for (const r of recs) {
        if (r.target !== chat) continue;
        r.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          fresh = true;
          /* worn once: a node that kept it would fade in again every time the panel came back from the tab */
          n.classList.add('atl-float-new');
          n.addEventListener('animationend', () => { try { n.classList.remove('atl-float-new'); } catch (_) { } }, { once: true });
        });
      }
      if (fresh && folded) setFolded(false);
      wake();
    });
    chatObs.observe(chat, { childList: true, subtree: true, characterData: true });
  } catch (_) { }
}

/* the panel is the kernel's; the kernel is lazy (js/atlas-loader.js). A float reader needs the input on
   the map, so the kernel is fetched once the page has settled rather than on the first press. */
function warm() {
  if (warmed || !eligible()) return;
  warmed = true;
  const go = () => {
    try {
      window.IntMapAtlas.ensure().then((C) => {
        try { if (C && typeof C.panel === 'function') C.panel(); } catch (_) { }
        soon();
      });
    } catch (_) { }
  };
  if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 1200);
}

function wire() {
  if (wired) return; wired = true;
  const obs = (el, o) => { try { if (el) new MutationObserver(soon).observe(el, o); } catch (_) { } };
  obs(feed(), { attributes: true, attributeFilter: ['style'], childList: true });
  obs(document.getElementById('sidebar'), { attributes: true, attributeFilter: ['class'] });
  obs(document.body, { attributes: true, attributeFilter: ['class'] });
  /* the panel is born in #map-container (ensure()); that is where a first panel is seen */
  obs(document.getElementById('map-container'), { childList: true });
  try { if (D() && D().on) D().on(soon); } catch (_) { }
}

/** applyAtlasDisplay('tab' | 'float') — the Settings value, applied now and on every change. */
export function applyAtlasDisplay(m) {
  mode = m === 'float' ? 'float' : 'tab';
  if (mode === 'float') { gone = false; ensureRoot(); wire(); warm(); }
  sync();
}

/** floatRoute('open' | 'close' | 'toggle') — js/atlas-console.js asks before its own open/close/toggle.
    true = handled here (the floating card is where Atlas is); false = the console does what it always did. */
export function floatRoute(kind) {
  if (!eligible() || tabShown()) return false;
  let p = panelEl();
  if (!p) { try { const C = window.IntMapConsole; if (C && typeof C.panel === 'function') p = C.panel(); } catch (_) { } }
  if (!p) return false;
  const shown = holds(p) && root && root.classList.contains('on');
  if (kind === 'close' || (kind === 'toggle' && shown)) {
    if (!holds(p)) return false;
    gone = true; paint(); return true;
  }
  gone = false;
  claim(p); paint();
  if (folded) setFolded(false);
  wake();
  setTimeout(() => { try { const i = p.querySelector('.atl-in'); if (i) i.focus(); } catch (_) { } }, 60);
  return true;
}
