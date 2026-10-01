/**
 * scripts/migration-order.mjs — (migration-order-guard) which migrations a change adds out of order.
 *
 * Production (`supabase db push`) will not apply a migration older than one it has already recorded, so a
 * migration a change ADDS must sort after every migration already on the base. Measured 2026-10-01: two PRs
 * written in parallel each took the timestamp that was "next" on the main they forked from; the second to land
 * (#869, 20261002090000) was older than the first (#867, 20261002100000), and the post-merge deploy refused the
 * whole history — 22 Edge Functions stayed undeployed. Names only: the rule needs nothing but the two lists.
 *
 * outOfOrder(onBase, inTree) → [{ name, stamp, latest }]
 */
export const stampOf = (name) => (/^(\d{14})_/.exec(String(name).split('/').pop()) || [])[1] || null;

export function outOfOrder(onBase, inTree) {
  const have = new Set(onBase);
  const latest = onBase.map(stampOf).filter(Boolean).sort().pop() || '';
  const out = [];
  for (const name of inTree) {
    const stamp = stampOf(name);
    if (have.has(name) || !stamp) continue;
    if (stamp <= latest) out.push({ name, stamp, latest });
  }
  return out;
}
