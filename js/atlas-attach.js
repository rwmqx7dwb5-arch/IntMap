/* ============================================================================
 *  IntMap · Atlas — attachments: what a file IS, and the full-screen viewer   (#R232)
 * ----------------------------------------------------------------------------
 *  「Atlasに画像を添付した時送信した画像をタップすると、それを見れるように。（全面に表示され、背景が
 *    暗くなるというよくある形式で。こまかいUIは任せる。）」
 *
 *  The chat caps a sent picture at 230–280 px, which is the right size for a conversation and the
 *  wrong size for looking at what you sent. This is the conventional viewer: the page dims, the
 *  picture takes the screen at its own aspect ratio, and anything — the backdrop, the ✕, Escape,
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
     Open `src` full-screen; `closeLabel` is the ✕ button's accessible name, already localised. */
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
    const x = document.createElement('button');
    x.className = 'atl-lb-x'; x.type = 'button';
    x.setAttribute('aria-label', closeLabel || 'Close'); x.textContent = '✕';
    el.appendChild(img); el.appendChild(x);
    el.addEventListener('click', () => close());
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
    const im = e.target && e.target.closest && e.target.closest('.atl-imgrow-in img');
    if (im && im.src) { e.preventDefault(); e.stopPropagation(); _open(im.src, (typeof closeLabel === 'function') ? closeLabel() : closeLabel); }
  });
}

/** The overlay's CSS, appended to the stylesheet js/atlas-console.js builds. */
export const LIGHTBOX_CSS =
  '.atl-lightbox{position:fixed;inset:0;z-index:2600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:atlLbIn .16s ease;padding:24px;box-sizing:border-box;cursor:zoom-out;}'
  + '@keyframes atlLbIn{from{opacity:0}to{opacity:1}}'
  + '.atl-lightbox img{max-width:100%;max-height:100%;width:auto;height:auto;border-radius:10px;box-shadow:0 18px 60px rgba(0,0,0,0.55);cursor:default;}'
  + '.atl-lightbox .atl-lb-x{position:absolute;top:max(12px,env(safe-area-inset-top));right:14px;width:40px;height:40px;border:none;border-radius:50%;background:rgba(255,255,255,0.14);color:#fff;font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}'
  + '.atl-lightbox .atl-lb-x:hover{background:rgba(255,255,255,0.26);}'
  + '@media(max-width:768px){ .atl-lightbox{padding:10px;} }';

/* ── what kind of attachment is this? ─────────────────────────────────────────────────────────
   (#R158) images and text-based files are both allowed; everything else is refused by name rather
   than silently dropped. The extension list carries the formats whose MIME type browsers get wrong
   or omit entirely (.md, .ts, .vue, Dockerfile…). Pure, so it is testable without a browser. */
export function atlFileKind(f){ try{ const TEXT_EXT=/\.(txt|text|md|markdown|rst|csv|tsv|json|jsonl|geojson|ndjson|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|dart|c|cc|cpp|cxx|h|hpp|cs|php|scala|lua|pl|sh|bash|zsh|fish|ps1|yaml|yml|xml|svg|html|htm|css|scss|sass|less|sql|graphql|log|ini|toml|conf|cfg|env|properties|gradle|tex|bib|r|jl|vue|svelte|astro|srt|vtt|diff|patch|gitignore|dockerfile|makefile)$/i;
  const ty=String(f&&f.type||'').toLowerCase(), nm=String(f&&f.name||'');
  if(/^image\//.test(ty)) return 'image';
  if(/^text\//.test(ty)||ty==='application/json'||ty==='application/xml'||ty==='application/javascript'||ty==='application/x-yaml'||TEXT_EXT.test(nm)) return 'text';
  return 'other'; }catch(_){ return 'other'; } }
export function atlReadText(f){ return new Promise(res=>{ try{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result||'')); fr.onerror=()=>res(''); fr.readAsText(f); }catch(_){ res(''); } }); }
export function atlFmtBytes(n){ n=+n||0; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(n<10240?1:0)+' KB'; return (n/1048576).toFixed(1)+' MB'; }
