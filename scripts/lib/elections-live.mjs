/* ============================================================================
 *  IntMap · THE ELECTIONS LAYER AS LIVE DATA — declarations, receipts, and «is it overdue?»
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-03, BEFORE THIS FILE: data/elections/ was written once, on 2026-09-10, and no
 *  workflow ever rebuilt it. Nothing in the bytes said when they were taken or from whom, and
 *  nothing could tell that the record had fallen behind the world — although it had, three ways:
 *    · the United States House stops at 2018 (three general elections missing: MEDSL's 2020-2024
 *      returns sit behind a Dataverse guestbook — scripts/elections/us.mjs);
 *    · Canada's 45th general election (2025-04-28) has no openly licensed return (ca.mjs);
 *    · Russia's 2026 State Duma election is published by the aggregator the pack reads, but without
 *      the column that places a precinct in a district (ru.mjs).
 *  Each was written down in a comment in its pack and in no place a reader or a job could see.
 *
 *  This file holds the pure parts of the cure; scripts/build-elections.mjs wires them:
 *    · checkDeclarations — scripts/elections/upstreams.json and the packs, in both directions
 *    · stamp             — `up` (the upstream's name) and `fetchedAt` on every election row
 *    · dueOf             — per chamber, the newest election and the day the next one was due by
 *                          the LAW (maxGapMonths), so «overdue» is a fact about a constitution and
 *                          not about this repository's habits
 *    · refreshOf         — the polity's `refresh` record: current / overdue / blocked / importable
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const UPSTREAMS = 'scripts/elections/upstreams.json';

export function loadUpstreams(root) {
  return JSON.parse(readFileSync(join(root, UPSTREAMS), 'utf8'));
}

/** Problems with the declarations, in both directions, against the packs on disk and the index. */
export function checkDeclarations(decl, packIds, index) {
  const problems = [];
  const packs = (decl && decl.packs) || {};
  for (const id of packIds) if (!packs[id]) problems.push(UPSTREAMS + ': pack ' + id + ' declares nothing — give it a name, its probes and the terms of its chambers');
  for (const id of Object.keys(packs)) if (!packIds.includes(id)) problems.push(UPSTREAMS + ': ' + id + ' is declared but scripts/elections/' + id + '.mjs does not exist');
  for (const [id, p] of Object.entries(packs)) {
    if (!p || typeof p.name !== 'string' || p.name.trim().length < 3) problems.push(UPSTREAMS + ': ' + id + ' has no name');
    if (!Array.isArray(p.probes) || !p.probes.length) problems.push(UPSTREAMS + ': ' + id + ' declares no probe — scripts/upstream-liveness.mjs cannot watch it');
    for (const pr of p.probes || []) {
      let u = null;
      try { u = new URL(pr.url); } catch { problems.push(UPSTREAMS + ': ' + id + ' probe is not a URL: ' + pr.url); continue; }
      /* ⚠ http IS ALLOWED ONLY WITH A REASON: a build host that only answers http is a measured fact
         (data.nec.go.kr), and a probe over https would measure a different host than the pack reads */
      if (u.protocol === 'http:' && !(typeof pr.why === 'string' && pr.why.trim().length >= 12)) problems.push(UPSTREAMS + ': ' + id + ' probes over http without saying why: ' + pr.url);
      else if (u.protocol !== 'https:' && u.protocol !== 'http:') problems.push(UPSTREAMS + ': ' + id + ' probe is not http(s): ' + pr.url);
    }
    for (const t of p.terms || []) {
      if (typeof t.body !== 'string' || !t.body) problems.push(UPSTREAMS + ': ' + id + ' has a term with no body');
      if (!(t.maxGapMonths === null || (Number.isInteger(t.maxGapMonths) && t.maxGapMonths > 0))) problems.push(UPSTREAMS + ': ' + id + ' · ' + t.body + ' maxGapMonths must be a positive integer or null');
      if (typeof t.basis !== 'string' || t.basis.trim().length < 20) problems.push(UPSTREAMS + ': ' + id + ' · ' + t.body + ' states no legal basis for its interval');
    }
    if (p.territory != null && !['one-state', 'member-states'].includes(p.territory)) problems.push(UPSTREAMS + ': ' + id + ' territory must be one-state|member-states');
  }
  /* every chamber in the record has a term, and every polity names a declared pack */
  for (const pol of (index && index.polities) || []) {
    if (pol.pack && !packs[pol.pack]) problems.push('data/elections/index.json: polity ' + pol.id + ' names pack ' + pol.pack + ', which declares nothing');
  }
  const packOf = new Map(((index && index.polities) || []).map((p) => [p.id, p.pack]));
  const bodies = new Set();
  for (const e of (index && index.elections) || []) bodies.add(packOf.get(e.polity) + '|' + (e.body && e.body.en));
  for (const k of bodies) {
    const [pack, body] = k.split('|');
    if (!((packs[pack] && packs[pack].terms) || []).some((t) => t.body === body)) problems.push(UPSTREAMS + ': ' + pack + ' has elections of «' + body + '» and states no term for that chamber');
  }
  return problems;
}

/**
 * Put `up` and, where missing, `fetchedAt` on every election row. Mutates and returns `index`.
 * @param {(e) => string|null} commitDate  the date of the commit that last changed e.res, for rows
 *        that predate the field — stated as derived (`fetchedFrom: 'commit'`)
 */
export function stamp(index, decl, { commitDate = () => null } = {}) {
  const packOf = new Map(index.polities.map((p) => [p.id, p.pack]));
  for (const e of index.elections) {
    const d = decl.packs[packOf.get(e.polity)];
    if (d) e.up = d.name;
    if (!e.fetchedAt) {
      const c = commitDate(e);
      if (c) { e.fetchedAt = c; e.fetchedFrom = 'commit'; }
    }
  }
  return index;
}

const addMonths = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
};

/** Per polity, per chamber: the newest election in the record and the day the law required the next by. */
export function dueOf(index, decl, today) {
  const out = new Map();
  for (const pol of index.polities) {
    const terms = ((decl.packs[pol.pack] || {}).terms) || [];
    const last = new Map();
    for (const e of index.elections) {
      if (e.polity !== pol.id) continue;
      const b = e.body && e.body.en;
      if (!last.has(b) || last.get(b) < e.date) last.set(b, e.date);
    }
    out.set(pol.id, [...last].map(([body, date]) => {
      const t = terms.find((x) => x.body === body);
      const dueBy = t && t.maxGapMonths ? addMonths(date, t.maxGapMonths) : null;
      return { body, last: date, dueBy, overdue: !!(dueBy && today > dueBy) };
    }));
  }
  return out;
}

/* The words for a chamber nobody has explained. en + jp (CONSTITUTION.md §7). */
const UNEXPLAINED = {
  en: 'The law required a newer election than the last one recorded here, and the pack did not establish why it is missing.',
  jp: '法が定める期限を過ぎても、ここに記録された最後の選挙より新しい選挙が取り込まれていません。欠けている理由はまだ確認されていません。',
};

/**
 * The polity's refresh record. `findings` are what the pack's own watch() established:
 * [{ body, state: 'blocked'|'importable', what:{en,jp}, why:{en,jp} }].
 */
export function refreshOf(bodies, findings, checkedAt) {
  return {
    checkedAt,
    bodies: bodies.map((b) => {
      const f = (findings || []).find((x) => x.body === b.body);
      const row = { body: b.body, last: b.last, dueBy: b.dueBy, state: 'current' };
      if (f) { row.state = f.state; row.why = f.why; if (f.what) row.what = f.what; }
      else if (b.overdue) { row.state = 'overdue'; row.why = UNEXPLAINED; }
      return row;
    }),
  };
}
