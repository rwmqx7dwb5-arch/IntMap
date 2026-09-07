/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  IntMap · CLDR — the codes and the territory-language facts Unicode publishes   (#R538)
 *
 *  Two things come from here. The first is dull and load-bearing: ISO 3166 alpha-3 ↔ alpha-2.
 *  IntMap keys countries by alpha-3 and Glottolog spells them in alpha-2, and the choice was
 *  between deriving that mapping from a standard or hand-typing a fourth country table into this
 *  repository. The second (used from Phase 4 on) is CLDR's territoryInfo: for each territory, the
 *  languages spoken in it, the share of the population that speaks each, and whether the territory
 *  gives it official standing — the structured version of what the Factbook says in prose.
 *
 *  Unicode CLDR, licensed under the Unicode licence — https://cldr.unicode.org/
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { cldfFile } from './cldf.mjs';

const BASE = 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/';
export const CLDR_STAMP = {
  source: 'Unicode CLDR — supplemental territory data',
  url: 'https://cldr.unicode.org/',
  via: 'https://github.com/unicode-org/cldr-json',
  licence: 'Unicode Licence v3',
};

export async function alpha3to2(root) {
  const t = JSON.parse(await cldfFile(root, 'cldr', BASE + 'codeMappings.json', 'codeMappings.json'));
  const m = t.supplemental.codeMappings, out = new Map();
  for (const [a2, v] of Object.entries(m)) if (v && v._alpha3) out.set(v._alpha3, a2);
  return out;
}

export async function territoryInfo(root) {
  const t = JSON.parse(await cldfFile(root, 'cldr', BASE + 'territoryInfo.json', 'territoryInfo.json'));
  return t.supplemental.territoryInfo;
}
