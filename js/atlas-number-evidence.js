import { digestOf, stable } from './atlas-job-core.js';

/* Derive the same identifier in the tool record and in the reader's source card. */
export function numberEvidence(provenance) {
  if (provenance?.kind !== 'number' || !provenance.source) return [];
  const facts = Array.isArray(provenance.facts) && provenance.facts.length
    ? provenance.facts : (provenance.values || []).map((value) => ({ value }));
  const records = new Map();
  for (const fact of facts) {
    if (!Number.isFinite(fact?.value)) continue;
    const record = {
      value: fact.value, unit: fact.unit || provenance.unit || '',
      subject: fact.subjectId || fact.geography || provenance.of,
      geography: fact.geography, period: fact.period || provenance.date,
      measure: provenance.what, source: provenance.source, url: provenance.url || '', version: provenance.version,
    };
    const id = digestOf(stable(record));
    records.set(id, { id, ...record });
  }
  return [...records.values()];
}
