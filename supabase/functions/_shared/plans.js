// ============================================================================
//  IntMap · _shared/plans.js — WHAT A PLAN GIVES, declared once  (supporter-funnel)
// ----------------------------------------------------------------------------
//  Every value that differs by plan is a column of ONE table here. Before this file the same
//  four plan names were spelled, with their numbers, in four places that nothing held together:
//    · _shared/ai-ledger.js   PLAN_LIMITS         — Atlas turns a day
//    · ai-proxy/index.ts      GLOSS_PLAN_LIMITS   — term look-ups a day
//    · the monitor_limit() SQL function           — saved area monitors
//    · js/app-body.js         AI_FREE_DAILY       — the page's number before the server has answered
//  Each was right on its own; a paid plan would have had to be added to all four by hand, and the
//  first one forgotten would have been a plan that is sold and not delivered.
//
//  WHO READS IT:
//    · _shared/ai-ledger.js derives PLAN_LIMITS from the `aiTurnsPerDay` column (ai-proxy and
//      monitor-run charge through it);
//    · ai-proxy/index.ts derives GLOSS_PLAN_LIMITS from the `aiGlossPerDay` column;
//    · js/supporter.js shows the reader what their plan gives and why (the support panel);
//    · tests/supporter-funnel-checks.test.mjs holds the copies that cannot import this file —
//      the monitor_limit() body in the newest migration that defines it, and the page's
//      AI_FREE_DAILY — to this table, so a value
//      changed here and not there fails the gate instead of drifting.
//
//  ⚠⚠ NOTHING HERE CHANGES WHAT ANYONE GETS. Every number is the one already in force when this
//  table was written (2026-10-01), moved, not changed. There is NO paid plan: no-one can buy `plus`
//  or `pro` (`offered: false`), every account is `free` unless an administrator sets profiles.plan,
//  and `unlimited` is the developer override (DEV_USER_IDS) and admin rows. A future paid plan is a
//  row's numbers and `offered` — PRODUCT.md §2.4 holds that design, unapproved.
//  ⚠ These are ALLOWANCES per account, not limits on what Atlas may do inside a turn
//  (CONSTITUTION.md §5): TURN_MAX_CALLS and the project-wide ceiling stay in ai-proxy.
//
//  ⚠ NO TYPE ANNOTATIONS AND NO DENO GLOBALS — node tests and the page (Vite) import this file as
//  plain JavaScript, the same as _shared/client-error-shape.js.
// ============================================================================

/* The columns. Each one names what it counts, so a reader of a row never has to guess a unit.
     aiTurnsPerDay  — Atlas questions an account may ask a day (one user turn = one use, #R318)
     aiGlossPerDay  — term look-ups inside an answer a day (a separate lane, #R491)
     monitors       — saved area monitors (monitor_limit(); the feature has no entry point today)
     offered        — whether a reader can obtain the plan themselves. No plan is sold today. */
export const PLANS = Object.freeze({
  free:      Object.freeze({ aiTurnsPerDay: 10,        aiGlossPerDay: 60,        monitors: 5,   offered: true }),
  plus:      Object.freeze({ aiTurnsPerDay: 50,        aiGlossPerDay: 300,       monitors: 25,  offered: false }),
  pro:       Object.freeze({ aiTurnsPerDay: 200,       aiGlossPerDay: 1_000,     monitors: 25,  offered: false }),
  unlimited: Object.freeze({ aiTurnsPerDay: 1_000_000, aiGlossPerDay: 1_000_000, monitors: 200, offered: false }),
});

/* The plan an account has when nothing says otherwise — a missing profiles row, a missing column, a
   name this table does not know. */
export const DEFAULT_PLAN = "free";

/* The plan's row, or the default plan's row for a name this table does not know (the direction every
   reader of profiles.plan has always taken: an unknown name is never read as MORE than free). */
export function planOf(name) {
  const k = String(name || "");
  return Object.prototype.hasOwnProperty.call(PLANS, k) ? PLANS[k] : PLANS[DEFAULT_PLAN];
}

/* One column across every plan — { free: n, plus: n, … }. This is the shape the per-value tables
   had (PLAN_LIMITS, GLOSS_PLAN_LIMITS), so a reader that wants a plan → number map takes it here. */
export function planColumn(key) {
  const out = {};
  for (const name of Object.keys(PLANS)) {
    if (!Object.prototype.hasOwnProperty.call(PLANS[name], key)) throw new Error(`plans: no column «${key}»`);
    out[name] = PLANS[name][key];
  }
  return Object.freeze(out);
}
