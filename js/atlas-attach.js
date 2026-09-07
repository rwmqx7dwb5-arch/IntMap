/* ============================================================================
 *  IntMap · Atlas — attachments: what a file IS, and the full-screen viewer   (#R232)
 * ----------------------------------------------------------------------------
 *  「Atlasに画像を添付した時送信した画像をタップすると、それを見れるように。（全面に表示され、背景が
 *    暗くなるというよくある形式で。こまかいUIは任せる。）」
 *
 *  The chat caps a sent picture at 230–280 px, which is the right size for a conversation and the
 *  wrong size for looking at what you sent. This is the conventional viewer: the page dims, the
 *  picture takes the screen at its own aspect ratio, and anything — the backdrop, the ×, Escape,
 *  the browser Back button — closes it.
 *
 *  ⚠ IT LIVES ON <body>, NOT INSIDE #atlas-panel. The panel is a 400 px box with `overflow` and its
 *  own stacking context; a full-screen overlay inside it would be clipped to it. The z-index sits
 *  above the panel's 1850 and above the mobile sheet's 1460.
 *
 *  ⚠ AND IT PUSHES A HISTORY ENTRY, so on a phone the Back gesture closes the picture instead of
 *  leaving the map — the rule every other full-screen surface in this app follows.
 *
 *  It also holds the three PURE questions the attach path asks — is this file an image, is it text,
 *  and how big is it — which need no closure at all and were the last of that subject still in the
 *  kernel.
 *
 *  ⚠ ITS OWN FILE BECAUSE js/atlas-console.js HAS A LINE CEILING (tests/r199-checks ⑤,
 *  tests/r200-checks ⑤: under 5,300, and it follows the floor DOWN). A new subject goes to a new
 *  file — that ceiling exists precisely so 「中心部がまだ巨大」 cannot come back one feature at a time.
 *  A real ES module: nothing registers it on window.IntMapModules and nothing orders it in
 *  src/main.js; js/atlas-console.js names it in an `import`, so the bundler resolves the binding.
 * ==========================================================================*/

/** THE ONE ENTRY POINT: delegate from the chat element, once. Every picture the conversation will
 *  ever hold is covered, nothing is attached per image, and nothing leaks when the panel is rebuilt. */
export function attachLightbox(chatEl, closeLabel) {
  if (!chatEl || chatEl.__lb) return;
  /* ⚠ NOT EXPORTED, AND NOT TOP-LEVEL EITHER. tests/r175-checks ③ allows a top-level declaration in
     js/ only when it is exported AND imported by name — a private helper is exactly what that rule
     forbids — so both the opener and its closer live inside the one thing this module publishes.
     Open `src` full-screen; `closeLabel` is the × button's accessible name, already localised. */
  function _open(src, closeLabel) {
    if (!src) return;
    /* ⚠ `close` IS DECLARED HERE, NOT AT THE TOP OF THE FILE. tests/r175-checks ③ allows a top-level
       declaration in js/ only when it is exported AND imported by name; a private helper is exactly
       what that rule forbids, so the only closing logic lives inside the function that opens. */
    const close = (fromPop) => {
      const cur = document.querySelector('.atl-lightbox'); if (!cur) return;
      try { cur.remove(); } catch (_) {}
      try { document.removeEventListener('keydown', cur.__esc, true); } catch (_) {}
      try { if (!fromPop && cur.__pushed) history.back(); } catch (_) {}
    };
    close();
    const el = document.createElement('div');
    el.className = 'atl-lightbox';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    const img = document.createElement('img');
    img.src = src; img.alt = '';
    /* tapping the PICTURE must not close it — only tapping around it does, which is the convention
       every gallery uses and the reason the backdrop carries the handler rather than the document. */
    img.addEventListener('click', (e) => e.stopPropagation());

    /* ══ (#R233) ZOOM ═════════════════════════════════════════════════════════════════════════
       「送信した画像をタップした画面で、画像をズーム可能に。」 #R232 gave the picture the screen at
       its own aspect ratio, which is still ONE size — a screenshot pasted into Atlas is exactly the
       kind of image you open in order to read something small in it.

       Wheel / pinch / double-tap, and drag to pan once it is bigger than the frame. Pointer events
       so one implementation covers mouse, touch and pen.

       ⚠ ZOOM IS ABOUT THE POINTER, NOT THE CENTRE. Keeping the pixel under the finger fixed is what
       makes this feel like a viewer rather than a slider: with local coordinate u = (P−C−T)/S held
       constant across the scale change, T′ = d − (d−T)·S′/S where d = P − C.
       ⚠ AND A DRAG MUST NOT CLOSE THE PICTURE. The backdrop's click handler is what closes, and a
       pan that ends over the backdrop is a click on it — so a gesture that moved is remembered and
       the next click is swallowed. Without this, panning a zoomed image dismisses it. */
    let S = 1, TX = 0, TY = 0, moved = false;
    const pts = new Map();
    let pinch0 = 0, s0 = 1;
    const paint = () => {
      img.style.transform = 'translate(' + TX + 'px,' + TY + 'px) scale(' + S + ')';
      img.classList.toggle('atl-lb-zoomed', S > 1.001);
    };
    /* keep at least a third of the picture reachable, so it cannot be flung out of the window */
    const clamp = () => {
      const r = img.getBoundingClientRect(), w = r.width, h = r.height;
      const mx = Math.max(0, (w - innerWidth) / 2 + w / 3), my = Math.max(0, (h - innerHeight) / 2 + h / 3);
      TX = Math.max(-mx, Math.min(mx, TX)); TY = Math.max(-my, Math.min(my, TY));
    };
    const zoomAt = (px, py, next) => {
      const s2 = Math.max(1, Math.min(8, next));
      if (s2 === S) return;
      const b = img.getBoundingClientRect();
      const cx = b.left + b.width / 2 - TX, cy = b.top + b.height / 2 - TY;   /* untransformed centre */
      const dx = px - cx, dy = py - cy;
      TX = dx - (dx - TX) * (s2 / S); TY = dy - (dy - TY) * (s2 / S);
      S = s2;
      if (S === 1) { TX = 0; TY = 0; } else clamp();
      paint();
    };
    el.addEventListener('wheel', (e) => {
      e.preventDefault(); zoomAt(e.clientX, e.clientY, S * Math.pow(1.0016, -e.deltaY));
    }, { passive: false });
    img.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); zoomAt(e.clientX, e.clientY, S > 1.001 ? 1 : 2.5); });
    img.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { img.setPointerCapture(e.pointerId); } catch (_) {}
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; s0 = S;
      }
    });
    img.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        moved = true;
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, s0 * (d / pinch0));
      } else if (S > 1.001) {
        if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
        TX += dx; TY += dy; clamp(); paint();
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    img.addEventListener('pointerup', up); img.addEventListener('pointercancel', up);
    /* double-TAP on touch, where dblclick is unreliable */
    let lastTap = 0;
    img.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      const t = e.timeStamp;
      if (t - lastTap < 300 && !moved) { zoomAt(e.clientX, e.clientY, S > 1.001 ? 1 : 2.5); lastTap = 0; }
      else lastTap = t;
    });

    const x = document.createElement('button');
    x.className = 'atl-lb-x'; x.type = 'button';
    x.setAttribute('aria-label', closeLabel || window.IntMapLang.t(document.documentElement.lang,'Close','閉じる','Schließen','Закрыть','Cerrar')); x.textContent = '×';
    el.appendChild(img); el.appendChild(x);
    x.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    el.addEventListener('click', () => { if (moved) { moved = false; return; } close(); });
    el.__esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', el.__esc, true);
    try {
      history.pushState({ atlLb: 1 }, ''); el.__pushed = true;
      window.addEventListener('popstate', function once() { window.removeEventListener('popstate', once); close(true); });
    } catch (_) {}
    document.body.appendChild(el);
  }

  chatEl.__lb = true;
  chatEl.addEventListener('click', (e) => {
    /* (#R493) `.atl-viewframe img` is the frame Atlas captured with view.inspect, shown back inside
       the answer. It is a picture in the chat like any other, so it opens in the same viewer — a
       340-pixel thumbnail of a map is a thing you have to be able to enlarge. ⚠ THE SELECTOR IS THE
       WHOLE BINDING: a class renamed on one side and not here fails SILENTLY (the click simply does
       nothing), which is why tests/r493-checks.test.mjs reads both spellings out of the sources. */
    const im = e.target && e.target.closest && e.target.closest('.atl-imgrow-in img, .atl-viewframe img');
    if (im && im.src) { e.preventDefault(); e.stopPropagation(); _open(im.src, (typeof closeLabel === 'function') ? closeLabel() : closeLabel); }
  });
}

/** The overlay's CSS, appended to the stylesheet js/atlas-console.js builds. */
export const LIGHTBOX_CSS =
  '.atl-lightbox{position:fixed;inset:0;z-index:2600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:atlLbIn .16s ease;padding:24px;box-sizing:border-box;cursor:zoom-out;}'
  + '@keyframes atlLbIn{from{opacity:0}to{opacity:1}}'
  /* (#R233) `touch-action:none` is what makes the pinch reach this element instead of the browser's
     own page zoom, and `will-change:transform` keeps the scaled bitmap on its own layer while it is
     being dragged. `transform-origin:center` is the frame the zoom arithmetic in _open assumes. */
  + '.atl-lightbox img{max-width:100%;max-height:100%;width:auto;height:auto;border-radius:10px;box-shadow:0 18px 60px rgba(0,0,0,0.55);cursor:zoom-in;touch-action:none;transform-origin:center center;will-change:transform;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;}'
  + '.atl-lightbox img.atl-lb-zoomed{cursor:grab;}'
  + '.atl-lightbox img.atl-lb-zoomed:active{cursor:grabbing;}'
  /* (#R233) 「×ボタンは丸ではなく四角に。」 A rounded SQUARE — the corner radius matches the picture's
     own 10px so the two shapes belong to the same sheet, and 50% (a circle) is gone. */
  + '.atl-lightbox .atl-lb-x{position:absolute;top:max(12px,env(safe-area-inset-top));right:14px;width:40px;height:40px;border:none;border-radius:10px;background:rgba(255,255,255,0.14);color:#fff;font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}'
  + '.atl-lightbox .atl-lb-x:hover{background:rgba(255,255,255,0.26);}'
  + '@media(max-width:768px){ .atl-lightbox{padding:10px;} }';

/* ══ WHAT A FILE IS — ASKED OF THE BYTES, NOT OF ITS NAME ════════════════════════════════════
 *  (#R540) 「Atlasに添付できるファイルの種類が少なすぎる。」
 *
 *  ⚠ THE OLD ANSWER WAS A LIST OF SPELLINGS. `atlFileKind` decided "is this text?" from the
 *  browser-declared MIME type plus a hand-written regex of 75 extensions. Everything the list did
 *  not name was refused — PDF, every Office document, every archive, and every text format nobody
 *  had thought of (.adoc, .org, .gpx, .wkt, .f90, .editorconfig …). That is the exact shape
 *  .agents/rules/no-ad-hoc-hardcoding.md §1 forbids: an embedded list of names for something that
 *  can be DERIVED. The list could only ever be extended one complaint at a time.
 *
 *  ⚠ AND THE LIST WAS ALSO WRONG IN THE OTHER DIRECTION. `image/*` matched by prefix, so a HEIC
 *  from an iPhone or an SVG was called an image; if the canvas could not draw it, compressImage
 *  resolved the ORIGINAL data URL, and ai-proxy — which accepts exactly png/jpeg/webp/gif —
 *  dropped it with `continue`. No toast, no error: the picture simply never reached the model.
 *
 *  SO NOTHING HERE READS A FILE'S NAME. Each question is asked of the thing itself:
 *    · is it a PDF?              — the %PDF- signature, which the providers read natively
 *    · is it a container?        — the ZIP/gzip signature; the parts inside answer what it holds
 *    · is it an image?           — hand it to the encoder and see whether a raster comes back
 *    · is it text?               — decode the bytes; if some encoding yields text, it is text
 *  Only when all four say no is the file refused, and then it is refused BY REASON, so the reader
 *  is told what happened instead of being read a list of what is allowed.
 *
 *  Pure enough to evaluate outside a browser: the only capability it cannot supply itself is the
 *  image encoder (canvas), which the caller injects — tests/r540 drives every other path for real
 *  rather than reading this source for spellings (#R505).
 * ==========================================================================================*/
export const ATL_FILE = (function () {
  /* ⚠ THE CLIENT'S HALF OF A BOUND THE SERVER ALSO ENFORCES. supabase/functions/ai-proxy holds the
     same numbers because it cannot trust these; tests/r540 ⑤ holds the two equal rather than
     trusting that someone edited both (#R504 — "そろえた" is not two copies of a number, it is a
     check that the two are equal). Provenance of each: see ai-proxy's ATTACHMENT BOUNDS block. */
  const LIMITS = Object.freeze({
    images: 4, files: 8, docs: 4,
    textPerFile: 120000, textTotal: 400000,
    docBytes: 8 * 1024 * 1024, docsBytes: 12 * 1024 * 1024,
    /* ⚠ THE CEILING ON WHAT IS EVEN READ INTO MEMORY, and it has no server half — the server never
       sees these bytes. Every question below needs the WHOLE file (a text decode, a ZIP central
       directory, a PDF's bytes), so without this a dropped 4 GB video would be read into the tab
       before anything could say no. Eight times the largest thing that can actually be sent. */
    readBytes: 64 * 1024 * 1024,
    sniff: 4096, zipEntries: 4096,
  });
  const DOC_MIME = 'application/pdf';

  /* ── signatures ─────────────────────────────────────────────────────────────────────────── */
  function starts(b, sig, at) { at = at || 0; if (at + sig.length > b.length) return false; for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false; return true; }
  function sniff(b) {
    if (!b || b.length < 4) return null;
    if (starts(b, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return 'ole';   /* legacy .doc/.xls/.ppt */
    if (starts(b, [0x1F, 0x8B])) return 'gzip';
    if (b[0] === 0x50 && b[1] === 0x4B && (b[2] === 3 || b[2] === 5 || b[2] === 7)) return 'zip';
    /* ⚠ %PDF- NEED NOT BE AT BYTE 0 — ISO 32000-1 §7.5.2 allows leading bytes, and scanners emit
       them. A check at offset 0 alone rejects PDFs that every reader opens. */
    const lim = Math.min(b.length, 1024), P = [0x25, 0x50, 0x44, 0x46, 0x2D];
    for (let i = 0; i <= lim - 5; i++) if (starts(b, P, i)) return 'pdf';
    return null;
  }

  /* ── text: decided by decoding, not by extension ────────────────────────────────────────── */
  /* The legacy encodings every browser must decode (WHATWG Encoding Standard §5 index list; Node's
     TextDecoder ships the same set). ORDER IS THE TIE-BREAK and it is not arbitrary: a byte string
     can be valid in several of these at once, so the permissive ones come last — gb18030 accepts
     nearly every byte sequence, and windows-1252 accepts all but five, so either would win over the
     encoding the file is actually in. Expires if a label stops being accepted: dec() returns null
     and the candidate is skipped, never crashing the read. */
  const LEGACY = ['shift_jis', 'euc-jp', 'iso-2022-jp', 'big5', 'euc-kr', 'windows-1251', 'gb18030', 'windows-1252'];
  function dec(bytes, label, fatal) { try { return new TextDecoder(label, { fatal: !!fatal }).decode(bytes); } catch (_) { return null; } }
  /* How much of this string could only be a MIS-decode. C1 controls and private-use characters are
     what a wrong table produces; a real document has neither. */
  function badness(t) {
    let bad = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c === 0xFFFD) bad += 3;
      else if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) bad += 3;
      else if (c >= 0x80 && c <= 0x9F) bad += 2;
      else if (c >= 0xE000 && c <= 0xF8FF) bad += 2;
    }
    return bad / Math.max(1, t.length);
  }
  function decodeText(bytes) {
    if (!bytes) return null;
    if (!bytes.length) return { text: '', encoding: 'utf-8' };
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) { const t = dec(bytes.subarray(3), 'utf-8'); return t == null ? null : { text: t, encoding: 'utf-8' }; }
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) { const t = dec(bytes.subarray(2), 'utf-16le'); return t == null ? null : { text: t, encoding: 'utf-16le' }; }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) { const t = dec(bytes.subarray(2), 'utf-16be'); return t == null ? null : { text: t, encoding: 'utf-16be' }; }
    /* A NUL byte is the one thing none of the encodings below produce from real text — and it is
       what every executable, every raster and every compressed stream has in the first kilobytes. */
    const probe = Math.min(bytes.length, 8192);
    for (let i = 0; i < probe; i++) if (bytes[i] === 0) return null;
    const utf8 = dec(bytes, 'utf-8', true);
    if (utf8 != null) return { text: utf8, encoding: 'utf-8' };
    for (const lab of LEGACY) { const t = dec(bytes, lab, true); if (t != null && badness(t) <= 0.02) return { text: t, encoding: lab }; }
    return null;
  }

  /* ── XML → prose, without a parser (the parts below are machine-written, not user markup) ── */
  function ents(s) {
    return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        const n = (e.charAt(1) === 'x' || e.charAt(1) === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return (isFinite(n) && n > 0 && n <= 0x10FFFF) ? String.fromCodePoint(n) : m; } catch (_) { return m; }
      }
      const T = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      return Object.prototype.hasOwnProperty.call(T, e) ? T[e] : m;
    });
  }
  /* ⚠ REMOVING A MULTI-CHARACTER SEQUENCE ONCE CAN PUT IT BACK. `<<!--x-->!--y-->` loses its inner
     comment and the outer halves close up into a comment again; `<scr<b>ipt>` closes up into a tag.
     One pass is therefore not "strip the markup", it is "strip most of the markup" — so each of
     these runs to a FIXED POINT. (CodeQL js/incomplete-multi-character-sanitization named both, on
     this file, and it is right about the shape even though this output is plain text handed to the
     model rather than HTML: the reader of a .docx should get what the document says, not a fragment
     that reassembled itself.) Each pass strictly shortens the string or changes nothing and ends
     the loop, so it terminates; the guard is there so a pathological part cannot spin. */
  function strip(s, re) {
    for (let i = 0; i < 64; i++) { const n = s.replace(re, ''); if (n === s) return s; s = n; }
    return s;
  }
  function xmlText(xml, breaks) {
    let s = strip(String(xml || ''), /<!--[\s\S]*?-->/g).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    (breaks || []).forEach(function (br) { s = s.replace(br[0], br[1]); });
    return ents(strip(s, /<[^>]*>/g));
  }
  function tidy(s) { return String(s || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }

  /* ── ZIP: central directory + DecompressionStream, enough to read a container's parts ────── */
  async function inflate(bytes, method) {
    if (method === 0) return bytes;
    if (method !== 8) return null;
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(st).arrayBuffer());
    } catch (_) { return null; }
  }
  async function gunzip(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(st).arrayBuffer());
    } catch (_) { return null; }
  }
  function zipOpen(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eo = -1; const from = Math.max(0, b.length - 22 - 65535);
    for (let i = b.length - 22; i >= from; i--) { if (dv.getUint32(i, true) === 0x06054B50) { eo = i; break; } }
    if (eo < 0) return null;
    let n = dv.getUint16(eo + 10, true), cd = dv.getUint32(eo + 16, true);
    /* Zip64: the locator sits 20 bytes before the end record once a count or offset saturates. */
    if (n === 0xFFFF || cd === 0xFFFFFFFF) {
      const lo = eo - 20;
      if (lo >= 0 && dv.getUint32(lo, true) === 0x07064B50) {
        const z64 = Number(dv.getBigUint64(lo + 8, true));
        if (z64 >= 0 && z64 + 56 <= b.length && dv.getUint32(z64, true) === 0x06064B50) {
          n = Number(dv.getBigUint64(z64 + 32, true)); cd = Number(dv.getBigUint64(z64 + 48, true));
        }
      }
    }
    const dir = new Map(); let p = cd;
    for (let i = 0; i < n && i < LIMITS.zipEntries && p + 46 <= b.length; i++) {
      if (dv.getUint32(p, true) !== 0x02014B50) break;
      const method = dv.getUint16(p + 10, true);
      let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      let lho = dv.getUint32(p + 42, true);
      const name = dec(b.subarray(p + 46, p + 46 + nlen), 'utf-8') || '';
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || lho === 0xFFFFFFFF) {
        let q = p + 46 + nlen; const end = q + elen;
        while (q + 4 <= end) {
          const id = dv.getUint16(q, true), sz = dv.getUint16(q + 2, true); let r = q + 4;
          if (id === 0x0001) {
            if (usize === 0xFFFFFFFF) { usize = Number(dv.getBigUint64(r, true)); r += 8; }
            if (csize === 0xFFFFFFFF) { csize = Number(dv.getBigUint64(r, true)); r += 8; }
            if (lho === 0xFFFFFFFF) { lho = Number(dv.getBigUint64(r, true)); r += 8; }
          }
          q += 4 + sz;
        }
      }
      p += 46 + nlen + elen + clen;
      if (!name || name.charAt(name.length - 1) === '/' || !usize) continue;
      dir.set(name, { method: method, csize: csize, lho: lho });
    }
    return {
      names: [...dir.keys()],
      async read(nm) {
        const e = dir.get(nm); if (!e) return null;
        if (e.lho + 30 > b.length || dv.getUint32(e.lho, true) !== 0x04034B50) return null;
        const lnl = dv.getUint16(e.lho + 26, true), lel = dv.getUint16(e.lho + 28, true);
        const at = e.lho + 30 + lnl + lel;
        if (at + e.csize > b.length) return null;
        return inflate(b.subarray(at, at + e.csize), e.method);
      },
    };
  }

  /* ── what a container HOLDS — answered by the parts inside it, not by the file's name ────── */
  function zipKind(names) {
    const has = function (n) { return names.indexOf(n) >= 0; };
    if (has('word/document.xml')) return 'docx';
    if (has('xl/workbook.xml')) return 'xlsx';
    if (has('ppt/presentation.xml')) return 'pptx';
    if (has('content.xml') && has('mimetype')) return 'odf';
    if (names.some(function (n) { return /\.kml$/i.test(n); })) return 'kmz';
    return 'zip';
  }
  function colNum(ref) { let n = 0; for (let i = 0; i < ref.length; i++) n = n * 26 + (ref.charCodeAt(i) - 64); return n; }
  async function sheetRows(xml, shared) {
    const out = [];
    for (const rm of String(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = []; let auto = 0;
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g)) {
        const at = cm[1] || cm[2] || '', inner = cm[3] || '';
        const ty = (/\bt="([^"]+)"/.exec(at) || [])[1] || '';
        const ref = (/\br="([A-Z]+)\d+"/.exec(at) || [])[1] || '';
        let v = '';
        if (ty === 's') { const vm = /<v>([\s\S]*?)<\/v>/.exec(inner); const i = vm ? +vm[1] : -1; v = (i >= 0 && i < shared.length) ? shared[i] : ''; }
        else if (ty === 'inlineStr' || ty === 'str') { v = xmlText(inner, []); }
        else { const vm = /<v>([\s\S]*?)<\/v>/.exec(inner); v = vm ? ents(vm[1]) : ''; }
        auto = ref ? colNum(ref) : auto + 1;
        cells.push({ c: auto, v: String(v).replace(/[\t\r\n]+/g, ' ') });
      }
      if (!cells.length) continue;
      const row = []; cells.forEach(function (x) { row[x.c - 1] = x.v; });
      const line = [];
      for (let i = 0; i < row.length; i++) line.push(row[i] == null ? '' : row[i]);
      if (line.join('').trim()) out.push(line.join('\t'));
    }
    return out;
  }
  async function containerText(z, budget) {
    const kind = zipKind(z.names);
    const td = function (b) { const r = b ? decodeText(b) : null; return r ? r.text : ''; };
    if (kind === 'docx') {
      const parts = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'].filter(function (n) { return z.names.indexOf(n) >= 0; });
      const br = [[/<w:tab\b[^>]*\/?>/g, '\t'], [/<w:br\b[^>]*\/?>/g, '\n'], [/<\/w:p>/g, '\n'], [/<\/w:tc>/g, '\t'], [/<\/w:tr>/g, '\n']];
      let out = '';
      for (const p of parts) out += xmlText(td(await z.read(p)), br) + '\n';
      return { kind: kind, text: tidy(out) };
    }
    if (kind === 'pptx') {
      const slides = z.names.filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
        .sort(function (a, b2) { return (+(/(\d+)\.xml$/.exec(a) || [])[1]) - (+(/(\d+)\.xml$/.exec(b2) || [])[1]); });
      const notes = z.names.filter(function (n) { return /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n); });
      const br = [[/<a:br\b[^>]*\/?>/g, '\n'], [/<\/a:p>/g, '\n']];
      let out = '';
      for (let i = 0; i < slides.length; i++) out += '--- slide ' + (i + 1) + ' ---\n' + tidy(xmlText(td(await z.read(slides[i])), br)) + '\n\n';
      for (let i = 0; i < notes.length; i++) { const t = tidy(xmlText(td(await z.read(notes[i])), br)); if (t) out += '--- notes ' + (i + 1) + ' ---\n' + t + '\n\n'; }
      return { kind: kind, text: tidy(out) };
    }
    if (kind === 'xlsx') {
      const sst = td(await z.read('xl/sharedStrings.xml'));
      const shared = [];
      for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) shared.push(xmlText(m[1] || '', []));
      const rels = td(await z.read('xl/_rels/workbook.xml.rels'));
      const target = new Map();
      for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
        const id = (/\bId="([^"]+)"/.exec(m[0]) || [])[1], tg = (/\bTarget="([^"]+)"/.exec(m[0]) || [])[1];
        if (id && tg) target.set(id, 'xl/' + String(tg).replace(/^\.?\//, ''));
      }
      const wb = td(await z.read('xl/workbook.xml'));
      let out = '';
      for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
        const nm = ents((/\bname="([^"]*)"/.exec(m[0]) || [])[1] || 'Sheet');
        const rid = (/\br:id="([^"]+)"/.exec(m[0]) || [])[1] || '';
        const path = target.get(rid);
        if (!path || z.names.indexOf(path) < 0) continue;
        const rows = await sheetRows(td(await z.read(path)), shared);
        if (!rows.length) continue;
        out += '--- ' + nm + ' ---\n' + rows.join('\n') + '\n\n';
        if (out.length > budget) break;
      }
      return { kind: kind, text: tidy(out) };
    }
    if (kind === 'odf' || kind === 'kmz') {
      const part = kind === 'odf' ? 'content.xml' : z.names.filter(function (n) { return /\.kml$/i.test(n); })[0];
      const raw = td(await z.read(part));
      if (kind === 'kmz') return { kind: kind, text: tidy(raw) };
      const br = [[/<text:tab\b[^>]*\/?>/g, '\t'], [/<text:line-break\b[^>]*\/?>/g, '\n'],
        [/<\/text:p>|<\/text:h>/g, '\n'], [/<\/table:table-cell>/g, '\t'], [/<\/table:table-row>/g, '\n']];
      return { kind: kind, text: tidy(xmlText(raw, br)) };
    }
    /* ANY OTHER ARCHIVE: every part that decodes as text, named, until the budget runs out. That
       covers .epub, a zip of sources, a zipped export — without naming any of them. */
    let out = '', used = 0;
    for (const nm of z.names.slice().sort()) {
      if (/^__MACOSX\//.test(nm) || /(^|\/)\.DS_Store$/.test(nm)) continue;
      if (used > budget) break;
      const r = decodeText(await z.read(nm));
      if (!r || !r.text.trim()) continue;
      const body = r.text.slice(0, Math.max(0, budget - used));
      out += '----- ' + nm + ' -----\n' + body + '\n\n'; used += body.length;
    }
    return { kind: 'zip', text: tidy(out) };
  }

  function b64of(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function textDesc(name, size, t, from) {
    let text = t.text, truncated = false;
    if (text.length > LIMITS.textPerFile) { text = text.slice(0, LIMITS.textPerFile); truncated = true; }
    if (!text.trim()) return { kind: 'unsupported', name: name, size: size, why: 'empty' };
    return { kind: 'text', name: name, size: size, text: text, truncated: truncated, encoding: t.encoding, from: from };
  }

  /* ── THE ONE QUESTION THE UI ASKS ────────────────────────────────────────────────────────── */
  /*  read(file, {encodeImage}) → one of
   *    {kind:'image', dataUrl}                         · goes to the vision channel
   *    {kind:'doc',   mime, b64}                        · goes to the provider as a document
   *    {kind:'text',  text, truncated, encoding, from}  · goes to the attachment channel
   *    {kind:'unsupported', why}                        · and `why` is what the reader is told
   *  `encodeImage` is injected because canvas is the one capability this module cannot supply —
   *  the app passes compressImage, a test passes whatever it wants to observe.
   */
  async function read(file, opts) {
    opts = opts || {};
    const name = String((file && file.name) || 'file'), size = (file && file.size) || 0;
    const ty = String((file && file.type) || '').toLowerCase();
    let buf = null;
    /* ⚠ ASK THE SIZE BEFORE ASKING FOR THE BYTES. A dropped film is a File like any other. */
    if (size > LIMITS.readBytes) return { kind: 'unsupported', name: name, size: size, why: /^(audio|video)\//.test(ty) ? 'media' : 'too-big', limit: LIMITS.readBytes };
    try { buf = new Uint8Array(await file.arrayBuffer()); } catch (_) { return { kind: 'unsupported', name: name, size: size, why: 'unreadable' }; }
    const sig = sniff(buf.subarray(0, LIMITS.sniff));

    if (sig === 'pdf') {
      if (buf.length > LIMITS.docBytes) return { kind: 'unsupported', name: name, size: size, why: 'too-big', limit: LIMITS.docBytes };
      return { kind: 'doc', name: name, size: size, mime: DOC_MIME, b64: b64of(buf) };
    }
    if (sig === 'ole') return { kind: 'unsupported', name: name, size: size, why: 'legacy-office' };
    if (sig === 'zip') {
      const z = zipOpen(buf);
      const r = z ? await containerText(z, LIMITS.textPerFile) : null;
      if (r && r.text) return textDesc(name, size, { text: r.text, encoding: 'utf-8' }, r.kind);
      return { kind: 'unsupported', name: name, size: size, why: z ? 'archive' : 'binary' };
    }
    if (sig === 'gzip') {
      const inner = await gunzip(buf);
      const r = inner ? decodeText(inner) : null;
      if (r) return textDesc(name, size, r, 'gzip');
      return { kind: 'unsupported', name: name, size: size, why: 'archive' };
    }
    /* An image is whatever the encoder turns into one of the four rasters the providers read.
       ⚠ THE ANSWER IS THE ENCODER'S, NOT THE MIME TYPE'S — that is the whole point: a HEIC that
       this browser cannot draw is NOT an image we can send, and saying so out loud is the fix for
       the silent drop. A picture that fails here still gets the text and second-chance passes
       below, which is how an SVG the canvas refuses still reaches the model as its source. */
    if (/^image\//.test(ty)) {
      const u = await encode(opts, file);
      if (u) return { kind: 'image', name: name, size: size, dataUrl: u };
    }
    if (/^(audio|video)\//.test(ty)) return { kind: 'unsupported', name: name, size: size, why: 'media' };
    const t = decodeText(buf);
    if (t) return textDesc(name, size, t, 'text');
    if (!/^image\//.test(ty)) { const u = await encode(opts, file); if (u) return { kind: 'image', name: name, size: size, dataUrl: u }; }
    /* ⚠ A PICTURE THIS BROWSER COULD NOT DRAW IS NOT "BINARY" — it is the one case #R540 exists to
       stop being silent, so it keeps its own reason and its own sentence. */
    return { kind: 'unsupported', name: name, size: size, why: /^image\//.test(ty) ? 'image-undecodable' : 'binary' };
  }
  async function encode(opts, file) {
    const fn = opts && opts.encodeImage; if (typeof fn !== 'function') return null;
    try { const u = await fn(file); return (typeof u === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(u)) ? u : null; } catch (_) { return null; }
  }

  return { LIMITS: LIMITS, DOC_MIME: DOC_MIME, sniff: sniff, decodeText: decodeText, zipOpen: zipOpen, containerText: containerText, read: read };
})();

/* Read a file as text. ⚠ KEPT FOR THE ONE CALLER THAT ALREADY HOLDS TEXT — ATL_FILE.read is what
   the attach path asks now, because `readAsText` assumes UTF-8 and answers nothing about what the
   file IS. */
export function atlFmtBytes(n) { n = +n || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
