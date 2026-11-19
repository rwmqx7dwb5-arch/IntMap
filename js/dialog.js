/* ============================================================================
 *  IntMap · ONE dialog contract and ONE «this can be pressed» contract   (a11y-shared-dialog)
 * ----------------------------------------------------------------------------
 *  window.IntMapDialog = { open, adopt, anyOpen, openCount, top, makeActionable, listbox }
 *
 *  ══ WHAT WAS MEASURED BEFORE THIS FILE (2026-09-29, static audit) ═══════════════════════════════
 *  About 32 surfaces behave as modals; 12 carried role="dialog"; ONE — js/widget-gallery.js — had
 *  the whole contract (role, aria-modal, a name, Esc, a Tab trap, focus returned on close). The
 *  Settings dialog's own comment promised «× and Escape» and no Escape handler existed anywhere.
 *  And «is a modal open?» was answered by TWO hand-written selector lists that disagreed:
 *  js/app-body.js asked `.modal,.lightbox,#compose-modal,#settings-modal` (no element carries
 *  `.modal` or `.lightbox`, and Terms / Sources / Support / Feedback were absent, so Esc toggled the
 *  sidebar underneath an open Terms dialog) while js/workspace.js asked a different list.
 *
 *  ══ THE RULE THIS FILE HOLDS ════════════════════════════════════════════════════════════════════
 *  A surface becomes a dialog by being REGISTERED here — `open()` for one built on demand, `adopt()`
 *  for one that already lives in the page and is shown/hidden by other code. Registration is the
 *  one fact every reader asks: `anyOpen()` answers from the registry and from nothing else, so the
 *  next dialog that registers is seen by every Esc owner without anybody editing a list.
 *  Open/closed is not bookkept by callers — it is OBSERVED (the element is connected and its
 *  computed display/visibility shows it), because the same overlays are shown and hidden with
 *  `style.display` from half a dozen files, and a registry that relied on callers remembering to
 *  report would go stale the first time one of them did not.
 *
 *  What a registered dialog gets:
 *    · role="dialog" + aria-modal="true" + a name (aria-labelledby, else aria-label) on its panel;
 *    · Escape closes the TOPMOST open dialog only, through the owner's own close function (so the
 *      Settings dirty-guard still asks) and is consumed — no other Esc owner sees it;
 *    · Tab / Shift+Tab stay inside the topmost dialog;
 *    · focus moves in when it opens and back to what had it when it closes — only if focus is still
 *      inside the dialog or nowhere (a reader who clicked elsewhere is not yanked back);
 *    · optionally, a press on the backdrop itself closes it.
 *
 *  ══ «THIS CAN BE PRESSED» ═══════════════════════════════════════════════════════════════════════
 *  A click handler on a <div>/<span>/<td>/<img>/<li> cannot be reached from a keyboard. The contract
 *  is the ARIA one: an element that says role=button|option|radio|checkbox|switch|tab|menuitem*|link
 *  and is focusable is ACTIVATED by Enter (and Space, except a link). That activation is implemented
 *  ONCE, here, as a delegated listener — so markup built as a string only has to say
 *  `role="button" tabindex="0"`, and `makeActionable(el)` is the same two attributes for an element
 *  built in code. Activation is `el.click()`: the existing click handler IS the action, so a keyboard
 *  press can never do something a pointer press does not. scripts/keyboard-reach.mjs counts the
 *  click receivers that are still out of reach and ratchets them (check:static rule).
 *
 *  Pure DOM, no renderer, no strings of its own (every name is supplied by the caller in the
 *  reader's language). Published synchronously; imported by src/main.js before any module that could
 *  register a dialog.
 * ==========================================================================*/
window.IntMapDialog = (function () {
  'use strict';

  var entries = [];          /* every registered dialog: { root, panel, opts, open, returnTo, mo } */
  var stack = [];            /* the OPEN ones, in the order they opened — last is topmost */
  var FOCUSABLE = 'button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  /* roles whose ARIA contract is «Enter (and Space) activates» — WAI-ARIA APG, one line per pattern */
  var ACTIVATE_ROLES = { button: 1, option: 1, radio: 1, checkbox: 1, switch: 1, tab: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1, link: 1, treeitem: 1 };
  var NATIVE = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION)$/;

  function shown(el) {
    if (!el || !el.isConnected) return false;
    try {
      if (el.hidden) return false;
      var s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    } catch (e) { return false; }
  }
  /* open = the owner's own predicate when it has one (a bottom sheet that is always laid out and slides
     off-screen when shut is «closed» while display says otherwise), else «connected and laid out» */
  function openOf(en) {
    if (typeof en.opts.isOpen === 'function') { try { return !!en.root.isConnected && !!en.opts.isOpen(); } catch (e) { return false; } }
    return shown(en.root);
  }
  function visibleFocusable(root) {
    var all = root.querySelectorAll(FOCUSABLE), out = [];
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      if (f.closest('[hidden],[inert]')) continue;
      try { if (!f.getClientRects().length) continue; } catch (e) {}
      out.push(f);
    }
    return out;
  }
  function entryOf(root) {
    for (var i = 0; i < entries.length; i++) if (entries[i].root === root) return entries[i];
    return null;
  }

  /* the last element that held focus OUTSIDE every open dialog — where focus goes back to. Read from
     focusin rather than only from activeElement at the moment of opening, because an owner may blur
     before it shows its dialog (Settings does, to open scrolled to the top) and the opening is
     observed a microtask later. */
  var lastOutside = null;
  function inAnyOpen(n) { for (var i = 0; i < stack.length; i++) if (stack[i].root.contains(n)) return true; return false; }
  function onOpened(en) {
    en.open = true;
    stack.push(en);
    var ae = document.activeElement;
    var here = (ae && ae !== document.body && !en.root.contains(ae)) ? ae : null;
    en.returnTo = here || ((lastOutside && lastOutside.isConnected && !en.root.contains(lastOutside)) ? lastOutside : null);
    if (en.opts.focus === false) return;
    /* focus moves IN — to what the owner names, else the first control, else the panel itself */
    try {
      var tgt = typeof en.opts.initialFocus === 'function' ? en.opts.initialFocus() : en.opts.initialFocus;
      if (!tgt) tgt = visibleFocusable(en.panel)[0];
      if (!tgt) { if (!en.panel.hasAttribute('tabindex')) en.panel.setAttribute('tabindex', '-1'); tgt = en.panel; }
      if (tgt && tgt.focus) tgt.focus({ preventScroll: true });
    } catch (e) {}
  }
  function onClosed(en) {
    en.open = false;
    var i = stack.indexOf(en); if (i >= 0) stack.splice(i, 1);
    var back = en.returnTo; en.returnTo = null;
    /* focus goes BACK — but only if it is still inside the closed dialog or nowhere at all */
    try {
      var ae = document.activeElement;
      var lost = !ae || ae === document.body || en.root.contains(ae) || !ae.isConnected;
      if (lost && back && back.isConnected && back.focus) back.focus({ preventScroll: true });
    } catch (e) {}
    if (!en.root.isConnected && en.opts.transient) drop(en);
  }
  function sync(en) {
    var now = openOf(en);
    if (now && !en.open) onOpened(en);
    else if (!now && en.open) onClosed(en);
  }
  function drop(en) {
    try { en.mo && en.mo.disconnect(); } catch (e) {}
    var i = entries.indexOf(en); if (i >= 0) entries.splice(i, 1);
    var j = stack.indexOf(en); if (j >= 0) stack.splice(j, 1);
  }
  function watch(en) {
    /* Open/closed is observed on the element itself (style / class / hidden) and on its parent (it
       may be removed). One observer per dialog — the registry is a few dozen elements, and nothing
       here observes the whole document (a map redraws its markers' style every frame). */
    try {
      var mo = new MutationObserver(function () { sync(en); });
      mo.observe(en.root, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'open'] });
      if (en.root.parentNode) mo.observe(en.root.parentNode, { childList: true });
      en.mo = mo;
    } catch (e) {}
  }

  function label(panel, opts) {
    if (!panel.getAttribute('role')) panel.setAttribute('role', opts.role || 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (opts.labelledby) panel.setAttribute('aria-labelledby', opts.labelledby);
    else if (opts.label && !panel.getAttribute('aria-labelledby')) panel.setAttribute('aria-label', opts.label);
    else if (!panel.getAttribute('aria-labelledby') && !panel.getAttribute('aria-label')) {
      /* no name given: the dialog is named by its own first heading, the way a reader sees it */
      var h = panel.querySelector('h1,h2,h3,h4,[role="heading"]');
      if (h) { if (!h.id) h.id = 'im-dlg-h' + (++_hSeq); panel.setAttribute('aria-labelledby', h.id); }
    }
  }
  var _hSeq = 0;

  /** Register a dialog that already lives in the page (or is built by its owner) and is shown and
   *  hidden by its owner. Idempotent: adopting the same element twice returns the first handle with
   *  the newer options.
   *  @param {HTMLElement} root   the element whose visibility IS the dialog's (usually the backdrop)
   *  @param {{panel?:HTMLElement, label?:string, labelledby?:string, close?:(why:string)=>void,
   *           escape?:boolean, backdrop?:boolean, initialFocus?:any, focus?:boolean, role?:string,
   *           transient?:boolean, isOpen?:()=>boolean}} [opts]
   *    close     how THIS dialog closes (its owner's own function — dirty guards stay in force).
   *              Default: `root.style.display='none'`.
   *    escape    false = the dialog owns Escape itself; the registry leaves it alone.
   *    backdrop  true = a press on `root` itself (not its content) closes it; 'any' = a press anywhere
   *              in it does (a lightbox whose whole surface is «tap to dismiss»); an Element = a press
   *              on that element does (a scrim that is a sibling of the panel).
   *    transient true = forget the entry once the element has left the document.
   *    isOpen    the owner's own «is it open» when layout cannot say (a sheet parked off-screen). */
  function adopt(root, opts) {
    if (!root) return null;
    opts = opts || {};
    var en = entryOf(root);
    if (en) { en.opts = Object.assign({}, en.opts, opts); if (opts.panel) en.panel = opts.panel; label(en.panel, en.opts); sync(en); return en.handle; }
    en = { root: root, panel: opts.panel || root, opts: opts, open: false, returnTo: null, mo: null };
    label(en.panel, opts);
    en.handle = {
      el: root,
      close: function (why) { closeEntry(en, why || 'api'); },
      isOpen: function () { return openOf(en); },
      forget: function () { drop(en); },
    };
    var bd = opts.backdrop;
    if (bd && bd.nodeType === 1) bd.addEventListener('click', function () { closeEntry(en, 'backdrop'); });
    else if (bd) root.addEventListener('click', function (e) { if (bd === 'any' || e.target === root) closeEntry(en, 'backdrop'); });
    entries.push(en);
    watch(en);
    sync(en);
    return en.handle;
  }

  /** Show a dialog built on demand. Appends `root` to <body> when it is not in the document yet,
   *  registers it (transient by default) and returns the same handle as adopt(). The default close
   *  REMOVES the element. */
  function open(root, opts) {
    if (!root) return null;
    opts = Object.assign({ transient: true }, opts || {});
    if (!opts.close) opts.close = function () { try { root.remove(); } catch (e) {} };
    if (!root.isConnected) document.body.appendChild(root);
    return adopt(root, opts);
  }

  function closeEntry(en, why) {
    try {
      if (typeof en.opts.close === 'function') en.opts.close(why);
      else en.root.style.display = 'none';
    } catch (e) {}
    sync(en);   /* the MutationObserver would also see it, a microtask later — answer now */
  }

  function top() {
    for (var i = stack.length - 1; i >= 0; i--) { if (openOf(stack[i])) return stack[i]; }
    return null;
  }
  /** Is any registered dialog showing right now? Answered from the registry and live layout only. */
  function anyOpen() {
    for (var i = 0; i < entries.length; i++) if (openOf(entries[i])) return true;
    return false;
  }
  function openCount() {
    var n = 0;
    for (var i = 0; i < entries.length; i++) if (openOf(entries[i])) n++;
    return n;
  }

  /* ── keys. Capture phase on the document, installed once: the topmost dialog answers Escape and
        Tab before any other owner of those keys does. ─────────────────────────────────────────── */
  function onKey(e) {
    if (e.key !== 'Escape' && e.key !== 'Tab') return;
    /* reconcile first — an observer callback may not have run yet in this task */
    for (var i = 0; i < entries.length; i++) sync(entries[i]);
    var en = top();
    if (!en) return;
    if (e.key === 'Escape') {
      if (en.opts.escape === false || e.defaultPrevented) return;
      e.preventDefault(); e.stopImmediatePropagation();
      closeEntry(en, 'escape');
      return;
    }
    var f = visibleFocusable(en.root);
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], ae = document.activeElement;
    if (!en.root.contains(ae)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && (ae === first || ae === en.panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && ae === last) { e.preventDefault(); first.focus(); }
  }

  /* ── activation. Bubble phase: an element's own key handler runs first and, if it handled the
        key, its preventDefault() keeps this from pressing a second time. ─────────────────────── */
  function onActivateKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var isEnter = e.key === 'Enter', isSpace = e.key === ' ' || e.key === 'Spacebar';
    if (!isEnter && !isSpace) return;
    var t = e.target;
    if (!t || t.nodeType !== 1 || NATIVE.test(t.tagName) || t.isContentEditable) return;
    var role = (t.getAttribute('role') || '').toLowerCase();
    /* a column header that states aria-sort IS the sort control (the table keeps its header semantics) */
    var sortHeader = (t.tagName === 'TH' || role === 'columnheader') && t.hasAttribute('aria-sort');
    if (!ACTIVATE_ROLES[role] && !sortHeader) return;
    if (t.getAttribute('tabindex') == null) return;
    if (t.getAttribute('aria-disabled') === 'true') return;
    if (isSpace && role === 'link') return;
    e.preventDefault();   /* Space would otherwise scroll the panel under the reader */
    t.click();
  }

  /** Make an element that has a click handler reachable and pressable from a keyboard:
   *  tabindex=0 (unless it already has one) and role=button (unless it already has a role). The key
   *  → click is the delegated listener above; nothing is attached per element.
   *  @param {Element} el @param {{role?:string, label?:string}} [opts] @returns {Element} */
  function makeActionable(el, opts) {
    if (!el || el.nodeType !== 1) return el;
    opts = opts || {};
    if (!NATIVE.test(el.tagName)) {
      if (el.getAttribute('tabindex') == null) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', opts.role || 'button');
    }
    if (opts.label && !el.getAttribute('aria-label')) el.setAttribute('aria-label', opts.label);
    return el;
  }

  /** A text field that drives a list of choices (the combobox pattern the route planner's stop
   *  suggestions use): ArrowDown/ArrowUp move the active option, Enter picks it, Escape closes the
   *  list. The field keeps focus; the list is announced through aria-activedescendant.
   *  @param {HTMLInputElement} input @param {HTMLElement} list
   *  @param {{options:()=>Element[], pick:(el:Element)=>void, close?:()=>void, label?:string}} o */
  var _lbSeq = 0;
  function listbox(input, list, o) {
    if (!input || !list || !o) return null;
    if (!list.id) list.id = 'im-lb-' + (++_lbSeq);
    list.setAttribute('role', 'listbox');
    if (o.label) list.setAttribute('aria-label', o.label);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    var active = -1;
    function opts() { var a = o.options() || []; return Array.prototype.slice.call(a); }
    function paint() {
      var a = opts();
      a.forEach(function (x, i) {
        if (!x.id) x.id = list.id + '-o' + i;
        x.setAttribute('role', 'option');
        x.setAttribute('aria-selected', i === active ? 'true' : 'false');
        x.classList.toggle('kbd-active', i === active);
      });
      if (active >= 0 && a[active]) {
        input.setAttribute('aria-activedescendant', a[active].id);
        try { a[active].scrollIntoView({ block: 'nearest' }); } catch (e) {}
      } else input.removeAttribute('aria-activedescendant');
      input.setAttribute('aria-expanded', a.length && shown(list) ? 'true' : 'false');
    }
    input.addEventListener('keydown', function (e) {
      var a = opts();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!a.length) return;
        e.preventDefault();
        active = e.key === 'ArrowDown' ? (active + 1) % a.length : (active <= 0 ? a.length - 1 : active - 1);
        paint();
      } else if (e.key === 'Enter' && active >= 0 && a[active]) {
        e.preventDefault();
        var pick = a[active]; active = -1; paint();
        o.pick(pick);
      } else if (e.key === 'Escape' && a.length && shown(list) && o.close) {
        e.preventDefault(); e.stopPropagation();
        active = -1; o.close(); paint();
      }
    });
    return {
      /** call after the list is re-rendered: options are re-labelled, the highlight starts over */
      reset: function () { active = -1; paint(); },
      active: function () { return active; },
    };
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keydown', onActivateKey, false);
    document.addEventListener('focusin', function (e) { var t = e.target; if (t && t.nodeType === 1 && t !== document.body && !inAnyOpen(t)) lastOutside = t; }, true);
  }

  return { open: open, adopt: adopt, anyOpen: anyOpen, openCount: openCount,
           top: function () { var en = top(); return en ? en.root : null; },
           makeActionable: makeActionable, listbox: listbox,
           /* for the tests */
           _entries: function () { return entries.length; }, FOCUSABLE: FOCUSABLE, ACTIVATE_ROLES: ACTIVATE_ROLES };
})();
