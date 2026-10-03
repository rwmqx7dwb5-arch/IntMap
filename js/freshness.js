/* ============================================================================
 *  IntMap · js/freshness.js — WHEN IS THIS TRUE, AND WHO SAID SO  (news-intelligence)
 * ----------------------------------------------------------------------------
 *  One small component for one sentence every live surface owes its reader: «as of <when>, measured
 *  by <whom>» — and, when the measuring has stopped or could not be asked, THAT, in words that do not
 *  look like each other. News, internet outages, the company atlas and the elections pack all print a
 *  version of it; this is the one they can share, so the four states read the same everywhere:
 *
 *      fresh       the source answered and its newest statement is inside its own rhythm
 *      stale       the source answered, and has said nothing new for longer than its rhythm
 *                  («No update for 5 h») — a measured fact about the source
 *      unverified  the source could not be asked — NOT an all-clear and NOT «dead»
 *                  (#R499 / #R504: «could not ask» and «asked, nothing there» must never look alike)
 *      unknown     nothing has been asked yet
 *
 *  ⚠ THE RHYTHM IS THE CALLER'S MEASUREMENT, NEVER A NUMBER HERE. A cron schedule, the median gap
 *    between a feed's runs, a dataset's release cadence — the caller passes `rhythmMs` with where it
 *    came from; this file only says «more than `missed` rhythms have passed». `missed` defaults to 3
 *    (three consecutive scheduled runs without a success: one missed run is noise on any scheduler,
 *    three is a pattern). Expires if a caller has a better-founded rule — pass `missed`.
 *  ⚠ PURE + ONE RENDERER: `judge()` has no DOM and no clock of its own (node evaluates it as shipped,
 *    tests/news-intelligence-checks.test.mjs); `chip()` returns markup, escaped through the caller's
 *    `esc` so this file has no opinion about which escaper the page uses.
 *  IntMap's own words, en + jp (CONSTITUTION.md §7).
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the one output encoder (js/safe-html.js) */
const esc = (s) => globalThis.IntMapSafe.html(s == null ? '' : String(s));

const HOUR = 3600000, MIN = 60000;

/** judge({ at, rhythmMs, now, missed, unverified }) → { state, ageMs, missedRuns } */
export function judge(o) {
  const p = o || {};
  if (p.unverified) return { state: 'unverified', ageMs: null, missedRuns: null };
  const at = toMs(p.at);
  if (at == null) return { state: 'unknown', ageMs: null, missedRuns: null };
  const now = toMs(p.now);
  const age = Math.max(0, (now == null ? at : now) - at);
  const rhythm = Number(p.rhythmMs);
  if (!(rhythm > 0)) return { state: 'fresh', ageMs: age, missedRuns: null };
  const missed = Number(p.missed) > 0 ? Number(p.missed) : 3;
  const runs = Math.floor(age / rhythm);
  return { state: runs >= missed ? 'stale' : 'fresh', ageMs: age, missedRuns: runs };
}

function toMs(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = Date.parse(String(v));
  return isNaN(t) ? null : t;
}

/** a duration in the reader's words — «3 h», «2 d», «40 min» — the unit the eye can compare */
export function ageText(ms, lang) {
  const L = IntMapLang.pick(() => lang);
  if (!(ms >= 0)) return '';
  if (ms < HOUR) return L('{n} min', '{n} 分').replace('{n}', String(Math.max(1, Math.round(ms / MIN))));
  if (ms < 48 * HOUR) return L('{n} h', '{n} 時間').replace('{n}', String(Math.round(ms / HOUR)));
  return L('{n} days', '{n}日').replace('{n}', String(Math.round(ms / (24 * HOUR))));
}

/**
 * freshChip({ at, by, rhythmMs, now, unverified, verb, lang, fmt }) → markup (every value escaped here)
 *   by    who measured / published it — a name, not a URL (the source list carries the link)
 *   verb  'updated' | 'measured' | 'published' — the sentence says what the instant IS
 *   fmt   (ms) → a localised date-time (the caller's formatter, so the clock zone is the page's)
 */
export function freshChip(o) {
  const p = o || {};
  const L = IntMapLang.pick(() => p.lang);
  const j = judge(p);
  const at = toMs(p.at);
  const when = at == null ? '' : (p.fmt ? p.fmt(at) : new Date(at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
  const verb = p.verb === 'measured' ? L('Measured', '計測') : p.verb === 'published' ? L('Published', '公表') : L('Last update', '最終更新');
  let text;
  if (j.state === 'unverified') text = L('Could not check whether this is current — this is not an all-clear', '最新かどうかを確認できませんでした（問題が無いという意味ではありません）');
  else if (j.state === 'unknown') text = L('Not checked yet', 'まだ確認していません');
  else if (j.state === 'stale') text = L('No update for {a}', '{a} 更新なし').replace('{a}', ageText(j.ageMs, p.lang)) + ' · ' + verb + ' ' + when;
  else text = verb + ' ' + when + (j.ageMs != null ? ' (' + L('{a} ago', '{a}前').replace('{a}', ageText(j.ageMs, p.lang)) + ')' : '');
  const by = p.by ? ' · ' + L('by {w}', '出典: {w}').replace('{w}', String(p.by)) : '';
  return '<span class="im-fresh im-fresh-' + esc(j.state) + '" data-fresh="' + esc(j.state) + '" role="status">'
    + '<span class="im-fresh-dot" aria-hidden="true"></span>'
    + '<span class="im-fresh-txt">' + esc(text + by) + '</span></span>';
}

export const IntMapFreshness = { judge, chip: freshChip, ageText };
/* imported, never published on window — a module that wants the component names it in an import (check:surface) */
