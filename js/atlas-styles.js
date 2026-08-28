/* ============================================================================
 *  IntMap · Atlas — the panel's stylesheet  (#R313)
 * ----------------------------------------------------------------------------
 *  Every rule the Atlas console draws itself with, as ONE string, lifted out of
 *  js/atlas-console.js verbatim.
 *
 *  ⚠ IT MOVED BECAUSE THE CEILING DOES NOT. js/atlas-console.js is held under 5,300 lines by four
 *  separate tests (#R199 ⑤ / #R200 ⑤ / #R278 ⑦ / #R298 ⑬) and the rule those tests state is that the
 *  ceiling follows the floor DOWN — it is never raised. #R313 added the choice-picker removal, the
 *  wind-particle dispatch and the shimmer indicator to that file, which put it 59 lines over, and
 *  origin/main had exactly one line of headroom left. So a SUBJECT moves out, which is the same
 *  answer #R199, #R278, #R298 and #R309 each paid — js/atlas-controls.js, js/atlas-sims.js and
 *  js/atlas-examples.js were all born this way. The stylesheet is the largest self-contained one.
 *
 *  ⚠ NOT ONE CHARACTER OF CSS CHANGED. The block is the same string built the same way; only the
 *  two ends moved (`s.textContent=` became `return`, and the caller assigns it). The three constants
 *  it interpolates are ES imports, so they arrive here the same way they arrived there.
 *
 *  ⚠ NO BACK-TICKS, EVER — CONSTITUTION §2. This is CSS inside JS string literals, and a back-tick
 *  anywhere in it (a comment included) would terminate a template literal somewhere and blank the
 *  whole site. It is built with quoted strings and `+` for exactly that reason; keep it that way.
 * ==========================================================================*/
import { LIGHTBOX_CSS } from './atlas-attach.js';
import { MSG_TOOLS_CSS, MSG_TOOLS_CSS_MOBILE } from './atlas-msg-tools.js';
import { GLOSS_CSS, GLOSS_CSS_MOBILE } from './atlas-gloss.js';   /* (#R491) the term-gloss card + its touch pill */
import { ATLAS_ANNOTATE_CSS } from './atlas-annotate.js';
import { HIGHLIGHT_CSS } from './atlas-highlight.js';   /* (#R494) the code-block token palette, beside the grammars that emit the classes */

export function atlasPanelCSS() {
    /* (#R62) refined AI-app look ("ChatGPTのような洗練された生成AI App風のUI") + the DEFAULT desktop layout is a
       tall LEFT column ("初回起動時に、画面左側にサイドバーのように縦長の形で展開"). Dragging/resizing still
       overrides it (inline styles beat these defaults). */
    /* (#R63) bottom clearance 64px so the always-on coordinate readout (bottom-left of the map) stays visible. */
    /* (#R72) spawn TALLER ("上部にまだ余裕があるので、上までもう少し伸ばして"): top 60→46px, height follows */
return '#atlas-panel{position:absolute;box-sizing:border-box;z-index:1850;left:14px;top:46px;transform:none;display:none;flex-direction:column;width:min(400px,calc(100vw - 28px));height:calc(100% - 110px);min-width:300px;min-height:180px;max-width:calc(100vw - 16px);max-height:calc(100% - 52px);resize:none;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:18px;box-shadow:0 18px 52px rgba(0,0,0,0.28);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);overflow:hidden;}'
      +'#atlas-panel.atl-min{height:auto !important;min-height:0 !important;resize:none;}'
      +'#atlas-panel.atl-min .atl-sub,#atlas-panel.atl-min .atl-ex,#atlas-panel.atl-min .atl-chat,#atlas-panel.atl-min .atl-inbar{display:none !important;}'
      +'#atlas-panel .atl-btns{display:flex;gap:2px;align-items:center;}'
      +'#atlas-panel .atl-min-btn{background:none;border:none;color:var(--text-muted);font-size:18px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:8px;}'
      +'#atlas-panel .atl-min-btn:hover{background:var(--input-bg);color:var(--text-main);}'
      +'#atlas-panel .atl-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 9px;cursor:move;border-bottom:1px solid rgba(128,128,128,0.12);}'
      +'#atlas-panel .atl-title{font-weight:500;font-size:14.5px;display:flex;align-items:center;gap:8px;letter-spacing:0.2px;}'   /* (#R63) "Atlas" NOT bold, NO leading symbol */
      +'#atlas-panel .atl-beta{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,#ff9500,#ff6482);border-radius:5px;padding:1.5px 5.5px;}'
      +'#atlas-panel .atl-x{background:none;border:none;color:var(--text-muted);font-size:19px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:8px;}'
      +'#atlas-panel .atl-x:hover{background:var(--input-bg);color:var(--text-main);}'
      +'#atlas-panel .atl-sub{padding:9px 8px 4px;font-size:11px;color:var(--text-muted);line-height:1.55;}'   /* (#R142/#R145) full-width in the sidebar — the feed now bleeds past #sidebar\'s 24px pad, so only a small inner gutter remains */
      +'#atlas-panel .atl-chat{flex:1;overflow-y:auto;scrollbar-gutter:stable both-edges;padding:8px 6px 6px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}'   /* (#R146) L/R gutters equal — the space-reserving webkit scrollbar (Win) only sat on the RIGHT, so the left looked narrower ("左だけ狭い"); reserve an equal gutter on BOTH edges */
      /* ══ (#R494) THE BUBBLE'S OWN TEXT — SIZE, AND HOW JAPANESE BREAKS ═══════════════════════════
         12.8px was set when this bubble held a sentence of English status text; it now holds prose in
         nine languages, and Japanese at 12.8px is small. 13.5/1.62 is the size the reply BODY already
         renders at one wrapper down (.atl-md), so the two stop disagreeing.
         ⚠ `word-break:break-word` IS THE WRONG PROPERTY FOR CJK. It permits a break between any two
         characters, which in Japanese means a line can end with 「（」 or begin with 「、」「。」「）」 —
         the kinsoku violations the language's own line-breaking rules exist to prevent. The trio that
         replaces it says the three separate things that were being conflated: `line-break:strict`
         asks for the strict Japanese rule set, `word-break:normal` stops breaking inside words, and
         `overflow-wrap:anywhere` still lets a single unbreakable run (a long URL) break rather than
         overflow the panel. This is the combination the mobile tab rule already used. */
      +'#atlas-panel .atl-b{padding:8px 12px;font-size:13.5px;line-height:1.62;border-radius:15px;line-break:strict;word-break:normal;overflow-wrap:anywhere;animation:atlIn .18s ease;}'
      +'@keyframes atlIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}'
      /* (#R103) user message = a compact bubble (tighter top/bottom); Atlas message = NO bubble (full width for text). */
      /* ══ ⚠⚠⚠ (#R483) 「Atlasのユーザー送信メッセージの吹き出しを、フロストガラスの質感に。」 ══════
         The fill moved from --atlas-grad (opaque, and shared with the Atlas tab, which nobody asked to
         change) to --atlas-glass (accent-tinted, translucent, this bubble only), and the text from a
         hard #fff to --text-main.
         ⚠ THE TEXT COLOUR IS NOT A SIDE-DETAIL, IT IS WHAT MAKES GLASS POSSIBLE — see the measured
         contrast note beside the token in css/intmap.css. White on glass is unreadable, and glass
         opaque enough to carry white is not glass. Reading --text-main is the same trade every other
         frosted surface in this app already made.
         ⚠ THE BLUR IS THE HOUSE IDIOM, AND ON THE DESKTOP IT IS NEARLY A NO-OP: this bubble sits
         inside #atlas-panel, which composites a backdrop blur of its own, so what stands behind a
         child of it is already a smooth wash with little left to blur. It is kept because it is NOT a
         no-op where it matters — the mobile tab rule further down this file sets the panel blur to
         none !important, and there the map really is behind the bubble. What a desktop reader reads as
         frost comes from the translucent tint, the hairline edge and the inset sheen.
         ⚠ The -webkit- twin is required: every declaration in this app that truly blurs carries one. */
      +'#atlas-panel .atl-b.u{align-self:flex-end;max-width:92%;padding:6px 12px;background:var(--atlas-glass);color:var(--text-main);border:1px solid var(--atlas-glass-edge);border-radius:16px 16px 5px 16px;box-shadow:var(--atlas-glass-shadow),inset 0 1px 0 var(--atlas-glass-sheen);backdrop-filter:saturate(var(--glass-sat,150%)) blur(var(--glass-blur,16px));-webkit-backdrop-filter:saturate(var(--glass-sat,150%)) blur(var(--glass-blur,16px));white-space:pre-wrap;}'   /* (#R122) pre-wrap keeps the user\'s own line breaks (Shift+Enter) visible in the bubble */
      +'#atlas-panel .atl-b.a{align-self:stretch;max-width:100%;background:transparent;color:var(--text-main);border:none;border-radius:0;padding:2px 1px;}'
      /* (#R231) the attached-picture row: the user's own column, without the bubble around it */
      +'#atlas-panel .atl-b.u.atl-imgrow{background:none;box-shadow:none;padding:0;border-radius:0;max-width:92%;white-space:normal;border:none;backdrop-filter:none;-webkit-backdrop-filter:none;}'   /* (#R483) the glass is stripped here too: this row is bare pictures, and a pane of frosted glass around them is a bubble by another name */
      +'#atlas-panel .atl-imgrow-in{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;}'
      +'#atlas-panel .atl-imgrow-in img{display:block;max-width:100%;max-height:230px;width:auto;height:auto;border-radius:12px;cursor:zoom-in;}'
      +'#atlas-panel .atl-imgrow-in img:only-child{max-height:280px;}'
      /* (#R493) the frame Atlas looked at, shown back to the reader inside the ANSWER — small, so it
         reads as evidence rather than as a second map, and captioned so «Atlas looked» is a claim the
         reader can check rather than one they have to take. js/atlas-attach.js's delegated click
         names this class too, so a tap opens it full-screen in the same viewer as an attached image. */
      +'.atl-viewframe{margin:6px 0 4px;max-width:340px;}'
      +'.atl-viewframe img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid var(--atlas-glass-edge);cursor:zoom-in;}'
      +'.atl-viewframe-cap{font-size:10.5px;line-height:1.45;color:var(--text-muted);margin-top:4px;}'
      +LIGHTBOX_CSS
      /* (#R156) UNIFIED RENDERER — code blocks, inline code, display/inline math, tables, blockquotes. NOT scoped to
         #atlas-panel so the same classes render identically in the sidebar-tab and workspace-window Atlas surfaces.
         Every wide element (code, math, table) is INDEPENDENTLY horizontally scrollable so the reply column never
         overflows on mobile ("長い数式や行列はモバイルで横スクロール可能に"). */
      +'.atl-codewrap{margin:.7em 0;border:1px solid var(--glass-border,rgba(128,128,128,.22));border-radius:10px;overflow:hidden;background:var(--input-bg,rgba(120,120,128,.08));}'
      +'.atl-codebar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 6px 4px 11px;background:rgba(120,120,128,.14);border-bottom:1px solid var(--glass-border,rgba(128,128,128,.18));}'
      +'.atl-codelang{font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted);}'
      +'.atl-codecopy{font-size:11px;font-weight:600;color:var(--text-muted);background:transparent;border:1px solid var(--glass-border,rgba(128,128,128,.28));border-radius:7px;padding:2px 9px;cursor:pointer;transition:color .15s,border-color .15s,background .15s;}'
      +'.atl-codecopy:hover{color:var(--text-main);border-color:var(--primary-color);}'
      +'.atl-codecopy.ok{color:#fff;background:var(--primary-color);border-color:var(--primary-color);}'
      +'.atl-codeblock{margin:0;padding:10px 12px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:12.5px;line-height:1.55;white-space:pre;}'
      +'.atl-codeblock code{font-family:inherit;white-space:pre;background:none;padding:0;color:var(--text-main);}'
      +'.atl-code-i{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;background:rgba(120,120,128,.16);border:1px solid rgba(128,128,128,.16);border-radius:5px;padding:.5px 5px;white-space:pre-wrap;word-break:break-word;}'
      +'.atl-math-b{margin:.55em 0;overflow-x:auto;overflow-y:hidden;padding:2px 1px 4px;max-width:100%;}'
      +'.atl-math-b .katex-display{margin:.3em 0;}'
      +'.atl-math-raw{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;color:var(--text-main);white-space:pre-wrap;}'
      +'.katex{font-size:1.06em;}'   /* nudge KaTeX up to match the reply body size */
      +'.atl-tablewrap{margin:.7em 0;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--glass-border,rgba(128,128,128,.2));border-radius:10px;}'
      +'.atl-md-table{border-collapse:collapse;width:100%;font-size:12.5px;line-height:1.5;}'
      +'.atl-md-table th,.atl-md-table td{border:1px solid var(--glass-border,rgba(128,128,128,.18));padding:5px 10px;text-align:left;vertical-align:top;white-space:nowrap;}'
      +'.atl-md-table thead th{background:rgba(120,120,128,.14);font-weight:600;}'   /* (#R159) header row: semibold, not bold */
      +'.atl-md-table tbody tr:nth-child(2n){background:rgba(120,120,128,.06);}'
      /* (#R492) the in-reply notes and their one floating card. Unscoped for the same reason as the block
         above: the card is appended to document.body and the marks appear on all three Atlas surfaces. */
      +ATLAS_ANNOTATE_CSS
      /* (#R494) a column js/atlas-reply.js measured as PROSE rather than figures wraps instead of
         stretching the table sideways — see _atlColWrap. The min-width stops it collapsing to one
         word per line beside a run of nowrap number columns. */
      +'.atl-md-table .atl-c-wrap{white-space:normal;min-width:10em;line-break:strict;overflow-wrap:anywhere;}'
      +HIGHLIGHT_CSS
      +'.atl-codebtns{display:flex;align-items:center;gap:5px;}'
      +'.atl-codewrapbtn{font-size:11px;font-weight:600;color:var(--text-muted);background:transparent;border:1px solid var(--glass-border,rgba(128,128,128,.28));border-radius:7px;padding:2px 9px;cursor:pointer;transition:color .15s,border-color .15s,background .15s;}'
      +'.atl-codewrapbtn:hover{color:var(--text-main);border-color:var(--primary-color);}'
      +'.atl-codewrapbtn.on{color:var(--primary-color);border-color:var(--primary-color);background:rgba(120,120,128,.12);}'
      /* ══ ⚠⚠⚠ (#R494) THE REPLY'S TYPOGRAPHY — ONE PLACE, AND IT IS THIS ONE ══════════════════════
         js/atlas-reply.js used to carry these numbers as inline styles inside twelve `.replace()`
         calls, which is why #R232 had to DELETE a spacer element after the fact: two rules each
         emitted margin around a heading and nothing could see the total. Here they are declarations
         on real elements, so the browser COLLAPSES a paragraph's bottom margin against a heading's
         top margin and the double gap cannot be expressed.
         ⚠ NOT scoped to #atlas-panel — the same classes render in the sidebar tab and the workspace
         window, exactly as the #R156 code/math/table rules above are not scoped.
         ⚠ #R154's 「見出しを色分けするのはやめる」 and #R159's 「返答のテキストは太字にしない」 live
         here now, and this is the line the gates in tests/r153/r154-checks read:
         HEADINGS DIFFERENTIATE BY SIZE + SPACING ONLY — NO COLOUR. Every level is weight 600 in
         --text-main; nothing below may introduce a hue, and #R159's 600 is never raised to 750/800. */
      +'.atl-md{font-size:14px;line-height:1.62;}'
      +'.atl-p{margin:0 0 1.5em;text-wrap:pretty;}'                                 /* (#R158) the paragraph rhythm, unchanged in value */
      +'.atl-ps{margin-bottom:.82em;}'                                              /* (#R150) sentence-end + single newline = a softer gap */
      +'.atl-p:last-child{margin-bottom:0;}'
      +'.atl-h{font-weight:600;color:var(--text-main);text-wrap:balance;}'          /* (#R494) balance: a two-line heading no longer leaves one orphan word */
      +'.atl-h1{font-size:1.9em;letter-spacing:.012em;line-height:1.2;margin:1.1em 0 .4em;}'
      +'.atl-h2{font-size:1.56em;line-height:1.25;letter-spacing:.006em;margin:1.3em 0 .38em;}'
      +'.atl-h3{font-size:1.3em;line-height:1.3;letter-spacing:.004em;margin:1.05em 0 .3em;}'
      /* (#R494) H4–H6 were all 1.3em — the same size as H3 and as each other, so a reply that nested
         three levels deep rendered as one level three times. They are a real ladder now. */
      +'.atl-h4{font-size:1.14em;line-height:1.35;letter-spacing:.002em;margin:1.0em 0 .28em;}'
      +'.atl-h5{font-size:1.02em;line-height:1.4;letter-spacing:.012em;margin:.95em 0 .25em;}'
      +'.atl-h6{font-size:.94em;line-height:1.45;letter-spacing:.04em;margin:.9em 0 .22em;}'
      /* a whole-line **bold run** is an author-written section lead (#R151/#R154) — it is emitted as
         an <h4> and this rule, declared AFTER .atl-h4, gives it back its own size */
      +'.atl-hb{font-size:1.28em;line-height:1.3;letter-spacing:.004em;margin:1.0em 0 .3em;}'
      +'.atl-h:first-child{margin-top:0;}'
      /* (#R494) real lists: the marker is the browser's, so the hanging indent, the nesting and the
         numbering are all free — none of which the `•&nbsp;` + text-indent div could do */
      +'.atl-ul,.atl-ol{margin:.45em 0 .9em;padding-left:1.5em;}'
      /* ⚠ THE MARKER FOLLOWS THE DEPTH, NOT THE PARENT'S TYPE. `.atl-ul .atl-ul` would only change a
         bullet list nested under another BULLET list — a bullet list inside a NUMBERED one (which is
         the commoner shape in an answer: three numbered steps, one of which has sub-points) would
         have kept the top-level disc and read as if it were top level. Keying on `.atl-li` counts
         list ancestors of either kind. */
      +'.atl-ul{list-style:disc;}.atl-li .atl-ul{list-style:circle;}.atl-li .atl-li .atl-ul{list-style:square;}'
      +'.atl-ol{list-style:decimal;}.atl-li .atl-ol{list-style:lower-alpha;}.atl-li .atl-li .atl-ol{list-style:lower-roman;}'
      +'.atl-li{margin:.3em 0;line-height:1.6;text-wrap:pretty;}'
      +'.atl-li::marker{color:var(--text-muted);}'
      +'.atl-li>.atl-ul,.atl-li>.atl-ol{margin:.25em 0 .3em;}'
      +'.atl-loose>.atl-li{margin:.55em 0;}'
      +'.atl-li>.atl-p{margin-bottom:.5em;}.atl-li>.atl-p:last-child{margin-bottom:0;}'
      +'.atl-ul:last-child,.atl-ol:last-child{margin-bottom:0;}'
      /* (#R494) ONE blockquote for a multi-line quotation. Each `>` line used to become its own
         bordered box, so a three-line quotation drew three left rules. */
      +'.atl-bq{margin:.75em 0;padding:3px 0 3px 13px;border-left:3px solid rgba(128,128,128,.4);color:var(--text-muted);}'
      +'.atl-bq>*:last-child{margin-bottom:0;}'
      +'.atl-hr{margin:1.15em 0;border:0;border-top:1px solid var(--glass-border,rgba(128,128,128,.28));}'
      +'.atl-a{color:var(--primary-color);text-decoration:none;border-bottom:1px solid currentColor;}'
      +'.atl-a-url{word-break:break-all;}'
      /* (#R494) the source row's overflow chip — `slice(0,6)` used to drop the rest silently */
      +'#atlas-panel .atl-lc-rest:not([hidden]){display:contents;}'
      +'#atlas-panel .atl-lc-more{align-self:center;font-size:11.5px;font-weight:600;color:var(--text-muted);background:var(--input-bg);border:1px solid var(--glass-border,rgba(128,128,128,.28));border-radius:11px;padding:5px 11px;cursor:pointer;transition:color .15s,border-color .15s;}'
      +'#atlas-panel .atl-lc-more:hover{color:var(--text-main);border-color:var(--primary-color);}'
      /* ══ ⚠⚠⚠ (#R313) THE PROGRESS INDICATOR IS CHATGPT'S SHIMMER, NOT THREE BOUNCING DOTS ═════
         「AtlasのThinkingとかSearchingとかのUI、ChatGPTと同じグラフィックにしてください。
           （実際にChatGPTのサイト見て、実装してください。）」
         MEASURED, not remembered: chatgpt.com serves its design system from the same origin, so
         /cdn/assets/root-*.css was fetched and the live rules for `.loading-shimmer` read off it.
         It is NOT a spinner and NOT a row of dots — the LABEL ITSELF is the animation:
           · the text is painted by a gradient clipped to the glyphs (background-clip:text with a
             transparent text-fill), so there is no extra element beside the word;
           · the gradient is base → band → band → base with the band held between 40% and 60%;
           · the band is 50% of the element wide (background-size:50% 200%, no-repeat) and travels
             from -100% to 250% over 2s, linear, for ever.
         ⚠ THE BAND IS THE BACKGROUND COLOUR, NOT A HIGHLIGHT. ChatGPT uses #ffffffbf in light and
         #0009 in dark — both of which move TOWARD the page behind the text, so what travels across
         the word is a fade, not a glare. Copying the values as a brighten in both themes would have
         produced a different effect that merely used the same technique. The two literals below are
         those two alphas expressed in IntMap's own theme blocks.
         ⚠ AND IT STOPS FOR prefers-reduced-motion, which the measured stylesheet also does — with
         the text-fill handed back to `currentColor`, because a transparent fill with no animation is
         an invisible word. */
      +'#atlas-panel{--atl-shimmer-band:rgba(255,255,255,0.75);}'
      +'[data-theme="dark"] #atlas-panel{--atl-shimmer-band:rgba(0,0,0,0.60);}'
      +'#atlas-panel .atl-stage{display:inline-block;color:var(--text-muted);font-size:12.5px;font-weight:500;padding:3px 0;'
        +'background:var(--text-muted) linear-gradient(to right,var(--text-muted) 0%,var(--atl-shimmer-band) 40%,var(--atl-shimmer-band) 60%,var(--text-muted) 100%);'
        +'background-repeat:no-repeat;background-size:50% 200%;background-position:-100% 0;'
        +'-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;'
        +'animation:atlShimmer 2s linear infinite;}'
      +'@keyframes atlShimmer{0%{background-position:-100% 0;}100%{background-position:250% 0;}}'
      +'@media (prefers-reduced-motion:reduce){#atlas-panel .atl-stage{animation:none;background:none;-webkit-text-fill-color:currentColor;}}'
      +'#atlas-panel .atl-ex{display:flex;flex-wrap:wrap;gap:6px;padding:6px 11px 2px;}'
      +'#atlas-panel .atl-rad-cfg{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin:7px 0 4px;padding:7px 9px;background:rgba(120,120,128,0.1);border:1px solid rgba(128,128,128,0.16);border-radius:10px;}'
      +'#atlas-panel .atl-rad-ctl{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);} #atlas-panel .atl-rad-ctl>span:first-child{flex:0 0 auto;} #atlas-panel .atl-rad-ctl b{color:var(--text-main);min-width:34px;text-align:center;}'
      +'#atlas-panel .atl-rad-sel{flex:1;min-width:0;background:var(--input-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:7px;font-size:11px;padding:3px 4px;}'
      +'#atlas-panel .atl-rad-mini{padding:2px 8px;font-size:13px;min-width:26px;}'
      /* (#R296) the four `.atl-route-mode*` rules stood here — removed with the buttons. */
      +'#atlas-panel .atl-trips{display:flex;flex-direction:column;gap:5px;margin-bottom:2px;}'
      +'#atlas-panel .atl-trip{border:1px solid rgba(128,128,128,0.16);border-radius:10px;padding:7px 10px;cursor:pointer;transition:border-color .15s,background .15s;}'
      +'#atlas-panel .atl-trip:hover{border-color:rgba(128,128,128,0.34);}'
      +'#atlas-panel .atl-trip.on{border-color:var(--primary-color);background:rgba(10,132,255,0.06);}'
      +'#atlas-panel .atl-trip-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}'
      +'#atlas-panel .atl-trip-time{font-size:12.5px;color:var(--text-main);display:inline-flex;align-items:center;}'
      +'#atlas-panel .atl-trip-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;flex:0 0 auto;}'
      +'#atlas-panel .atl-trip-dur{font-size:11px;color:var(--text-muted);white-space:nowrap;}'
      +'#atlas-panel .atl-trip-seq{font-size:11.5px;color:var(--text-muted);margin-top:3px;line-height:1.35;}'
      +'#atlas-panel .atl-trip-legs{display:none;margin-top:5px;max-height:200px;overflow:auto;}'
      +'#atlas-panel .atl-trip.on .atl-trip-legs{display:block;}'
      +'#atlas-panel .atl-traj-row{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0 2px;}'
      +'#atlas-panel .atl-traj-btn{font-size:11px;font-weight:600;color:var(--text-main);background:rgba(120,120,128,0.12);border:1px solid rgba(128,128,128,0.2);border-radius:999px;padding:5px 11px;cursor:pointer;transition:background .15s ease,border-color .15s ease;}'
      +'#atlas-panel .atl-traj-btn:hover{background:rgba(120,120,128,0.22);border-color:var(--primary-color);}'
      +'#atlas-panel .atl-traj-btn.on{background:var(--primary-color);color:#fff;border-color:var(--primary-color);}'
      +'#atlas-panel .atl-chip{font-size:11px;color:var(--text-main);background:rgba(120,120,128,0.10);border:1px solid rgba(128,128,128,0.16);border-radius:12px;padding:6px 10px;cursor:pointer;text-align:left;transition:background .15s ease,border-color .15s ease;}'
      +'#atlas-panel .atl-chip:hover{background:rgba(120,120,128,0.2);border-color:var(--primary-color);}'
      +'#atlas-panel .atl-inbar{display:flex;gap:8px;align-items:center;padding:6px 9px 4px;border-top:1px solid rgba(128,128,128,0.12);}'   /* (#R103) tighter top/bottom margin around the input+send */
      /* (#R149) image attach button + pasted/attached image thumbnails ("入力欄にペーストすれば画像も送れるように") */
      +'#atlas-panel .atl-attach{flex:0 0 auto;width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:color .15s ease,background .15s ease;}'
      +'#atlas-panel .atl-attach:hover{color:var(--primary-color);background:var(--input-bg);}'
      /* (#R154) voice-dictation mic button ("Atlasを音声入力対応に") — mirrors .atl-attach; .rec = live recording (red pulse) */
      +'#atlas-panel .atl-mic{flex:0 0 auto;width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:color .15s ease,background .15s ease;}'
      +'#atlas-panel .atl-mic:hover{color:var(--primary-color);background:var(--input-bg);}'
      +'#atlas-panel .atl-mic.rec{color:#fff;background:#ff3b30;animation:atlMicPulse 1.3s ease-in-out infinite;}'
      +'@keyframes atlMicPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,59,48,0.55);}50%{box-shadow:0 0 0 5px rgba(255,59,48,0);}}'
      +'#atlas-panel .atl-imgrow{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px 0;}'
      +'#atlas-panel .atl-thumb{position:relative;width:54px;height:54px;border-radius:9px;overflow:hidden;border:1px solid rgba(128,128,128,0.28);background:var(--input-bg);}'
      +'#atlas-panel .atl-thumb img{width:100%;height:100%;object-fit:cover;display:block;}'
      +'#atlas-panel .atl-thumb-x{position:absolute;top:2px;right:2px;width:17px;height:17px;border-radius:50%;background:rgba(0,0,0,0.62);color:#fff;border:none;cursor:pointer;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;}'
      +'#atlas-panel .atl-fchip{position:relative;display:inline-flex;align-items:center;gap:5px;max-width:190px;height:30px;padding:0 26px 0 9px;border-radius:9px;border:1px solid rgba(128,128,128,0.28);background:var(--input-bg);color:var(--text-main);font-size:11.5px;}'   /* (#R158) non-image file chip in the composer */
      +'#atlas-panel .atl-fchip svg{flex:0 0 auto;opacity:.72;}'
      +'#atlas-panel .atl-fchip-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      +'#atlas-panel .atl-fchip-x{position:absolute;top:50%;right:4px;transform:translateY(-50%);}'
      +'#atlas-panel .atl-b.u .atl-fchip.atl-fchip-msg{height:26px;padding:0 9px;max-width:200px;background:var(--input-bg);border-color:var(--atlas-glass-edge);color:var(--text-main);}'   /* (#R158) file chip inside the user bubble; (#R483) it was white-on-white the moment the bubble stopped being an opaque gradient — a chip whose whole job is to name a file has to be readable on whatever the bubble is */
      +'#atlas-panel .atl-thumb-x:hover{background:rgba(220,50,50,0.9);}'
      +'#atlas-panel.atl-drag .atl-chat{outline:2px dashed var(--primary-color);outline-offset:-6px;border-radius:10px;}'
      /* (#R103) ONE small AI disclaimer under the input (instead of appending it to every message) */
      +'#atlas-panel .atl-ainote{font-size:9.5px;color:var(--text-muted);text-align:center;padding:0 12px 7px;line-height:1.4;opacity:0.8;}'
      +'#atlas-panel .atl-in{flex:1;min-width:0;height:42px;min-height:42px;max-height:132px;padding:11px 15px;border-radius:21px;border:1px solid rgba(128,128,128,0.25);background:var(--card-bg);color:var(--text-main);font-size:13px;line-height:1.45;outline:none;box-sizing:border-box;transition:border-color .15s ease,box-shadow .15s ease;resize:none;overflow-y:auto;font-family:inherit;display:block;}'   /* (#R118) textarea: Shift+Enter improves to multi-line, auto-grows to ~5 lines */
      +'#atlas-panel .atl-in:focus{border-color:var(--primary-color);box-shadow:0 0 0 3px rgba(10,132,255,0.18);}'
      /* (#R72) send button ("メッセージ送信ボタンがダサい"): clean filled circle + arrow-up SVG (ChatGPT-style),
         disabled-looking when the input is empty. */
      /* (#R156) SEND + STOP = ACCENT COLOUR ("送信ボタン、応答を停止ボタンはアクセントカラーに"), but only ONCE the
         user has entered something ("文字を入力するまでは今の色"): the base .atl-go is the active state (accent fill,
         white icon); .idle (empty input) keeps the previous white-bg/black-arrow look; .busy (Stop) is also accent.
         Accent = var(--primary-color) with a matching white icon so it reads as a filled primary button. */
      +'#atlas-panel .atl-go{flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:1px solid transparent;background:var(--primary-color);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 2px 8px rgba(0,0,0,0.18);transition:transform .08s ease,opacity .15s ease,background .15s ease,filter .15s ease;}'
      +'#atlas-panel .atl-go svg{display:block;}'
      +'#atlas-panel .atl-go:hover{filter:brightness(1.07);} #atlas-panel .atl-go:active{transform:scale(0.9);}'
      +'#atlas-panel .atl-go.idle{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.12);color:#111;border-color:rgba(0,0,0,0.08);}'   /* (#R149/#R156) empty input keeps the previous SOLID-BLACK ↑ on white ("文字を入力するまでは今の色") */
      +'#atlas-panel .atl-go.idle:hover{background:#f0f0f4;filter:none;}'
      +'#atlas-panel .atl-go.busy{background:var(--primary-color);box-shadow:0 2px 8px rgba(0,0,0,0.2);color:#fff;border-color:transparent;}'   /* (#R156) Stop-answering button = accent fill + white square icon */
      +'#atlas-panel .atl-go.busy:hover{filter:brightness(1.07);}'
      +MSG_TOOLS_CSS
      +GLOSS_CSS   /* (#R491) ⚠ NOT scoped to #atlas-panel: the card is appended to <body> so the panel's overflow cannot clip it */
      /* (#R72) scroll-to-bottom jump button */
      +'#atlas-panel .atl-jump{position:absolute;left:50%;transform:translateX(-50%);bottom:72px;z-index:5;width:32px;height:32px;border-radius:50%;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--popup-bg);color:var(--text-main);cursor:pointer;display:none;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:0;}'
      +'#atlas-panel .atl-jump.show{display:flex;}'
      +'#atlas-panel .atl-jump:hover{color:var(--primary-color);border-color:var(--primary-color);}'
      /* (#R72) inline controls rendered inside replies */
      +'#atlas-panel .atl-ctl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}'
      +'#atlas-panel .atl-ctl-lbl{font-size:11.5px;color:var(--text-main);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      +'#atlas-panel .atl-ctl-toggle{flex:0 0 auto;width:36px;height:21px;border-radius:11px;border:none;background:rgba(120,120,128,0.32);position:relative;cursor:pointer;transition:background .18s ease;padding:0;}'
      +'#atlas-panel .atl-ctl-toggle .atl-ctl-knob{position:absolute;top:2px;left:2px;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);transition:left .18s ease;}'
      +'#atlas-panel .atl-ctl-toggle.on{background:#34c759;} #atlas-panel .atl-ctl-toggle.on .atl-ctl-knob{left:17px;}'
      +'#atlas-panel .atl-ctl-op{flex:0 0 120px;accent-color:var(--primary-color);}'
      +'#atlas-panel .atl-ctl-btn{align-self:flex-start;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);border-radius:10px;padding:6px 12px;font-size:11.5px;font-weight:600;cursor:pointer;}'
      +'#atlas-panel .atl-ctl-btn:hover{border-color:var(--primary-color);color:var(--primary-color);}'
      /* (#R74) ChatGPT-style source link cards */
      +'#atlas-panel .atl-src-h{font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-muted);margin:9px 0 1px;}'   /* (#R79) ChatGPT-style Sources label above the cards */
      +'#atlas-panel .atl-lc-row{display:flex;flex-wrap:wrap;gap:6px;margin:7px 0 3px;}'
      +'#atlas-panel .atl-lc{display:flex;align-items:center;gap:7px;max-width:100%;min-width:0;padding:5px 10px 5px 6px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));border-radius:11px;background:var(--input-bg);text-decoration:none;transition:border-color .15s ease,background .15s ease;}'
      +'#atlas-panel .atl-lc:hover{border-color:var(--primary-color);}'
      +'#atlas-panel .atl-lc-ico{width:18px;height:18px;border-radius:5px;flex:0 0 auto;}'
      +'#atlas-panel .atl-lc-tx{display:flex;flex-direction:column;min-width:0;}'
      +'#atlas-panel .atl-lc-t{font-size:10.5px;font-weight:600;color:var(--text-main);line-height:1.25;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      +'#atlas-panel .atl-lc-d{font-size:9.5px;color:var(--text-muted);line-height:1.25;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      /* (#R112) Atlas as a NATIVE sidebar TAB (normal + mobile). The panel is mounted, IN NORMAL FLOW, into
         #atlas-feed — a content area below the tab bar, sibling of #live-news-feed / #countries-feed / #info-dashboard
         — so the sidebar header + tab bar stay visible and Atlas reads as native sidebar content, exactly like the
         News / Information / Countries tabs. There is NO popup overlay (the old #atl-in-sheet "popup pasted onto the
         sidebar" hack is gone). #atlas-feed provides the positioning context + fill; .atl-tab strips every floating
         popup style off the panel and hides its popup header (the sidebar tab bar is the chrome). Workspace mode is
         excluded via :not(.ws-mode) — there Atlas keeps its own floating WINDOW. */
      +'body:not(.ws-mode) #atlas-feed{position:relative;flex:1 1 auto;min-height:0;flex-direction:column;margin:0 -24px;padding:0;overflow:hidden;}'   /* (#R145) TRUE full-width in the sidebar ("左右に余白がありすぎ"): the real gutter is #sidebar\'s own 24px L/R padding — bleed the Atlas feed out past it (as mobile already does with -16px) so replies use the whole sidebar, not the 392px inner box */
      +'body:not(.ws-mode) #atlas-panel.atl-tab{position:relative !important;left:auto !important;top:auto !important;right:auto !important;bottom:auto !important;inset:auto !important;width:100% !important;height:100% !important;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;transform:none !important;border:none !important;border-radius:0 !important;box-shadow:none !important;background:transparent !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;z-index:auto !important;resize:none !important;display:flex !important;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-head{display:none !important;}'
      /* (#R115) MOBILE Atlas ≈ the ChatGPT app ("Atlas UI in sidebar bigger… like ChatGPT app"): bigger message
         text, a wider text zone (tighter side padding, full-width Atlas replies), a taller rounded input pill
         (16px font also stops the iOS focus auto-zoom) LIFTED clearly above the sheet's bottom edge/home
         indicator, and slightly bigger suggestion chips / inline controls to match. */
      +'@media(max-width:768px){'
      /* (#R116) EDGE-TO-EDGE: the sheet's 16px side padding left the Atlas UI 358px wide on a 390px screen
         ("左右幅が画面幅とあっておらず") — bleed the feed to the full screen width, and kill every horizontal
         overflow so the chat can never wiggle sideways ("左右に動いてしまう"). */
      +'body:not(.ws-mode) #atlas-feed{margin:0 -16px !important;overflow-x:hidden !important;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab{max-width:100%;overflow-x:hidden;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-chat{padding:10px 11px 8px;gap:12px;overflow-x:hidden;}'   /* (#R142) fuller width on mobile too */
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b{font-size:15px;line-height:1.62;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.u{max-width:86%;padding:8px 14px;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.a{padding:2px 1px;}'
      /* (#R116) user vs Atlas message text SAME size: Atlas replies carry inline 12–13px font-sizes from the
         reply builders — lift those to the 15px bubble size (meta/footers ≤11px stay small on purpose). */
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.a [style*="font-size:12px"],'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.a [style*="font-size:12.5px"],'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.a [style*="font-size:12.8px"],'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.a [style*="font-size:13px"],'
      /* ⚠⚠ (#R494) THE REPLY BODY IS NAMED, NOT SNIFFED. This list matched the reply body by the
         SPELLING of an inline style — `[style*="font-size:14px"]` — so the mobile size lift held only
         for as long as five call sites in js/atlas-console.js kept writing that exact substring, and
         nothing anywhere would have failed if one of them had written `font-size: 14px`. The body is
         `.atl-md` now and the selector says so. The `[style*=…]` entries above stay: they still catch
         the meta/footer builders that have not been converted, and those are the ones this rule was
         always guessing at. */
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.a [style*="font-size:14px"],'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-b.a .atl-md{font-size:15.5px !important;}'   /* (#R158) desktop reply body is 14px → keep mobile a touch larger */
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-sub{font-size:12.5px;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-ex{gap:7px;padding:6px 11px 2px;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-chip{font-size:12.5px;padding:8px 12px;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-inbar{gap:8px;padding:8px 11px 6px;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-in{height:48px;min-height:48px;border-radius:24px;padding:12px 16px;font-size:16px;}'   /* (#R118) textarea paddings (16px font kills iOS zoom, unchanged) */
      /* (#R309) the frosted-glass material for this input is in css/intmap.css, beside the three
         search bars that needed the same fix and the #R39 rule it is copied from. */
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-go{width:44px;height:44px;}'
      /* (#R116) input LOWERED a bit from R115 (16px+safe-area was too high — "少し位置を下げて"). */
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-ainote{font-size:10px;padding:2px 12px calc(6px + env(safe-area-inset-bottom,0px));}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-ctl-lbl{font-size:13px;}'
      +'body:not(.ws-mode) #atlas-panel.atl-tab .atl-msgt button{font-size:11.5px;padding:4px 8px;}'
      +MSG_TOOLS_CSS_MOBILE
      +GLOSS_CSS_MOBILE   /* (#R491) on a phone the card stops chasing the selection and becomes a sheet */
      +'}';
}
