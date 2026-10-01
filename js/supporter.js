/* ============================================================================
 *  IntMap · supporting IntMap — where support goes, and when to mention it  (supporter-funnel)
 * ----------------------------------------------------------------------------
 *  The support panel (#blueberry-modal, js/app-body.js) asked for money with three sentences about
 *  the project and nothing about what the money is FOR. Its only other entry points were the gear's
 *  last button and the 4–5-star feedback reply (js/feedback.js). This file adds the two things it
 *  lacked, and nothing that asks harder:
 *
 *    ① WHERE SUPPORT GOES — a section inside the same panel, built from what IntMap actually records:
 *       the daily Atlas allowance (the plan table, supabase/functions/_shared/plans.js — the same
 *       numbers ai-proxy charges by) and this month's AI requests and tokens (public.operating_stats(),
 *       supabase/migrations/20261001120000_operating_stats.sql). PRODUCT.md §2.1-3 — what is shown is
 *       honest: a figure no record holds is not shown, a figure that could not be read says so, and
 *       «requests» are never called «answers» (the migration says why the ledger cannot count answers).
 *    ② THE MOMENT IT IS RELEVANT — one small, non-modal card, at two moments only:
 *         · 'limit'  — the reader has just been told today's Atlas questions are used up. That is the
 *                      one moment the cost of Atlas is visible to them, so it is the honest one to
 *                      name it. js/ai-core.js raises `intmap:ai-limit` where it tells them.
 *         · 'thanks' — the reader has come back on OFFER.thanksAfterDays different days. Once.
 *       Closing it, or following it, puts every offer to sleep (OFFER below). It never covers the map's
 *       controls, never opens by itself as a modal and never interrupts a turn.
 *
 *  The Stripe links are declared here (STRIPE_DONATE). Which one a reader gets is still decided in one
 *  place, the page's `stripeDonateURL()` (js/app-body.js — js/feedback.js reads it too): the JPY page
 *  for the Japanese UI, the USD page for every other language.
 *
 *  ⚠ NO PAYMENT HAPPENS HERE AND NOTHING IS UNLOCKED BY ONE. There is no paid plan (PRODUCT.md §2.3,
 *  the design in §2.4 is unapproved); every reader keeps the same allowance whether or not they give.
 *  ⚠ NO WINDOW GLOBAL. The page reaches this file through `import` (DECISIONS.md «ファイル同士は window
 *  ではなく import で結ぶ»): js/app-body.js installs it, js/atlas-cap-panel.js opens it.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { PLANS, DEFAULT_PLAN, planOf } from '../supabase/functions/_shared/plans.js';

/* Stripe Payment Links (AGENTS.md §2 carries the same two as project facts; tests/process-standing-rules
   holds them there). js/app-body.js publishes them as window.INTMAP_STRIPE_URL_EN / _JP. */
export const STRIPE_DONATE = Object.freeze({
  en: 'https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en',
  jp: 'https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja',
});

/* ══ WHEN AN OFFER MAY APPEAR — product choices, not measurements (no-ad-hoc-hardcoding §4) ═══════
   · Observation: NONE. No offer has ever been shown, so there is no dismissal rate or return rate to
     derive these from. They are the operator's choice of «gentle», stated as such.
   · Expire when the support panel records whether offers are followed or closed — then these move to
     what that measures, not to a guess in the other direction.
   · Canonical place: THIS object. Nothing else spells them (the spec reads them from here).
     snoozeDays        — after «Not now», no offer of either kind for this many days.
     afterSupportDays  — after the reader followed an offer to the panel, none for this many days
                         (IntMap cannot see whether they gave — Stripe holds that — so it asks less, not
                         again next month).
     thanksAfterDays   — the number of DIFFERENT days a reader has opened IntMap before the one-time
                         thank-you appears. Days, not visits: ten tabs in an afternoon are one day. */
export const OFFER = Object.freeze({ snoozeDays: 30, afterSupportDays: 180, thanksAfterDays: 7 });

const STORE_KEY = 'intmap.supporter.v1';
const DAY_MS = 86400000;

let CTX = null;      // installSupporter's context — the page's language, t(), session, and the panel
let card = null;     // the one offer card, built on first use

/* ── the reader's own record, on this device only (never sent anywhere) ────────────────────────── */
function readStore() {
  try { const o = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
  catch (_) { return {}; }
}
function writeStore(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (_) {} }
function today(now) { const d = new Date(now); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

/* One more day, if today is a new one. → the number of different days IntMap has been opened here. */
export function recordVisitDay(now) {
  const t = Number.isFinite(+now) ? +now : Date.now();
  const s = readStore(), d = today(t);
  if (s.lastDay !== d) { s.lastDay = d; s.days = (Number(s.days) || 0) + 1; writeStore(s); }
  return Number(s.days) || 0;
}

/* Is any offer allowed right now, and is THIS one? `reason` is 'limit' | 'thanks'. */
export function offerAllowed(reason, now) {
  const t = Number.isFinite(+now) ? +now : Date.now();
  const s = readStore();
  if (Number(s.sleepUntil) > t) return false;
  if (reason === 'thanks') return !s.thanksShown && (Number(s.days) || 0) >= OFFER.thanksAfterDays;
  if (reason === 'limit') return s.limitDay !== today(t);   // the limit is daily, so is its card
  return false;
}
function sleepFor(days, now) {
  const t = Number.isFinite(+now) ? +now : Date.now();
  const s = readStore(); s.sleepUntil = t + days * DAY_MS; writeStore(s);
}

const tr = (key) => { try { return CTX && CTX.t ? String(CTX.t(key)) : key; } catch (_) { return key; } };
const lang = () => { try { return CTX && CTX.lang ? CTX.lang() : 'en'; } catch (_) { return 'en'; } };
const fmt = (n) => { try { return Number(n).toLocaleString(IntMapLang.htmlTag(lang())); } catch (_) { return String(n); } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ── ② THE OFFER CARD ───────────────────────────────────────────────────────────────────────────── */
function hideCard() { if (card) { card.hidden = true; card.removeAttribute('data-reason'); } }
function buildCard() {
  if (card) return card;
  card = el('div', 'supporter-offer');
  card.id = 'supporter-offer';
  card.style.zIndex = 'var(--z-toast)';   /* a named layer (scripts/z-layers.mjs NAMES): below every dialog */
  card.setAttribute('role', 'region');
  card.setAttribute('aria-labelledby', 'supporter-offer-title');
  card.hidden = true;
  const text = el('div', 'supporter-offer-text');
  const h = el('strong', 'supporter-offer-title'); h.id = 'supporter-offer-title';
  const p = el('p', 'supporter-offer-body'); p.id = 'supporter-offer-body';
  text.append(h, p);
  const acts = el('div', 'supporter-offer-actions');
  const later = el('button', 'supporter-offer-later'); later.type = 'button'; later.id = 'supporter-offer-later';
  const go = el('button', 'supporter-offer-go'); go.type = 'button'; go.id = 'supporter-offer-go';
  acts.append(later, go);
  card.append(text, acts);
  later.addEventListener('click', () => { sleepFor(OFFER.snoozeDays); hideCard(); });
  go.addEventListener('click', () => { sleepFor(OFFER.afterSupportDays); hideCard(); openSupport({ section: 'costs' }); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); sleepFor(OFFER.snoozeDays); hideCard(); } });
  document.body.appendChild(card);
  return card;
}

/* Is a dialog in front of the reader? Every modal of the page is a `.modal-overlay` (index.html and the
   ones js/ builds), shown by display — an offer under one would be marked shown and never seen. */
function dialogOpen() {
  try {
    for (const m of document.querySelectorAll('.modal-overlay')) {
      const cs = getComputedStyle(m);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') return true;
    }
  } catch (_) {}
  return false;
}

/* Show the card for `reason` if it is allowed. → true when it is now on screen. */
function offerSupport(reason, now) {
  if (!CTX || !offerAllowed(reason, now)) return false;
  if (dialogOpen()) return false;
  const c = buildCard();
  const t = Number.isFinite(+now) ? +now : Date.now();
  const s = readStore();
  if (reason === 'limit') {
    s.limitDay = today(t);
    c.querySelector('#supporter-offer-title').textContent = tr('supOfferLimitTitle');
    c.querySelector('#supporter-offer-body').textContent = tr('supOfferLimitBody');
  } else {
    s.thanksShown = t;
    c.querySelector('#supporter-offer-title').textContent = tr('supOfferThanksTitle');
    c.querySelector('#supporter-offer-body').textContent = tr('supOfferThanksBody').replace('{n}', fmt(Number(s.days) || 0));
  }
  writeStore(s);
  c.querySelector('#supporter-offer-later').textContent = tr('supOfferLater');
  c.querySelector('#supporter-offer-go').textContent = tr('supOfferGo');
  c.setAttribute('data-reason', reason);
  c.hidden = false;
  return true;
}

/* ── ① WHERE SUPPORT GOES ──────────────────────────────────────────────────────────────────────── */
/* This month's project-wide AI requests and tokens, as public.operating_stats() reports them.
   → { ok:true, stats } | { ok:false } — «could not be read» is its own answer, never zeros. */
async function readOperatingStats() {
  try {
    const db = CTX && CTX.db ? CTX.db() : null;
    if (!db || typeof db.rpc !== 'function') return { ok: false };
    /* GET, not the default POST: PostgREST runs a GET call in a READ ONLY transaction, so this read is
       one by construction, not by the function's body alone (operating_stats is STABLE, which GET requires). */
    const { data, error } = await db.rpc('operating_stats', {}, { get: true });
    if (error || !data || typeof data !== 'object') return { ok: false };
    return { ok: true, stats: data };
  } catch (_) { return { ok: false }; }
}

/* What a reader's plan gives, from the plan table — the numbers ai-proxy charges by. Every reader is on
   the default plan today; an administrator-set profiles.plan is not readable here and is not guessed. */
export function allowance() {
  const p = planOf(DEFAULT_PLAN);
  return { plan: DEFAULT_PLAN, aiTurnsPerDay: p.aiTurnsPerDay, aiGlossPerDay: p.aiGlossPerDay, paidPlanOffered: Object.values(PLANS).some((r) => r !== p && r.offered) };
}

/* The month line, in the reader's words. `res` is readOperatingStats()'s answer. */
export function monthLine(res) {
  if (!res || !res.ok) return tr('supMonthUnavail');
  const s = res.stats || {};
  if (!s.metered_since || !(Number(s.provider_calls) > 0)) return tr('supMonthNone');
  let line = tr('supMonthBody')
    .replace('{calls}', fmt(Number(s.provider_calls) || 0))
    .replace('{tin}', fmt(Number(s.input_tokens) || 0))
    .replace('{tout}', fmt(Number(s.output_tokens) || 0))
    .replace('{since}', String(s.metered_since))
    .replace('{month}', String(s.month || ''));
  if (Number(s.unmetered_calls) > 0) line += ' ' + tr('supMonthUnmetered').replace('{n}', fmt(Number(s.unmetered_calls)));
  return line;
}

/* Fill (or refill) the «where support goes» section of the support panel. Returns the promise of the
   month figure, so a caller (the spec, Atlas) can wait for the line that is actually on screen. */
export function renderSupportCosts(panel) {
  const root = panel && panel.querySelector ? panel : document.getElementById('blueberry-modal');
  if (!root) return Promise.resolve(null);
  let sec = root.querySelector('#supporter-costs');
  if (!sec) {
    sec = el('section', 'supporter-costs'); sec.id = 'supporter-costs';
    const anchor = root.querySelector('#blueberry-body');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor.nextSibling); else root.appendChild(sec);
  }
  sec.replaceChildren();
  sec.setAttribute('aria-labelledby', 'supporter-costs-title');
  const h = el('h4', 'supporter-costs-title', tr('supCostsTitle')); h.id = 'supporter-costs-title';
  const a = allowance();
  const rows = [
    ['supporter-row-atlas', tr('supAtlasTitle'), tr('supAtlasBody').replace('{n}', fmt(a.aiTurnsPerDay)).replace('{g}', fmt(a.aiGlossPerDay))],
    ['supporter-row-month', tr('supMonthTitle'), tr('supMonthLoading')],
    ['supporter-row-rest', tr('supRestTitle'), tr('supRestBody')],
  ];
  const list = el('div', 'supporter-costs-list');
  for (const [id, t, b] of rows) {
    const r = el('div', 'supporter-costs-row'); r.id = id;
    r.append(el('div', 'supporter-costs-label', t), el('div', 'supporter-costs-value', b));
    list.appendChild(r);
  }
  sec.append(h, list);
  const month = sec.querySelector('#supporter-row-month .supporter-costs-value');
  return readOperatingStats().then((res) => { if (month && month.isConnected) month.textContent = monthLine(res); return res; });
}

/* Open the support panel; `section:'costs'` brings «where support goes» into view. */
export function openSupport(o) {
  if (!CTX || typeof CTX.openPanel !== 'function') return false;
  hideCard();
  try { CTX.openPanel(); } catch (_) { return false; }
  if (o && o.section === 'costs') {
    try { const s = document.getElementById('supporter-costs'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  }
  return true;
}

/* The same facts the panel shows, for Atlas (js/atlas-cap-panel.js `operatingCosts`). */
export async function operatingFacts() {
  const res = await readOperatingStats();
  return { allowance: allowance(), month: res.ok ? res.stats : null, monthLine: monthLine(res) };
}

/* Wire it once. ctx = { lang(), t(key), db(), openPanel() }. */
export function installSupporter(ctx) {
  if (CTX) return;
  CTX = ctx || {};
  try { recordVisitDay(); } catch (_) {}
  /* 'limit' — js/ai-core.js raises this where it tells a signed-in reader today's questions are gone */
  window.addEventListener('intmap:ai-limit', () => { try { offerSupport('limit'); } catch (_) {} });
  /* 'thanks' — once the launch screen has gone (body.booting is removed by the boot sequence), and the
     page is idle, so it never competes with the first paint or the opening camera */
  const whenIdle = () => { const go = () => { try { offerSupport('thanks'); } catch (_) {} };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go); else setTimeout(go, 0); };
  if (!offerAllowed('thanks')) return;
  if (!document.body.classList.contains('booting')) { whenIdle(); return; }
  const mo = new MutationObserver(() => { if (!document.body.classList.contains('booting')) { mo.disconnect(); whenIdle(); } });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
