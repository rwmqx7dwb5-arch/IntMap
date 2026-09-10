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
 *  heuristic (distance + a development proxy), NOT airline routes, passenger volumes or commuting
 *  data. Nothing in IntMap should describe it as a real transport network until it is one.
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

   Sources are named per preset; they are shown in the simulator's about line. */
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
    sources: ['Biggerstaff et al., influenza R0 systematic review', 'CDC 2025–26 influenza guidance', 'WHO influenza fact sheet 2026']
  },
  covid: {
    id: 'covid',
    /* Ancestral SARS-CoV-2. Latent 4 d vs incubation 5 d: presymptomatic transmission is
       established, so the infectious window opens about a day before symptoms. */
    transmission: { r0: 3.2, latentDays: 4, incubationDays: 5, infectiousDays: 9, seasonality: 0.18 },
    severity: { metric: 'IFR', value: 0.007 },
    immunity: { naturalMonths: 9 },
    vaccine: { availableAtStart: false, efficacyInfection: 0.6, waningMonths: 8, developmentDays: 270 },
    treatment: { availableAtStart: false, mortalityRR: 0.45 },
    /* WHO's 2026 vaccine policy is written for a world with HIGH population immunity — hybrid
       immunity plus variant-adapted boosters. That is the real-world scenario, not the naive one. */
    baselineImmunity: 0.9,
    sources: ['WHO COVID-19 vaccine position paper, July 2026', 'WHO TAG-CO-VAC 2026']
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
    sources: ['WHO SARS summary (2003)']
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
    sources: ['Ebola R0 meta-analysis (2024)', 'WHO Ebola fact sheet', 'WHO Ebola vaccines (2026-06-25)', 'WHO Ebola therapeutics guideline']
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
    sources: ['CDC Interactive Measles Outbreak Simulator (2026)', 'WHO Immunization coverage (2026-07-15)']
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
     ⚠ n IS REAL. Above STOCHASTIC_MAX the compartments go deterministic and stop being integers, so
     the whole part is drawn exactly and the fraction is one extra Bernoulli — which is correct in
     expectation and, more importantly, still cannot exceed n. */
  function draw(n, p) {
    if (!(n > 0) || !(p > 0)) return 0;
    if (p >= 1) return n;
    const m = n * p;
    if (m >= STOCHASTIC_MAX) return m;
    const whole = Math.floor(n), frac = n - whole;
    let k = binomial(whole, p);
    if (frac > 0 && rnd() < frac * p) k++;
    return Math.min(n, k);
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
    /* «Lifelong» is a duration, not a special case: 0 months on the slider means NO lasting
       immunity (recovery goes straight back to susceptible) and the top of the slider means
       forever. Neither is expressed as a 1/0 rate any more. */
    naturalImmunityDays: preset.immunity.lifelong && inp.naturalImmunityMonths == null
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
    vaccineImmunityDays: preset.vaccine.lifelong ? Infinity : monthsToDays(num(inp.vaccineMonths, preset.vaccine.waningMonths)),
    vaccineRolloutScale: num(preset.vaccine.rolloutScale, 1),
    treatmentAtStart: realWorld && !!preset.treatment.availableAtStart,
    treatmentMortalityRR: num(preset.treatment.mortalityRR, 0.45)
  };
  function monthsToDays(m) { return (m == null || m <= 0) ? 0 : (m >= 600 ? Infinity : m * 30); }

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
  const st = new Array(N);
  let worldPop = 0;
  for (let i = 0; i < N; i++) {
    const c = C[i] || {};
    const pop = (c.pop > 0) ? c.pop : 3e6;
    worldPop += pop;
    const immune = pop * P.initialImmunity;
    const dev = Math.min(1, Math.max(0.05, num(c.dev, 0.5)));
    st[i] = {
      /* ⚠ FOUR CAPACITIES, NOT ONE «dev». They are all proxied from the same development figure
         today — that is honest and it is written down — but medical capacity, travel connectivity,
         policy response and vaccine delivery are different things, and a model that spells them as
         one number can never be improved without touching every formula that used it. */
      health: dev, connectivity: dev, response: dev, delivery: 0.35 + 0.65 * dev,
      /* ⚠ (#R666) `connectivity` STAYS `dev` AND STOPS BEING READ BY THE MOBILITY. It was doing two
         different jobs — how attractive this country is as a destination, and how much its own
         residents travel — with one number derived from GDP per head. Those are now `attract` and
         `travel`, both built below from airport capacity where the host supplies it. Nothing else
         reads `connectivity`, and it is left in place because it is what `travel` falls back TO. */
      air: Math.max(0, num(c.air, 0)),
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
      /* Per-variant share of what is circulating HERE. Index 0 is the original pathogen. A variant
         that emerges in Brazil does not change Japan's R0 until it arrives in Japan. */
      share: [1], escApplied: 0
    };
  }
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

  /* ── seeding ──────────────────────────────────────────────────────────────────────────────── */
  /* ⚠ THIS ALWAYS TAKES FROM S. The old re-import path added to E without subtracting, so every
     re-importation invented up to thirty people out of nothing. */
  function inject(i, cases, fromShare) {
    const s = st[i];
    const k = Math.min(s.S, Math.max(0, cases));
    if (!(k > 0)) return 0;
    /* ⚠⚠⚠ (#R666) THE SHARE IS MIXED AGAINST WHAT WAS HERE BEFORE, NOT AFTER. `mixShare` weighs the
       arrivals against `E + I`, and this function used to ADD them first — so eight cases of a
       variant arriving in a country with no cases at all mixed 8 against 8, and the country came out
       47% ancestral strain when not one ancestral case had ever set foot in it. Measured on the
       arithmetic: w = 8/(8+8+1) = 0.471. */
    const here = sum(s.E) + sum(s.I);
    s.S -= k;
    if (P.latentDays > 0) s.E[0] += k; else s.I[0] += k;
    s.cumInf += k;
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
  let mobilityFrom = 'population';   /* what the weights were actually built out of — reported */
  (function buildMobility() {
    if (N < 1) return;
    let popSum = 0, airSum = 0, airRootSum = 0, devSum = 0, withAir = 0;
    for (let i = 0; i < N; i++) { popSum += st[i].pop0; devSum += st[i].connectivity; if (st[i].air > 0) { airSum += st[i].air; airRootSum += Math.pow(st[i].air, AIR_EXP); withAir++; } }
    const popMean = popSum / N, devMean = (devSum / N) || 1;
    const anyAir = withAir > 0 && airSum > 0;
    if (anyAir) mobilityFrom = withAir === N ? 'airports' : 'airports+population';
    const airMean = anyAir ? airRootSum / withAir : 0;
    /* Airport capacity per million people, averaged over PEOPLE and not over countries: a mean over
       rows is a mean over two hundred rows of which a third are islands with one airstrip. */
    const apcRef = anyAir ? (airSum * 1e6) / popSum : 0;

    const popW = new Float64Array(N), attract = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      popW[i] = Math.pow(Math.max(1, st[i].pop0) / popMean, POP_EXP);
      /* ⚠ A COUNTRY WITH NO AIRPORT FIGURE IS NOT A COUNTRY WITH NO AIRPORTS. It falls back to its
         population weight, which is on the same scale (both average to 1 across the world). */
      attract[i] = Math.max(ATTRACT_FLOOR, (anyAir && st[i].air > 0) ? Math.pow(st[i].air, AIR_EXP) / airMean : popW[i]);
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
    if (edges > 0 && mobilityFrom !== 'population') mobilityFrom += '+borders';
    else if (edges > 0) mobilityFrom = 'population+borders';

    if (N < 2) return;
    for (let i = 0; i < N; i++) {
      const row = i * N, a = adj[i];
      let acc = 0;
      for (let j = 0; j < N; j++) {
        if (j !== i) {
          const d = haversine(st[i], st[j]);
          acc += attract[j] * Math.exp(-d / AIR_DECAY_KM) + (a && a.has(j) ? LAND_MIX * popW[j] : 0);
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

    let totI = 0, totE = 0; const exporters = [];
    for (let i = 0; i < N; i++) {
      const s = st[i];
      if (!s.seeded) continue;
      const live = alive(s) || 1;
      const Ii = sum(s.I), Ei = sum(s.E);
      const prevalence = Ii / live;

      /* Behaviour: people change what they do when the epidemic is visible, and a lockdown adds to
         that. With interventions off, neither happens. */
      const behav = P.interventions === 'none' ? 1
        : Math.max(0.12, 1 - (0.55 * Math.min(1, prevalence * 90) + 0.25 * s.lock) * interventionScale);
      const beta = localR0(s) / P.infectiousDays * seasonFactor(s.lat) * behav;
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

      /* Policy. Borders escalate and — unlike before — come back down. */
      if (P.interventions !== 'none') {
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
      let leave = draw(pool, Math.min(1, rate));
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
    return events;
  }
  function dominant(s) { let b = 0; for (let k = 1; k < s.share.length; k++) if (s.share[k] > s.share[b]) b = k; return b; }

  /* ── read-out ─────────────────────────────────────────────────────────────────────────────── */
  function totals() {
    /* ⚠ (#R666) `S` IS BOTH SUSCEPTIBLE POOLS, because that is what the word means to a reader; `SV`
       is reported beside it for anyone who needs «reached by the campaign and not protected». */
    let S = 0, SV = 0, E = 0, I = 0, R = 0, D = 0, V = 0, cumInf = 0, affected = 0;
    for (let i = 0; i < N; i++) {
      const s = st[i];
      S += s.S + s.SV; SV += s.SV; E += sum(s.E); I += sum(s.I); R += s.R; D += s.D; V += s.V; cumInf += s.cumInf;
      if (s.seeded && (sum(s.I) + sum(s.E)) > 0.5) affected++;
    }
    return { S, SV, E, I, R, D, V, cumInf, affected, worldPop, day, variants: variants.length - 1, vaccine: vaxDay >= 0, treatment, emergency };
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
    seed(i, cases) { return inject(i, cases == null ? P.initialCases : cases, null); },
    step, totals, invariant, vaccineProgress,
    /* ⚠ (#R666) WHAT THE MOBILITY WAS ACTUALLY BUILT OUT OF — so the HUD can say it rather than
       assume it. `from` is one of population / airports / airports+population, each optionally
       «+borders»; a world the host handed no codes and no airport figures for says `population`,
       and the screen must not then claim air connectivity. `destinations(i)` is the row itself, for
       a test that wants to measure the distribution instead of reading the formula. */
    mobility: {
      get from() { return mobilityFrom; },
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
    active(i) { const s = st[i]; return { E: sum(s.E), I: sum(s.I), D: s.D, seeded: s.seeded }; }
  };
}

/* ── PLACEMENT — the map's half of the same run ────────────────────────────────────────────────
   Where the dots go is not epidemiology, but it is the other thing that has to be TRUE: a case dot
   drawn in the sea or in the neighbouring country is a claim about where people are ill.

   The old placement anchored on real cities and then added a random jitter — and never asked
   whether the jittered point was still inside the country. For a coastal or border city it often
   was not. `accept` is that question, asked about the point that will actually be drawn; a jitter
   that cannot find an accepted point falls back to the anchor, which was accepted by construction.

   It lives in this file, and is exported, for one reason: node can call it. A rule that only exists
   inside a DOM closure is a rule no test can measure (#R505). */
export function scatterCases(n, anchors, span, rnd, accept) {
  const out = [];
  if (!anchors || !anchors.length) return out;
  const TRIES = 8;   /* enough for a coastal anchor; beyond that the anchor itself is the honest answer */
  for (let d = 0; d < n; d++) {
    const a = anchors[d % anchors.length];
    if (d < anchors.length) { out.push([a[0], a[1]]); continue; }
    let placed = null;
    for (let t = 0; t < TRIES && !placed; t++) {
      const p = [a[0] + (rnd() - 0.5) * span, a[1] + (rnd() - 0.5) * span];
      if (!accept || accept(p[0], p[1])) placed = p;
    }
    out.push(placed || [a[0], a[1]]);
  }
  return out;
}
