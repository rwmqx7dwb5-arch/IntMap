/* ============================================================================
 *  IntMap · PANDEMIC MODEL — the arithmetic of the Pandemic Simulator  (#R575)
 * ----------------------------------------------------------------------------
 *  js/playground.js owned both the epidemiology and the map for six rounds, and an external audit
 *  measured what that cost. Six defects broke the model as a NUMERICAL OBJECT — not "too simple",
 *  but self-contradictory:
 *
 *    · the UI's playback speed multiplied the per-day probability of a border hop, of a variant
 *      emerging and of a treatment being found, so watching the same outbreak at ×8 produced a
 *      different epidemic (a variant's mean wait fell from ~714 days to ~89);
 *    · «Immunity 0 months» made the waning rate 1/0 = Infinity, and Infinity × 0 recovered = NaN,
 *      which then spread through S and R;
 *    · «Incubation 0 days» made the E→I rate 2/day, so 100 exposed became 200 infectious — the
 *      model MANUFACTURED PEOPLE;
 *    · a re-import into an already-seeded country added exposed people without removing them from
 *      the susceptible pool — people again from nothing;
 *    · the end-of-run test looked at I only, so a country holding a million EXPOSED people with few
 *      infectious ones was declared «contained»;
 *    · and the number printed as «x% of the world infected» was (R+D+I)/pop, which FALLS whenever
 *      immunity wanes or a variant escapes it, because those move people out of R.
 *
 *  So the engine is a separate file, and it is pure: no DOM, no window, no map, no clock, no
 *  Math.random. It takes countries + parameters + a seed and returns a state machine that node can
 *  step ten thousand times in a test (tests/r575-checks.test.mjs asserts the twelve properties the
 *  audit asked for, population conservation and speed-invariance first).
 *
 *  ⚠ THE UNITS OF `speed` ARE WALL-CLOCK MILLISECONDS AND NOTHING ELSE. There is no `speed` in this
 *  file, and there must never be: the caller decides how often to call step(), and step() decides
 *  what one day does. Those are different questions and the old code answered them with one number.
 *
 *  ⚠ WHAT THIS IS NOT. A simplified educational model, not a forecast. It is a country-level
 *  metapopulation — one well-mixed compartment set per country — with a GRAVITY-STYLE importation
 *  heuristic built from population, REAL LAND BORDERS and SCHEDULED-AIRPORT CAPACITY, and it is
 *  still NOT airline routes, passenger volumes or commuting data. Nothing in IntMap should describe
 *  it as a real transport network until it is one.
 *  ⚠ (#R673) THIS PARAGRAPH SAID «distance + a development proxy» UNTIL TODAY, which is the model
 *  #R666 replaced — a hundred and fifty lines below it, in the same file, the new weights are
 *  documented correctly. A file that contradicts itself about its own mechanism is how PRODUCT.md
 *  came to carry the same dead sentence: the stale copy is the one people read first.
 * ==========================================================================*/

/* ── THE DISEASES ───────────────────────────────────────────────────────────────────────────────
   Data, not code: every difference between two pathogens is a field here, so that dispatching on a
   disease never becomes a chain of `if (id === 'ebola')`. Five groups, deliberately not mixed:
   TRANSMISSION (how fast), SEVERITY (how deadly, and BY WHICH MEASURE), IMMUNITY (how long), VACCINE
   and TREATMENT (what medicine already exists in 2026 — for four of these five, quite a lot).

   ⚠ `latentDays` IS NOT THE INCUBATION PERIOD. Incubation is infection→symptoms; latent is
   infection→infectious, and it is the one an SEIR model needs. They differ by disease: influenza
   and COVID-19 transmit BEFORE symptoms (so latent < incubation), while Ebola is not infectious
   during incubation (so they coincide). `incubationDays` is carried alongside for display only.

   ⚠ `severity.metric` IS PART OF THE NUMBER. SARS's ~9.6% and Ebola's ~50% are CASE fatality
   ratios — deaths per DETECTED case — and the denominator of an infection fatality ratio is larger.
   Printing a CFR under the label «IFR» silently changes what it means, so the label travels with it.

   ══ ⚠⚠⚠ (#R678) A SOURCE NAMES THE PARAMETER IT STANDS BEHIND. `sources` was a flat list of
   strings, joined with « · » into one 10 px line inside a collapsed fold, and it therefore could
   not answer the only question a reader has when they look at «R₀ 1.95»: where did 1.95 come
   from? Each entry is now `{ for, name }`, where `for` is A FIELD OF THIS PRESET — so the
   attribution is checkable against the object it is attached to rather than being prose, and the
   UI can also work out which parameters have NO named source and say so. Some do not. That is a
   fact about this preset table and the reader is entitled to it (tests/r678-pandemic-p1-checks ⑦).
   ⚠ `for` IS A KEY, NOT A LABEL. This file is pure and has no language; js/playground.js turns
   the key into words in nine of them. */
export const PANDEMIC_PRESETS = {
  flu: {
    id: 'flu',
    /* R0: systematic review of influenza reproduction numbers — seasonal median ≈1.28, 2009
       pandemic ≈1.46. 1.4 sits between them. Expires if a review revises those medians. */
    transmission: { r0: 1.4, latentDays: 1, incubationDays: 2, infectiousDays: 5, seasonality: 0.35 },
    severity: { metric: 'IFR', value: 0.001 },
    /* Reinfection with a drifted strain is common within a year; 8 months of protection against the
       CIRCULATING strain is the modelling convention this simulator has always used. */
    immunity: { naturalMonths: 8 },
    /* A seasonal vaccine already exists every year (CDC 2025–26 recommendation), and it is a
       moderately effective one — ~40% against infection in a well-matched season. */
    vaccine: { availableAtStart: true, efficacyInfection: 0.4, waningMonths: 12 },
    /* Antivirals are recommended and in use; they reduce mortality but do not abolish it. */
    treatment: { availableAtStart: true, mortalityRR: 0.8 },
    /* Prior exposure + annual vaccination leave a large fraction of the world non-susceptible to
       the circulating strain at any moment. Used only in the real-world scenario. */
    baselineImmunity: 0.35,
    sources: [
      { for: 'transmission', name: 'Biggerstaff et al., influenza R0 systematic review' },
      { for: 'vaccine', name: 'CDC 2025–26 influenza guidance' },
      { for: 'severity', name: 'WHO influenza fact sheet 2026' }
    ]
  },
  covid: {
    id: 'covid',
    /* Ancestral SARS-CoV-2. Latent 4 d vs incubation 5 d: presymptomatic transmission is
       established, so the infectious window opens about a day before symptoms. */
    transmission: { r0: 3.2, latentDays: 4, incubationDays: 5, infectiousDays: 9, seasonality: 0.18 },
    severity: { metric: 'IFR', value: 0.007 },
    immunity: { naturalMonths: 9 },
    /* ══ ⚠⚠⚠ (#R673) THE «TODAY'S WORLD» SCENARIO HAS TO CONTAIN TODAY'S MEDICINE ═══════════════
       These two read `false`, and the panel above them said the scenario «starts from the immunity,
       vaccines and treatments this disease actually has in 2026». For COVID-19 of all five presets
       that was the flatly wrong one to say it about: variant-adapted vaccines are what WHO's July
       2026 position paper is written to recommend, and antivirals have been in guidelines for
       years. The screen and the arithmetic disagreed about the only thing the scenario is for.
       ⚠ `availableAtStart` IS ONLY READ IN THE REAL-WORLD SCENARIO — the novel-pathogen run sets
       both false for every preset by construction, which is what makes the two runs comparable.
       `developmentDays` therefore describes a hypothetical COVID-like NEW pathogen. */
    vaccine: { availableAtStart: true, efficacyInfection: 0.6, waningMonths: 8, developmentDays: 270 },
    treatment: { availableAtStart: true, mortalityRR: 0.45 },
    /* ⚠ (#R673) AN ASSUMPTION, AND THE PANEL NOW CALLS IT ONE. WHO's 2026 vaccine policy is written
       for a world with HIGH population immunity — hybrid immunity plus variant-adapted boosters —
       and this model has one immune compartment, so 0.9 enters as «90% start in R». That is NOT a
       WHO estimate that 90% of people hold complete protection for nine months; it is this model's
       coarsest possible reading of a real qualitative fact, and the UI must not print it as an
       observation. Partial protection would need a compartment this engine does not have. */
    baselineImmunity: 0.9,
    sources: [
      { for: 'vaccine', name: 'WHO COVID-19 vaccine position paper, July 2026' },
      { for: 'baselineImmunity', name: 'WHO TAG-CO-VAC 2026' }
    ]
  },
  sars: {
    id: 'sars',
    /* WHO: incubation usually 2–7 days, up to 10. Presymptomatic transmission was not a major
       driver, so latent ≈ incubation here. */
    transmission: { r0: 2.6, latentDays: 5, incubationDays: 5, infectiousDays: 10, seasonality: 0.12 },
    /* WHO's final 2003 tally: case fatality ≈9.6%. That is a CFR, and it is labelled as one. */
    severity: { metric: 'CFR', value: 0.096 },
    immunity: { naturalMonths: 36 },
    vaccine: { availableAtStart: false, efficacyInfection: 0.6, waningMonths: 24, developmentDays: 300 },
    treatment: { availableAtStart: false, mortalityRR: 0.6 },
    baselineImmunity: 0,
    /* One document backs two fields here, so it appears twice — an attribution is per PARAMETER,
       and collapsing the duplicate would lose the fact that the incubation period and the case
       fatality came from the same tally. */
  sources: [
      { for: 'transmission', name: 'WHO SARS summary (2003)' },
      { for: 'severity', name: 'WHO SARS summary (2003)' }
    ]
  },
  ebola: {
    id: 'ebola',
    /* Pooled mean R0 ≈1.95 (2024 meta-analysis). WHO: incubation 2–21 days, typically 7–11, and a
       person is NOT infectious during incubation — the one preset where latent = incubation. */
    transmission: { r0: 1.95, latentDays: 9, incubationDays: 9, infectiousDays: 10, seasonality: 0 },
    /* WHO: average case fatality ≈50% (25–90% across outbreaks). Again a CFR. */
    severity: { metric: 'CFR', value: 0.5 },
    immunity: { naturalMonths: 120 },
    /* Ervebo is licensed and WHO-prequalified, with outbreak stockpiles. It is not a mass campaign:
       it is ring vaccination, so it exists from day one but reaches few people per day. */
    vaccine: { availableAtStart: true, efficacyInfection: 0.9, waningMonths: 60, rolloutScale: 0.15 },
    /* mAb114 and REGN-EB3 are strongly recommended by WHO and cut mortality substantially. */
    treatment: { availableAtStart: true, mortalityRR: 0.6 },
    baselineImmunity: 0,
    sources: [
      { for: 'transmission', name: 'Ebola R0 meta-analysis (2024)' },
      { for: 'severity', name: 'WHO Ebola fact sheet' },
      { for: 'vaccine', name: 'WHO Ebola vaccines (2026-06-25)' },
      { for: 'treatment', name: 'WHO Ebola therapeutics guideline' }
    ]
  },
  measles: {
    id: 'measles',
    /* CDC's 2026 measles outbreak simulator: R0 default 12 (user range 10–18), latent 11 days,
       infectious 9 days. Those are the numbers this preset mirrors. */
    transmission: { r0: 12, latentDays: 11, incubationDays: 11, infectiousDays: 9, seasonality: 0.05 },
    severity: { metric: 'IFR', value: 0.002 },
    /* Infection-derived measles immunity is lifelong for practical purposes. */
    immunity: { naturalMonths: 0, lifelong: true },
    vaccine: { availableAtStart: true, efficacyInfection: 0.97, waningMonths: 0, lifelong: true },
    treatment: { availableAtStart: false, mortalityRR: 0.7 },
    /* WHO immunization coverage 2025: 84% of children received MCV1, 77% MCV2. A measles scenario
       that starts from a fully susceptible world is a scenario about a measles-LIKE novel pathogen,
       which is exactly why the two scenarios are named differently in the UI. */
    baselineImmunity: 0.84,
    sources: [
      { for: 'transmission', name: 'CDC Interactive Measles Outbreak Simulator (2026)' },
      { for: 'baselineImmunity', name: 'WHO Immunization coverage (2026-07-15)' }
    ]
  }
};

/* ── THE ENGINE ─────────────────────────────────────────────────────────────────────────────────
   createPandemicModel({countries, preset, params, seed}) → a stepper.

   `countries`  [{ name, pop, lat, lng, dev }]   dev ∈ (0,1], a development proxy
   `preset`     one of PANDEMIC_PRESETS (or the same shape)
   `params`     the user's overrides — see defaults() below
   `seed`       any integer. THE SAME SEED AND PARAMETERS MUST PRODUCE THE SAME RUN, byte for byte,
                whatever the caller does with wall-clock time.                                     */
export function createPandemicModel(cfg) {
  const C = (cfg && cfg.countries) || [];
  const N = C.length;
  const preset = (cfg && cfg.preset) || PANDEMIC_PRESETS.covid;

  /* ── constants ────────────────────────────────────────────────────────────────────────────────
     Every one of these carries what it was derived from and what would invalidate it. A constant
     nobody can date is a guess wearing a number's clothes. */

  /* Erlang shape. One exponential stage per compartment makes the sojourn time exponential, which
     puts far too many people through E in a day or two and keeps a long tail forever. CDC's measles
     simulator chains two latent and two infectious stages for exactly this reason; two is the
     cheapest shape that is no longer exponential. Raising these changes the epidemic's speed, not
     its mean durations. */
  /* ⚠⚠⚠ (#R666) HOW MANY STAGES IS DECIDED PER DISEASE, BELOW, BECAUSE OF THE SOJOURN TIME.
     The stage count and the per-stage daily probability are the SAME decision and were split
     across two places, which is how the mean stopped matching the setting — see the note above
     `latentStages` / `infectiousStages`. */

  /* Above this expected transition size the law of large numbers has already done its work and a
     draw is indistinguishable from its mean, so the arithmetic goes deterministic — a Poisson draw
     of 10⁶ is 10⁶ ± 0.1%. Below it, chance decides, which is what lets a small outbreak die out on
     its own. Measured only as a cost/accuracy trade-off: at 30, one step of one country costs one
     Knuth-Poisson loop of ~30 multiplications at worst. */
  const STOCHASTIC_MAX = 30;

  /* Fewer than half a person is not a person. Real-valued compartments otherwise leave 0.4 of an
     exposed individual sitting in a country forever, which makes «is the outbreak over?»
     unanswerable. The remainder is moved to R, so the population is still conserved. */
  const FADEOUT = 0.5;

  /* ══ (#R666) IMPORTATION — PHASE 2. WHERE AN OUTBREAK GOES NEXT IS NOW A DISTRIBUTION ═══════
     ⚠⚠⚠ WHAT THIS REPLACES. The destination of an importation was `Math.floor(rnd()*N)` — a UNIFORM
     draw over every country on the map. Distance and a connectivity proxy decided only whether the
     try was ACCEPTED, so Tuvalu and India were equally likely to be OFFERED the world's next
     outbreak and the difference between them showed up only as a scaling of one Bernoulli trial.
     Nothing about that is a mobility model: it is a coin flip with a weight on it.

     Now every ordered pair carries a weight and the destination is drawn from it. The weight has
     two terms because there are two ways an infection crosses a border, and they are not the same
     mechanism:

         w_ij  =  attract_j · exp(−d_ij / AIR_DECAY_KM)      ← by air
                + LAND_MIX · adjacent_ij · popW_j            ← on foot, by road, by rail

     · `attract_j` is country j's SCHEDULED AIRLINE INFRASTRUCTURE relative to the world mean
       (data/airports.json, built by scripts/build-airports.mjs from OurAirports). A country the
       host supplies no airport figure for falls back to its population weight, so it is never
       unreachable — «no data» must not read as «no airports» (#R262).
     · `popW_j = (pop_j / popMean)^POP_EXP`. Land crossings are driven by how many people live on
       the other side, not by how many runways.
     · `adjacent_ij` is a REAL land border (data/country-facts.json's `borders` — 163 countries,
       322 undirected edges, symmetric and closed), not a distance threshold. Two countries 40 km
       apart across water are not neighbours, and a distance rule cannot tell the difference.

     ⚠ THE WEIGHT DECIDES WHERE, NOT HOW OFTEN. Anything constant across j cancels when the row is
     normalised, so country i's own propensity to travel is NOT in here — it is in the acceptance
     below, where it belongs.

     AIR_DECAY_KM is the old model's 3200 km and keeps its meaning (the e-folding distance of air
     travel). AIR_SCALE and HUB_SCALE are gone: they scaled a per-destination acceptance that no
     longer exists. */
  const AIR_DECAY_KM = 3200;
  /* Destination population enters sub-linearly, the standard gravity-model convention — twice the
     people is not twice the arrivals. Not fitted to anything in this project; it expires the day a
     real passenger matrix does. */
  const POP_EXP = 0.7;
  /* How much a shared land border is worth against an average air link at zero distance. A MIXING
     WEIGHT, not an observation — nothing in this project measures land crossings. MEASURED on the
     real 177-country world at 2.5: land neighbours take a median 26% of the destination weight a
     bordered country offers (p25 17%, p75 39%; China 80%, Nepal 70%, Brazil 61%, Germany 31%) and
     exactly 0% of what each of the 24 landless countries offers, which is the qualitative fact this
     term exists to produce. Raising it makes an outbreak crawl overland; lowering it makes every
     border irrelevant. */
  const LAND_MIX = 2.5;
  /* Floor on a destination's attractiveness, so that the least-connected country on Earth is still
     reachable rather than arithmetically excluded. A share of the world mean. */
  const ATTRACT_FLOOR = 0.02;
  /* ══ ⚠⚠⚠ (#R678) HOW MUCH OF «WHICH COUNTRY» COMES FROM THE OBSERVED ROUTE NETWORK ══════════
     The distance kernel above is ISOTROPIC: it cannot know that France–Senegal, Portugal–Brazil,
     Spain–Argentina and the United Kingdom–India carry far more people than their kilometres
     allow, because what puts people on those aircraft is language, empire and diaspora, and none
     of those is a function of distance. data/mobility.json carries the one openly licensed
     bilateral fact there is: how many distinct airline routes flew between each pair of countries
     in the OpenFlights snapshot.

     ⚠⚠ THAT SNAPSHOT IS FROZEN AT JUNE 2014, and it counts ROUTES, not seats, flights or
     passengers. OpenFlights says so itself. It is used anyway because the alternative is not a
     better bilateral source — MEASURED 2026-09-10, there is none that is open and current; OAG,
     ICAO TFS and Sabre are all commercial — the alternative is NO bilateral term at all, which is
     what the model had.

     ⚠⚠⚠ AND THIS IS WHY IT IS A BLEND AND NOT A REPLACEMENT. A zero in the route table means «no
     DIRECT flight between these two countries in 2014». It does not mean nobody travels: most
     long pairs are flown with a connection, and a route table cannot see an itinerary. At m = 1
     Japan → Bolivia would be arithmetically impossible. The distance kernel is exactly the
     «everything else, including connections and everything that has changed since 2014» channel,
     so it always keeps half the row.

     A MIXING WEIGHT, not an observation — like LAND_MIX above, and CALIBRATED THE SAME WAY LAND_MIX
     was: by what it does to real rows, and against the one global spread curve there is.

     MEASURED on the real 177-country world (Natural Earth 110 m + the four tables), covid preset,
     novel-pathogen scenario, 20 cases seeded in Brazil, seeds 1-12. WHAT IT BUYS, at 0.35 against
     0 — these are the rows distance decay gets flatly wrong:
       · Australia's most likely destination becomes NEW ZEALAND (12.0%), which at 0 was not in its
         top six AT ALL — Malaysia was first. Distance decay cannot see that 2,000 km of ocean to a
         country Australians actually fly to beats 6,000 km to one they do not.
       · The United States enters the United Kingdom's top six (4.1%) and Japan's (5.6%). At 0
         neither row contained it.
       · Portugal → Brazil goes 0.19% → 1.07%, and the United Kingdom → India 0.29% → 0.46%.
     ⚠ AND WHAT IT DOES NOT BUY, because a measurement that only lists its successes is an
     advertisement: France → Senegal does not move at all (0.18% at every value of this constant).
     The 2014 table has too few France–Senegal routes for the blend to lift it, so the diaspora
     corridor this term was partly meant to capture is still missing.

     ⚠⚠⚠ AND WHAT IT COSTS, MEASURED. The median day the Nth country is reached moves from
     60 / 81 / 100 (10th / 50th / 100th, before this round) to 60 / 85 / 116. The observed COVID-19
     curve — the target the whole importation model is calibrated against — is 50 / 80 / 95. So the
     first two points are unchanged and the HUNDREDTH-COUNTRY POINT GETS WORSE: a 5% overshoot
     becomes a 22% one. That is the price and it is not hidden: the countries reached last are
     exactly the ones with no direct flight in the table, and half of each origin's air weight is
     now allocated to the two dozen partners it does fly to.
     ⚠ 0.25 COSTS THE SAME 116 AND BUYS LESS; 0.5 COSTS 120 AND BUYS LITTLE MORE. 0.35 is the most
     structure available at the smallest measured cost, which is why it is the number.
     ⚠ THE SCALE CONSTANT CANNOT FIX THIS AND IT WAS TRIED. Raising TRAVEL_WHEN_INFECTED by 70%
     moves the hundredth-country point by 11 days (140 → 129 in the variant that was measured):
     what the route table changes is the SHAPE of the reachable set, not the rate, and a rate
     constant does not absorb a shape.

     The older note, kept because it is still the reason this is a blend and not a replacement, by what
     it does to real rows. MEASURED on the 177-country world at 0.5, the qualitative facts it
     exists to produce are the ones distance alone gets wrong: see tests/r678-pandemic-p1-checks.
     ⚠ IT APPLIES PER ORIGIN. A country the route table has no outbound row for keeps the pure
     distance kernel — «not in a 2014 table» must not read as «flies nowhere» (#R262 again). */
  const ROUTE_MIX = 0.35;
  /* How much of country i's own outbound travel one unit of «airport capacity per million people»
     buys, relative to the world's population-weighted mean of the same figure. The square root is
     compression, not a measurement: airport counts are infrastructure, and infrastructure grows
     more slowly than the traffic through it (Singapore runs one of the world's busiest
     international airports out of ONE large airport, so a linear reading would call it the least
     connected country in Asia). Clamped because neither end of an unbounded ratio is credible. */
  const TRAVEL_EXP = 0.5, TRAVEL_MIN = 0.2, TRAVEL_MAX = 3;
  /* …and the same compression on a DESTINATION's airport capacity, for the same reason from the
     other side: the count of airports grows with a country's LAND AREA, and the international
     traffic through them does not. MEASURED without it, Iceland's most likely destination was
     Russia at 14.3% and the United Kingdom came sixth at 4.5% — Russia has 63.5 units of capacity
     spread over eleven time zones, almost all of it domestic. With it the same row reads Russia
     7.0% / United Kingdom 3.6%, and Japan's reads China 10.4% · South Korea 5.9% · Taiwan 3.6%
     instead of China 24.4% · United States 9.2%. Expires with any source that counts seats or
     passengers rather than runways. */
  const AIR_EXP = 0.5;
  /* ══ ⚠⚠ (#R666) HOW MUCH BEING INFECTED SUPPRESSES A TRIP ═══════════════════════════════════
     `INTL_TRIPS_PER_PERSON_DAY` is the rate for the general population. An infected person is not
     the general population: they may be symptomatic, they may be told to stay home, and screening
     turns some of them back. This is that suppression, as one factor.

     CALIBRATED AGAINST A REAL EPIDEMIC, not against the model it replaces. COVID-19's own country
     count is the only global spread curve there is: roughly ten countries by late January 2020,
     fifty by the end of February, a hundred by mid-March — about day 50, day 80 and day 95 from the
     first symptom onsets in Wuhan. MEASURED here on the real 177-country world (Natural Earth 110 m
     + data/country-facts.json + data/airports.json), covid preset, novel-pathogen scenario, 20 cases
     seeded in Brazil, seeds 1-12, median day the Nth country is reached:

                             10th    50th   100th
       COVID-19, observed      ~50     ~80     ~95
         0.30                   54      74      86
       → 0.15                   59      81      95
         0.07                   66      92     114
         0.04                   69      94     131
       the model this replaces 245     349     402

     ⚠ THE TENTH COUNTRY SATURATES near 50 days however high this goes, because the first hops are
     paced by how long the source country takes to grow an exportable number of infected people and
     not by how often anybody flies. That the curve saturates in the right place is the reason to
     believe the mechanism rather than this constant.
     ⚠ AND THE MODEL IT REPLACES WAS FIVE TIMES SLOWER THAN THE WORLD. That was not visible while
     the destination was a uniform draw and the export gate was a prevalence threshold: there was
     nothing in it that a real epidemic could be compared against. Expires with any real passenger
     figure. */
  const TRAVEL_WHEN_INFECTED = 0.15;
  /* ══ ⚠⚠⚠ (#R666) HOW MANY PEOPLE LEAVE, NOT HOW MANY TRIES A COUNTRY GETS ═══════════════════
     What stood here was «three destinations a day per seeded country, eight cases if the try lands,
     and nothing at all below a prevalence of 0.04%». Every part of that is a rule about the SIMULATOR
     rather than about travel: a country of a hundred million exported NOTHING until forty thousand
     people were infectious in it, and once it did, it got the same three offers a day as Tuvalu.

     What crosses a border is PEOPLE, and the number of them is the number of infected people times
     the rate at which people travel abroad. So the day's departures are drawn from the country's own
     infected pool — which makes the threshold unnecessary (one infected person in a hundred million
     really does have a small chance of flying, and it is small BECAUSE the pool is small, not because
     a constant says so) and makes the eight-case chunk unnecessary too (each traveller carries one
     infection, and whether it establishes is what the local dynamics are for).

     THE RATE. UN Tourism counts about 1.4 billion international tourist arrivals a year against a
     world population of about 8.1 billion — 4.7 × 10⁻⁴ crossings per person per day. It is an
     UNDERCOUNT of border crossings (same-day visitors and land commuting are not tourist arrivals)
     and an OVERCOUNT of distinct travellers (one person's trip is several arrivals), and this model
     has nothing finer. ⚠ It is scaled per country by `travel[i]`, and by the reader's own mobility
     slider, and by both governments' border states. Expires with any real passenger figure.
     ⚠ E TRAVELS TOO. Somebody incubating is exactly the traveller who is not stopped at a border,
     which is most of what screening misses; the pool is E + I. */
  const INTL_TRIPS_PER_PERSON_DAY = 4.7e-4;
  /* A ceiling on how many individual departures one country resolves in one day, so a pandemic with
     a hundred million infectious people cannot spend a browser frame drawing destinations one at a
     time. MEASURED as a cost bound, not an epidemiological one: at this point the destination
     distribution is being sampled a thousand times a day per country and the law of large numbers has
     long since decided where they land. Above it the remainder is dropped, which can only ever SLOW
     spread — and by then every country worth reaching has been reached. */
  const MAX_DEPARTURES = 1000;

  /* Border policy. Four states with a real way back — the previous model had `closed = true` and no
     line that ever set it to false, so a border shut on day 60 of an eight-year run stayed shut for
     the remaining 2,860 days. Multipliers are how much traffic each state passes. */
  const BORDER_STATES = ['open', 'screening', 'restricted', 'closed'];
  const BORDER_PASS = { open: 1, screening: 0.55, restricted: 0.25, closed: 0.08 };
  /* Prevalence that pushes a border one step tighter / lets it relax one step, and the number of
     consecutive quiet days required before relaxing (so a border does not flap daily). */
  const BORDER_TIGHTEN = [0.0002, 0.001, 0.004], BORDER_RELAX = 0.0004, BORDER_RELAX_DAYS = 21;

  /* Lockdown. Same shape as before: it ratchets up with prevalence, decays when prevalence falls,
     and each cycle costs public patience (fatigue), after which it stops being reachable. */
  const LOCK_MAX = 0.85, LOCK_UP = 0.08, LOCK_DOWN = 0.04, LOCK_ON = 0.004, LOCK_OFF = 0.0015, LOCK_FATIGUE_MAX = 3;

  /* Vaccine rollout: the daily share of the remaining susceptible pool a country can reach at full
     tilt, and how fast it ramps to that. 1.2%/day of those remaining is roughly the fastest national
     COVID-19 campaigns of 2021. Scaled per country by delivery capacity, and per disease by
     `vaccine.rolloutScale` (Ebola's ring vaccination is not a mass campaign). */
  const VAX_RATE_MAX = 0.012, VAX_RATE_RAMP = 0.00035;

  /* Novel-pathogen R&D only. The record for a genuinely new pathogen — genome to first emergency
     authorisation, COVID-19 mRNA — is about 270 days; nothing has ever been faster, so a run cannot
     unlock a vaccine before this floor even if progress races ahead. Irrelevant to any preset whose
     vaccine already exists. */
  const VAX_MIN_DAY_BASE = 240, VAX_MIN_DAY_SPREAD = 120;
  /* Daily probability that a novel pathogen's treatment is found, once the outbreak is large enough
       to be studied at scale. ⚠ NO `speed` HERE. 0.0009/day ⇒ a mean wait of ~3 years, which is the
       intended «this run got lucky» timescale. */
  const TREATMENT_P_DAY = 0.0009, TREATMENT_MIN_INFECTED = 2e6;

  /* Variants. A real one carries roughly a 1.1–1.4× transmissibility advantage (Omicron-like), not
     a repeated 1.6×, and the cumulative advantage is capped so eight years cannot produce an R0 of
     forty. ⚠ THE CAP IS RELATIVE, NOT ABSOLUTE: an absolute cap of 16 turned «more transmissible»
     into a REDUCTION for anyone who set R0 to 18. */
  const VARIANT_MAX = 4, VARIANT_P_DAY = 0.0014, VARIANT_MIN_INFECTED = 5e5;
  const VARIANT_R0_UP = [1.08, 0.30], VARIANT_R0_DOWN = [0.88, 0.08], VARIANT_R0_CAP = 2.2;
  const VARIANT_ESCAPE = [0.15, 0.30], VARIANT_VACCINE_ESCAPE = 0.5;
  /* How fast a fitter variant replaces what is already circulating, locally. A share advantage of
     10% per day is the observed order for Alpha/Delta/Omicron replacement (weeks, not months). */
  const VARIANT_REPLACE = 0.14;

  /* Seasonality by latitude. WHO: temperate zones have a sharp annual epidemic (Oct–Mar north,
     Apr–Sep south); the tropics have year-round transmission with weak, sometimes double, peaks. A
     single global sinusoid gave a Singapore winter. */
  const SEASON_TROPIC = 15, SEASON_TEMPERATE = 30, SEASON_TROPIC_SCALE = 0.25;
  const SEASON_PEAK_N = 20, SEASON_PEAK_S = 202;   /* day-of-year of peak transmission */

  /* Global emergency. ⚠ THIS IS NOT A PHEIC AND MUST NOT BE LABELLED AS ONE. Under the IHR a PHEIC
     is a judgement by the Director-General on advice of an Emergency Committee — international
     spread, risk, and the need for a coordinated response — never a case-count threshold. The old
     code declared one at exactly 3,000,000 cumulative cases. What is modelled here is a threshold
     the SIMULATION crosses, and the UI names it as such. */
  const EMERGENCY_COUNTRIES = 8, EMERGENCY_PREVALENCE = 2e-5;

  /* Run length. Eight years of «endemic equilibrium» is not something a model without births,
     deaths or ageing can claim: the susceptible pool it would need is the one demography refills.
     Three years is as far as this engine can honestly go. */
  const MAX_DAYS = 365 * 3;
  /* End of run: the global exposed+infectious pool must stay under this for this many days. Counting
     I alone let a million EXPOSED people be declared «contained». */
  const END_EI = 100, END_DAYS = 14, END_CONTAINED_DAY = 300;

  /* ── seeded randomness (mulberry32) ───────────────────────────────────────────────────────────
     Small, fast, and good enough for this: the model needs reproducibility, not cryptography. */
  let rngState = ((cfg && cfg.seed) | 0) || 1;
  function rnd() {
    rngState = (rngState + 0x6d2b79f5) | 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rrange(a, b) { return a + rnd() * b; }
  /* ══ ⚠⚠⚠ (#R666) «n PEOPLE, EACH WITH PROBABILITY p» IS BINOMIAL, AND IT WAS POISSON ══════════
     `min(n, Poisson(n·p))` is the right shape only when p is small. It was being asked about
     probabilities that are not: with one stage and a 1-day latent period `p` is 1, and even at two
     stages influenza's latent p was 0.865. MEASURED at n = 1, p = 0.865 — one exposed person, one
     day — the true chance of moving on is 86.5% and the Poisson answer was
     P(Poisson(0.865) ≥ 1) = 57.9%. The bias lands exactly where chance decides the outcome: the
     first handful of cases, and whether a small outbreak fades out at all.

     BINV (Kachitvichyanukul & Schmeiser's inverse-CDF sampler): walk the exact binomial pmf by its
     recurrence until the uniform is used up. The loop runs about n·p + 1 times, and `draw` only
     reaches here below STOCHASTIC_MAX, so it is bounded by ~30 iterations. `p` is folded to the
     smaller side first, so (1−p)^n never underflows and the loop is short at BOTH ends. */
  function binomial(n, p) {
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return n;
    const flip = p > 0.5, pp = flip ? 1 - p : p;
    const q = 1 - pp, sr = pp / q, a = (n + 1) * sr;
    let r = Math.pow(q, n), u = rnd(), x = 0;
    if (!(r > 0)) return flip ? n - Math.round(n * pp) : Math.round(n * pp);   /* unreachable below the cap; a mean rather than a hang */
    while (u > r && x < n) { u -= r; x++; r *= (a / x - sr); }
    return flip ? n - x : x;
  }
  /* THE ONE PLACE PEOPLE MOVE. n people, each with probability p, and never more than n of them —
     which is what makes population conservation a property of the code rather than a hope.

     ⚠⚠⚠ (#R673) n IS REAL, AND THE FRACTION MUST NOT BE DRAWN AS A WHOLE PERSON. What stood here
     was «one extra Bernoulli at frac·p, then clamp to n», and the clamp is what broke it: the
     Bernoulli pays out ONE person while `Math.min(n, k)` cuts the answer back to n, so the payout
     is worth only the fraction it was supposed to represent. MEASURED at n = 0.5, p = 0.5 over
     200 000 seeded draws: the mean was 0.1249 against the n·p = 0.25 the whole compartment system
     is built on — HALF the people that should have moved, every time a compartment held less than
     one person. It is not an exotic input: every deterministic transition above STOCHASTIC_MAX
     returns a real number, so real-valued compartments are the normal state of this model and the
     small ones are exactly where chance is supposed to decide whether an outbreak fades.

     THE FRACTION MOVES IN EXPECTATION INSTEAD. `frac · p` is a real quantity of people, and this
     model already carries real quantities of people; paying it out exactly is unbiased by
     construction, is bounded by frac (so the total can never exceed n and the clamp is gone with
     the bug it was hiding), and leaves the WHOLE part — the part where individual outcomes decide
     anything — fully stochastic. An integer n is untouched: frac is 0 and this line does nothing. */
  function draw(n, p) {
    if (!(n > 0) || !(p > 0)) return 0;
    if (p >= 1) return n;
    const m = n * p;
    if (m >= STOCHASTIC_MAX) return m;
    const whole = Math.floor(n), frac = n - whole;
    return binomial(whole, p) + frac * p;
  }
  /* Hazard: the chance one individual leaves a compartment during one day, given a mean sojourn
     time. ⚠ THIS REPLACES `rate × population`, WHICH IS WHY «0 days» NO LONGER CREATES PEOPLE:
     1 − e^(−dt/τ) is a probability and cannot exceed 1, while dt/τ can be 2. */
  function hazard(perDay) { return perDay > 0 ? 1 - Math.exp(-perDay) : 0; }

  /* ── parameters ───────────────────────────────────────────────────────────────────────────── */
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  const inp = (cfg && cfg.params) || {};
  const realWorld = inp.scenario === 'real-world';
  const P = {
    scenario: realWorld ? 'real-world' : 'naive',
    r0: num(inp.r0, preset.transmission.r0),
    latentDays: num(inp.latentDays, preset.transmission.latentDays),
    infectiousDays: Math.max(1, num(inp.infectiousDays, preset.transmission.infectiousDays)),
    baseFatality: num(inp.baseFatality, preset.severity.value),
    /* ══ ⚠⚠⚠ (#R673) «LIFELONG» IS ITS OWN FIELD, BECAUSE IT IS NOT A NUMBER OF MONTHS ══════════
       It used to be one: `monthsToDays` read «≥ 600» as Infinity, so a single slider carried a
       duration AND a categorical statement in the same variable, and the two collided exactly where
       a real preset lives. Ebola's `naturalMonths: 120` is TEN YEARS — a finite duration, a real
       claim — and the panel's slider topped out at 120 and printed «∞» there, so the screen said
       «lifelong» about a value the engine correctly treated as 3 600 days. Worse, moving the slider
       to the same end it was already at wrote 600 into the field and the immunity BECAME infinite,
       with the display unchanged: the same pixel, the same label, two different epidemics.

       So there are two fields. `naturalImmunityMonths` is only ever a duration and 600 means 600,
       and `naturalImmunityLifelong` is the categorical answer. 0 months keeps its own meaning — no
       lasting immunity at all, recovery straight back to susceptible — which is a third statement
       and was never in conflict with the other two. */
    naturalImmunityDays: (inp.naturalImmunityLifelong != null ? !!inp.naturalImmunityLifelong : !!preset.immunity.lifelong)
      ? Infinity
      : monthsToDays(num(inp.naturalImmunityMonths, preset.immunity.naturalMonths)),
    seasonality: num(inp.seasonality, preset.transmission.seasonality),
    startDayOfYear: num(inp.startDayOfYear, 1),
    initialCases: Math.max(1, num(inp.initialCases, 100)),
    /* The share of every country that is ALREADY immune on day 0. Zero in the naive scenario by
       definition; the preset's real-world figure otherwise. */
    initialImmunity: Math.min(0.99, Math.max(0, num(inp.initialImmunity, realWorld ? (preset.baselineImmunity || 0) : 0))),
    mobility: Math.max(0, num(inp.mobility, 1)),
    /* 'none' | 'adaptive' | 'strong' — the comparison the audit asked for: the same pathogen with
       and without a public-health response. */
    interventions: inp.interventions || 'adaptive',
    vaccineAtStart: inp.vaccineAtStart != null ? !!inp.vaccineAtStart : (realWorld && !!preset.vaccine.availableAtStart),
    vaccineEfficacy: num(inp.vaccineEfficacy, preset.vaccine.efficacyInfection),
    vaccineImmunityDays: (inp.vaccineImmunityLifelong != null ? !!inp.vaccineImmunityLifelong : !!preset.vaccine.lifelong)
      ? Infinity
      : monthsToDays(num(inp.vaccineMonths, preset.vaccine.waningMonths)),
    vaccineRolloutScale: num(preset.vaccine.rolloutScale, 1),
    /* (#R673) Does a campaign reach a country the outbreak has not reached? See the note on
       `stepUnreached`. It is a policy with a default, not a consequence of the loop's shape. */
    vaccinateUnreached: inp.vaccinateUnreached != null ? !!inp.vaccinateUnreached : true,
    treatmentAtStart: realWorld && !!preset.treatment.availableAtStart,
    treatmentMortalityRR: num(preset.treatment.mortalityRR, 0.45)
  };
  /* ⚠ (#R673) NO SENTINEL. This converts months to days and does nothing else; «forever» is
     `naturalImmunityLifelong`, one field up. The `m >= 600 ? Infinity` that used to live on this
     line is the whole of defect U2. */
  function monthsToDays(m) { return (m == null || m <= 0) ? 0 : m * 30; }

  const interventionScale = P.interventions === 'none' ? 0 : P.interventions === 'strong' ? 1.6 : 1;

  /* ══ ⚠⚠⚠ (#R666) THE MEAN SOJOURN TIME MUST BE THE ONE THAT WAS ASKED FOR ═══════════════════
     MEASURED on the model this replaces: a disease configured with a 1-day latent period spent a
     mean of 2.31 days latent, a 4-day one spent 5.08, a 9-day infectious period lasted 10.04. Every
     duration in every preset was about a day too long, and the header of this file claimed the
     opposite — «raising these changes the epidemic's speed, not its mean durations».

     WHY. The per-stage daily probability was `1 − e^(−S/T)`, the CONTINUOUS-time hazard. In a
     model that steps one whole day at a time the number of days spent in a stage is GEOMETRIC with
     mean 1/p, not exponential with mean T/S, and 1/(1 − e^(−r)) ≈ 1/r + ½ — half a day per stage,
     two stages, one day too long, every time.

     THE FIX IS THE DISCRETE ANSWER TO THE DISCRETE QUESTION: a geometric with mean T/S days is
     `p = S/T`, so S stages have mean exactly T. Nothing about the SHAPE changes — the sum of S
     geometrics is the discrete Erlang the two stages were always for — only the calibration.

     ⚠ AND THE STAGE COUNT HAS TO BE PART OF IT. Because a person cannot cross two stages in one
     day (the loops below run backwards precisely so they cannot), two stages can never have a mean
     under two days: influenza's 1-day latent period is not representable at two stages AT ALL, at
     any probability. So a period shorter than two days gets ONE stage, where `p = 1/T` is
     reachable. The exponential tail that costs is the right price for a mean that is the truth.
     ⚠ A period under ONE day is not representable by a daily model either; `p` clamps at 1 and the
     mean is one day. `latentDays: 0` is a different statement — «no latent compartment at all» —
     and keeps its own branch. */
  const LATENT_STAGES = P.latentDays >= 2 ? 2 : 1;
  const INFECTIOUS_STAGES = P.infectiousDays >= 2 ? 2 : 1;

  /* ── country state ────────────────────────────────────────────────────────────────────────────
     E and I are ARRAYS — one entry per Erlang stage. `pop0` is kept so that conservation is a
     testable statement about this country and not about a global sum that could hide two errors
     cancelling out. */
  /* An observed 0-100 indicator as a 0-1 capacity, or the development proxy when this country is
     not in the table. Floored at 0.05 like `dev` is: a capacity of exactly zero would make
     `overload` and `delivery` degenerate rather than merely bad. */
  const cap = (raw, fallback) => { const v = num(raw, NaN); return (isFinite(v) && v > 0) ? Math.min(1, Math.max(0.05, v / 100)) : fallback; };

  /* ══ ⚠⚠⚠ (#R678) INITIAL IMMUNITY IS A PLACE, NOT A NUMBER ══════════════════════════════════
     `P.initialImmunity` was applied to every country and every age at once, so a measles outbreak
     started in South Sudan and in Portugal from exactly the same place — on a WORLD MAP, which is
     the one place that difference is the whole point. Measles is the one preset whose real-world
     immunity IS a measured vaccination coverage, so it is the one where a per-country figure
     exists rather than being assumed: `c.immunity` is WHO/UNICEF MCV1 coverage (data/health.json),
     and the host supplies it for that preset only.

     ⚠ THE SLIDER STILL MEANS WHAT IT SAYS. It sets the POPULATION-WEIGHTED MEAN; the observations
     supply the SHAPE. Every country is scaled by the same factor so the world mean lands on the
     slider, and the slider starts on the preset's own stated world figure — so the DEFAULT run has
     the world average it always had, and a DISTRIBUTION it never had. Dragging it to 20% then asks «what if the world were far less
     vaccinated, in the pattern it actually has» — a question worth being able to ask. The
     alternatives either take the slider away or let it silently overwrite the data.

     ⚠ THE CLAMP IS NOT FREE, AND IS NOT CORRECTED. Scaling up pushes well-covered countries past
     the 0.99 ceiling, and a clamped country stops contributing its share, so the realised mean
     sits at or below the slider. Iterating to hit the mean exactly would move countries the data
     did not move, which is the thing this whole block exists to stop doing.

     ⚠ THERE IS NO PER-COUNTRY OBSERVATION OF COVID-19 IMMUNITY, and none is invented. Hybrid
     immunity is not a vaccination coverage and no source publishes it per country, so covid's 0.9
     stays the flat, stated assumption it always was: `c.immunity` is simply absent there and every
     country falls back to `P.initialImmunity`. */
  let immunityScale = 1, immunityObserved = 0;
  (function calibrateImmunity() {
    let wSum = 0, obsSum = 0;
    for (let i = 0; i < N; i++) {
      const c = C[i], p = +(c && c.pop);
      const v = num(c && c.immunity, NaN);
      if (!(p > 0) || !isFinite(v) || v < 0) continue;
      wSum += p; obsSum += p * Math.min(1, v); immunityObserved++;
    }
    if (!(wSum > 0) || !immunityObserved) { immunityObserved = 0; return; }
    const obsMean = obsSum / wSum;
    immunityScale = obsMean > 0 ? P.initialImmunity / obsMean : 0;
  })();
  function immunityOf(c) {
    const v = num(c && c.immunity, NaN);
    if (!immunityObserved || !isFinite(v) || v < 0) return P.initialImmunity;
    return Math.min(0.99, Math.max(0, Math.min(1, v) * immunityScale));
  }

  const st = new Array(N);
  let worldPop = 0;
  for (let i = 0; i < N; i++) {
    const c = C[i] || {};
    /* ══ ⚠⚠⚠ (#R675) A PLACE WHOSE POPULATION NOBODY MEASURED IS NOT AN EPIDEMIOLOGICAL UNIT ══════
       This read `(c.pop > 0) ? c.pop : 3e6`, and every quantity below is a share of that number: a
       row the host had no population figure for was given THREE MILLION INVENTED PEOPLE, who then
       caught the disease, died of it, closed their border and appeared in the world totals. It was
       measurable on screen — Antarctica, whose real resident population is a few thousand seasonal
       staff, was one of them, and the reader saw it announce a national lockdown.
       ⚠ THE FIX IS NOT A BETTER DEFAULT. There is no honest number here; a default of any size is a
       claim about a place the source is silent on. The host decides what the world is (it holds the
       tables), and this refuses to model a row that cannot be modelled, out loud, rather than
       inventing the one field everything else divides by. */
    const pop = +c.pop;
    if (!(pop > 0) || !isFinite(pop)) {
      throw new TypeError('createPandemicModel: country ' + i + ' (' + (c.name || c.code || '?') + ') has no population; a row with no measured population cannot be a compartment set');
    }
    worldPop += pop;
    const immune = pop * immunityOf(c);
    const dev = Math.min(1, Math.max(0.05, num(c.dev, 0.5)));
    st[i] = {
      /* ⚠ FOUR CAPACITIES, NOT ONE «dev». They are all proxied from the same development figure
         today — that is honest and it is written down — but medical capacity, travel connectivity,
         policy response and vaccine delivery are different things, and a model that spells them as
         one number can never be improved without touching every formula that used it.
         ⚠⚠ (#R678) THREE OF THE FOUR ARE NOW OBSERVED, and each by the indicator that is about the
         thing the field actually drives — not the one that was easiest to get:
           · `health`   drives hospital overload and baseline fatality  ← WHO UHC service coverage
                        index (SDG 3.8.1), 195 countries
           · `response` drives how fast a government tightens its border, and whether it can run a
                        vaccine programme at all  ← WHO IHR SPAR capacity 7, health emergency
                        management, 194 countries
           · `delivery` drives the share of the susceptible reached per day once a vaccine exists
                        ← WHO/UNICEF DTP3 coverage, 236 countries. «What share of this country's
                        one-year-olds actually received three doses of a vaccine that already
                        exists and is already scheduled» IS the last-mile capability this field
                        models, which is why a rich country with a weak routine programme and a
                        poor one with a strong programme now come out the right way round.
         ⚠ A COUNTRY THE HOST HAS NO FIGURE FOR IS NOT A COUNTRY WITH NO CAPACITY. `cap()` falls
         back to the development proxy FOR THAT COUNTRY ALONE — «no data» must not read as «no
         hospitals» (#R262), and the fallback is per country, never per world. */
      health: cap(c.uhc, dev), response: cap(c.spar, dev), delivery: cap(c.dtp3, 0.35 + 0.65 * dev),
      connectivity: dev,
      /* ⚠ (#R666) `connectivity` STAYS `dev` AND STOPS BEING READ BY THE MOBILITY. It was doing two
         different jobs — how attractive this country is as a destination, and how much its own
         residents travel — with one number derived from GDP per head. Those are now `attract` and
         `travel`, both built below from airport capacity where the host supplies it. Nothing else
         reads `connectivity`, and it is left in place because it is what `travel` falls back TO. */
      /* Which of the three capacities above came from an observation rather than the proxy.
         Recorded per country because the tables do not cover the same countries. */
      capacityFrom: (isFinite(num(c.uhc, NaN)) ? 1 : 0) + (isFinite(num(c.spar, NaN)) ? 2 : 0) + (isFinite(num(c.dtp3, NaN)) ? 4 : 0),
      air: Math.max(0, num(c.air, 0)),
      /* How many people arrive here from abroad in a year — a World Bank observation
         (data/mobility.json), and OPTIONAL: the mobility build below says how many countries had
         one, and a country without one falls back to its airport capacity. */
      arr: Math.max(0, num(c.arr, 0)),
      pop0: pop, lat: num(c.lat, 0), lng: num(c.lng, 0),
      /* ⚠⚠⚠ (#R666) `SV` — VACCINATED, AND STILL SUSCEPTIBLE. An all-or-nothing vaccine leaves the
         people it failed to protect in the susceptible pool, and yesterday they went back into `S`,
         where the rollout drew them again the next day, and the next. A 40% vaccine given to the
         same person often enough protects them almost surely, so the comment beside the rollout —
         «which is why a 40% vaccine cannot end an epidemic on its own» — was describing something
         the code did not do. They are the same thing epidemiologically (they catch it exactly as
         `S` does) and a different thing administratively (the campaign has already reached them), so
         they are a compartment rather than a flag. CDC's 2026 measles simulator separates the same
         group for the same reason. */
      S: pop - immune, SV: 0, E: zeros(LATENT_STAGES), I: zeros(INFECTIOUS_STAGES), R: immune, V: 0, D: 0,
      /* ⚠ THE ATTACK RATE'S OWN LEDGER. It cannot be read off R+D+I, because waning immunity and
         immune escape both move people OUT of R — which made the old «% of the world infected»
         number go DOWN. This one only ever increases; it counts infection EVENTS, so a reinfection
         counts again, and the UI says so. */
      cumInf: 0, cumDead: 0,
      seeded: false, lock: 0, fatigue: 0, border: 0, quiet: 0,
      /* ══ ⚠⚠⚠ (#R675) WHO DECIDES THIS ROW'S BORDER AND ITS LOCKDOWN ════════════════════════════
         Every row used to decide its own, because every row was «a country». The map's rows are
         Natural Earth admin-0 units, which include dependencies, disputed areas and Antarctica —
         so the news ticker announced that Antarctica had closed its borders, and it was not a
         display bug: the run really did give a continent with no government a border policy, and
         the traffic multiplier that came with it.
         `actor` is the INDEX OF THE GOVERNMENT that answers for this row — itself when it is an
         independent state, its sovereign's row when it is a dependency of one that is in the world,
         and −1 when there is no government to ask. A row with no actor never escalates, never
         relaxes and never emits a policy event; a dependency's border is its sovereign's border,
         which is what a dependency's border is.
         ⚠ THE HOST SUPPLIES IT FROM DATA (data/country-facts.json's `ind` + Natural Earth's own
         SOV_A3), not from a list of names, and a host that supplies nothing gets `i` — every row
         its own actor, which is exactly the behaviour before this round. */
      actor: (c.actor === null || c.actor === undefined) ? i : ((c.actor >= 0 && c.actor < N) ? (c.actor | 0) : -1),
      /* The day the first infection landed here, −1 while it never has. Read by the country
         inspector; it is a fact about the run and the run is the only thing that knows it. */
      day0: -1,
      /* Per-variant share of what is circulating HERE. Index 0 is the original pathogen. A variant
         that emerges in Brazil does not change Japan's R0 until it arrives in Japan. */
      share: [1], escApplied: 0
    };
  }
  /* ⚠ (#R675) ACTORS ARE FLATTENED HERE, ONCE, so that `st[s.actor]` is always a row that decides
     for itself. A host is allowed to say «this row follows that one» without checking whether THAT
     row follows a third: a chain would make the daily propagation depend on array order, which is
     the shape of bug this field exists to remove. Two passes cover any chain Natural Earth can
     produce; a cycle resolves to «no actor», which is the honest reading of a cycle. */
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) { const a = st[i].actor; if (a >= 0 && a !== i) st[i].actor = st[a].actor; }
  }
  for (let i = 0; i < N; i++) { const a = st[i].actor; if (a >= 0 && st[a].actor !== a) st[i].actor = -1; }

  /* ══ (#R675) A FOLLOWER'S POLICY IS ITS ACTOR'S POLICY, WHENEVER ANYBODY CAN LOOK ════════════════
     Called once here and once at the end of every `step()`, never in the middle of the country loop:
     inside it the answer would depend on whether the sovereign's index happens to be lower than the
     dependency's, and «what is Greenland's border» would be settled by array order. Because the
     transmission and export terms are evaluated before it, a follower spends each day under the
     rules its actor had at the start of that day — which is also what a dependency's day is like —
     and is never OBSERVED holding a different answer from the government it is under. */
  function syncFollowers() {
    for (let i = 0; i < N; i++) {
      const s = st[i];
      if (s.actor === i) continue;
      if (s.actor < 0) { s.border = 0; s.lock = 0; continue; }
      const a = st[s.actor];
      s.border = a.border; s.lock = a.lock;
    }
  }
  syncFollowers();

  function zeros(n) { const a = new Array(n); for (let k = 0; k < n; k++) a[k] = 0; return a; }

  /* ── variants ─────────────────────────────────────────────────────────────────────────────── */
  const variants = [{ r0Mult: 1, ifrMult: 1, escape: 0 }];

  /* ── run state ────────────────────────────────────────────────────────────────────────────── */
  let day = 0, ended = null;
  let vaxDay = P.vaccineAtStart ? 0 : -1, vaxProg = 0, vaxRate = 0;
  let treatment = P.treatmentAtStart, emergency = false, quietDays = 0;
  const vaxDifficulty = 0.7 + rnd() * 0.9;
  const vaxMinDay = VAX_MIN_DAY_BASE + Math.floor(rnd() * VAX_MIN_DAY_SPREAD);
  const milestones = { tenCountries: false, d1m: false, d10m: false };

  /* ── helpers ──────────────────────────────────────────────────────────────────────────────── */
  function sum(a) { let s = 0; for (let k = 0; k < a.length; k++) s += a[k]; return s; }
  function alive(s) { return s.S + s.SV + sum(s.E) + sum(s.I) + s.R + s.V; }
  function haversine(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lng - a.lng) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /* Latitude decides how much of a season a place has, not just when its winter is. */
  function seasonFactor(lat) {
    if (!P.seasonality) return 1;
    const al = Math.abs(lat);
    const amp = al >= SEASON_TEMPERATE ? P.seasonality
      : al >= SEASON_TROPIC ? P.seasonality * (SEASON_TROPIC_SCALE + (1 - SEASON_TROPIC_SCALE) * ((al - SEASON_TROPIC) / (SEASON_TEMPERATE - SEASON_TROPIC)))
        : P.seasonality * SEASON_TROPIC_SCALE;
    const peak = lat >= 0 ? SEASON_PEAK_N : SEASON_PEAK_S;
    const doy = ((P.startDayOfYear + day - 1) % 365 + 365) % 365;
    return 1 + amp * Math.cos(2 * Math.PI * ((doy - peak) / 365));
  }
  /* What is circulating here, weighted by each variant's local share. */
  function localR0(s) { let m = 0; for (let k = 0; k < s.share.length; k++) m += s.share[k] * variants[k].r0Mult; return P.r0 * m; }
  function localIfrMult(s) { let m = 0; for (let k = 0; k < s.share.length; k++) m += s.share[k] * variants[k].ifrMult; return m; }

  /* ══ ⚠⚠⚠ (#R675) THE TRANSMISSION TERM HAS ONE OWNER, BECAUSE TWO THINGS NOW ASK IT ═════════════
     `step()` needs β to advance the day. The country inspector needs the EFFECTIVE reproduction
     number, which is the same β read as a per-generation quantity against the susceptible share —
     the number a reader actually wants when they ask «is it still growing here», and the one the
     R₀ slider does NOT answer once immunity, season, behaviour, lockdown and a variant have all
     moved it. Writing the formula twice is how #R536 and #R660 happened: the copy drifts, and the
     screen then disagrees with the simulation it is describing. So both callers go through here. */
  function behaviourOf(s, prevalence) {
    return P.interventions === 'none' ? 1
      : Math.max(0.12, 1 - (0.55 * Math.min(1, prevalence * 90) + 0.25 * s.lock) * interventionScale);
  }
  function betaOf(s, behav) { return localR0(s) / P.infectiousDays * seasonFactor(s.lat) * behav; }
  /* Rₑ = β · D · (susceptible share). `P.infectiousDays` is D, so the division inside `betaOf` and
     the multiplication here cancel by construction — which is the point: they cannot drift apart. */
  function rEffOf(s) {
    const live = alive(s) || 1;
    return betaOf(s, behaviourOf(s, sum(s.I) / live)) * P.infectiousDays * ((s.S + s.SV) / live);
  }

  /* ── seeding ──────────────────────────────────────────────────────────────────────────────── */
  /* ⚠ THIS ALWAYS TAKES FROM S. The old re-import path added to E without subtracting, so every
     re-importation invented up to thirty people out of nothing. */
  /* ══ ⚠⚠⚠ (#R673) WHAT AN IMPORTATION IS, SAID ONCE, HERE ═══════════════════════════════════════
     It is NOT a person moving from one country to another: the origin's E and I are not reduced by
     it, and never were. It is IMPORTATION PRESSURE — an arriving infected traveller starting a
     local chain — so what it consumes is a LOCAL SUSCEPTIBLE, and the population of both countries
     is conserved because nobody was moved. Anything in the UI that describes this as travellers
     relocating is describing a different model.

     AND «A LOCAL SUSCEPTIBLE» MEANS BOTH POOLS. This took `Math.min(s.S, …)` — plain S only —
     while the local force of infection has drawn from S and SV at the same hazard since #R666. So
     the same person was susceptible to their neighbour and immune to the airport: a country whose
     campaign had reached everyone it could, leaving S = 0 and a large SV, was arithmetically
     unreachable by importation while being perfectly infectable from within. The two pools are
     consumed in proportion to their sizes, which is what «an arrival meets a random susceptible»
     means. */
  function inject(i, cases, fromShare) {
    const s = st[i];
    const pool = s.S + s.SV;
    const k = Math.min(pool, Math.max(0, cases));
    if (!(k > 0)) return 0;
    const fromS = pool > 0 ? k * (s.S / pool) : k;
    /* ⚠⚠⚠ (#R666) THE SHARE IS MIXED AGAINST WHAT WAS HERE BEFORE, NOT AFTER. `mixShare` weighs the
       arrivals against `E + I`, and this function used to ADD them first — so eight cases of a
       variant arriving in a country with no cases at all mixed 8 against 8, and the country came out
       47% ancestral strain when not one ancestral case had ever set foot in it. Measured on the
       arithmetic: w = 8/(8+8+1) = 0.471. */
    const here = sum(s.E) + sum(s.I);
    s.S -= fromS; s.SV -= k - fromS;
    if (P.latentDays > 0) s.E[0] += k; else s.I[0] += k;
    s.cumInf += k;
    if (!s.seeded) s.day0 = day;
    s.seeded = true;
    if (fromShare) mixShare(s, fromShare, k, here);
    return k;
  }
  /* An importation carries whatever is circulating where it came from, weighted by how big it is
     relative to what is already here. */
  function mixShare(s, from, weight, here) {
    /* ⚠ NO «+1» WHEN NOTHING WAS HERE. The old denominator carried a lone +1 to keep it non-zero,
       which on an empty country turned a pure importation into 47% of something that had never
       arrived. An empty country simply takes what arrived. */
    if (!(here > 0)) { for (let k = 0; k < variants.length; k++) s.share[k] = from[k] || 0; normalise(s.share); return; }
    const w = weight / (weight + here);
    for (let k = 0; k < variants.length; k++) {
      const a = s.share[k] || 0, b = from[k] || 0;
      s.share[k] = a + (b - a) * w;
    }
    normalise(s.share);
  }
  function normalise(sh) {
    let t = 0; for (let k = 0; k < sh.length; k++) { if (!(sh[k] > 0)) sh[k] = 0; t += sh[k]; }
    if (t <= 0) { sh[0] = 1; for (let k = 1; k < sh.length; k++) sh[k] = 0; return; }
    for (let k = 0; k < sh.length; k++) sh[k] /= t;
  }

  /* ══ (#R666) THE MOBILITY MATRIX — BUILT ONCE, AT CONSTRUCTION ═══════════════════════════════
     One row per origin, holding the CUMULATIVE destination weight so a draw is one uniform number
     and one binary search rather than a scan. N is the number of countries on the map (177 at the
     110 m Natural Earth scale, 252 at 10 m), so the matrix is at most 64 000 doubles — built once
     and read every day, which is the right way round for something that never changes.
     ⚠ IT IS SEED-INDEPENDENT AND CONFIG-INDEPENDENT. Two runs with the same world have the same
     matrix, so `same seed is the same world` (tests/r575-checks ⑧) still means what it said. */
  const MOB_CUM = new Float64Array(N > 1 ? N * N : 0);
  const travel = new Float64Array(N);
  let mobilityFrom = 'population';
  /* HOW MUCH of the matrix each source actually reached — counted while the rows are built, not
     inferred from the table sizes. «data/mobility.json has a row for Chad» and «that row survived
     being indexed against the countries on THIS map» are different facts, and only the second one
     is in the matrix. The screen reports these, so a reader is never told the model used an
     observation it did not have. */
  const mobilityStats = { routedOrigins: 0, routedPairs: 0, obsAttract: 0, withArr: 0 };   /* what the weights were actually built out of — reported */
  (function buildMobility() {
    if (N < 1) return;
    let popSum = 0, airSum = 0, airRootSum = 0, devSum = 0, withAir = 0;
    /* Observed World Bank volumes, and the population they belong to, so each reference mean is a
       mean over PEOPLE rather than over rows (a mean over rows is a mean over two hundred rows of
       which a third are islands). */
    let arrSum = 0, withArr = 0;
    for (let i = 0; i < N; i++) {
      popSum += st[i].pop0; devSum += st[i].connectivity;
      if (st[i].air > 0) { airSum += st[i].air; airRootSum += Math.pow(st[i].air, AIR_EXP); withAir++; }
      if (st[i].arr > 0) { arrSum += st[i].arr; withArr++; }

    }
    const popMean = popSum / N, devMean = (devSum / N) || 1;
    const anyAir = withAir > 0 && airSum > 0;
    if (anyAir) mobilityFrom = withAir === N ? 'airports' : 'airports+population';
    const airMean = anyAir ? airRootSum / withAir : 0;
    /* Airport capacity per million people, averaged over PEOPLE and not over countries: a mean over
       rows is a mean over two hundred rows of which a third are islands with one airstrip. */
    const apcRef = anyAir ? (airSum * 1e6) / popSum : 0;
    /* ══ ⚠⚠⚠ (#R678) THE OBSERVATION KEEPS THE COMPRESSION, AND THE REASON IS NOT THE OLD ONE ═══
       AIR_EXP's own comment says the square root «expires with any source that counts seats or
       passengers rather than runways», and observed arrivals ARE such a source. The first version of
       this line therefore took them linearly. IT WAS MEASURED AND IT WAS WRONG, in two ways that
       only a measurement could have shown:

       · `attract_j` is not «how many people arrive in j». It is «given that somebody is leaving
         country i, how likely is j». Half of France's ninety million arrivals are short repeat trips
         from its neighbours — which the DISTANCE TERM and the LAND-BORDER TERM already carry. Taken
         linearly the same regional traffic is counted twice, and the compression is what stops it.
       · The near-zero end is a REPORTING GAP, not a fact. MEASURED, the World Bank series puts
         Benin at 0.000 international departures per head and Malawi at 0.001. Nobody leaves Benin is
         not an observation anyone made; it is a series that is incomplete. Reading it as zero is the
         same error as #R675's three million invented people, in the other direction.

       With the compression, arrivals-as-attractiveness costs the calibration almost nothing
       (10th / 50th / 100th country at 60 / 83 / 104 against 60 / 81 / 100 before) while replacing an
       INFRASTRUCTURE PROXY with a MEASUREMENT OF TRAFFIC, which is what AIR_EXP's comment asked for.

       ⚠⚠⚠ AND THE OTHER HALF OF THE SAME IDEA WAS MEASURED AND NOT SHIPPED. Driving `travel[i]` —
       how much country i's own residents travel — from the same World Bank departures and boardings
       moved the 50th- and 100th-country days to 92 and 124 (linear: 106 and 144), and the scale
       constant could not pull them back (see ROUTE_MIX above). 53% of countries landed on one of the
       two clamps because [TRAVEL_MIN, TRAVEL_MAX] was chosen for a compressed proxy ratio and the
       observed ratio spans 0.000 to 20.1. Making that data usable needs the clamp's meaning
       rethought and the emission rate re-calibrated — a piece of work with its own measurements,
       not a line changed here. `travel[i]` therefore still comes from airport capacity, and
       data/mobility.json ships only the column that is used. */
    const arrMean = withArr > 0 ? arrSum / withArr : 0;
    mobilityStats.withArr = withArr;

    const popW = new Float64Array(N), attract = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      popW[i] = Math.pow(Math.max(1, st[i].pop0) / popMean, POP_EXP);
      /* ⚠ A COUNTRY WITH NO AIRPORT FIGURE IS NOT A COUNTRY WITH NO AIRPORTS. It falls back to its
         population weight, which is on the same scale (both average to 1 across the world). */
      /* ⚠ A LADDER, NOT A CHOICE. Each rung is a strictly better answer to «how many people arrive
         here» than the one below it, and a country takes the highest rung IT has — the tables do
         not cover the same countries, so a per-world choice would throw away the good rows to
         match the bad ones. */
      if (arrMean > 0 && st[i].arr > 0) { attract[i] = Math.max(ATTRACT_FLOOR, Math.pow(st[i].arr / arrMean, AIR_EXP)); mobilityStats.obsAttract++; }
      else attract[i] = Math.max(ATTRACT_FLOOR, (anyAir && st[i].air > 0) ? Math.pow(st[i].air, AIR_EXP) / airMean : popW[i]);
      travel[i] = (anyAir && st[i].air > 0 && apcRef > 0)
        ? Math.min(TRAVEL_MAX, Math.max(TRAVEL_MIN, Math.pow((st[i].air * 1e6 / Math.max(1, st[i].pop0)) / apcRef, TRAVEL_EXP)))
        : Math.min(TRAVEL_MAX, Math.max(TRAVEL_MIN, st[i].connectivity / devMean));
    }

    /* Land borders, by CODE. The host hands over what data/country-facts.json says; a code naming a
       country that is not on this map is dropped here rather than being silently indexed as 0 —
       which is what an unguarded lookup would have done, seeding Afghanistan's neighbours into
       whatever country happens to be first in the array. */
    const byCode = Object.create(null);
    for (let i = 0; i < N; i++) { const c = C[i] && C[i].code; if (c) byCode[String(c).toUpperCase()] = i; }
    const adj = new Array(N);
    let edges = 0;
    for (let i = 0; i < N; i++) {
      const b = C[i] && C[i].borders;
      if (!b || !b.length) { adj[i] = null; continue; }
      const set = new Set();
      for (let k = 0; k < b.length; k++) { const j = byCode[String(b[k]).toUpperCase()]; if (j != null && j !== i) { set.add(j); edges++; } }
      adj[i] = set.size ? set : null;
    }
    if (mobilityStats.obsAttract > 0) mobilityFrom = mobilityFrom === 'population' ? 'arrivals' : mobilityFrom + '+arrivals';
    if (edges > 0 && mobilityFrom !== 'population') mobilityFrom += '+borders';
    else if (edges > 0) mobilityFrom = 'population+borders';

    /* ── the observed route network, indexed against THIS world ─────────────────────────────
       `byCode` above already maps a country code to its row. A destination code naming a country
       that is not on this map is dropped here rather than silently indexed as 0 — the same guard
       the land borders take, for the same reason. */
    const ROUTES = (cfg && cfg.routes) || null;
    const rowBuf = ROUTES ? new Float64Array(N) : null;
    /* counters live on mobilityStats, in the outer closure, so nothing depends on the order these blocks appear in */
    function routeRow(i) {
      if (!rowBuf) return null;
      const code = C[i] && C[i].code;
      const from = code ? ROUTES[String(code).toUpperCase()] : null;
      if (!from) return null;
      rowBuf.fill(0);
      let any = 0;
      for (const to in from) {
        const j = byCode[String(to).toUpperCase()];
        if (j == null || j === i) continue;
        const v = +from[to];
        if (v > 0) { rowBuf[j] += v; any++; }
      }
      return any ? rowBuf : null;
    }

    if (N < 2) return;
    for (let i = 0; i < N; i++) {
      const row = i * N, a = adj[i];
      /* ── PASS 1: the two row totals the blend needs ────────────────────────────────────────
         ⚠ THE BLEND IS BETWEEN SHARES, AND IT IS SCALED BACK TO THE GRAVITY ROW'S OWN TOTAL. That
         is what keeps LAND_MIX meaning what it was measured to mean: the land term is added on
         the air term's scale, so if the air term's row total moved, every land border on the map
         would silently change value. Only the allocation WITHIN the air term changes here. */
      const rr = routeRow(i);
      let gravSum = 0, routeSum = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        gravSum += attract[j] * Math.exp(-haversine(st[i], st[j]) / AIR_DECAY_KM);
        if (rr) routeSum += rr[j];
      }
      const m = (rr && routeSum > 0 && gravSum > 0) ? ROUTE_MIX : 0;
      if (m > 0) { mobilityStats.routedOrigins++; for (let j = 0; j < N; j++) if (j !== i && rr[j] > 0) mobilityStats.routedPairs++; }
      /* ── PASS 2: the row itself ────────────────────────────────────────────────────────── */
      let acc = 0;
      for (let j = 0; j < N; j++) {
        if (j !== i) {
          const d = haversine(st[i], st[j]);
          const grav = attract[j] * Math.exp(-d / AIR_DECAY_KM);
          const air = m > 0 ? (1 - m) * grav + m * gravSum * (rr[j] / routeSum) : grav;
          acc += air + (a && a.has(j) ? LAND_MIX * popW[j] : 0);
        }
        MOB_CUM[row + j] = acc;
      }
      /* A world of one reachable country would leave the row flat; `pickDest` answers −1 for it. */
    }
  })();

  /* One uniform number, one binary search. Returns −1 when this origin can reach nobody. */
  function pickDest(i) {
    if (N < 2) return -1;
    const row = i * N, total = MOB_CUM[row + N - 1];
    if (!(total > 0)) return -1;
    const x = rnd() * total;
    let lo = 0, hi = N - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (MOB_CUM[row + mid] > x) hi = mid; else lo = mid + 1; }
    return lo === i ? -1 : lo;
  }

  /* ── one day ──────────────────────────────────────────────────────────────────────────────── */
  function step() {
    if (ended) return [];
    day++;
    const events = [];


    /* Stage hazards. `latentDays === 0` is not a division: it means the E boxes are bypassed at
       injection, so nothing is sitting in them to move. */
    /* (#R666) `S/T`, not `1 − e^(−S/T)` — the note beside LATENT_STAGES says why. */
    const pE = P.latentDays > 0 ? Math.min(1, LATENT_STAGES / P.latentDays) : 1;
    const pI = Math.min(1, INFECTIOUS_STAGES / P.infectiousDays);
    /* Immunity: ∞ ⇒ never wanes (0/day), 0 ⇒ handled at the recovery step, which sends people
       straight back to S instead of through an infinite rate. */
    const pWane = (P.naturalImmunityDays === Infinity || !(P.naturalImmunityDays > 0)) ? 0 : hazard(1 / P.naturalImmunityDays);
    const pVWane = (P.vaccineImmunityDays === Infinity || !(P.vaccineImmunityDays > 0)) ? 0 : hazard(1 / P.vaccineImmunityDays);
    const noLastingImmunity = P.naturalImmunityDays === 0;

    /* Vaccine R&D — only for a pathogen that has no vaccine yet. */
    if (vaxDay < 0) {
      let drive = 0;
      for (let i = 0; i < N; i++) if (st[i].response > 0.6) drive += sum(st[i].I);
      vaxProg += 0.0016 + Math.min(0.02, drive / 4e8);
      if (vaxProg > vaxDifficulty && day >= vaxMinDay) {
        vaxDay = day;
        let best = -1, bv = -1;
        for (let i = 0; i < N; i++) if (st[i].response > 0.62) { const v = sum(st[i].I) * st[i].response + rnd() * 1e6; if (v > bv) { bv = v; best = i; } }
        events.push({ t: 'vaccine', c: best });
      }
    }
    if (vaxDay >= 0) vaxRate = Math.min(VAX_RATE_MAX, vaxRate + VAX_RATE_RAMP);

    /* (#R673) The part of a day that is about people rather than about pathogens: immunity fades
       and a campaign reaches people. Called for every country the outbreak has not reached, and
       the same three lines run inside the seeded branch below in the same order. */
    function stepUnreached(s) {
      if (P.vaccinateUnreached) {
        const doses = vaxDay >= 0 ? draw(s.S, Math.min(0.99, vaxRate * s.delivery * P.vaccineRolloutScale)) : 0;
        const protectedDoses = draw(doses, P.vaccineEfficacy);
        s.S -= doses; s.V += protectedDoses; s.SV += doses - protectedDoses;
      }
      const wane = draw(s.R, pWane), vWane = draw(s.V, pVWane);
      s.R -= wane; s.S += wane;
      s.V -= vWane; s.S += vWane;
    }

    /* ══ ⚠⚠⚠ (#R673) THE CLOCK OF A COUNTRY IS NOT STARTED BY THE DISEASE ARRIVING ══════════════
       `if (!s.seeded) continue` used to skip the WHOLE country, and only two of the things it
       skipped are about infection. Waning immunity and vaccination are about the POPULATION, and a
       population does not stop existing because no case has landed on it: a country's day-0
       immunity stayed frozen at its starting value until the day the first traveller arrived, and a
       vaccine unlocked on day 270 reached nobody there until the epidemic did. So «the disease has
       reached here» silently doubled as «this country's calendar has started», which made the
       arrival date of an infection the start date of that country's public health.

       The loop is now split at the honest seam. Everything that needs E or I is inside `if
       (s.seeded)`; waning and vaccination are outside it and run everywhere, every day.

       ⚠ WHETHER AN UNREACHED COUNTRY VACCINATES IS A POLICY, AND IT IS NOW WRITTEN AS ONE.
       `P.vaccinateUnreached` defaults to true — a global rollout is what actually happened in
       2021 and what WHO's allocation frameworks are written for — and setting it false is a
       modelling choice a caller states out loud, not a side effect of a control-flow shortcut. */
    let totI = 0, totE = 0; const exporters = [];
    for (let i = 0; i < N; i++) {
      const s = st[i];
      if (!s.seeded) { stepUnreached(s); continue; }
      const live = alive(s) || 1;
      const Ii = sum(s.I), Ei = sum(s.E);
      const prevalence = Ii / live;

      /* Behaviour: people change what they do when the epidemic is visible, and a lockdown adds to
         that. With interventions off, neither happens. */
      const behav = behaviourOf(s, prevalence);
      const beta = betaOf(s, behav);
      /* ⚠ (#R666) TWO SUSCEPTIBLE POOLS, ONE HAZARD. `SV` catches the disease exactly as `S` does,
         so it is drawn separately at the same probability — which is what «each person independently»
         means — rather than by splitting one draw, which would correlate the two. */
      const hInf = hazard(beta * Ii / live);
      const newInfS = draw(s.S, hInf), newInfSV = draw(s.SV, hInf);
      const newInf = newInfS + newInfSV;

      /* Erlang chains, walked BACKWARDS so a person cannot cross two stages in one day. */
      const eOut = new Array(LATENT_STAGES), iOut = new Array(INFECTIOUS_STAGES);
      for (let k = LATENT_STAGES - 1; k >= 0; k--) eOut[k] = draw(s.E[k], pE);
      for (let k = INFECTIOUS_STAGES - 1; k >= 0; k--) iOut[k] = draw(s.I[k], pI);

      /* Severity. The user's slider is the BASE probability; hospital overload, treatment and the
         circulating variant move it, and it can never exceed 1. */
      const overload = 1 + Math.min(1.1, (prevalence * 55) * (1 - s.health));
      const ifrEff = Math.min(1, P.baseFatality * overload * localIfrMult(s) * (treatment ? P.treatmentMortalityRR : 1) * (1.2 - 0.4 * s.health));
      const leaving = iOut[INFECTIOUS_STAGES - 1];
      const dead = draw(leaving, ifrEff), rec = leaving - dead;

      /* Vaccination. Efficacy is all-or-nothing per dose: the protected share moves to V, the rest
         stay susceptible — which is why a 40% vaccine cannot end an epidemic on its own.
         ⚠ DRAWN FROM WHAT IS LEFT AFTER TODAY'S INFECTIONS. Two independent draws from the same S
         can together exceed it, and «S went slightly negative» is how the clamping that hid the
         other five defects got written in the first place. */
      const freeS = Math.max(0, s.S - newInfS);
      const doses = vaxDay >= 0 ? draw(freeS, Math.min(0.99, vaxRate * s.delivery * P.vaccineRolloutScale)) : 0;
      const protectedDoses = draw(doses, P.vaccineEfficacy);
      const wane = draw(s.R, pWane), vWane = draw(s.V, pVWane);

      /* Apply. Every line moves people from one box to another; nothing is created. */
      s.S -= newInfS; s.SV -= newInfSV;
      if (P.latentDays > 0) {
        s.E[0] += newInf;
        for (let k = 0; k < LATENT_STAGES; k++) {
          s.E[k] -= eOut[k];
          if (k + 1 < LATENT_STAGES) s.E[k + 1] += eOut[k]; else s.I[0] += eOut[k];
        }
      } else {
        s.I[0] += newInf;
      }
      for (let k = 0; k < INFECTIOUS_STAGES; k++) {
        s.I[k] -= iOut[k];
        if (k + 1 < INFECTIOUS_STAGES) s.I[k + 1] += iOut[k];
      }
      if (noLastingImmunity) s.S += rec; else s.R += rec;
      s.D += dead; s.cumDead += dead;
      s.cumInf += newInf;
      /* ⚠ (#R666) THE WHOLE DOSE LEAVES `S`: the protected part to `V`, the rest to `SV`, where the
         rollout will not reach for it again. */
      s.S -= doses; s.V += protectedDoses; s.SV += doses - protectedDoses;
      s.R -= wane; s.S += wane;
      s.V -= vWane; s.S += vWane;

      /* Local variant replacement: a fitter strain takes over here at a rate set by how much fitter
         it is, and only here. */
      if (variants.length > 1) {
        let mean = 0;
        for (let k = 0; k < variants.length; k++) mean += s.share[k] * variants[k].r0Mult;
        for (let k = 0; k < variants.length; k++) s.share[k] *= Math.exp(VARIANT_REPLACE * (variants[k].r0Mult - mean) / (mean || 1));
        normalise(s.share);
        /* Immune escape follows the share, not the calendar: as an escaping variant becomes the
           thing circulating HERE, the immunity it escapes stops counting HERE. Monotone, so it is
           applied once however many days the takeover takes. */
        let target = 0;
        for (let k = 0; k < variants.length; k++) target += s.share[k] * variants[k].escape;
        if (target > s.escApplied) {
          const d = target - s.escApplied; s.escApplied = target;
          const mv = s.R * d, vv = s.V * d * VARIANT_VACCINE_ESCAPE;
          s.R -= mv; s.V -= vv; s.S += mv + vv;
        }
      }

      /* Fade-out. Below half a person there is no outbreak left here. */
      const rem = sum(s.E) + sum(s.I);
      if (rem > 0 && rem < FADEOUT) {
        for (let k = 0; k < LATENT_STAGES; k++) { s.R += s.E[k]; s.E[k] = 0; }
        for (let k = 0; k < INFECTIOUS_STAGES; k++) { s.R += s.I[k]; s.I[k] = 0; }
      }

      const nowI = sum(s.I), nowE = sum(s.E);
      totI += nowI; totE += nowE;

      /* Policy. Borders escalate and — unlike before — come back down.
         ⚠ (#R675) ONLY A GOVERNMENT DECIDES. `s.actor === i` is true of every independent state and
         of nothing else; a dependency was given its sovereign's decision at the top of the day and
         a row with no government was given none. This is also what stops a policy EVENT naming a
         place that cannot hold a press conference. */
      if (P.interventions !== 'none' && s.actor === i) {
        const pv = nowI / (alive(s) || 1);
        if (s.border < 3 && pv > BORDER_TIGHTEN[s.border] / interventionScale && rnd() < 0.04 + 0.16 * s.response) {
          s.border++; s.quiet = 0;
          if (s.border === 3) events.push({ t: 'border', c: i });
        } else if (s.border > 0 && pv < BORDER_RELAX) {
          if (++s.quiet >= BORDER_RELAX_DAYS) { s.border--; s.quiet = 0; if (s.border === 0) events.push({ t: 'reopen', c: i }); }
        } else s.quiet = 0;

        if (s.lock < LOCK_MAX && pv > LOCK_ON / interventionScale && s.fatigue < LOCK_FATIGUE_MAX) {
          const before = s.lock;
          s.lock = Math.min(LOCK_MAX, s.lock + LOCK_UP);
          if (before <= 0.45 && s.lock > 0.45) events.push({ t: 'lockdown', c: i });
        } else if (s.lock > 0 && pv < LOCK_OFF) { s.lock = Math.max(0, s.lock - LOCK_DOWN); s.fatigue += 0.01; }
      }

      /* Export. Collected now, applied after the loop so that a country seeded today cannot also
         export today — the old code let a chain of same-day hops run down the country array. */
      if (P.mobility > 0 && (nowI + sum(s.E)) >= 1) exporters.push(i);
    }

    /* ── importation ─────────────────────────────────────────────────────────────────────────── */
    for (let x = 0; x < exporters.length; x++) {
      const i = exporters[x], s = st[i];
      /* ⚠ (#R666) HOW MANY LEAVE comes from here; WHERE THEY GO comes from the matrix. Distance,
         destination size, destination air capacity and land adjacency are all inside `pickDest` —
         anything in this line must be a property of the ORIGIN, or it would be counted twice.
         `travel[i]` is how much this country's residents travel; the origin's border state is its
         own government's answer and the destination's is asked per traveller below. */
      const pool = sum(s.E) + sum(s.I);
      const rate = P.mobility * TRAVEL_WHEN_INFECTED * INTL_TRIPS_PER_PERSON_DAY * travel[i] * BORDER_PASS[BORDER_STATES[s.border]];
      /* ⚠ (#R673) A DEPARTURE IS A WHOLE PERSON, AND `draw` RETURNS A REAL NUMBER. `for (t = 0;
         t < leave; t++)` on a leave of 30.2 ran 31 times — the fraction bought a whole traveller,
         every day, for free. The fraction is now spent as the probability of one more, which is
         what it is worth. */
      const leaveReal = draw(pool, Math.min(1, rate));
      const lw = Math.floor(leaveReal);
      let leave = lw + (rnd() < leaveReal - lw ? 1 : 0);
      if (leave > MAX_DEPARTURES) leave = MAX_DEPARTURES;
      for (let t = 0; t < leave; t++) {
        const j = pickDest(i);
        if (j < 0) continue;
        /* the receiving government's answer, per traveller */
        if (rnd() >= BORDER_PASS[BORDER_STATES[st[j].border]]) continue;
        inject(j, 1, s.share);
      }
    }

    /* ── global events ───────────────────────────────────────────────────────────────────────── */
    const T = totals();
    if (!milestones.tenCountries && T.affected >= 10) { milestones.tenCountries = true; events.push({ t: 'tenCountries' }); }
    if (!emergency && T.affected >= EMERGENCY_COUNTRIES && (T.E + T.I) / worldPop > EMERGENCY_PREVALENCE) {
      emergency = true; events.push({ t: 'emergency' });
    }
    /* ⚠ THE GUARD IS `!treatment`, NOT «the preset has no treatment». In the real-world scenario a
       disease that already has one starts with treatment === true and this cannot fire; in the
       novel-pathogen scenario it starts false even for influenza, because a NOVEL pathogen that
       resembles influenza has no antivirals waiting for it. Reading the preset here would have
       made those two runs differ by something other than the scenario. */
    if (!treatment && totI > TREATMENT_MIN_INFECTED && rnd() < TREATMENT_P_DAY) {
      treatment = true; events.push({ t: 'treatment' });
    }
    if (!milestones.d1m && T.D > 1e6) { milestones.d1m = true; events.push({ t: 'deaths', n: 1e6 }); }
    if (!milestones.d10m && T.D > 1e7) { milestones.d10m = true; events.push({ t: 'deaths', n: 1e7 }); }

    if (variants.length - 1 < VARIANT_MAX && totI > VARIANT_MIN_INFECTED && rnd() < VARIANT_P_DAY) {
      let best = -1, bv = -1;
      for (let i = 0; i < N; i++) { const v = sum(st[i].I); if (v > bv) { bv = v; best = i; } }
      const moreInf = rnd() < 0.7;
      /* Relative to what is already circulating, and capped relative to the pathogen the run
         started from — never against an absolute number that could invert the news. */
      const mult = moreInf ? rrange(VARIANT_R0_UP[0], VARIANT_R0_UP[1]) : rrange(VARIANT_R0_DOWN[0], VARIANT_R0_DOWN[1]);
      const parentIdx = best >= 0 ? dominant(st[best]) : 0;
      const r0Mult = Math.min(VARIANT_R0_CAP, variants[parentIdx].r0Mult * mult);
      const escape = rrange(VARIANT_ESCAPE[0], VARIANT_ESCAPE[1]);
      const ifrMult = rnd() < 0.4 ? variants[parentIdx].ifrMult * rrange(0.7, 0.6) : variants[parentIdx].ifrMult;
      variants.push({ r0Mult, ifrMult, escape });
      /* It exists in ONE country, as a small share of what circulates there. Everywhere else keeps
         a zero share until it is imported — the old model rewrote the pathogen globally the instant
         a variant was named. */
      for (let i = 0; i < N; i++) st[i].share.push(0);
      if (best >= 0) { st[best].share[variants.length - 1] = 0.02; normalise(st[best].share); }
      events.push({ t: 'variant', c: best, n: variants.length - 1, moreTransmissible: r0Mult > variants[parentIdx].r0Mult });
    }

    /* ── end of run ──────────────────────────────────────────────────────────────────────────── */
    const ei = T.E + T.I;
    if (ei < END_EI) quietDays++; else quietDays = 0;
    if (quietDays >= END_DAYS && day > 40) {
      const contained = T.affected <= 1 && day < END_CONTAINED_DAY && T.cumInf / worldPop < 0.01;
      ended = { kind: contained ? 'contained' : 'over' };
      events.push({ t: 'end', kind: ended.kind });
    } else if (day >= MAX_DAYS) {
      ended = { kind: 'endemic' };
      events.push({ t: 'end', kind: 'endemic' });
    }
    syncFollowers();
    record(T);
    return events;
  }

  /* ══ ⚠⚠⚠ (#R675) THE RUN'S OWN TIME SERIES, KEPT BY THE THING THAT KNOWS THE DAYS ══════════════
     The panel could show «now» and nothing else, which is the wrong shape for an epidemic: whether
     6.4% cumulative infections is the start of a wave or the end of one is not readable from 6.4%.
     A chart drawn from a series the UI accumulated itself would drift the moment a frame is dropped
     — `tick()` is a setTimeout and skips days under load — so the series is kept HERE, one record
     per `step()`, and is therefore exactly as long as the run is old.
     ⚠ THE DAILY FLOWS ARE DIFFERENCES OF LEDGERS, NOT SUMS OF THE PATHS. `cumInf` and `D` are
     already monotone totals that every path (local transmission, importation, re-infection) has to
     go through, so differencing them cannot miss a path the way adding up call sites can — which is
     the defect #R673 found in the old attack-rate arithmetic, pointed the other way. */
  const hist = [];
  let lastCum = 0, lastD = 0;
  function record(T) {
    hist.push({
      day, I: T.I, E: T.E, D: T.D, R: T.R, V: T.V, cumInf: T.cumInf,
      newInf: Math.max(0, T.cumInf - lastCum), newDead: Math.max(0, T.D - lastD),
      affected: T.affected, reached: T.reached, locked: T.locked, restricted: T.restricted, variants: T.variants
    });
    lastCum = T.cumInf; lastD = T.D;
  }
  function dominant(s) { let b = 0; for (let k = 1; k < s.share.length; k++) if (s.share[k] > s.share[b]) b = k; return b; }

  /* ── read-out ─────────────────────────────────────────────────────────────────────────────── */
  function totals() {
    /* ⚠ (#R666) `S` IS BOTH SUSCEPTIBLE POOLS, because that is what the word means to a reader; `SV`
       is reported beside it for anyone who needs «reached by the campaign and not protected». */
    let S = 0, SV = 0, E = 0, I = 0, R = 0, D = 0, V = 0, cumInf = 0, affected = 0, reached = 0;
    /* ⚠ (#R675) THE RESPONSE IS COUNTED IN GOVERNMENTS, NOT IN ROWS. A dependency carrying its
       sovereign's lockdown is the same lockdown, and counting it again would print «47 lockdowns»
       for a world in which 31 governments had ordered one. */
    let locked = 0, restricted = 0, closed = 0, actors = 0;
    for (let i = 0; i < N; i++) {
      const s = st[i];
      S += s.S + s.SV; SV += s.SV; E += sum(s.E); I += sum(s.I); R += s.R; D += s.D; V += s.V; cumInf += s.cumInf;
      if (s.seeded && (sum(s.I) + sum(s.E)) > 0.5) affected++;
      if (s.seeded) reached++;
      if (s.actor === i) { actors++; if (s.lock > 0.45) locked++; if (s.border >= 2) restricted++; if (s.border === 3) closed++; }
    }
    return { S, SV, E, I, R, D, V, cumInf, affected, reached, locked, restricted, closed, actors, units: N, worldPop, day, variants: variants.length - 1, vaccine: vaxDay >= 0, treatment, emergency };
  }

  /* Progress towards a vaccine, for a pathogen that does not have one yet. */
  function vaccineProgress() {
    if (vaxDay >= 0) return 1;
    return Math.max(0, Math.min(1, vaxProg / vaxDifficulty, day / vaxMinDay));
  }

  /* ⚠ THE INVARIANT. Called by the tests every step and by the UI once a second in debug builds.
     Everything this round fixed would have been caught on day one by this function existing. */
  function invariant() {
    for (let i = 0; i < N; i++) {
      const s = st[i];
      const parts = [s.S, s.SV, s.R, s.V, s.D].concat(s.E, s.I);
      for (let k = 0; k < parts.length; k++) {
        if (!isFinite(parts[k])) return 'country ' + i + ': non-finite compartment';
        if (parts[k] < -1e-6) return 'country ' + i + ': negative compartment ' + parts[k];
      }
      const total = alive(s) + s.D;
      if (Math.abs(total - s.pop0) > Math.max(1e-6, s.pop0 * 1e-9)) {
        return 'country ' + i + ': population ' + total + ' ≠ ' + s.pop0;
      }
      if (s.cumInf < 0) return 'country ' + i + ': negative cumulative infections';
    }
    return null;
  }

  return {
    params: P, preset, countries: st, variantList: variants,
    get day() { return day; },
    get ended() { return ended; },
    get worldPop() { return worldPop; },
    /* ⚠ (#R673) `fromShare` IS PART OF THE SIGNATURE, so that the variant mix an arrival carries is
       reachable from a test. It was not, and tests/r666-model ⑦ — the one test that exists to hold
       `mixShare` to the fix that named it — called `seed()`, which passed a hard-coded `null`. The
       test set a share by hand, seeded, and asserted the share was unchanged: TRUE BY CONSTRUCTION,
       because the function it was measuring never ran. Restoring the #R666 defect underneath it
       left it green. A private argument is a rule with no way to be wrong (#R505). */
    seed(i, cases, fromShare) { return inject(i, cases == null ? P.initialCases : cases, fromShare || null); },
    step, totals, invariant, vaccineProgress,
    /* ⚠ (#R666) WHAT THE MOBILITY WAS ACTUALLY BUILT OUT OF — so the HUD can say it rather than
       assume it. `from` is one of population / airports / airports+population, each optionally
       «+borders»; a world the host handed no codes and no airport figures for says `population`,
       and the screen must not then claim air connectivity. `destinations(i)` is the row itself, for
       a test that wants to measure the distribution instead of reading the formula. */
    mobility: {
      get from() { return mobilityFrom + (mobilityStats.routedOrigins > 0 ? '+routes' : ''); },
      get stats() { return Object.assign({}, mobilityStats); },
      travel(i) { return travel[i]; },
      destinations(i) {
        const out = []; if (N < 2 || i < 0 || i >= N) return out;
        const row = i * N, total = MOB_CUM[row + N - 1];
        if (!(total > 0)) return out;
        let prev = 0;
        for (let j = 0; j < N; j++) { const w = MOB_CUM[row + j] - prev; prev = MOB_CUM[row + j]; if (j !== i) out.push({ j, p: w / total }); }
        return out;
      },
    },
    /* Active cases in one country, split the way the map draws them. */
    active(i) { const s = st[i]; return { E: sum(s.E), I: sum(s.I), D: s.D, seeded: s.seeded }; },
    /* The day-by-day series. Returned as the live array — the caller reads it, nobody else writes
       it — because copying 1 095 records on every animation frame is a cost with no reader. */
    history() { return hist; },
    /* ══ (#R675) EVERYTHING ONE COUNTRY IS, FOR THE INSPECTOR ═══════════════════════════════════
       ⚠ IT IS BUILT HERE. The panel that shows it must not do arithmetic on a compartment (that
       rule is the whole of #R575), and Rₑ in particular is not something a UI can reconstruct: it
       needs β, the season, the behaviour term, the lockdown and the local variant mix, all of which
       are this module's and would have to be copied out to be read. */
    report(i) {
      const s = st[i]; if (!s) return null;
      const live = alive(s) || 1, Ii = sum(s.I), Ei = sum(s.E);
      const prevalence = Ii / live;
      const dom = dominant(s);
      return {
        i, pop: s.pop0, alive: live, S: s.S, SV: s.SV, E: Ei, I: Ii, R: s.R, V: s.V, D: s.D,
        cumInf: s.cumInf, seeded: s.seeded, arrivalDay: s.day0,
        r0: localR0(s), rEff: rEffOf(s), prevalence,
        season: seasonFactor(s.lat), behaviour: behaviourOf(s, prevalence),
        /* Health pressure is the multiplier hospital overload is putting on this country's fatality
           right now — 1.0 is «coping», and it is the same expression `step()` applies. */
        overload: 1 + Math.min(1.1, (prevalence * 55) * (1 - s.health)),
        health: s.health, delivery: s.delivery, response: s.response,
        /* Whether those three are this country's own observations or the development proxy. The
           panel says which, because «Chad's medical capacity» read off GDP and read off the UHC
           index are different claims and only one of them was measured in Chad. */
        capacityFrom: s.capacityFrom,
        /* Policy, and WHOSE. `actor === i` is a government speaking for itself; anything else is
           somebody else's decision arriving here, and the panel says which. */
        actor: s.actor, selfGoverning: s.actor === i,
        border: s.actor < 0 ? null : BORDER_STATES[s.border], borderPass: s.actor < 0 ? 1 : BORDER_PASS[BORDER_STATES[s.border]],
        lock: s.actor < 0 ? 0 : s.lock, fatigue: s.fatigue,
        variant: dom, variantShare: s.share[dom] || 0
      };
    }
  };
}

/* ── THE MAP'S ARITHMETIC — HOW MANY DOTS, AND WHICH OF THEM CHANGED ───────────────────────────
   (#R673) These three lived inside js/playground.js's closure, which is the reason an external
   audit found them and eleven rounds of tests did not: `scatterCases` was moved out for exactly
   this reason in #R575 and the rest of the same paragraph was left behind. Every one of them is
   pure arithmetic over numbers the engine already produces, and node can now run them.

   ⚠ THIS IS NOT EPIDEMIOLOGY AND MUST NOT BECOME IT. Nothing here may touch a compartment; it
   takes the read-out `active(i)` already returns and answers questions about DRAWING. */

/* How many dots a country gets, and how many of them are the not-yet-infectious colour.
   ⚠⚠⚠ THIS LAYER IS «WHO IS ILL NOW», SO `D` CANNOT KEEP A COUNTRY ON IT. The gate here used to
   be `act < 1 && D < 1`, with a floor that lifted k to 1 whenever `D > 0` — so a country whose
   outbreak was over (E = 0, I = 0, D = 100) drew one dot, and since `kE` is 0 when `act` is 0 that
   dot came out RED, which the legend printed beside it defines as «infectious». The map reported
   current cases in a country that had none, permanently, contradicting the HUD above it.
   Cumulative deaths still DARKEN a live country's dots — that is what `sevIdx` is — because how
   deadly the outbreak here has been is a property of a place that still has cases. */
export function caseDotPlan(a, perDot, cap) {
  if (!a || !a.seeded) return null;
  const act = a.E + a.I;
  if (!(act >= 1) || !(perDot > 0)) return null;
  let k = Math.round(act / perDot);
  if (k < 1) k = 1;
  if (k > cap) k = cap;
  /* 21 discrete darkness levels. Rounded BEFORE it becomes part of a signature, or it drifts in
     the tenth decimal every day and every dot counts as changed (#R666). */
  const sevIdx = Math.round((a.D > 0 ? Math.min(1, (a.D / (a.I + a.D + 1)) * 3) : 0) * 20);
  return { k, kE: Math.round(k * (a.E / act)), sevIdx, sev: sevIdx / 20 };
}

/* What a dot looks like, as one comparable value, for the day's diff.
   ⚠⚠⚠ IT MUST SEPARATE EVERY PAIR IT IS ASKED ABOUT, AND `cls + sev*2` DID NOT. With `sev` on
   twentieths, `sev*2` lands on 0, 0.1 … 2, so (cls 1, sev 0) and (cls 0, sev 0.5) are both exactly
   1: a dot crossing between those two states counted as UNCHANGED and the diff — whose whole job
   is to send what moved — sent nothing, leaving the wrong colour on screen until an unrelated
   full re-sync swept it up. Integers cannot alias. */
export function dotSignature(cls, sevIdx) { return sevIdx * 2 + cls; }

/* The value a slider can actually hold, so that what the engine runs, what the input shows and
   what the label prints are one number. See the note beside `mk` in js/playground.js: Ebola's
   R₀ 1.95 on a 0.1 grid was 1.95 in the engine, 2 in the input and «1.9» on the label. */
export function snapToStep(val, min, max, step) {
  const v = Math.min(max, Math.max(min, val));
  if (!(step > 0)) return v;
  const dec = Math.max(0, ((String(step).split('.')[1]) || '').length);
  return +(min + Math.round((v - min) / step) * step).toFixed(dec + 2);
}

/* ── PLACEMENT — the map's half of the same run ────────────────────────────────────────────────
   Where the dots go is not epidemiology, but it is the other thing that has to be TRUE: a case dot
   drawn in the sea or in the neighbouring country is a claim about where people are ill.

   The old placement anchored on real cities and then added a random jitter — and never asked
   whether the jittered point was still inside the country. For a coastal or border city it often
   was not. `accept` is that question, asked about the point that will actually be drawn; a jitter
   that cannot find an accepted point falls back to the anchor, which was accepted by construction.

   It lives in this file, and is exported, for one reason: node can call it. A rule that only exists
   inside a DOM closure is a rule no test can measure (#R505).

   ══ ⚠⚠⚠ (#R678) AN ANCHOR MAY CARRY A WEIGHT, AND THE WEIGHT IS HOW MANY PEOPLE LIVE THERE ═══
   The dots were spread ROUND-ROBIN over the anchors: every anchor got the same number of cases.
   On a world map that is wrong in a way a reader can see from across the room — Canada, Russia and
   Australia had cases scattered evenly over tundra, taiga and desert, because an anchor in Alert
   and an anchor in Toronto counted the same. In a well-mixed compartment model cases are
   proportional to POPULATION, so the anchors have to be too.

   `anchors[k]` is `[lng, lat]` or `[lng, lat, weight]`. Quotas are allocated by LARGEST REMAINDER
   over the weights, and then emitted round-robin over the anchors that still have quota left.
   ⚠ THE EMISSION ORDER IS PART OF THE CONTRACT, not a detail. `buildDots()` colours the first
   `kE` dots of the pool as exposed and the rest as infectious, so grouping a city's dots together
   would put every exposed case in one city. Round-robin interleaving keeps them mixed.
   ⚠ EQUAL OR ABSENT WEIGHTS REPRODUCE THE OLD BEHAVIOUR EXACTLY — largest remainder with equal
   weights gives `floor(n/A)` to everybody and the remainder to the lowest indices, which is what
   round-robin did. That is a property a test can hold, and it is the reason this is one function
   with a weight rather than two functions. */
export function scatterCases(n, anchors, span, rnd, accept) {
  const out = [];
  if (!anchors || !anchors.length || !(n > 0)) return out;
  const TRIES = 8;   /* enough for a coastal anchor; beyond that the anchor itself is the honest answer */
  const A = anchors.length;

  /* ── quotas, by largest remainder ────────────────────────────────────────────────────────
     A weight that is absent, negative or not a number counts as 1: an anchor the caller could
     not size is still a place people live, and dropping it would silently shrink the country. */
  const w = new Array(A);
  let wSum = 0;
  for (let k = 0; k < A; k++) {
    const a = anchors[k];
    const v = (a && a.length > 2) ? +a[2] : 1;
    w[k] = (isFinite(v) && v > 0) ? v : (a && a.length > 2 ? 0 : 1);
    wSum += w[k];
  }
  if (!(wSum > 0)) { for (let k = 0; k < A; k++) w[k] = 1; wSum = A; }

  const quota = new Array(A), frac = new Array(A);
  let given = 0;
  for (let k = 0; k < A; k++) {
    const exact = n * w[k] / wSum;
    quota[k] = Math.floor(exact);
    frac[k] = exact - quota[k];
    given += quota[k];
  }
  /* The remainder goes to the largest fractional parts, ties to the LOWER INDEX. With equal
     weights every fraction is identical, so the remainder lands on 0, 1, 2 … — exactly the
     round-robin allocation this replaced. */
  if (given < n) {
    const order = [];
    for (let k = 0; k < A; k++) order.push(k);
    order.sort((p, q) => (frac[q] - frac[p]) || (p - q));
    for (let t = 0; t < order.length && given < n; t++) { quota[order[t]]++; given++; }
  }

  /* ── emission, round-robin over the anchors that still have quota ─────────────────────── */
  const used = new Array(A).fill(0);
  while (out.length < n) {
    let progressed = false;
    for (let k = 0; k < A && out.length < n; k++) {
      if (used[k] >= quota[k]) continue;
      progressed = true;
      const a = anchors[k];
      if (used[k] === 0) out.push([a[0], a[1]]);   /* the anchor itself was accepted by construction */
      else {
        let placed = null;
        for (let t = 0; t < TRIES && !placed; t++) {
          const p = [a[0] + (rnd() - 0.5) * span, a[1] + (rnd() - 0.5) * span];
          if (!accept || accept(p[0], p[1])) placed = p;
        }
        out.push(placed || [a[0], a[1]]);
      }
      used[k]++;
    }
    if (!progressed) break;   /* every quota spent — only reachable if the arithmetic above is wrong */
  }
  return out;
}

/* ══ ⚠⚠⚠ (#R675) THE EVENT VOCABULARY, AND WHICH EVENTS ARE ALLOWED TO INTERRUPT A READER ═══════
   The simulator's news ticker stacked a card for EVERY event in the middle of the screen, and the
   number of events a day is roughly the number of governments reacting — so the map was covered
   exactly when there was most to see on it. Measured on the screenshot that opened this round:
   twelve cards, all of them «X closes its borders» / «X enters lockdown», over the world map.

   ⚠ THE SPLIT IS NOT «IMPORTANT» VS «UNIMPORTANT». It is a property of the event: a `world` event
   changes the rules everybody is playing under and happens a handful of times in a run (a vaccine
   exists; a variant is named; the emergency threshold is passed), and a `country` policy event is
   one government reacting to its own prevalence and happens as often as there are governments.
   The first is worth stopping for. The second is a LIST — it belongs in a list.

   ⚠ THIS TABLE IS THE VOCABULARY, AND tests/r675-pandemic-checks HOLDS IT TO THE EMITTERS: every
   `events.push({ t: … })` literal in this file must have a row here, and every row here must be
   emitted somewhere. A new event kind that forgets to declare itself would otherwise default to
   whatever the `||` on the lookup happened to say, which is how a routine event ends up back in
   the middle of the map. */
/* ⚠ THE TABLE LIVES INSIDE THE FUNCTION THAT READS IT. Every other constant in this module does
   too (`BORDER_STATES`, `VAX_RATE_MAX`, `MAX_DEPARTURES` …): a module-private top-level declaration
   is the one shape tests/r175-checks ③ forbids outright, because it is what used to be a global.
   Eleven keys rebuilt per call, and events are counted in hundreds per run, not per frame.
   ⚠ AN UNDECLARED KIND ANSWERS `null` RATHER THAN GUESSING. That is what lets a test say «every
   kind this engine emits is declared» without being handed the list of keys to compare against —
   the shape that goes stale (#R628). The SAFE DEFAULT lives at the call site, and it is `routine`:
   js/playground.js writes `eventKind(t) || { tier: 'routine', scope: 'country' }`, where a reader
   can see it. Guessing «major» covers the map; guessing «routine» loses one line of a list. */
export function eventKind(t) {
  return ({
    vaccine:      { scope: 'world',   tier: 'major' },
    treatment:    { scope: 'world',   tier: 'major' },
    emergency:    { scope: 'world',   tier: 'major' },
    tenCountries: { scope: 'world',   tier: 'major' },
    deaths:       { scope: 'world',   tier: 'major' },
    end:          { scope: 'world',   tier: 'major' },
    /* A variant is named in ONE country and changes the pathogen everybody will meet — country-scoped
       in its subject, world-scoped in its consequence, and the reason `scope` and `tier` are two
       columns rather than one. */
    variant:      { scope: 'country', tier: 'major' },
    border:       { scope: 'country', tier: 'routine' },
    reopen:       { scope: 'country', tier: 'routine' },
    lockdown:     { scope: 'country', tier: 'routine' }
  })[t] || null;
}

/* ══ ⚠⚠⚠ (#R675) A SINGLE RUN IS ONE DRAW FROM A DISTRIBUTION, AND THE PANEL SAID OTHERWISE ══════
   Everything in this engine is stochastic — that is the point of `STOCHASTIC_MAX`, of the seed
   field, of the fade-out rule — and yet the only thing a reader ever saw was one realisation,
   printed as flatly as a measurement. «257 territories on day 208» reads as a fact about the
   pathogen; it is a fact about seed 812734.

   These two functions are the whole of the uncertainty arithmetic, and they are here rather than in
   the panel for the reason everything else in this file is: node can call them (#R505). */
/* `runs` is one object per replicate. Every numeric field present on the FIRST run is summarised;
   fields are not named here, so a run that starts carrying a new number is summarised without this
   function being edited (a list of field names is the shape #R628 caught: the census and the thing
   being censused drift apart). */
export function summariseEnsemble(runs) {
  /* ⚠ NESTED, NOT TOP-LEVEL AND NOT EXPORTED. `summariseEnsemble` is the surface, and everything
     worth holding this function to is visible through it; an export whose only importer is a test is
     dead code to the program, and a module-private top-level declaration is what tests/r175-checks ③
     forbids. Both readings point the same way — measure the thing a reader can reach. */
  function quantile(sorted, p) {
    const n = sorted.length;
    if (!n) return NaN;
    if (n === 1) return sorted[0];
    /* Linear interpolation between order statistics (the «type 7» definition R and NumPy default to).
       ⚠ NOT `sorted[Math.floor(p*n)]`: with ten runs that returns the same value for p = 0.10 and
       p = 0.19 and never returns anything at all for p = 1. */
    const h = (n - 1) * Math.min(1, Math.max(0, p));
    const lo = Math.floor(h), hi = Math.ceil(h);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
  }
  const out = { n: runs.length, metrics: {}, outcomes: {} };
  if (!runs.length) return out;
  const keys = Object.keys(runs[0]).filter(k => typeof runs[0][k] === 'number' && isFinite(runs[0][k]));
  for (let q = 0; q < keys.length; q++) {
    const k = keys[q];
    const v = [];
    for (let r = 0; r < runs.length; r++) { const x = runs[r][k]; if (typeof x === 'number' && isFinite(x)) v.push(x); }
    v.sort((a, b) => a - b);
    out.metrics[k] = { p10: quantile(v, 0.1), p25: quantile(v, 0.25), p50: quantile(v, 0.5), p75: quantile(v, 0.75), p90: quantile(v, 0.9), min: v[0], max: v[v.length - 1], n: v.length };
  }
  /* How often each ending happened, as a share of the replicates — the number a reader actually
     wants («does this thing get out?»), which no single run can answer at all. */
  for (let r = 0; r < runs.length; r++) { const k = runs[r].kind || 'unknown'; out.outcomes[k] = (out.outcomes[k] || 0) + 1; }
  Object.keys(out.outcomes).forEach(k => { out.outcomes[k] = out.outcomes[k] / runs.length; });
  return out;
}

/* ══ (#R675) THE CHART'S GEOMETRY, WHICH IS ARITHMETIC AND SO DOES NOT LIVE IN THE DOM ═══════════
   Returns an SVG points string for `values` drawn into `w × h` with y = 0 at the bottom. `max` is
   passed in rather than derived, because two series drawn on one pair of axes have to share it and
   a function that took its own maximum would silently draw them on different ones.
   ⚠ MORE DAYS THAN PIXELS IS THE NORMAL CASE (1 095 days into ~300 px). The reduction takes the
   MAXIMUM of each bucket, not the first or the mean: a one-day peak that a mean would flatten is
   the single most important feature of an epidemic curve. */
export function chartPoints(values, w, h, max) {
  const n = values.length;
  if (!n || !(w > 0) || !(h > 0)) return '';
  const m = max > 0 ? max : 1;
  const cols = Math.min(n, Math.max(2, Math.round(w)));
  const pts = new Array(cols);
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * n / cols), b = Math.max(a + 1, Math.floor((c + 1) * n / cols));
    let peak = 0;
    for (let k = a; k < b && k < n; k++) { const v = values[k]; if (v > peak) peak = v; }
    const x = cols === 1 ? 0 : (c * w / (cols - 1));
    pts[c] = x.toFixed(1) + ',' + (h - Math.min(1, peak / m) * h).toFixed(1);
  }
  return pts.join(' ');
}

/* ══ ⚠⚠⚠ (#R675) WHO GOVERNS EACH MAPPED UNIT — DERIVED FROM DATA, TESTABLE IN NODE ══════════════
   `rows` is one entry per simulated unit, in the order the model will see them:
     · `admin`   what this unit calls itself (Natural Earth ADMIN)
     · `sov`     the unit Natural Earth says administers it (SOVEREIGNT); equal to `admin` for a
                 unit that administers itself
     · `capital` the seat of government the facts table records, or null/undefined for none
   Returns the `actor` field each row should carry: its own index, the index of the row that
   governs it, or −1 for «there is no government to ask».

   ⚠ TWO FACTS, EACH DOING ONE JOB, AND IN THIS ORDER.
     1. If another PRESENT row calls itself this row's sovereign, this row is under that government.
        Greenland under Denmark, Puerto Rico under the United States, Macao under China. That is the
        upstream map's own topology and it cannot go stale the way a list of dependency names would.
     2. Otherwise, a row is its own government IF a seat of government is recorded for it. Taiwan,
        Kosovo and Western Sahara all have one and no present row administers them, so they decide
        for themselves — which is what the border-policy question is actually about, and what a
        «UN member states» test would have got wrong in three places. Antarctica, Bir Tawil, the
        Spratlys and the sovereign base areas have none, and make no policy.
   ⚠ `haveCapitals` IS THE «THE TABLE DID NOT LOAD» ANSWER. When it is false nothing is demoted and
   every self-administered row is its own actor — the behaviour of every run before this round —
   because «we could not look it up» is not evidence of «there is nobody there» (#R623). */
export function policyActors(rows, haveCapitals) {
  const n = rows.length, out = new Array(n);
  const byAdmin = new Map();
  for (let i = 0; i < n; i++) { const a = rows[i] && rows[i].admin; if (a != null && !byAdmin.has(a)) byAdmin.set(a, i); }
  for (let i = 0; i < n; i++) {
    const r = rows[i] || {};
    if (r.sov != null && r.sov !== r.admin && byAdmin.has(r.sov) && byAdmin.get(r.sov) !== i) { out[i] = byAdmin.get(r.sov); continue; }
    out[i] = (haveCapitals && !r.capital) ? -1 : i;
  }
  return out;
}
