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
,

  /* ── the registry entries' descriptions (#R246) ──────────────────────────────────────────────
     ⚠ THIS IS THE ENGLISH ORIGINAL, AND IT LIVES HERE SO THAT IT IS MEASURED. It used to be
     `use:{en,jp}` inside js/reference-data.js, which is (a) an object keyed by language code — the
     eleventh shape, invisible to every instrument — and (b) ~50 kB of prose in the EAGER bundle.
     Worse, scripts/i18n-pages-audit.mjs measures each language against every string PATH in the
     ENGLISH document, so with the English text living outside this file the de/ru/es translations
     below were uncounted and the total ABSENCE of fr/ko/zh/zh-Hans read as 287/287, 100 %.
     Now every language keeps its own copy here, English included, and the existing audit sees the
     whole surface with no new instrument. The registry carries only the name and the URL. */
  sourceUse: {
    "CRUST1.0 — global crustal model": "Bundled with the app (data/crust1.bin.gz): the 1° global crustal model — sediment, crystalline crust and uppermost mantle, each with its own shear velocity, density and layer depth. The earthquake simulator builds every site's velocity profile below 30 m from it, which is what lets it show a basin amplifying long periods.",
    "USGS Slab2 — subduction zone geometry": "Bundled with the app (data/slab2.bin.gz): the depth, strike and dip of all 27 active subduction zones. The earthquake simulator uses it to tell a plate-interface earthquake from one inside the descending slab — the same question, and the same answer, everywhere on Earth.",
    "Bird (2003) PB2002 plate boundaries": "Bundled with the app (data/tectonics.bin.gz): distance to the nearest plate boundary, that boundary's class and the diffuse-deformation (orogen) polygons. Used to classify an earthquake's tectonic setting, which selects the published ground-motion parameters for it.",
    "USGS ShakeMap station lists": "Recorded peak ground acceleration and velocity at real instruments, used to score the earthquake model against observations (scripts/seismic-validate.mjs). Fetched only when that validation is run offline — never by the app in your browser.",
    "CARTO basemaps": "Light/dark vector basemap tiles",
    "MapLibre GL JS": "The default map rendering engine (BSD-3-Clause). Draws every 2-D/3-D map view, the globe projection and the terrain mesh.",
    "CesiumJS": "Optional second rendering engine (Apache-2.0), selectable in Settings ▸ Map behavior ▸ Map engine. Downloaded only when chosen. Uses NO Cesium Ion asset and no access token — it renders the same Esri imagery and the same AWS terrarium elevation data as the default engine.",
    "Twemoji (Twitter Emoji)": "Self-hosted country-flag webfont (TwemojiCountryFlags.woff2) so flag emoji render on platforms without native flag glyphs (e.g. Windows). Graphics licensed CC-BY 4.0.",
    "Esri World Imagery": "Satellite imagery + reference labels; World Hillshade & World Transportation reference tiles (hillshade layer and the roads-layer preview image)",
    "OpenStreetMap": "Place search & place/region boundary outlines (Nominatim), the real course of a river when its name is clicked on the map (#R217), & basemap data",
    "NASA GIBS / Worldview": "Temperature, precipitation, SST, sea-ice concentration & SST anomaly, snow, aerosol & UV-aerosol index, carbon monoxide, soil moisture, fires, vegetation (NDVI) and shaded relief",
    "NASA Blue Marble (via NASA EOSDIS GIBS)": "The whole-Earth base picture bundled with the app (data/world-basemap.jpg — Blue Marble: Shaded Relief and Bathymetry, 2048×1024 equirectangular). It is drawn UNDER the satellite tiles so the globe is never blank while they load, and — because it is equirectangular rather than Web Mercator — it is also the OFFLINE floor for the polar caps beyond ±85.05° in the Cesium engine, where Mercator tiles cannot reach. Above it there, the caps are drawn from NASA GIBS’s tiled EPSG:4326 service (Blue Marble: Shaded Relief and Bathymetry, 500 m), because a single equirectangular image has only ONE row of pixels for its topmost 0.176° of latitude and stretches that row into a radial smear across the whole cap. Both follow the satellite basemap. In the MapLibre engine, where a single equirectangular image cannot be draped over the globe at all, the same picture is used one step more coarsely: the AVERAGE COLOR of its polar rows is measured at runtime and painted as the layer beneath everything, so the caps beyond ±85.05° are ice rather than the renderer’s clear color. That color is a measurement of this imagery, not a chosen value. Rebuilt by scripts/build-world-basemap.mjs.",
    "NOAA sea-surface currents, wind stress and temperature (CoastWatch / PolarWatch ERDDAP)": "(#R222) The ocean-current layer — 108 named currents (data/ocean-currents.json) plus the flow field as a GRID rather than a list of arrows: data/ocean-currents-field.bin.gz is the source’s own 0.25° mesh, 1,440 × 720 cells with 466,007 of them carrying flow, one byte of speed and one of bearing, and the client chooses its own spacing from the view. data/ocean-currents-months.bin.gz adds twelve monthly climatologies at 0.5° (six years of each calendar month), fetched only if a month is chosen. Rebuilt from the same three NOAA products. ⚠ The arrows and the PATHS are measured: a CLIMATOLOGICAL mean of fields spread across the whole served record, kept on the source’s own 0.25° grid, with each named current traced through that field by numerical integration (RK2, 25 km steps, loop- and closure-detecting) from a published seed on its core. Only the NAME and the seed are editorial; no geometry is copied from any map. The velocity is NOAA CoastWatch’s blended GEOSTROPHIC surface current from multi-mission satellite altimetry (Sentinel-3A/B, CryoSat-2, Jason-2/3, SARAL), and the wind-driven part is added from NOAA NCEI blended wind stress through the drifter-fitted relation of Ralph & Niiler (1999) — |u| = B·|τ|/(ρ√f), 55° cum sole, tapered inside 2.5° of the equator, which is the same decomposition OSCAR itself is built from. ⚠ WARM OR COLD IS NOW MEASURED, not derived from the flow: it is each current’s own SST against the zonal mean at the same latitude (NOAA OISST v2.1) — the textbook definition — and it is what puts the Canary (−2.9 K), California (−2.3 K), Peru (−3.1 K) and Benguela (−1.2 K) on the cold side, where the previous derivation had three of them warm or neutral. Within ±0.6 K the current is drawn grey, because the equatorial and circumpolar currents really do run along their own isotherms. All three are U.S. Government works in the public domain; the altimetric product is generated using AVISO+. Rebuilt by scripts/build-ocean-currents.mjs.",
    "JPL Solar System Dynamics — planetary satellites": "(#R208) The 177 moons drawn around the other planets (data/moons.json) — mean orbital elements INCLUDING the mean anomaly at epoch 2000-01-01.5 TDB, which is the number that makes a moon’s position an answer rather than an arrangement, plus each satellite’s own reference plane (the ecliptic, or that planet’s local Laplace plane with its pole). Mean radii from the companion physical-parameters table. Rebuilt by scripts/build-moons.mjs.",
    "Hipparcos Catalog (ESA 1997) — CDS I/239": "The 98,887 stars behind the globe in dark mode (data/stars.bin — right ascension, declination, V magnitude, B−V color index and (#R208) the measured parallax, to V 9.5). Positions are precessed from J2000 to the map’s own clock and rotated by Greenwich Mean Sidereal Time, so the sky is the real sky for that instant; sizes come from the measured magnitudes and colors from the measured B−V. Going this far past the naked-eye limit is also what draws the Milky Way: that band is not a painted gradient, it is where the stars actually are. Served by the Strasbourg astronomical Data Center (CDS); the Bright Star Catalog (Hoffleit & Warren 1991, Harvard–Smithsonian TDC) remains the build’s fallback source. Rebuilt by scripts/build-star-catalog.mjs.",
    "NASA/JPL Horizons — interplanetary spacecraft trajectories": "(#R213) The “Spacecraft” population in Explore space (data/spacecraft.json): 17 vehicles — Voyager 1 and 2, Pioneer 10 and 11, New Horizons, Parker Solar Probe, Solar Orbiter, Juno, JUICE, Europa Clipper, Lucy, Psyche, BepiColombo, Hayabusa2, OSIRIS-APEX, JWST and Gaia. Heliocentric J2000-ecliptic position AND velocity sampled at a per-spacecraft step (90 days for Voyager, 3 days for Parker), interpolated on the client with a cubic Hermite so the reconstructed path is reproduced rather than chorded. ⚠ Horizons answers without CORS headers, so this is fetched at BUILD time and bundled; and ⚠ a trajectory is not telemetry — Pioneer 10 and 11 stopped answering in 2003 and 1995 and Gaia was passivated in 2025, so what is drawn for them is a propagated position, which the panel says outright. Outside a kernel’s stated coverage the app says the file does not know rather than repeating the last point silently. U.S. Government work — not subject to copyright. Rebuilt by scripts/build-spacecraft.mjs.",
    "NASA/JPL Small-Body Database (SBDB)": "(#R213) The “Asteroids & comets” population in Explore space (data/small-bodies.json): 1,142 objects. The bulk sets are defined by measurement, not by taste — every asteroid at least 150 km across, every trans-Neptunian object brighter than H 5.5, every NUMBERED (i.e. confirmed-returning) comet, and every potentially hazardous asteroid brighter than H 18 — plus an explicitly editorial list of spacecraft targets and famous bodies, including the three interstellar objects. Osculating heliocentric elements, propagated two-body on the client: elliptic from the time of perihelion, hyperbolic for e>1 and Barker’s equation at e=1. ⚠ Osculating elements describe the orbit at ONE epoch; planetary perturbations (and, for an active comet, non-gravitational jetting) move the real body off that ellipse over years. Good enough to see where a body is in the solar system, not good enough to point a telescope. SBDB has no CORS headers, so this is bundled at build time. U.S. Government work. Rebuilt by scripts/build-smallbodies.mjs.",
    "SIMBAD — CDS, Strasbourg (deep-sky objects and their published distances)": "(#R213) The “Beyond the solar system” population in Explore space (data/deep-sky.json): 150 objects — all 110 Messier objects plus the Local Group, the nearest large galaxies, the Galactic Centre and the Virgo, Coma, Fornax and Sculptor groups. Positions and object types from SIMBAD’s `basic` table; the distance is the MEDIAN of every distance measurement SIMBAD carries for that object (`mesDistance`), with the number of measurements and the quartiles kept beside it. ⚠ A published distance is a measurement with a method behind it, and methods disagree — Cepheids, the tip of the red-giant branch, Tully-Fisher, surface-brightness fluctuation and redshift can differ by tens of per cent, which is what the quartiles state. 131 of the 150 have a published distance; the other 19 are drawn on the celestial sphere WITHOUT depth rather than being given an invented one. This is also what sets how far the camera may pull back: the ceiling is the furthest measured object (about 72 Mpc), not an arbitrary number. Wenger et al. 2000, A&AS 143, 9 — please cite SIMBAD if you reuse it. Rebuilt by scripts/build-deepsky.mjs.",
    "REST Countries": "Country reference facts (capital, currency, languages, borders) for the info page",
    "NASA FIRMS": "Active fire / thermal anomalies",
    "RainViewer": "Live precipitation radar & IR clouds",
    "Open-Meteo": "Elevation (incl. the Copernicus-DEM grid for Atlas below/above-sea-level highlights), wind field, the right-click live weather popup (current conditions + 5-day forecast) & live weather / air-quality / sea-temperature / elevation readings for widgets and Atlas integrated analysis; the live space+time wind/temperature/precipitation field driving the Atlas radiation-dispersion simulation",
    "Open-Meteo Marine": "Hourly sea level above MSL for the Tides layer, and — (#R216) — the ocean-current velocity and direction plus the sea-surface temperature that the Ocean currents layer draws its arrows from and classifies warm/cold with (the temperature is compared with the same model ~110 km upstream along the flow)",
    "MET Norway (Locationforecast)": "Automatic fallback for the point-weather popup when Open-Meteo is unavailable (NLOD/CC-BY 4.0)",
    "OSRM (Open Source Routing Machine)": "Atlas road directions — turn-by-turn driving/walking/cycling routes on OpenStreetMap road data (public demo servers router.project-osrm.org & routing.openstreetmap.de; ODbL)",
    "Transitous / MOTIS": "Atlas public-transit directions — real train/subway/tram/bus/ferry routing on worldwide open GTFS feeds (api.transitous.org, MOTIS engine), returning every alternative itinerary; the origin & destination coordinates are sent to compute the itinerary. For intercity rail with no open timetable (e.g. Japan JR/Shinkansen) Atlas falls back to routing on the OpenStreetMap rail network via the Overpass API",
    "Valhalla (FOSSGIS)": "Atlas isochrone / reachable-area (\"30 min by car\", \"15 min walk\") — road-network time-contour polygons on OpenStreetMap data via the keyless public FOSSGIS Valhalla /isochrone (drive/walk/cycle); the origin coordinate + chosen minutes are sent to compute the area",
    "Google Street View": "Embedded street-level panoramas (the \"Street View here\" panel & the Atlas street-view action) via the keyless maps.google.com embed, plus the real Street-View coverage overlay & click-to-snap using Google's keyless coverage tiles (mts.google.com); imagery & coverage © Google",
    "Global Watersheds (mghydro.com)": "Live HydroSHEDS-based watershed delineation for Atlas river-basin highlights (credit: Global Watersheds, mghydro.com)",
    "GRDC / World Bank — Major River Basins of the World": "Self-hosted major-basin polygons (236 basins) for Atlas river-basin highlights (CC BY 4.0, incorporates HydroSHEDS data)",
    "OpenTopoMap": "One example tile as the contour-lines layer preview image (CC-BY-SA)",
    "USGS Earthquake Hazards Program": "Live & historical earthquakes (map layer, widget, compare & Atlas integrated analysis), and the real events the seismic-wave simulator can load as a scenario source",
    "OpenStreetMap Overpass API": "Atlas facility/POI mapping — live area queries for named facility types (oil, power plants, airports, military, …); and the named river/canal ways around a clicked river label, when Nominatim cannot answer for that river (#R217) (ODbL)",
    "Wikidata Query Service": "Atlas facility/POI mapping — second, independent facility source (curated entities with coordinates, merged with the OSM results; CC0) — (#R198) the ja/de/ru/es NAMES in the bundled world gazetteer, looked up by GeoNames id (P1566) at build time because the GeoNames alternate-name column carries no language tag — the live current-officeholder lookup (head of state / head of government) that grounds Atlas answers about national leaders, the company / ownership graph behind the Industry web layer, and (#R216) the NAMES of the world’s ocean currents with their published coordinates (CC0)",
    "GeoNames": "(#R198) (#R208) The bundled world gazetteer data/gazetteer-world.json.gz — 147,924 populated places across 242 countries (coordinates, population and country from the cities1000 export; names in 18 languages from alternateNamesV2, which unlike the inline column carries an ISO language code per name), gzipped to 3.9 MB and un-gzipped in the browser. Built by scripts/build-gazetteer.mjs. It is what lets the non-AI news locator and the search box resolve a place ten times further down the long tail than the curated table alone. CC BY 4.0.",
    "geoBoundaries": "Administrative boundary shapes (ADM1) for Atlas region compositions — fallback boundary source (CC BY 4.0)",
    "GDELT Project": "Live worldwide news search (last 72 h) powering Atlas briefs & integrated analysis",
    "Market data (fxratesapi / ER-API · gold-api · CoinGecko · alternative.me)": "FX rates, gold/silver, crypto prices & sentiment — widgets and the bottom ticker",
    "Yahoo Finance": "Stock-index quotes for the bottom ticker, and live share prices used to compute live market caps in the Companies tab (US-listed names)",
    "Clearbit Logo API / Google favicons": "Company logos in the Companies tab — the company domain name is sent to fetch its logo (falls back to Google favicons, then a monogram)",
    "Wikipedia (Wikimedia REST API)": "Article checks for place popups + background summaries for Atlas analysis (CC BY-SA)",
    "Data centers — OpenStreetMap (telecom/man_made/building = data_center, Overpass API)": "Every data centre mapped in OpenStreetMap, queried live from the current map view (ODbL). Each point carries that object’s own tags — operator, owner, power, opening date — and the layer prints them unchanged; nothing is inferred",
    "Diplomatic missions — OpenStreetMap (amenity=embassy / office=diplomatic, Overpass API)": "Embassies, consulates and other diplomatic missions mapped in OpenStreetMap (ODbL). A global snapshot of all 17,423 of them is bundled with the app so the layer draws at any zoom; zoomed in, the current view is queried live and replaces it. Each point prints that object’s own tags and links to it; nothing is inferred",
    "Military sites — OpenStreetMap (military=*, Overpass API)": "Airfields, naval bases, barracks, ranges and danger areas tagged `military` in OpenStreetMap, queried live for the current map view (ODbL). The public record only — no site is derived from imagery analysis, and no field is estimated",
    "Power plants & grid — OpenStreetMap (power=plant/substation/generator, Overpass API)": "Power stations, substations, wind turbines and solar farms mapped in OpenStreetMap, queried live for the current map view (ODbL). Output, fuel, voltage and operator are printed from the object’s own tags; nothing is estimated",
    "Mines, quarries & wells — OpenStreetMap (landuse=quarry, man_made=mineshaft/petroleum_well, Overpass API)": "Mines, quarries, mine shafts and oil or gas wells mapped in OpenStreetMap, queried live for the current map view (ODbL). Resource and operator come from the object’s own tags",
    "Airports & air infrastructure — OpenStreetMap (aeroway=aerodrome/terminal/heliport, Overpass API)": "Airports, airfields, terminals, heliports and control towers mapped in OpenStreetMap, queried live for the current map view (ODbL). ICAO/IATA code, runway length and elevation are printed only where the object carries them",
    "Ports, harbours & terminals — OpenStreetMap (harbour, landuse=port, ferry terminals, Overpass API)": "Ports, harbours, ferry terminals, container and cargo terminals and cranes mapped in OpenStreetMap, queried live for the current map view (ODbL)",
    "Water & wastewater plant — OpenStreetMap (man_made=water_works/wastewater_plant/pumping_station, Overpass API)": "Water works, wastewater treatment plants, pumping stations, water towers and reservoirs mapped in OpenStreetMap, queried live for the current map view (ODbL)",
    "Universities & research institutes — OpenStreetMap (amenity=university/college/research_institute, Overpass API)": "Universities, colleges, research institutes, observatories and research libraries mapped in OpenStreetMap, queried live for the current map view (ODbL)",
    "Emergency services — OpenStreetMap (fire_station / police / ambulance_station, Overpass API)": "Fire stations, police stations, ambulance stations and mountain-rescue posts mapped in OpenStreetMap, queried live for the current map view (ODbL)",
    "Spaceports & satellite ground stations — OpenStreetMap (aeroway=spaceport, man_made=launch_pad/satellite_dish, Overpass API)": "Launch pads, spaceports, satellite ground stations and radio telescopes mapped in OpenStreetMap (ODbL). A global snapshot of all 13,310 of them is bundled with the app — there are about thirty spaceports on Earth, so asking «what is in this rectangle» answers «nothing» almost everywhere — and the current view is queried live once zoomed in",
    "Health facilities — OpenStreetMap (amenity=hospital/clinic/doctors/pharmacy, Overpass API)": "Hospitals, clinics, doctors’ surgeries and pharmacies mapped in OpenStreetMap, queried live for the current map view (ODbL). Beds, speciality, operator and opening hours appear only where that object carries the tag",
    "Telecom & internet infrastructure — OpenStreetMap (telecom=*, communications towers, Overpass API)": "Internet exchanges, telephone exchanges, communication masts and towers mapped in OpenStreetMap, queried live for the current map view (ODbL) — the physical plant the network runs on",
    "AWS Global Infrastructure — regions": "The official list of AWS Regions and their locations, used for the cloud-region points in the Data centers & AI infrastructure layer (a region is the location the operator publishes, not a surveyed building)",
    "Microsoft Azure — datacenter locations": "Microsoft’s own datacenter-region map, used for the Azure points in the Data centers & AI infrastructure layer",
    "Google Cloud — locations": "Google Cloud’s published region and owned-campus locations, used for the Google points in the Data centers & AI infrastructure layer",
    "Oracle Cloud — public cloud regions": "Oracle’s published OCI region list, used for the Oracle points in the Data centers & AI infrastructure layer",
    "Meta — data centers": "Meta’s own data-centre site list, used for the Meta campus points in the Data centers & AI infrastructure layer",
    "TOP500 — supercomputer sites": "The TOP500 list of the world’s fastest supercomputers, used for the HPC / research-computing points in the Data centers & AI infrastructure layer",
    "Live cameras — OpenStreetMap (Overpass API)": "Public webcam points worldwide, queried live from OSM by map view (the contact:webcam / webcam tags, ODbL) and FILTERED to cameras that actually display live imagery in-app — refreshing image / YouTube-live / Roundshot · Panomax 360° / video (link-out-only cams are dropped); the still image auto-refreshes in the popup (no API key)",
    "Transport for London — JamCams": "~880 live London traffic cameras (keyless TfL Unified API, \"JamCam\" places) — each a refreshing JPEG + short clip, shown auto-refreshing in the Live-cameras layer (Powered by TfL Open Data; contains OS data © Crown copyright)",
    "Caltrans — California DOT CCTV": "~3,300 live California traffic cameras (keyless open CCTV-status JSON across all 12 districts) — each a direct refreshing JPEG, shown auto-refreshing in the Live-cameras layer (© California Department of Transportation)",
    "Fintraffic / Digitraffic — Finland road-weather cameras": "811 Finnish road-weather camera stations / 2,272 live views (keyless, CORS-open Digitraffic API) — deterministic direct JPEGs, shown auto-refreshing with a per-station view switcher in the Live-cameras layer (© Fintraffic, CC BY 4.0)",
    "OpenTrafficCamMap — US state DOT cameras": "1,815 more US live traffic cameras (Colorado / Indiana / Alaska / Arizona DOTs) from the MIT-licensed OpenTrafficCamMap open dataset, served keyless from the jsDelivr CDN (pinned commit); only feeds whose images verifiably hotlink are shown. Imagery © the respective state DOTs",
    "US / Canada DOT “511” traffic cameras": "~17,000 more live traffic cameras across 13 US-state / Canadian-province DOT “511” networks (Florida, Georgia, New York, Pennsylvania, North Carolina, Nevada, Wisconsin, Idaho, Louisiana, New England, Ontario, Alberta, Yukon) on the shared “511” map platform. Each site’s camera list is fetched once via a public CORS relay (the endpoints send no CORS header); every image hotlinks directly and auto-refreshing in the Live-cameras layer. Imagery © the respective state / provincial DOTs",
    "Mapzen / AWS Terrain Tiles — elevation model (DEM)": "Keyless public \"terrarium\" terrain-RGB tiles (AWS Open Data). Decoded client-side into an elevation sampler that powers slope/aspect analysis, the line-of-sight viewshed, RF coverage, the terrain-sculpting & water-routing simulator, the terrain-shadow and annual sunlight-hours engine, and flood/tsunami inundation. Built from SRTM, ETOPO1, and national elevation sources — see the registry for full attribution",
    "IASP91 reference Earth model — Kennett & Engdahl (1991)": "The radial P- and S-velocity model the seismic-wave simulator ray-traces through to obtain P/S travel times, the travel-time curve’s triplications and the core shadow zone. Verified against published IASP91 tables (P at 30°/60°/90° within a few seconds)",
    "Brune (1970) source model · Hanks & Kanamori (1979) · Boore stochastic method": "The point-source ground-motion chain in the seismic simulator: seismic moment from magnitude, corner frequency from stress drop, far-field spectrum with trilinear geometrical spreading, anelastic attenuation and quarter-wavelength site amplification, converted to peak values by random-vibration theory",
    "Wald, Quitoriano, Heaton & Kanamori (1999) — PGV → Modified Mercalli intensity": "The relation the seismic simulator uses to state an intensity (MMI = 3.47 log10 PGV + 2.35). MMI, not the JMA shindo scale; shown only inside the range the relation was regressed on",
    "Wald & Allen (2007) — topographic slope → Vs30 site proxy": "The USGS global site-condition proxy the seismic simulator uses to paint a terrain-aware intensity field: Vs30 estimated from real-DEM topographic slope (active-tectonic table), entering quarter-wavelength site amplification cell by cell. Sea cells and cells without DEM are reported, not painted",
    "気象庁「計測震度の算出方法」 (JMA instrumental seismic intensity)": "(#R192) The JMA shindo the simulator shows is computed by the JMA’s own definition rather than converted from PGV: the period-effect, 10 Hz high-cut and 0.5 Hz low-cut filters are applied to the model’s acceleration spectrum, the level a₀ exceeded for a TOTAL of 0.3 s is solved for by random-vibration theory, and I = 2·log₁₀ a₀ + 0.94. The three components are isotropised at V/H = 2/3 rather than simulated separately, which the panel states. It replaces the Fujimoto & Midorikawa (2005) PGV regression used up to #R191.",
    "Okada (1985) · Wells & Coppersmith (1994) · Atkinson & Silva (2000)": "(#R192) Okada’s closed-form surface deformation of a rectangular dislocation gives the co-seismic sea-floor displacement the tsunami propagation model starts from (verified against the published test case before use); Wells & Coppersmith’s reverse-fault scaling gives the rupture length, width and slip from the magnitude; and Atkinson & Silva’s two-corner source spectrum replaced the single Brune corner in the ground-motion chain, which under-predicted the intermediate frequencies of great earthquakes. (#R193) The Okada field is now summed over a tapered 8 × 3 sub-fault grid, re-normalized so the seismic moment is exactly the one the magnitude implies.",
    "Kotani et al. (1998) — Manning roughness for tsunami run-up computation": "(#R193) The bottom-friction coefficient the tsunami propagation model uses (Manning n = 0.025 s·m^(−1/3) over an ocean floor), the value the Japanese operational long-wave models are run with. Friction is negligible in deep water (it scales as the total depth to the −7/3) and is what limits the wave over a continental shelf, so an unfrictioned long-wave model over-predicts coastal amplitude.",
    "Kasten & Young (1989) air mass · Meinel & Meinel clear-sky beam": "The clear-sky direct-normal irradiance behind the annual sunlight-hours engine (1361 W/m² · 0.7^AM^0.678). A clear-sky figure computed from the site’s own terrain horizon — not a weather forecast and not a yield estimate",
    "GEBCO 2020": "Ocean bathymetry (depth readout)",
    "AWS Terrain Tiles": "3D terrain, hillshade & contour generation",
    "Beck et al. Köppen-Geiger (2018)": "1 km climate-zone classification",
    "MarineRegions": "Maritime EEZ / territorial-sea boundaries",
    "TeleGeography Submarine Cable Map": "Submarine telecom cable routes",
    "NASA SEDAC GPW v4": "Gridded population density",
    "UNDP / EIU / SIPRI / World Bank": "HDI (1990–2022 annual series), Democracy Index, GDP, military spend, demographics",
    "AISstream.io": "Live ship AIS traffic (your key)",
    "airplanes.live": "Live aircraft traffic (community ADS-B; also samples the aircraft-layer preview image)",
    "CelesTrak": "Orbital element sets (GP/OMM, the modern successor to the two-line element set) for the live-satellite layer, by catalogue group. Keyless and CORS-open; free for non-commercial use with attribution. Positions are NOT downloaded — the element sets are, once every two hours, and every position on screen is propagated locally from them with SGP4/SDP4 (satellite.js, MIT), so panning and time do not cost requests. TWO THINGS ARE ALSO SHIPPED WITH THE APP, both rebuilt from this same source by CI: data/tle/catalogue.tle, a real snapshot of the `active` catalogue with a real epoch, so the layer still draws when celestrak.org cannot be reached (the app states how old the elements it used are); and data/tle/groups.json, the NORAD catalogue numbers belonging to each CelesTrak group, so that a request for one CATEGORY can be answered from that snapshot instead of drawing nothing. Group membership is not derivable from an element set and is never inferred from an object’s name — a group whose listing could not be fetched is recorded as absent rather than as empty",
    "satellite.js": "The SGP4/SDP4 orbit propagator behind every satellite position, footprint, ground track, look angle and pass prediction in the app (MIT license). Verified against Vallado’s canonical test vector to 7 micrometres and against the live ISS elements (436.6 km, 7.650 km/s, 92.96 min, 51.631°)",
    "Planespotters.net": "Photograph of the individual airframe on the live-aircraft detail card, looked up by the ICAO 24-bit address the ADS-B feed reports. Keyless public photo API, free for non-commercial use; every photo is shown with its photographer’s credit and links back to the original — no photo is cached or re-hosted, and nothing is sent about you (the aircraft’s hex code is the whole request)",
    "NOAA SWPC": "Aurora oval (OVATION) & planetary K-index — the aurora layer and its preview image",
    "Natural Earth": "Country borders & polygons; time-zone boundaries (the Time-zones layer); and (#R192) the bundled land/sea mask data/land-mask.png — the 1:50m physical land polygons rasterised to a 1-bit 2048×1024 equirectangular grid by scripts/build-land-mask.mjs, so the intensity field can tell land from sea without asking the network (it used to read terrain tiles for this, and painted the ocean whenever too few of them arrived). Public domain.",
    "AWS Terrain Tiles — the bundled global sea floor": "(#R197) data/bathymetry.png — the same public terrarium elevation data, read once at build time over the whole world (scripts/build-bathymetry.mjs) and shipped as a 1440×720 (0.25°) grid carrying the mean depth of each cell’s sea samples and that cell’s sea fraction. It is what the GLOBAL tsunami propagation model integrates over, so every cell on the planet has a measured depth before the first time step instead of the app fetching a thousand tiles and modeling the ones that arrived. Bathymetry from ETOPO1; see the registry for full attribution.",
    "Solar System Scope — planetary surface textures": "(#R197) The equirectangular surface maps the space explorer draws each world with (data/planets/*.jpg — every world except the Earth, which since #R203 is drawn with the app’s own data/world-basemap.jpg so that the space explorer and the map show ONE Earth), assembled by Solar System Scope from NASA/JPL/USGS imagery — MESSENGER for Mercury, Magellan radar for Venus, LRO for the Moon, Viking/MOLA for Mars, Cassini and Voyager for the giants. Shipped byte-for-byte as published. Licensed CC BY 4.0. Pluto is NOT among them and is drawn in its measured color rather than with an invented surface.",
    "USGS Gazetteer of Planetary Nomenclature": "(#R197) The IAU-approved place names on the other worlds (data/planet-names.json) — 2,772 features on Mercury, Venus, the Moon, Mars and Pluto with their published center coordinates, diameters and feature types, so a planet is labeled the way the Earth is. Public domain; the IAU is the naming authority.",
    "OpenRailwayMap / OpenSeaMap": "Global rail infrastructure & nautical seamark overlays (raster tiles, beta)",
    "Wikipedia / Wikimedia": "Information cards & imagery",
    "Public CORS relays (allorigins.win, corsproxy.io, corsfix.com, codetabs.com)": "(#R214) NOT a data source — a way of REACHING one. Google News RSS, some “511” traffic-camera indexes and a few other feeds send no Access-Control-Allow-Origin header, so a browser cannot read them directly; these public relays fetch the document server-side and re-serve it with the header. What a relay sees is the URL being requested (a public feed address) and the connection itself; no account, no coordinates and no personal data are ever sent through one. All four are raced with an 8-second deadline each and the losers are aborted, so one that is down or slow cannot hold the page. ⚠ THEY ARE NOT INTERCHANGEABLE PER TARGET, and that is measured rather than assumed: on this build Google served the en-US news edition through corsproxy.io in 5 ms and answered the SAME proxy with its “Sorry…” bot page (503) for the ja-JP edition — which is why the Japanese feed was blank until a fourth relay was added. Where a relay is used it is stated in the entry for the source itself.",
    "Google News": "News headlines (RSS) — fetched & geolocated server-side; also queried live from the browser for Atlas web search (topic name sent). Each item’s ORIGINATING OUTLET is carried by the feed itself (Google News appends it to the headline after the last \" - \"), and that is where the Settings ▸ News outlets list comes from: the outlets offered are the ones the current feed actually delivers, counted, rather than a list maintained here. Choosing outlets filters what is displayed; it does not change what is fetched, and no outlet name is ever inferred",
    "OpenFreeMap / OpenMapTiles": "Vector place labels & 3D building footprints",
    "Google Fonts (Noto Sans JP / SC / TC)": "(#R242) NOT a data source — the Japanese, Simplified-Chinese and Traditional-Chinese TYPEFACES the app draws its text with, when the interface is in one of those languages. Google Fonts splits each of them into about 120 unicode-range subsets, so a page fetches the ~30 KB its own glyphs need instead of a 5 MB font; bundling all three whole would be ~25 MB in the repository and 5–10 MB on every CJK reader. What the font server sees is the request for a font file and the connection itself — no account, no coordinates, no personal data. Every other face the app uses (Inter for Latin/Cyrillic, Pretendard for Korean, and the map’s own Inter glyph atlases) is served from this site and reaches no third party at all; see fonts/README.md.",
    "Inter / Pretendard (bundled, SIL OFL 1.1)": "(#R242) The Latin/Cyrillic and Korean typefaces, bundled with the site — including the SDF glyph atlases the MAP’s own labels are drawn from, generated from Inter by scripts/build-glyphs.mjs (no public glyph server publishes Inter). Licences and attribution: fonts/README.md.",
    "ESA WorldCover": "10 m global land-cover classification",
    "RESOLVE / WWF Ecoregions 2017": "Terrestrial ecoregions",
    "Smithsonian GVP": "Holocene volcanoes",
    "DeepStateMap": "Ukraine frontline (beta layer)",
    "historical-basemaps (aourednik)": "Historical borders — the beta overlay layer, and the automatic fallback for the map’s own past-year borders (nearest snapshot)",
    "CShapes 2.0 (Schvitz et al., ETH Zürich)": "Yearly international borders 1886–2019 for the time machine (each border change dated to the year; self-hosted simplified copy). The 1945–2019 East/West/unified Germany borders were rebuilt from the authoritative modern Bundesländer (deutschlandGeoJSON, © GeoBasis-DE / BKG) so the inner-German border matches reality.",
    "Maddison Project Database 2020 (Bolt & van Zanden)": "Authoritative HISTORICAL real GDP (constant 2011 international $) & population back to 1900 for the Time-machine — the Countries tab, choropleths & country comparison when traveling before the World Bank’s 1960 floor and for dissolved states (Former USSR/Yugoslavia/Czechoslovakia are first-class Maddison entities)",
    "World Bank Open Data": "Per-country time-series indicators (time-series charts, the 5-country comparison, and the Time-machine — the whole Countries tab, the hover read-outs and the country choropleths show the real figures for the year the master clock is set to)",
    "IMF World Economic Outlook": "Govt-debt layer gap-fill + the alternative economic source in the country comparison (DataMapper API)",
    "WorldPop (University of Southampton)": "Population inside a drawn area / circle / place boundary — summed from the ~100 m global population grid via the WorldPop stats API",
    "AI provider — OpenAI (Anthropic / Google selectable)": "Server-side AI (key held server-side): Atlas assistant, news geolocation, in-app AI features, and web search for current-events questions",
    "Annual precipitation, 1981–2010 normal — CHELSA V2.1 bio12 (30 arc-seconds, ~1 km)": "Bundled with the app: mean annual precipitation for 1981–2010 at 30 arc-seconds (about 1 km at the equator), reprojected into the same Web-Mercator frame as the Köppen rasters and masked to land. It is the field the country-average precipitation choropleth averages away. Its 16-bit storage saturates at 6,553 mm, so the very wettest places are shown at that ceiling.",
    "Annual precipitation by year, 1981–2020 — GPCC Full Data Monthly V2022, Deutscher Wetterdienst (0.5°, gauge analysis over land)": "Bundled with the app: the twelve monthly totals of each year summed into an annual total, on the German Weather Service’s 0.5° rain-gauge analysis over land, 1981 through 2020. Chosen over satellite precipitation because IMERG’s annual accumulations sit behind an Earthdata login and the openly published product is an instantaneous rate, which cannot be summed into a year in a browser. A gauge analysis says nothing about the ocean, so the sea is empty.",
    "Religion and language composition by country — CIA World Factbook (US Government work, public domain)": "Bundled with the app: the Factbook’s own «Religions» and «Languages» fields, parsed into a share per group per country — 202 countries for religion and 196 for language, each with the year the Factbook states. It is what lets the religion layer separate Catholic, Protestant and Orthodox. Where the Factbook does NOT separate the denominations — the United Kingdom’s entry reads «Christian (includes Anglican, Roman Catholic, Presbyterian, Methodist)» — neither does the map.",
    "気象警報・注意報 — 気象庁 (Japan Meteorological Agency, bulletin list r8, by municipality)": "Read live for the warnings layer: the JMA's own bulletin list, the file its warning page requests. The state is the newest bulletin per office, and Japan is painted at the municipality (class20), which is the unit the JMA issues at.",
    "気象庁の警報階級と配色 (JMA warning levels 20/30/40/50 and their published colours)": "The JMA's own level table and the colours its warning page publishes for them — 注意報 #f2e700, 警報 #ff2800, 危険警報 #aa00aa, 特別警報 #0c000c and #c8c8cb for 「nothing in force」. Read from that page rather than written from memory.",
    "行政区域データ（市区町村界）— 国土交通省 国土数値情報 N03 (via smartnews-smri/japan-topography)": "Japan's municipal boundaries, from the Ministry of Land's National Land Numerical Information. The warnings layer keys them on the JIS X 0402 code, which is the first five digits of a JMA class20 area code — that is how a JMA warning becomes a shape.",
    "Weather warnings, United States — NOAA National Weather Service (api.weather.gov, CAP)": "Read live for the warnings layer: every alert the US National Weather Service currently has in force, with its own polygon, grouped in the tap by state. Fetched directly by the browser — this service sends the CORS header.",
    "Warnungen — Deutscher Wetterdienst GeoServer (Warnungen_Landkreise, WFS)": "Read live for the warnings layer: the DWD's warnings WITH their Landkreis polygons attached. MeteoAlarm relays the same warnings without any geometry, so Germany is read from its own service and drawn at the district.",
    "Farevarsler — MET Norway MetAlerts 2.0": "Read live for the warnings layer: MET Norway publishes its CAP set as GeoJSON with the affected polygon on every alert, so Norway is drawn at the area the alert itself names.",
    "Avisos meteorológicos — INMET (Instituto Nacional de Meteorologia, Brazil)": "Read live for the warnings layer: INMET's active warnings, which carry their own polygon, grouped in the tap by state. Its three severity bands are the agency's own words.",
    "Weather warnings, Australia — Bureau of Meteorology": "Read live for the warnings layer: the Bureau of Meteorology's warning list. It carries no geometry, so each warning is drawn on the STATE the BoM files it by.",
    "Weather warnings, Hong Kong — Hong Kong Observatory Open Data (warnsum)": "Read live for the warnings layer: the signals the Hong Kong Observatory currently has hoisted. Its warnings are territory-wide, so the territory IS the issuing unit.",
    "Weather advisories, the Philippines — PAGASA-DOST public alert feed (CAP)": "Read live for the warnings layer: PAGASA's public CAP index. Its flood advisories carry one area per PROVINCE with a real polygon, which is what the Philippines is drawn at.",
    "災害告警 — 中央氣象署 CWA (Taiwan), via the NCDR CAP aggregator": "Read live for the warnings layer: the CWA's own bulletins, taken from Taiwan's NCDR CAP aggregator and filtered to that agency. Areas with a polygon are drawn as published; the rest name a township, which is the unit the CWA issues them at.",
    "Weather warnings, New Zealand — MetService public CAP alerts": "Read live for the warnings layer: MetService's public CAP index. It was EMPTY when this was wired — a state, not a failure — and the panel says so rather than implying calm.",
    "Weather warnings, Canada — Environment and Climate Change Canada (OGC API — Features)": "Read live for the warnings layer: the alerts Environment and Climate Change Canada currently has in force, with their own polygons, grouped in the tap by province. Fetched directly by the browser because this service sends the CORS header itself.",
    "Weather warnings, Europe — MeteoAlarm (EUMETNET), 35 national services": "Read live for the warnings layer: the warnings each European national weather service has in force, as MeteoAlarm publishes them, grouped in the tap by region. MeteoAlarm sends no CORS header and one country’s feed is about ten megabytes — most of it the same warnings in eight languages — so the app’s own relay fetches and summarises it server-side. The summary is a projection, not an edit: every warning in the feed produces a row.",
    "Weather warnings, China — China Meteorological Administration public warning list": "Read live for the warnings layer: the China Meteorological Administration’s public list of warnings currently in force. It carries no geometry, so the country is washed with the highest level in force and the tap lists the warnings grouped by province — the province comes from the division code the warning id begins with. Fetched through the app’s own relay because the service sends no CORS header.",
    "Weather warnings worldwide — national meteorological services via the WMO Severe Weather Information Centre (CAP)": "Read live for the warnings layer, for every country with no feed of its own above: each national meteorological service's OWN warnings, republished verbatim by the WMO with the polygon that service drew, its own wording and its own CAP severity. The WMO is the transport, not the author — the panel names the issuing service. Fetched through the app's own relay, which also asks one geometry-free query first to find which members have anything in force at all.",
    "WMO Members and their CAP implementation status (which national service files CAP, and which does not)": "Read once per session: the WMO's own record of which member's CAP implementation is Completed. Only those countries are drawn as covered — painting «nothing in force» grey over a country that files nothing would be exactly the claim the hatched pattern exists to avoid.",
  }
});
