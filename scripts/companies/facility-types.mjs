/* ============================================================================
 *  IntMap · what counts as a company FACILITY, and what it is called
 * ----------------------------------------------------------------------------
 *  Wikidata will happily tell you that Toyota "owns" the city of Toyota and a
 *  railway line. A one-hop ownership query is therefore not a facility query —
 *  the TYPE is what makes it one. Every base class below was resolved from
 *  Wikidata by label (not guessed), and each is expanded through its P279*
 *  subclass closure once and cached, so a new subclass upstream is picked up
 *  without editing this file.
 *
 *  Two lists, and DENY wins:
 *    ALLOW  base class -> the `type` we publish (docs/COMPANIES.md §5.1)
 *    DENY   base classes that are never a corporate facility even when a company
 *           is recorded as owner: settlements, railway stations, airports,
 *           schools, churches, parks, sports venues.
 *
 *  ⚠ A corporate museum IS a facility (Toyota Kaikan, Mercedes-Benz Museum) and
 *  is deliberately NOT denied — it is published as `museum`, in group `other`.
 * ==========================================================================*/
import { sparql, qid, val } from './wd.mjs';

/* base QID -> published type. Order matters: the FIRST match in this list wins,
   so the specific classes come before the general ones. */
export const ALLOW = [
  ['Q1530704', 'headquarters'],            /* corporate headquarters */
  ['Q7540126', 'headquarters'],            /* headquarters */
  ['Q4168959', 'factory'],                 /* semiconductor fabrication plant */
  ['Q47509284', 'assembly_plant'],         /* assembly plant */
  ['Q12353044', 'refinery'],               /* oil refinery */
  ['Q2069494', 'factory'],                 /* steel mill */
  ['Q65515162', 'smelter'],                /* smelter */
  ['Q190928', 'shipyard'],                 /* shipyard */
  ['Q131734', 'brewery'],                  /* brewery */
  ['Q820477', 'mine'],                     /* mine */
  ['Q159719', 'power_plant'],              /* power station */
  ['Q671224', 'data_center'],              /* data center */
  ['Q113688270', 'test_facility'],         /* test facility */
  ['Q2399626', 'tech_center'],             /* technology center */
  ['Q483242', 'laboratory'],               /* laboratory */
  ['Q31855', 'research'],                  /* research institute */
  ['Q1229659', 'distribution_center'],     /* distribution center */
  ['Q1868068', 'logistics'],               /* logistics hub */
  ['Q125378564', 'port_terminal'],         /* harbour terminal */
  ['Q181623', 'warehouse'],                /* warehouse */
  ['Q1362225', 'warehouse'],               /* warehouse (structure) */
  ['Q9386255', 'factory'],                 /* production facility */
  ['Q83405', 'factory'],                   /* factory */
  ['Q2519340', 'office'],                  /* administrative building */
  ['Q1021645', 'office'],                  /* office building */
  ['Q57334497', 'store'],                  /* retail outlet */
  ['Q33506', 'museum'],                    /* museum — corporate museums are real facilities */
];

export const DENY = [
  'Q486972',    /* human settlement */
  'Q515',       /* city */
  'Q56061',     /* administrative territorial entity */
  'Q55488',     /* railway station */
  'Q548662',    /* public transport stop */
  'Q1248784',   /* airport */
  'Q3918',      /* university */
  'Q3914',      /* school */
  'Q16970',     /* church building */
  'Q22698',     /* park */
  'Q1076486',   /* sports venue */
  'Q11707',     /* restaurant */
  'Q41176',     /* building — too general; a bare "building" is not evidence of a facility */
  'Q811979',    /* architectural structure — same */
  'Q13226383',  /* facility — same */
];

/* The map group each type is drawn as (docs/COMPANIES.md §5.1). Kept HERE, next
   to the vocabulary, so adding a type cannot forget to give it a group. */
export const GROUP_OF = {
  headquarters: 'hq', secondary_headquarters: 'hq', regional_headquarters: 'hq',
  office: 'office', branch: 'office', subsidiary_office: 'office', sales_office: 'office',
  factory: 'factory', assembly_plant: 'factory', refinery: 'factory', smelter: 'factory',
  shipyard: 'factory', brewery: 'factory', mine: 'factory', power_plant: 'factory',
  research: 'rnd', rnd_center: 'rnd', tech_center: 'rnd', laboratory: 'rnd',
  test_facility: 'rnd', design_center: 'rnd',
  logistics: 'logistics', distribution_center: 'logistics', warehouse: 'logistics',
  data_center: 'logistics', port_terminal: 'logistics',
  store: 'other', museum: 'other', training_center: 'other', other: 'other',
};

/* presence kind per group — "a legal/physical operation of this kind exists in
   this country", which is NOT the same claim as "the product is sold here". */
export const PRESENCE_KIND = {
  hq: 'corporate', office: 'office', factory: 'manufacturing',
  rnd: 'rnd', logistics: 'logistics', other: 'corporate',
};

let _closure = null;

async function closureOf(base) {
  const rows = await sparql('SELECT ?t WHERE { ?t wdt:P279* wd:' + base + ' } LIMIT 20000',
    { maxAgeMs: 60 * 24 * 3600 * 1000 });
  return rows.map((r) => qid(val(r, 't')));
}

/** { typeOf(qid) -> published type | null, allowIds: Set<qid> } */
export async function typeIndex() {
  if (_closure) return _closure;
  const typeOf = new Map();
  /* build in REVERSE so the earlier (more specific) entries overwrite later ones */
  for (let i = ALLOW.length - 1; i >= 0; i--) {
    const [base, name] = ALLOW[i];
    for (const t of await closureOf(base)) typeOf.set(t, name);
  }
  const deny = new Set();
  for (const base of DENY) for (const t of await closureOf(base)) deny.add(t);
  /* ⚠ A class that is BOTH (an office building is also a building) must survive.
     `isDenied` therefore asks "denied AND never named by the allow list", so the
     general classes above only reject items that have no positive evidence. */
  _closure = {
    typeOf: (q) => typeOf.get(q) || null,
    isDenied: (q) => deny.has(q) && !typeOf.has(q),
    allowIds: new Set(typeOf.keys()),
    denyIds: deny,
    size: typeOf.size,
  };
  return _closure;
}

/** Pick the published type for an item given all of its P31 values. */
export function pickType(p31List, idx) {
  let best = null;
  let bestRank = 1e9;
  for (const q of p31List) {
    const t = idx.typeOf(q);
    if (!t) continue;
    const rank = ALLOW.findIndex(([, name]) => name === t);
    if (rank >= 0 && rank < bestRank) { bestRank = rank; best = t; }
  }
  return best;
}
