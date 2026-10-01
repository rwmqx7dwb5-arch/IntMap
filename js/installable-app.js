// @ts-check
/* ============================================================================
 *  IntMap · AS AN INSTALLED APP — the install entry, the offline notice, the window colour
 *  (installable-app)
 * ----------------------------------------------------------------------------
 *  manifest.webmanifest (scripts/build-app-manifest.mjs) makes IntMap installable and sw.js keeps a
 *  copy of the app so an installed IntMap opens with no network. This file is the page's half:
 *
 *  ① THE INSTALL ENTRY, in Settings → About & support. Chromium hands the page a
 *    `beforeinstallprompt` event when the site meets its install criteria; holding it (preventDefault)
 *    replaces the browser's own mini-infobar with one quiet button the reader presses when they want
 *    it. iOS has no such event — Safari installs only from its Share sheet — so there the entry is the
 *    one sentence that says where that is. ⚠ Where neither exists (Firefox desktop, an already
 *    installed window) the entry is HIDDEN: a button that cannot do anything is not offered.
 *  ② THE OFFLINE NOTICE. A map opened from the device with no network draws its shell and nothing a
 *    layer had to download; without a word that looks like a quiet, empty world (CONSTITUTION: an
 *    absence must not pass for a calm). The notice says the reader is offline and that what could not
 *    be downloaded is not shown, and when the network returns it says a reload will fetch it. It asks
 *    the worker whether THIS document came out of the shell (`shell-status`), because the browser's
 *    `navigator.onLine` alone cannot tell a page opened offline from one that merely lost its network.
 *  ③ THE WINDOW COLOUR. index.html's two theme-color tags follow the OS scheme; an in-app theme choice
 *    overrides the scheme everywhere else, so the installed window's title bar follows it too —
 *    read from the live --bg-color, never a second copy of the token.
 *
 *  Strings are keyed (js/locales/ui.<code>.js) and live in the markup's data-i18n, so a language
 *  switch re-words them like every other control; nothing here composes text.
 * ==========================================================================*/

/** @type {any} the held BeforeInstallPromptEvent (not in lib.dom) */
let _deferred = null;
let _installed = false;

const _mm = (q) => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch (_) { return false; } };
/** running as the installed app (Chromium/Android standalone, or an iOS home-screen launch) */
function isStandalone() {
  return _mm('(display-mode: standalone)') || _mm('(display-mode: window-controls-overlay)')
    || (typeof navigator !== 'undefined' && /** @type {any} */ (navigator).standalone === true);
}
/** iOS / iPadOS WebKit — the platform whose only install path is the Share sheet. iPadOS reports a
 *  desktop Mac user agent, and is told apart by having a touch screen (no Mac has one). */
function isAppleMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return /\b(iPhone|iPad|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

/**
 * What the install entry should offer right now.
 * @returns {'installed'|'prompt'|'ios'|'none'}
 */
function installState() {
  if (_installed || isStandalone()) return 'installed';
  if (_deferred) return 'prompt';
  if (isAppleMobile()) return 'ios';
  return 'none';
}

function syncInstallEntry() {
  if (typeof document === 'undefined') return;
  const group = document.getElementById('setting-install-group');
  const btn = document.getElementById('setting-install-app');
  const ios = document.getElementById('setting-install-ios');
  if (!group) return;
  const st = installState();
  group.hidden = !(st === 'prompt' || st === 'ios');
  if (btn) btn.hidden = st !== 'prompt';
  if (ios) ios.hidden = st !== 'ios';
}

async function promptInstall() {
  const ev = _deferred; if (!ev) return;
  /* the event can be used once: whatever the reader answers, it is spent */
  _deferred = null;
  try { await ev.prompt(); const choice = await ev.userChoice; if (choice && choice.outcome === 'accepted') _installed = true; } catch (_) {}
  syncInstallEntry();
}

/* ── ② offline ─────────────────────────────────────────────────────────────────────────────── */
let _openedFromShell = false, _wentOffline = false;
function syncOffline() {
  if (typeof document === 'undefined') return;
  const box = document.getElementById('im-offline'); if (!box) return;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  /* «back online» only when something was missed: the page opened offline, or the network dropped
     while it was open. A session that never lost the network is never told anything. */
  const back = !offline && (_openedFromShell || _wentOffline);
  box.hidden = !(offline || back);
  const now = document.getElementById('im-offline-now'), was = document.getElementById('im-offline-back'), btn = document.getElementById('im-offline-reload');
  if (now) now.hidden = !offline;
  if (was) was.hidden = !back;
  if (btn) btn.hidden = !back;
}
/** The worker's answer to «did you open this document from the shell?» */
export function noteShellStatus(msg) {
  if (!msg || msg.type !== 'shell-status') return;
  if (msg.openedFromShell) { _openedFromShell = true; syncOffline(); }
}

/* ── ③ the window colour ───────────────────────────────────────────────────────────────────── */
function syncThemeColor() {
  if (typeof document === 'undefined') return;
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim();
    if (!bg) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  } catch (_) {}
}

/* ── wiring ─────────────────────────────────────────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  /* ⚠ AT MODULE EVALUATION, NOT AFTER BOOT: the event fires once per load, as soon as the page is
     installable, and a listener attached after it is a listener for nothing. */
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); _deferred = e; syncInstallEntry(); });
  window.addEventListener('appinstalled', () => { _deferred = null; _installed = true; syncInstallEntry(); });
  window.addEventListener('offline', () => { _wentOffline = true; syncOffline(); });
  window.addEventListener('online', syncOffline);
  try { if (typeof matchMedia === 'function') matchMedia('(display-mode: standalone)').addEventListener('change', syncInstallEntry); } catch (_) {}
  const wire = () => {
    const btn = document.getElementById('setting-install-app');
    if (btn) btn.addEventListener('click', () => { promptInstall(); });
    const reload = document.getElementById('im-offline-reload');
    if (reload) reload.addEventListener('click', () => { location.reload(); });
    if (typeof navigator !== 'undefined' && navigator.onLine === false) _wentOffline = true;
    syncInstallEntry(); syncOffline(); syncThemeColor();
    /* the theme is an attribute on <html> that js/theme-sky.js and the inline boot script write */
    try { new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (_) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true }); else wire();
}
