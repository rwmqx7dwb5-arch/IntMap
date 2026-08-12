/* ============================================================================
 *  IntMap · Reading pages — ENGLISH  (#R218)
 * ----------------------------------------------------------------------------
 *  One file per language; see js/page-i18n.js for the document shape and for what adding a
 *  language costs (this file, copied and translated, plus one row in LANGS).
 *  English is also the FALLBACK: any key a younger translation has not reached is read from
 *  here, per key, so a half-finished language is still that language plus a few English lines.
 *  The prose is #R211/#R212/#R215's, carried over unchanged — this round moved it, it did not
 *  rewrite it.
 * ========================================================================== */
/* ⚠ the one-line bootstrap: on sources.html / science.html js/page-i18n.js has already run and
   this is a no-op; inside the app (where that file is never loaded) it creates a minimal registry so
   the Sources dialog can lazily read this file for the translated source descriptions. */
window.IntMapPageI18N=window.IntMapPageI18N||{_d:{},define:function(c,d){this._d[c]=d;},doc:function(c){return this._d[c];}};
window.IntMapPageI18N.define('en', {

  common: {
    backToMap: 'Back to the map',
    contents: 'Contents',
    toScience: 'Science & logic',
    toSources: 'Data sources'
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  sources: {
    title: 'Data sources',
    meta: 'Every organisation whose data IntMap shows, where it is used, how it is fetched, its licence, and what it means for your privacy.',
    sub: 'Every number, line and image IntMap shows, and <b>where it came from</b>. What is computed from them is on the <a href="./science.html">Science &amp; logic</a> page.',
    footer: [
      'This page lists the <b>data providers</b>. How that data is used in calculations is on the <a href="./science.html">Science &amp; logic</a> page.<br>If you find an error on this page, please let us know through the in-app feedback form.'
    ],
    sections: [
      {
        id: 'what', nav: 'About this page', h: 'About this page',
        blocks: [
          ['tagline', 'Everything IntMap shows was measured and published by an outside organisation. This page lists those organisations.'],
          ['p', 'IntMap does not produce any data of its own. It fetches what meteorological agencies, NASA, UN bodies, universities and the OpenStreetMap community publish, and draws it on a single map. How much a figure on screen can be relied on depends on the organisation that published it, and this page is where you can check which organisation that is.'],
          ['p', 'The list below shows the providers the app actually uses, and it grows as the map does. To find something specific, filter by a layer name (&ldquo;tides&rdquo;, &ldquo;crops&rdquo;) or by the organisation.']
        ]
      },
      {
        id: 'live', nav: 'How current the data is', h: 'How current the numbers are',
        blocks: [
          ['tagline', 'How recent the data is depends on the layer. The table below shows which moment each kind of layer represents.'],
          ['table',
            ['Kind', 'Which moment you are seeing', 'Examples'],
            [
              ['Fetched as you look', 'The moment you switched it on. Earthquakes update in minutes; warnings are re-read about every five', 'Earthquakes, warnings, weather, aircraft, satellite imagery'],
              ['Annual statistics', 'The most recent published year, and the app always prints which year that is', 'Trade, energy mix, population, economic indicators'],
              ['A reference year', 'An observation of a stated year; nothing after it is included', 'Crop cultivation (2000, 2010), climate zones (1901&ndash;2020)'],
              ['Shipped with the app', 'Captured when the app was last updated; the same answer with no network at all', 'Borders, coastlines, sea floor, the star catalogue, planet textures, satellite orbital elements']
            ]
          ],
          ['lim', '<b>Worth knowing</b> — Some data drifts away from reality as it ages; satellite orbital elements are the clearest example. For those layers the panel shows the date the data was captured. Older data is never presented as if it were current.']
        ]
      },
      {
        id: 'privacy', nav: 'What a layer sends', h: 'What happens when you open a layer',
        blocks: [
          ['tagline', 'Your browser fetches the data from the provider directly.'],
          ['p', 'IntMap uses almost no relay servers: tiles, weather, earthquakes and the rest are requested by your device from the provider directly. Their access logs will therefore contain <b>your IP address and which map tiles you requested</b>, which indicates roughly the area you were viewing. This is the same as in other map applications, but it is stated here for clarity.'],
          ['p', 'Your location is used only on your device. Coordinates are sent out only when you ask something about a place, such as a search, a route or a forecast. Accounts, AI features and monitors are covered in the app&rsquo;s own Privacy dialog.']
        ]
      },
      {
        id: 'licence', nav: 'Who made it, and the terms', h: 'Who made this data, and the terms',
        blocks: [
          ['tagline', 'Attribution is required by these licences, and it is also how you can tell whose work a figure is.'],
          ['ul', [
            '<b>OpenStreetMap</b> (ODbL 1.0) &mdash; the map built by volunteers: roads, rail, buildings, places and administrative boundaries, and the base data for routing. Credited on the map at all times.',
            '<b>US Government works</b> (NASA, NOAA, USGS, NWS &hellip;) &mdash; public domain as a rule: imagery, earthquakes, city lights, planetary positions. NASA\'s logos and insignia are not.',
            '<b>National weather agencies</b> &mdash; warnings are shown as the issuing agency published them, and the agency is always named.',
            '<b>Natural Earth</b> &mdash; public-domain borders and coastlines.',
            '<b>Our World in Data</b> (CC BY 4.0) &mdash; electricity, energy and crop statistics, with the upstream compiler (Ember, the Energy Institute, FAO) named alongside.',
            '<b>The World Bank</b>, <b>FAO</b>, <b>Wikipedia / Wikidata</b> &mdash; under each provider\'s own terms, named in the panel that uses them.'
          ]],
          ['note', 'Each entry links to the provider&rsquo;s own page, where the full licence text can be found. The descriptions here are summaries and do not take precedence over that text.']
        ]
      },
      {
        id: 'limits', nav: 'What a source does not tell you', h: 'What a source does not tell you',
        blocks: [
          ['tagline', 'A stated source does not by itself mean the data is accurate, current, or applicable to your own location.'],
          ['ul', [
            '<b>A national total is not a local value.</b> A country-level statistic painted across a country does not say where inside it the figure comes from. The shading changes at the border; the phenomenon it describes usually does not.',
            '<b>Where no feed is available, the app says so in words.</b> An empty map is not a statement that no warnings are in force.',
            '<b>A simulation result is not source data.</b> The earthquake, tsunami, flood and sunlight results are computed from the data listed here. The equations, assumptions and limits are on the <a href="./science.html">Science &amp; logic</a> page.',
            '<b>In an emergency, always follow the official authorities.</b> What this application shows is for reference only.'
          ]]
        ]
      },
      {
        id: 'list', nav: 'The list, by subject', h: 'The list, by subject', count: 'src-count',
        blocks: [
          ['tagline', 'Each entry is one provider, with its name, where IntMap uses it, and a link to its own page.'],
          ['slot', 'src-panel']
        ]
      }
    ],
    filterPh: 'Filter — earthquakes, tides, NASA…',
    entries: 'entries',
    loading: 'Loading…',
    loadFail: 'The list could not be loaded — please reload the page.',
    noMatch: 'No source matches that filter.',
    groups: {
      base: 'Basemap, terrain, elevation',
      imagery: 'Imagery & remote sensing',
      weather: 'Weather, ocean, climate',
      hazard: 'Earthquakes, hazards, warnings',
      space: 'Space & astronomy',
      econ: 'Economy, statistics, energy',
      geo: 'Countries, boundaries, place names',
      transit: 'Transport, routing, aircraft, ships',
      news: 'News & reference',
      other: 'Other'
    }
  },

  /* ══════════════════════════════════════════════════════════════════════════════════════════ */
  science: {
    title: 'Science &amp; logic',
    meta: 'Which data each IntMap feature and simulation uses, by which equations, and under which assumptions.',
    sub: 'What each IntMap feature actually computes, from which data, under which assumptions. Separate from the data-source list: this page is about the <b>method</b>.',
    footer: [
      'This page documents <b>method</b>. The list of data providers is on the <a href="./sources.html">Data sources</a> page.<br>If you find an error here, please use the in-app feedback.'
    ],
    sections: [
      {
        id: 'principles', nav: 'Principles', h: 'Principles',
        blocks: [
          ['tagline', 'Four promises that hold across every feature below.'],
          ['h3', '① No placeholder data'],
          ['p', 'Every number is measured, observed or published. Nothing is generated to look plausible. When a fetch fails the app <b>says it failed</b> rather than substituting something that looks reasonable.'],
          ['h3', '② Every cap is declared'],
          ['p', 'Computations have budgets — path length, tile count, grid size. Hitting a budget and reporting the truncated result silently would be a claim that the phenomenon ended there, so a bitten budget is always stated in the answer.'],
          ['h3', '③ No claim finer than the data'],
          ['p', 'A channel narrower than one elevation sample, or a flood finer than one solver cell, is drawn at the data\'s own resolution and the number of such cases is <b>reported</b>, not hidden.'],
          ['h3', '④ Each model states what it does not answer'],
          ['p', 'The water model answers "where does it stand and which way does it leave", not "how fast does the front travel". Each panel says which question it is not answering.']
        ]
      },
      {
        id: 'elevation', nav: 'Elevation data', h: 'Elevation data — the base of every terrain computation',
        blocks: [
          ['p', 'Every terrain feature shares one elevation sampler. The data is Terrarium-encoded RGB elevation tiles, where the pixel colour <em>is</em> the height.'],
          ['tex', 'h \\;=\\; \\bigl(R \\cdot 256 + G + B/256\\bigr) - 32768 \\quad [\\mathrm{m}]'],
          ['p', 'A point\'s elevation is <b>bilinearly interpolated</b> from the four surrounding samples — nearest-neighbour would turn tile pixels into false steps and corrupt slope and flow answers. The ground spacing of one sample at zoom z is:'],
          ['tex', '\\Delta(z) \\;=\\; \\frac{40\\,075\\,017 \\, \\cos\\varphi}{2^{z} \\cdot 256} \\quad [\\mathrm{m\\;per\\;pixel}]'],
          ['table', ['z', 'Spacing at mid-latitude', 'Used for'], [
            ['14', '~10 m', 'Channel head, cross-sections'],
            ['11', '~54 m', 'Long-range downstream trace'],
            ['7', '~860 m', '"Is this the sea or a closed basin?"']
          ]],
          ['lim', 'Gaps are filled from neighbours and the <b>number of filled cells is always shown</b>. If more than 30 % is missing the sampler steps down a zoom level and retries; only if even the coarsest level fails does it report a failure — and it names the network, not the place.'],
          ['h3', 'The four samples, and the budget they come from'],
          ['tex', 'h(x,y) \\;=\\; \\sum_{i,j\\in\\{0,1\\}} h_{ij}\\,\\bigl(1-|x-i|\\bigr)\\bigl(1-|y-j|\\bigr)'],
          ['p', 'A tile is 256&times;256 samples; a query at zoom 14 therefore costs one HTTP request per 2.4 km square and is cached for the session. A terrain run states its own tile budget before it starts &mdash; an intensity field asks for up to 1,600 tiles and a phone caches 140, so the tiles a run is using are <b>pinned</b> for its duration and released in a <code>finally</code>. Without that a large field evicts its own inputs and re-fetches them, which is what turns a field into concentric circles.']
        ]
      },
      {
        id: 'water', nav: 'Terrain & water routing', h: 'Terrain sculpting &amp; water routing',
        blocks: [
          ['tagline', 'Where the water stands, which way it leaves, and where it overtops — solved on the real DEM.'],
          ['h3', '① Depression filling — priority flood'],
          ['p', 'Barnes, Lehman &amp; Mulla (2014) — the modern form of Planchon–Darboux. A min-heap grows inward from the grid border, always taking the lowest cell reached so far. The pop order is a topological order of the drainage network, so there is no separate flow-direction pass, no special case for sinks, and flats drain instead of stalling. Every cell comes out with:'],
          ['ul', [
            '<b>filled</b> — the level a depression containing it fills to before it spills',
            '<b>parent</b> — the neighbour it was reached from, i.e. its way out'
          ]],
          ['h3', '② Volume routing — multiple flow direction'],
          ['p', 'D8 collapses flow into single-cell lines on an open hillside — its signature artefact. Instead each cell splits its water between <b>every lower neighbour</b>, weighted by slope and contour width (Freeman 1991 / Quinn 1991):'],
          ['tex', 'w_i \\;\\propto\\; \\left(\\frac{\\Delta z_i}{L_i}\\right)^{1.1} \\! \\cdot C_i, \\qquad C = \\tfrac{1}{2}\\Delta \\ (\\text{face}), \\;\\; 0.354\\,\\Delta \\ (\\text{corner})'],
          ['p', 'The weighting is super-linear in slope, so hillslopes disperse and valleys converge on their own. A share only ever moves to a strictly lower <code>filled</code>, so cycles are impossible.'],
          ['h3', '③ Lakes hold, then cascade'],
          ['p', 'Sorting a depression\'s cells by elevation once makes stored volume a prefix sum and the level for a given volume a binary search. If the inflow does not fill it, the water stops there; only the <b>overflow</b> is injected at the outlet the priority flood already identified. An empty reservoir therefore does not deliver its full inflow downstream.'],
          ['h3', '④ Beyond the grid — walking the raw DEM'],
          ['p', 'The working grid is at most 60 km; a river is not. Outside it, the trace floods a window, follows that window\'s <b>talweg</b> (the descending branch with the largest accumulated catchment), moves the window to where it left off, and repeats. There are exactly two endings:'],
          ['ul', [
            '<b>The sea</b> — 1.5 km of continuous ground at or below 0 m. Elevation alone cannot tell the ocean from the Dead Sea or Death Valley, so the last step tests whether the ≤ 0 m region is connected to the edge of a ~240 km window <em>and</em> covers ≥ 15 % of it (open Pacific 100 %, Dead Sea 7 %).',
            '<b>It stops</b> — a basin that would have to fill by more than 25 m to leave. That is a lake, not DEM noise.'
          ]],
          ['p', 'When the lake is wider than the window (Lake Biwa is 63 km; the window is 15 km) there is no descending neighbour anywhere inside it. The look-ahead then widens to <b>3&times; → 9&times; → 27&times;</b>, each asking the DEM at the level whose own spacing matches that window. At 9&times; (~135 km) Biwa fits with room to spare and the Seta — the only way the level drops — is visible. <b>The threshold does not grow with the ladder</b>: a coarser sample can only over-estimate the fill required, so holding the number fixed makes the test stricter as the window widens, which is the safe direction.'],
          ['h3', '⑤ The width and depth that get drawn'],
          ['p', 'At each point the DEM is read on the <b>perpendicular</b> out to ±1.8 km, and the water surface is raised until the wetted area matches what has to pass. That requirement comes from continuity:'],
          ['tex', 'A(s) \\;=\\; \\frac{C}{\\sqrt{S(s)}}, \\qquad v \\;=\\; K\\sqrt{S}, \\quad K = 40'],
          ['p', 'Speed going as &radic;slope is the friction-slope term every open-channel formula shares; K = 40 gives 1.3 m/s on a 0.1 % grade, mid-range for a real lowland river. Steep reaches come out narrow and quick, flat reaches broad and slow. <b>The only free number is the volume (or discharge) the user entered.</b>'],
          ['lim', 'This is a <b>steady-state routing model</b>, not a shallow-water solver: it does not answer arrival time (a separate feature does). "Continuous pour" repeats the same steady solve as the volume grows — a quasi-static filling sequence — and the panel shows simulated time, never wall clock.'],
          ['h3', 'The size of a run, and what bounds it'],
          ['tex', '\\text{priority flood: } O(n\\log n),\\qquad \\text{MFD: } w_i = \\frac{(\\Delta z_i/L_i)^{1.1}C_i}{\\sum_j (\\Delta z_j/L_j)^{1.1}C_j}'],
          ['table', ['Quantity', 'Value', 'Why that value'], [
              ['Working grid', 'up to 60 km, &le; 512&times;512 cells', 'a phone must hold the heap, the fill and the accumulation at once'],
              ['Heap operations', 'O(n log n), n = cells', 'every cell is pushed and popped exactly once'],
              ['Downstream walk', 'windows of 15 km, widening &times;3 &rarr; &times;9 &rarr; &times;27', 'a lake wider than the window has no descending neighbour inside it'],
              ['Cross-section', '&plusmn;1.8 km, 96 samples', 'wide enough for a lowland river, fine enough for a gorge']
            ]],
          ['h3', 'The friction law behind K = 40'],
          ['tex', 'v \\;=\\; \\frac{1}{n}R_h^{2/3}S^{1/2}\\;\\;(\\text{Manning}), \\qquad K=\\frac{R_h^{2/3}}{n}\\;\\approx\\;40\\ \\text{for } R_h\\sim2\\,\\text{m},\\; n\\sim0.035'],
          ['p', 'The constant is not free: it is Manning&rsquo;s equation with a hydraulic radius of about 2 m and n = 0.035, i.e. a natural channel with some vegetation. It is stated here so a reader can decide whether it applies to the reach they are looking at.']
        ]
      },
      {
        id: 'seismic', nav: 'Seismic shaking', h: 'Seismic shaking',
        blocks: [
          ['p', 'The source is a Brune ω<sup>−2</sup> spectrum; everything between it and the ground is a product of three attenuations, each with a published form and a published constant.'],
          ['tex', '\\dot{M}(f) = \\dfrac{M_0}{1+(f/f_c)^2}, \\qquad f_c = 4.906\\times10^{6}\\,\\beta\\left(\\dfrac{\\Delta\\sigma}{M_0}\\right)^{1/3}'],
          ['tex', 'A(f) = \\underbrace{\\dfrac{R_{\\theta\\phi}\\,F\\,V}{4\\pi\\rho\\beta^{3}}}_{\\text{source}}\\; \\dot{M}(f)\\; \\underbrace{G(r)}_{\\text{spreading}}\\; \\underbrace{e^{-\\pi f r/(Q(f)\\beta)}}_{\\text{anelastic}}\\; \\underbrace{e^{-\\pi\\kappa f}}_{\\text{near-surface}}'],
          ['tex', 'G(r) = \\begin{cases} r^{-1.3} & r \\le 70\\ \\text{km}\\\\ r^{+0.2} & 70 < r \\le 140\\ \\text{km}\\\\ r^{-0.5} & r > 140\\ \\text{km}\\end{cases} \\qquad Q(f) = Q_0 f^{\\eta},\\;\\; \\kappa = 0.035\\ \\text{s}'],
          ['tex', '\\log_{10} h_{\\text{eff}} = -0.405 + 0.235\\,M'],
          ['p', 'A spectrum is not a peak. The peak of a random process with this spectrum comes from the Cartwright &amp; Longuet-Higgins peak factor, with N<sub>z</sub> the number of zero crossings in the path duration T<sub>d</sub> — which is why the same spectrum gives a smaller peak for a long, scattered path than for a short one.'],
          ['tex', 'y_{\\max} = \\sqrt{2\\ln N_z}\\left(1+\\dfrac{0.5772}{2\\ln N_z}\\right)\\sqrt{\\dfrac{1}{T_d}\\int_0^{\\infty}\\!\\!|Y(f)|^{2}df}'],
          ['p', 'The site term is the terrain: V<sub>S30</sub> from topographic slope, measured over the DEM&rsquo;s own sample spacing rather than at a fictional 900 m, then quarter-wavelength amplification. Where the elevation tiles do not arrive the field falls back to one site class everywhere, and the panel says so — an intensity with a single amplification is a function of distance alone, which is drawn as concentric circles.'],
          ['tex', '\\text{slope} = \\dfrac{\\lVert\\nabla h\\rVert}{\\Delta s},\\quad \\Delta s = \\max\\!\\bigl(900\\,\\text{m},\\,1.25\\,\\Delta(z)\\bigr) \\;\\longrightarrow\\; V_{S30} \\;\\longrightarrow\\; A_{qwl} = \\sqrt{\\dfrac{\\rho_r\\beta_r}{\\overline{\\rho\\beta}(\\lambda/4)}}'],
          ['tex', '\\mathrm{MMI} = 3.78 + 1.47\\log_{10}\\mathrm{PGV}\\;\\;(\\mathrm{PGV}>0.76\\ \\text{cm/s}) \\qquad I_{\\mathrm{JMA}} = 2\\log_{10}a_0 + 0.94'],
          ['p', 'Arrival times are ray-traced through the <b>IASP91</b> velocity structure — the take-off angle is solved for the source depth and epicentral distance and the path is integrated, rather than read from a table. That gives the P and S arrivals.'],
          ['p', 'Amplitude is an empirical distance decay times a <b>frequency-dependent Q</b> (anelastic attenuation), times a <b>site amplification</b>. The site class is not assumed: it comes from the slope measured at the DEM\'s own sample spacing at that point (steep = rock, flat = alluvium).'],
          ['lim', 'Beyond the bottom of the intensity scale the field is <b>extrapolating</b>, and says so. The epicentre is where the user put it; no AI-guessed coordinate is ever used.'],
          ['h3', 'From a spectrum to a number on the screen'],
          ['p', 'The Fourier amplitude spectrum is evaluated at 64 frequencies logarithmically spaced over 0.1&ndash;20 Hz. Everything after that is the peak-factor integral above, evaluated by the trapezium rule on those 64 points; the path duration is T<sub>d</sub> = T<sub>source</sub> + 0.05&thinsp;r, the standard Boore form.'],
          ['p', 'The field is solved on a grid whose spacing is chosen from the magnitude &mdash; 512 m for M &lt; 6, 1&ndash;2 km above it &mdash; and then <b>interpolated for display only</b>. Nothing is drawn finer than the grid it was solved on.']
        ]
      },
      {
        id: 'tsunami', nav: 'Tsunami', h: 'Tsunami',
        blocks: [
          ['p', 'The propagation is the non-linear shallow-water equations with Manning bottom friction, solved explicitly on a staggered grid. The time step is bounded by the fastest cell, not chosen.'],
          ['tex', '\\dfrac{\\partial\\eta}{\\partial t} + \\nabla\\!\\cdot\\!\\bigl[(h+\\eta)\\mathbf{u}\\bigr] = 0, \\qquad \\dfrac{\\partial\\mathbf{u}}{\\partial t} + g\\nabla\\eta + \\dfrac{g\\,n^{2}\\lVert\\mathbf{u}\\rVert\\mathbf{u}}{(h+\\eta)^{4/3}} = 0'],
          ['tex', 'c = \\sqrt{g\\,h}, \\qquad \\Delta t \\le \\dfrac{\\mathrm{CFL}\\,\\Delta x}{\\max\\sqrt{g\\,h}}, \\qquad \\dfrac{H_2}{H_1} = \\left(\\dfrac{h_1}{h_2}\\right)^{1/4}'],
          ['p', 'The initial surface is the Okada (1985) elastic half-space displacement of the drawn rupture — so the wave starts from a fault with a length, a width, a depth, a dip and a slip, not from a bump.'],
          ['tex', '\\eta_0(x,y) = u_z^{\\,\\text{Okada}}\\bigl(x,y;\\,L,\\,W,\\,d,\\,\\delta,\\,\\lambda,\\,\\bar{D}\\bigr), \\qquad M_0 = \\mu\\,L\\,W\\,\\bar{D}'],
          ['p', 'The initial sea-surface displacement is the <b>Okada (1985)</b> elastic half-space solution for a rectangular fault. Two implementation points matter:'],
          ['ul', [
            'The arctangent must be the <b>principal value</b> — using <code>atan2</code> produces a false subsidence lobe behind the fault.',
            'Truncating the computation window leaves a step, and the step propagates as a <b>false wave front</b>. The window is widened until the displacement is negligible.'
          ]],
          ['p', 'Propagation is the <b>linear long-wave</b> equation over measured bathymetry, phase speed <span class="pg-eq pg-eq-inline">c = &radic;(gh)</span> — about 200 m/s over 4 000 m of water (airliner speed), slowing and steepening as the depth falls. It runs in a Web Worker so the map stays interactive.'],
          ['h3', 'The discretisation, written out'],
          ['p', 'Staggered Arakawa C grid, leapfrog in time: the surface &eta; lives at cell centres and the two volume fluxes M, N on the faces between them, half a step apart in time. That is the scheme every operational long-wave code uses, and it is written out here because &ldquo;shallow-water equations&rdquo; alone does not say how they were solved.'],
          ['tex', '\\eta^{\\,t+1}_{i,j} = \\eta^{\\,t}_{i,j} - \\frac{\\Delta t}{\\Delta x}\\Bigl[(M^{\\,t+\\frac12}_{i+\\frac12,j}-M^{\\,t+\\frac12}_{i-\\frac12,j}) + (N^{\\,t+\\frac12}_{i,j+\\frac12}-N^{\\,t+\\frac12}_{i,j-\\frac12})\\Bigr]'],
          ['tex', 'M^{\\,t+\\frac12}_{i+\\frac12,j} = M^{\\,t-\\frac12}_{i+\\frac12,j} - g\\,D\\,\\frac{\\Delta t}{\\Delta x}\\bigl(\\eta^{\\,t}_{i+1,j}-\\eta^{\\,t}_{i,j}\\bigr) - \\frac{g\\,n^{2}}{D^{7/3}}\\lVert\\mathbf{M}\\rVert M\\,\\Delta t'],
          ['h3', 'Stability, edges and dry land'],
          ['tex', '\\frac{\\partial \\eta}{\\partial t} \\pm c\\,\\frac{\\partial \\eta}{\\partial x} = 0 \\quad\\text{(Sommerfeld, at the open edge)}, \\qquad D = h+\\eta > \\varepsilon_{\\text{dry}} = 0.01\\ \\text{m}'],
          ['p', 'The time step is taken from the CFL condition on the <b>deepest</b> cell in the domain (0.45 of the limit), so it is a consequence of the bathymetry rather than a setting. The open edges radiate rather than reflect &mdash; a closed edge would send a false wave back into the domain within one crossing time &mdash; and a cell is wet only above a 1 cm depth, which is what stops the friction term from dividing by a vanishing depth at the shoreline.'],
          ['lim', 'The solver is <b>non-dispersive</b> (long-wave), so it does not reproduce the leading-wave dispersion of a very short source, and it does not model wave breaking or run-up over roughness. Arrival times and the first crest are its answer; the inundation depth on land is a bathtub bound, not a run-up computation.']
        ]
      },
      {
        id: 'sealevel', nav: 'Sea level & inundation', h: 'Sea level &amp; inundation',
        blocks: [
          ['p', 'Ground at or below the chosen level is shaded — a bathtub fill. The shade is the <b>depth itself</b>, and the elevation data\'s resolution is directly the resolution of the flood edge.'],
          ['lim', 'Levees, gates and drainage are not modelled, and connectivity to the sea is not required by default. The claim is therefore <b>"this ground is below that level"</b>, not "this is what would flood".'],
          ['h3', 'Connectivity, when it is asked for'],
          ['p', 'The default answer is per cell: is this ground at or below that level. With connectivity switched on, a flood fill runs from the sea over the same grid and only cells reachable from it are shaded &mdash; which removes closed depressions below sea level (the Qattara Depression, Death Valley) that the bathtub answer includes. The two answers differ by exactly those basins, and the panel says which one is being shown.']
        ]
      },
      {
        id: 'tides', nav: 'Tides', h: 'Tides',
        blocks: [
          ['p', 'The series is Open-Meteo Marine\'s global tide model — hourly sea level above MSL. Highs and lows are its <b>local extrema</b>, with the time refined by fitting a parabola through the three samples around each turn, so the answer is not pinned to the hour the model is sampled at.'],
          ['tex', 't^{*} \\;=\\; t_i + \\tfrac{1}{2}\\,\\frac{a-c}{a-2b+c}\\,\\Delta t'],
          ['p', 'Switching the layer on samples the coastline in view and asks the model for all of those points at once, so the whole visible coast carries its level, its phase and its next turn before anything is tapped — and the ground at or below that level is shaded from the same elevation data as §6. Tapping a coast replaces the overview with that point\'s own table, asked for on its own coordinates.'],
          ['p', '"How far the water comes" uses exactly the construction in §6, with the current tide level as the water level. Over minutes to hours a still-water fill is a fair approximation — but it is not a run-up model.']
        ]
      },
      {
        id: 'currents', nav: 'Ocean currents', h: 'Ocean currents',
        blocks: [
          ['p', 'The bundled field is geostrophic flow from satellite altimetry plus the wind-driven Ekman part; each named current is then integrated through that measured field from a published seed on its core.'],
          ['tex', 'u_g = -\\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial y}, \\qquad v_g = \\dfrac{g}{f}\\dfrac{\\partial\\eta}{\\partial x}, \\qquad f = 2\\Omega\\sin\\varphi'],
          ['tex', '\\lVert\\mathbf{u}_{ek}\\rVert = \\dfrac{B}{\\sqrt{|f|}}\\dfrac{\\lVert\\boldsymbol{\\tau}\\rVert}{\\rho_w},\\quad B = 0.065\\ \\text{s}^{-1/2}, \\qquad \\theta = \\theta_{\\tau} - \\operatorname{sgn}(\\varphi)\\,55^{\\circ}'],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\,\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', 'Warm or cold is <b>measured</b>, not inferred from the direction of the flow: it is the current&rsquo;s own sea-surface temperature against the zonal mean at the same latitude. Within ±0.6 K the current is drawn grey, because the equatorial and circumpolar currents genuinely run along their own isotherms.'],
          ['tex', '\\overline{\\Delta T} = \\dfrac{1}{N}\\sum_{i=1}^{N}\\Bigl[T(\\mathbf{x}_i)-\\langle T\\rangle_{\\varphi_i}\\Bigr] \\quad \\begin{cases}>+0.6\\ \\text{K} & \\text{warm}\\\\ <-0.6\\ \\text{K} & \\text{cold}\\\\ \\text{otherwise} & \\text{zonal}\\end{cases}'],
          ['tagline', 'A flow field, drawn as the streamlines of the water that is actually moving.'],
          ['p', 'The velocity field is Open-Meteo Marine\'s <code>ocean_current_velocity</code> and <code>ocean_current_direction</code> — the same keyless model the tides use. A grid covering the view is asked for in one request, land cells are skipped from the bundled land mask, and the answers are bilinearly interpolated into a continuous field.'],
          ['p', 'A <b>streamline</b> is then integrated through that field from each seed point with a 4th-order Runge–Kutta step, forwards and backwards, so one line is a path the water actually takes rather than an arrow standing on its own. Line width is the speed; arrowheads along the line say which way it goes.'],
          ['eq', 'x<sub>n+1</sub> = x<sub>n</sub> + (h/6)(k<sub>1</sub> + 2k<sub>2</sub> + 2k<sub>3</sub> + k<sub>4</sub>), &nbsp; k<sub>i</sub> = u(x)/|u| &nbsp; (unit-speed, so the step is a distance)'],
          ['p', 'Warm or cold is <b>measured, not assumed</b>. 暖流 / 寒流 is a claim about what the water carries, so each streamline is compared with the sea-surface temperature about 110 km <b>upstream</b> along its own path. Upstream warmer than here means the current is bringing warmth (red); upstream colder means it is bringing cold (blue).'],
          ['lim', 'Where the difference is under 0.25 K — inside the model\'s own noise — the line is <b>grey</b> and the legend says "neither". A current that is not carrying a temperature contrast must not be coloured as though it were. Names are Wikidata (CC0), drawn at the coordinate published for each current; a name is a point on the map and does not claim that the line beside it is that current.'],
          ['h3', 'The field: what is averaged, and over what'],
          ['p', 'The bundled field is a <b>climatology</b>: 36 velocity fields spread evenly over the whole served record (2015&rarr;now) plus 24 wind-stress fields, on the source&rsquo;s own 0.25&deg; grid. A mean over 36 fields reduces mesoscale (eddy) variance by about a factor of six, which is what makes a traced path a current rather than a ring.'],
          ['tex', '\\mathbf{u}_{\\text{tot}} \\;=\\; \\underbrace{\\frac{g}{f}\\,\\hat{\\mathbf{k}}\\times\\nabla\\eta}_{\\text{geostrophic (altimetry)}} \\;+\\; \\underbrace{\\frac{B}{\\sqrt{|f|}}\\frac{\\boldsymbol{\\tau}}{\\rho_w}\\,\\mathcal{R}\\bigl(-\\operatorname{sgn}\\varphi\\cdot55^{\\circ}\\bigr)}_{\\text{Ekman (wind stress)}}'],
          ['h3', 'How a named current&rsquo;s line is produced'],
          ['tex', '\\mathbf{x}_{n+1} = \\mathbf{x}_n + \\Delta s\\;\\hat{\\mathbf{u}}\\!\\left(\\mathbf{x}_n + \\tfrac{\\Delta s}{2}\\,\\hat{\\mathbf{u}}(\\mathbf{x}_n)\\right), \\qquad \\Delta s = 25\\ \\text{km}'],
          ['p', 'Each of the 108 named currents is integrated forward and backward from one published seed on its core, up to 5,000 km each way, through that measured field. Three rules end a walk: a cell entered twice more than 12 steps apart (a closed eddy), a return within 60 km of the seed after a real journey (a gyre closing), or a budget of 12 consecutive cells below 2.2 cm/s. A trace that closes in under 1,500 km is <b>rejected</b> and the seed is retried from the ring around it &mdash; a published core position can land in a standing recirculation beside the current.'],
          ['h3', 'The file the browser reads'],
          ['tex', 's_{\\text{byte}} = \\left\\lfloor 255\\sqrt{\\frac{\\min(s,\\,2.5)}{2.5}} \\right\\rceil, \\qquad b_{\\text{byte}} = \\left\\lfloor \\frac{255\\,\\theta}{360^{\\circ}} \\right\\rceil'],
          ['tex', '\\text{stride} = \\min\\Bigl\\{\\,2^{k} \\;:\\; \\frac{\\Delta\\lambda_{\\text{view}}}{0.25^{\\circ}2^{k}}\\cdot\\frac{\\Delta\\varphi_{\\text{view}}}{0.25^{\\circ}2^{k}} \\le N_{\\max}\\Bigr\\},\\qquad N_{\\max}=4\\,200\\ (\\text{phone}),\\;9\\,000'],
          ['p', 'The field ships as a regular grid &mdash; 1,440 &times; 720 cells, one byte of speed and one of bearing &mdash; rather than as a list of arrows, because a list fixes the spacing at build time. The client strides the grid instead, choosing the coarsest stride that still fills the view with at most N<sub>max</sub> marks, and each strided cell is the <b>vector mean</b> of its block (averaging bearings as numbers would turn 350&deg; and 10&deg; into 180&deg;). Speed is stored through a square root so the resolution is 0.05 cm/s at the low end, where the eastern boundary currents are.'],
          ['h3', 'The twelve months'],
          ['p', 'A second file carries twelve monthly climatologies at 0.5&deg; &mdash; six years of each calendar month averaged &mdash; and is fetched only if a month is chosen. Each named current also carries its twelve monthly speeds and the mean projection of that month&rsquo;s flow <b>onto its own path</b>; where that projection changes sign between months, the current reverses with the season and the list says so. The paths themselves are not re-traced per month: a 0.5&deg; field cannot support twelve different geometries, and a line that changed shape every month would be a claim about the path the data does not make.']
        ]
      },
      {
        id: 'atmosphere', nav: 'Atmosphere & sky', h: 'Atmosphere & sky colour',
        blocks: [
          ['tagline', 'What colour the sky is, from this height, at this Sun angle, looking this way — integrated rather than chosen.'],
          ['p', 'A renderer that picks two hex colours and interpolates them agrees with the sky at exactly one Sun elevation and one camera height. This app flies from a street to low orbit and travels in time, so the sky is <b>marched</b>: the view ray is integrated to the top of the atmosphere, and at every step the ray back to the Sun is integrated too. A step whose Sun ray is blocked by the Earth contributes nothing — which is what makes dusk fall from the ground upward, and gives twilight without any twilight term.'],
          ['h3', 'The radiative transfer that is actually marched'],
          ['tex', 'L(\\mathbf{x},\\boldsymbol{\\omega}) \\;=\\; \\int_{0}^{t_{\\max}} T(\\mathbf{x},\\mathbf{p})\\,\\Bigl[\\, \\sigma_s^{R}(\\mathbf{p})\\,p_R(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s^{M}(\\mathbf{p})\\,p_M(\\mu)\\,T(\\mathbf{p},\\mathbf{p}_{\\odot})\\,E_\\odot \\;+\\; \\sigma_s(\\mathbf{p})\\,\\Psi_{ms}(h,\\theta_\\odot) \\Bigr]\\,dt'],
          ['tex', 'T(\\mathbf{a},\\mathbf{b}) \\;=\\; \\exp\\!\\left[-\\!\\int_{\\mathbf{a}}^{\\mathbf{b}}\\!\\bigl(\\beta_R\\,e^{-h/H_R} + 1.1\\,\\beta_M\\,e^{-h/H_M} + \\beta_{O_3}\\,\\Lambda(h)\\bigr)ds\\right]'],
          ['tex', 'p_R(\\mu) = \\frac{3}{16\\pi}\\bigl(1+\\mu^{2}\\bigr), \\qquad p_M(\\mu) = \\frac{3}{8\\pi}\\,\\frac{(1-g^{2})(1+\\mu^{2})}{(2+g^{2})\\,(1+g^{2}-2g\\mu)^{3/2}}, \\quad g = 0.76'],
          ['h3', 'Ozone, and why twilight is blue'],
          ['p', 'Ozone <b>absorbs and does not scatter</b>, so it appears in the optical depth on both rays and in no phase function. It is what makes the blue hour blue: with the Sun below the horizon the sight-line passes through 10–40 km, where Rayleigh scattering has little left to remove, and what takes the residual yellow-red out is the Chappuis band near 600 nm.'],
          ['tex', '\\Lambda(h) \\;=\\; \\max\\!\\left(0,\\; 1 - \\frac{|h - 25\\,\\mathrm{km}|}{15\\,\\mathrm{km}}\\right), \\qquad \\beta_{O_3} = (0.650,\\,1.881,\\,0.085)\\times10^{-6}\\ \\mathrm{m^{-1}}'],
          ['h3', 'Multiple scattering'],
          ['p', 'Single scattering counts a photon once. In the blue, air is optically thick enough that most of what reaches the eye has bounced several times, and every bounce erases direction — so the multiply-scattered part is <b>isotropic</b> and appears with no phase function at all. Closing the geometric series gives a term that depends only on height and Sun elevation, so it is tabulated (16 heights × 24 Sun elevations) and interpolated twice per sample.'],
          ['tex', '\\Psi_{ms} \\;=\\; \\frac{L^{(2)}}{1 - f}, \\qquad f = \\frac{1}{4\\pi}\\oint \\sigma_s\\,T\\,d\\omega \\;<\\; 1'],
          ['tex', 'C \\;=\\; \\Bigl[\\,1 - e^{-L\\,\\varepsilon}\\,\\Bigr]^{1/2.2}, \\qquad \\varepsilon = 0.7'],
          ['lim', 'One aerosol profile for the whole planet, no clouds, no airglow and no starlight — so a deep night integrates to black and is floored at a measured night colour rather than shown as the model returns it. The limb seen from space is the renderer\'s own scattering pass, not this integral; this model decides the colour that pass is blended toward.'],
          ['h3', 'The march, and its cost'],
          ['tex', 'L=\\sum_{i=1}^{16} T(\\mathbf{x},\\mathbf{p}_i)\\bigl[\\sigma_s^R p_R + \\sigma_s^M p_M\\bigr]T(\\mathbf{p}_i,\\odot)E_\\odot\\,\\Delta t \\;+\\;\\sum_{i}\\sigma_s\\Psi_{ms}\\Delta t,\\quad T \\text{ from } M=8 \\text{ sun steps}'],
          ['p', 'Sixteen steps along the view ray, eight along the sun ray at each of them, and a 16 &times; 24 table of multiple-scattering values interpolated twice per sample. That is about 300 exponentials per colour, evaluated when the Sun or the camera has actually moved &mdash; a few times a second at the very most, which is why it can be an integral rather than a gradient.'],
          ['h3', 'Seen from outside: the limb'],
          ['tex', '\\theta_{\\text{limb}}(h_t) \\;=\\; \\arcsin\\!\\frac{R_\\oplus+h_t}{R_\\oplus+h_{\\text{eye}}} \\;-\\; 90^{\\circ}, \\qquad \\ell(h_t)\\;\\approx\\;2\\sqrt{2R_\\oplus H}\\,e^{-h_t/2H}'],
          ['p', 'From orbit the atmosphere is not overhead, it is edge-on: a ray whose closest approach is 6 km above the surface crosses roughly 800 km of air, one at 55 km crosses almost none. Both ends of the drawn gradient are those two rays, so the band is blue-white low on the day side, red through the terminator and black on the night side, at whatever altitude the camera is at. Nothing about it is a chosen colour.'],
          ['lim', 'One aerosol profile for the whole planet, no clouds, no airglow and no starlight, so a deep night integrates to black and is floored at a measured night colour. The halo drawn around the globe is the renderer&rsquo;s own scattering pass; this model decides the colours it is blended toward.']
        ],
      },
      {
        id: 'sun', nav: 'Sun, shadow, viewshed', h: 'Sun, shadow and viewshed',
        blocks: [
          ['p', 'Solar position comes from the standard astronomical algorithm — declination and hour angle to azimuth and altitude. It is verified to give 0° declination at an equinox and the obliquity at a solstice.'],
          ['p', 'Annual insolation sweeps the surrounding DEM by azimuth to build the point\'s <b>real horizon profile</b>, then integrates the sun\'s track against it. The viewshed answers <b>per raster cell</b> rather than per bearing, because a bearing sweep misses cells at distance.'],
          ['h3', 'The horizon, and the year integrated against it'],
          ['tex', 'H(\\alpha) = \\max_{r\\le R_{\\max}}\\arctan\\frac{z(r,\\alpha)-z_0}{r}, \\qquad E = \\int_{\\text{year}} I_0\\,\\cos\\theta_i\\,\\bigl[\\,\\gamma_s(t)>H(\\alpha_s(t))\\,\\bigr]\\,dt'],
          ['p', 'The surrounding terrain is swept by azimuth in 1&deg; steps out to 25 km, and the largest elevation angle found along each bearing is that bearing&rsquo;s horizon. The Sun&rsquo;s track for the whole year is then integrated against that profile at 10-minute steps, counting only the moments it stands above it &mdash; which is why a north-facing alpine slope comes out at a fraction of the flat-ground value rather than at the cosine of its latitude.'],
          ['p', 'The viewshed answers <b>per raster cell</b> rather than per bearing: a bearing sweep leaves gaps that grow with distance, so at 20 km the two differ by whole ridges.']
        ]
      },
      {
        id: 'sats', nav: 'Satellites', h: 'Satellites',
        blocks: [
          ['p', 'Orbits are propagated from TLEs with <b>SGP4/SDP4</b>. A TLE degrades with age and — importantly — <b>diverges silently</b>, so there is a hard limit on element-set age and anything past it is not drawn.'],
          ['p', 'The catalogue is a bundled snapshot plus a live fetch. A category with no list is <b>omitted, not shown empty</b> — an empty array would be a claim that the category has no satellites.'],
          ['h3', 'SGP4, and why the age of an element set is a hard limit'],
          ['tex', 'n\'\' = n_0\\bigl[1 + \\tfrac{3}{2}k_2\\tfrac{(3\\cos^2 i-1)}{a^{2}(1-e^{2})^{3/2}}\\bigr],\\qquad \\sigma_{\\text{pos}} \\sim 1\\text{–}3\\ \\mathrm{km/day}\\ \\text{after epoch}'],
          ['p', 'A TLE is not a position: it is a set of mean elements fitted to a specific analytic theory, and only SGP4/SDP4 can read it. Its error grows at roughly 1&ndash;3 km per day after the epoch for a low orbit, and it does so <b>silently</b> &mdash; there is no signal in the data that says the answer has gone wrong. So the propagator refuses element sets past a stated age rather than drawing a plausible dot in the wrong place.']
        ]
      },
      {
        id: 'space', nav: 'Space & bodies', h: 'Space &amp; bodies',
        blocks: [
          ['p', 'Planet and moon positions are Keplerian, from orbital elements. Bodies are drawn enlarged (at true scale they are sub-pixel), but the <b>magnification ceiling is geometry, not taste</b>: it follows from the requirement that the Moon stay clear of the Earth even at perigee.'],
          ['p', 'The satellites of the other planets come from JPL\'s own mean-element table for 177 moons at a stated epoch, each propagated to the clock. The elements are not all in one plane — a close giant-planet satellite states its planet\'s local <b>Laplace plane</b>, whose pole the table gives as right ascension and declination — and that frame is carried through rather than read as if it were the ecliptic.'],
          ['p', 'At model scale a satellite is placed by the same compression law the Moon is, and then <b>pushed out to clear its primary</b>: compressing a distance and a radius by different powers can otherwise put an inner moon inside the planet it orbits. At true scale nothing is moved, because there is nothing to compress.'],
          ['p', 'Stars come from a bundled all-sky bright-star catalogue at their real positions and magnitudes; colour is derived from the B&minus;V index, i.e. real colour temperature.'],
          ['h3', 'Positions'],
          ['tex', 'M = E - e\\sin E \\;\\Longrightarrow\\; E_{k+1}=E_k-\\frac{E_k-e\\sin E_k-M}{1-e\\cos E_k}, \\qquad \\tan\\frac{\\nu}{2}=\\sqrt{\\tfrac{1+e}{1-e}}\\tan\\frac{E}{2}'],
          ['p', 'Planets and moons come from mean elements at a stated epoch: the mean anomaly is advanced, Kepler&rsquo;s equation is solved by Newton&ndash;Raphson (four iterations reach 10<sup>&minus;12</sup> for e &lt; 0.9), and the true anomaly follows. A close giant-planet satellite states its planet&rsquo;s local <b>Laplace plane</b> rather than the ecliptic, and that frame is carried through instead of being read as if it were.'],
          ['h3', 'The two scales, and what is preserved between them'],
          ['tex', 'r_{\\text{model}} = 26\\,\\mathrm{AU}^{0.42}, \\qquad R_{\\text{model}} = 0.12\\left(\\frac{R}{R_\\oplus}\\right)^{1/3}, \\qquad d\' = \\frac{\\mathcal{P}\'\\bigl(\\mathcal{P}^{-1}(d\\tan\\tfrac{\\phi}{2})\\bigr)}{\\tan\\frac{\\phi}{2}}'],
          ['p', 'Model scale compresses orbital radii by a power of 0.42 and body radii by a cube root, so it is not one scale but two, and no single conversion of the camera&rsquo;s distance can hold both. What is carried across the switch is therefore the <b>real-space radius at the edge of the frame</b> &mdash; convert it out of the old units through that scale&rsquo;s own law and back in through the new one, and the same planets stay in the same places. Where a body fills the frame the invariant becomes its apparent size instead, blended in log space over the range where the picture stops being about the system and starts being about the body.']
        ]
      },
      {
        id: 'flight', nav: 'Flight model', h: 'Flight model',
        blocks: [
          ['p', 'Thrust and lift fall with air density, so the <b>service ceiling is not a wall</b>: an aircraft started above it descends until the air can hold it, rather than being clamped.'],
          ['p', 'The camera sits <em>at</em> the aircraft rather than being a chase view corrected after the fact.'],
          ['h3', 'The forces'],
          ['tex', 'L=\\tfrac12\\rho V^{2}S\\,C_L(\\alpha),\\quad D=\\tfrac12\\rho V^{2}S\\bigl(C_{D0}+\\tfrac{C_L^{2}}{\\pi e A\\!R}\\bigr),\\quad T=T_0\\left(\\frac{\\rho}{\\rho_0}\\right)^{0.7}'],
          ['p', 'Lift is a linear C<sub>L</sub>(&alpha;) up to the stall angle and a modelled post-stall drop after it; induced drag is the standard 1/(&pi;eAR) term, so a wing with a low aspect ratio really does pay for its lift. Thrust falls with density to the 0.7 power, which is what gives a service ceiling without a rule that says &ldquo;stop here&rdquo;: an aircraft started above its ceiling descends until the air can hold it.'],
          ['h3', 'The air it is flying through'],
          ['tex', '\\rho(h)=\\rho_0\\left(1-\\frac{Lh}{T_0}\\right)^{\\frac{g}{RL}-1},\\quad L=6.5\\ \\mathrm{K/km};\\qquad \\rho=\\rho_{11}e^{-\\frac{g(h-11\\,\\mathrm{km})}{R\\,T_{11}}}\\ (h>11\\ \\mathrm{km})'],
          ['p', 'The International Standard Atmosphere, in two pieces: a linear-lapse troposphere and an isothermal stratosphere above 11 km. Airspeed is therefore two different numbers &mdash; true airspeed and the equivalent airspeed the airframe feels &mdash; and the HUD says which is which.'],
          ['h3', 'The integration'],
          ['tex', '\\mathbf{y}_{n+1}=\\mathbf{y}_n+\\Delta t\\,\\mathbf{f}(\\mathbf{y}_n),\\quad \\Delta t=\\min\\!\\left(\\tfrac{1}{30}\\ \\mathrm{s},\\,\\Delta t_{\\text{frame}}\\right)\\ \\text{sub-stepped so } \\Delta t\\le \\tfrac{1}{120}\\ \\mathrm{s}'],
          ['p', 'Explicit sub-stepped integration at a bounded step, so a long frame does not become a long time step and put the aircraft through the ground. The camera sits <em>at</em> the aircraft rather than being a chase view corrected afterwards, and the terrain under it is sampled from the same elevation data as every other terrain feature on this page.']
        ]
      },
      {
        id: 'routing', nav: 'Routing & reachability', h: 'Routing &amp; reachability',
        blocks: [
          ['p', 'Road routes come from OSRM over the OpenStreetMap network, alternatives from the same engine. Rail routing runs on real OSM track and <b>snaps to the largest connected component</b> — snapping to an isolated siding would make the destination unreachable. Public transport uses real timetables via MOTIS/Transitous.'],
          ['p', 'An isochrone is the set of points a time budget reaches, wrapped in a hull. The hull is for display — <b>reachability itself is decided on the network</b>, not by the hull.'],
          ['h3', 'What an isochrone actually solves'],
          ['p', 'A time budget is expanded over the road network from the origin &mdash; a many-to-one shortest-path search, not a circle &mdash; and the reached nodes are then wrapped in a concave hull for drawing. <b>Reachability is decided on the network</b>; the hull is a picture of the answer and is never consulted to produce it. Where the network is sparse the hull is conspicuously wrong-looking and the answer underneath it is still right.']
        ]
      },
      {
        id: 'trade', nav: 'Trade flows', h: 'Trade flows',
        blocks: [
          ['p', 'Bilateral goods trade from BACI (CEPII) via OEC — reporter &times; partner &times; HS section &times; year, 1995–2024.'],
          ['p', '<b>Line width is proportional to the square root of the value.</b> Two reasons. A country\'s top partner is routinely 500&times; its hundredth, so linear widths erase everything below the top three; and a logarithm makes a $200 M flow look a third as wide as a $200 B one, which lies in the other direction. With &radic;, a stroke\'s <b>area</b> (width &times; length) tracks the quantity — the flow-map convention.'],
          ['eq', 'w = 1.2 + 11.8 &middot; &radic;(v / v<sub>max</sub>) &nbsp;px'],
          ['lim', 'Only the <b>picture</b> is compressed. Hovering shows both the short form (<code>$141.6B</code>) and the <b>exact, unrounded figure</b> (<code>$141,585,432,101</code>). Nothing in this app rescales a value in order to display it.']
        ]
      },
      {
        id: 'energy', nav: 'Energy mix', h: 'Energy mix',
        blocks: [
          ['p', 'Electricity mix from Ember, primary energy from the Energy Institute review, both via Our World in Data, per country per year. The map carries the <b>one number that ranks countries</b> (low-carbon share of electricity / fossil share of primary energy); the composition itself is a <b>stacked bar</b>, because nine sources are not one colour.'],
          ['p', 'Travelling in time re-reads <b>that year\'s rows</b> rather than interpolating. If a country has no row for that year, the newest observation at or before it is used — and the year actually used is stated.']
        ]
      },
      {
        id: 'crops', nav: 'Crops', h: 'Crops',
        blocks: [
          ['p', 'The raster is FAO GAEZ v4 — harvested area, yield or production for one crop, at a stated reference year, drawn at the resolution the service returns for the area on screen.'],
          ['p', 'A cell that carries data is <b>opaque</b>: the ramp says what the number is, so transparency says nothing and belongs entirely to the opacity control. A cell with no crop stays transparent, because that is absence of data rather than a small value.'],
          ['lim', 'This is a reference-year grid, not a live one, and the panel says which year. A national statistic is not a field map: where you need the physical extent of cultivated ground, ESA WorldCover\'s 10 m cropland class is offered separately, and <b>the two are never blended into one picture</b>.']
        ]
      },
      {
        id: 'alerts', nav: 'Warnings', h: 'Weather &amp; disaster warnings',
        blocks: [
          ['p', 'Japan reads the JMA real-time feed <b>at the unit the warning is issued for</b> — it carries both a prefecture-level and a municipality-level tier. The map is painted at the prefecture and the municipality rows are listed on tap. Colour is the highest tier actually in force (emergency warning = purple, warning = red, advisory = yellow). The United States uses the NWS active-alerts feed, which carries its own geometry.'],
          ['lim', 'Nothing drawn is <b>not</b> the same as nothing in force. Tapping a country whose agency is not wired says so in words — this app will not make a safety claim with an empty map.']
        ]
      },
      {
        id: 'news', nav: 'News geolocation', h: 'News geolocation',
        blocks: [
          ['p', 'Placing an article on the map is done by <b>deterministic code</b>, not by a model: extraction, matching and disambiguation are rules and gazetteers, and the AI only ever explains meaning. Clustering is deterministic too, with CJK bigrams for Japanese headlines.'],
          ['p', 'An article\'s date is <b>not</b> the event\'s date, and the two are kept apart.']
        ]
      },
      {
        id: 'time', nav: 'Clock & time machine', h: 'Clock &amp; time machine',
        blocks: [
          ['p', 'There is exactly one clock in the app. The day–night terminator, body positions, the year for statistics, the year for trade and the fetch time for warnings all subscribe to it, so moving between "now" and a past instant is a single change that reaches every feature.'],
          ['p', 'Travelling to a past year also draws <b>that era\'s borders</b> (the nearest historical snapshot at or before the year). Nothing that exists only per year is interpolated to look daily.']
        ]
      },
      {
        id: 'labels', nav: 'Label sizing', h: 'Label sizing',
        blocks: [
          ['p', 'Every text size on the map derives from one ladder whose specification is a <b>relation</b>, not a value: a non-place label is smaller than a place label. The reference for non-place labels is kept separate, so raising the ceiling for country names does not silently inflate sea, POI and grid labels with it.']
        ]
      },
      {
        id: 'ai', nav: 'What the AI may not decide', h: 'What the AI is not allowed to decide',
        blocks: [
          ['p', 'Atlas (the AI console) is responsible for <b>meaning</b>; the code is responsible for <b>execution</b>. Concretely:'],
          ['ul', [
            'The AI never writes <b>coordinates</b>. It names places as structured targets (ISO codes, place names) which are resolved against real datasets.',
            'An unresolvable target is neither silently rescued nor silently dropped — the failure is returned as a fact.',
            'Whether something changed is decided by <b>code</b>; the AI only writes the explanation (monitors and alerts).',
            'The AI cannot report an action it did not perform; a partial run is marked as partial in the result.'
          ]]
        ]
      }
    ]
  }
});
