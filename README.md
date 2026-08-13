<div align="center">

# IntMap

### Explore the world across place, data, and time.

A browser-based geospatial platform that brings geography, climate, infrastructure, history, statistics, current events, and interactive tools together on one map.

[**Open IntMap**](https://rwmqx7dwb5-arch.github.io/IntMap/) · [What IntMap is](https://rwmqx7dwb5-arch.github.io/IntMap/about.html) · [**Support IntMap**](https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en) · [Report an issue](https://github.com/rwmqx7dwb5-arch/IntMap/issues)

**Free to use · No ads · No installation required**

</div>

---

## What is IntMap?

> If you would rather see it than read about it, the [**overview page**](https://rwmqx7dwb5-arch.github.io/IntMap/about.html) covers the same ground in a few minutes of screenshots of the running app — in English or 日本語.

IntMap is the map I wanted but could not find: one place where I could explore the world through whatever location, period, or type of data interested me.

It combines the functions of a world atlas, data explorer, historical map, news map, geographic toolkit, and experimental playground. Instead of moving between separate websites, you can place different kinds of information on the same map and examine how they relate.

IntMap is primarily designed for people interested in geography and international affairs, while aiming to make advanced geographic tools approachable through a visual interface and Atlas, its built-in AI interface.

## What you can do

* Combine more than a hundred geographic and statistical layers
* Follow a country's goods trade partner by partner, by commodity and by year
* Read a country's electricity and primary-energy mix as a composition, not a single colour
* See the weather and disaster warnings an agency has actually issued, at the unit it issued them for
* Look up high and low water anywhere on a coast, and how far the tide reaches over real terrain
* Explore climate, terrain, ecology, population, economics, infrastructure, and strategic geography
* Move between historical periods using the Time Machine
* Compare countries through rankings, charts, tables, and correlation analysis
* View recent world news at the location where events occurred
* Monitor aircraft, earthquakes, weather, fires, volcanoes, and other changing information
* Measure distances and areas, draw regions, and inspect selected locations
* Use Atlas to control many parts of the application through natural language
* Switch between flat, globe, satellite, and 3D terrain views
* Explore experimental modes such as the Flight Simulator and World Explorer

## Explore information on one map

The Information section is the largest part of IntMap.

Layers cover areas including:

* Physical geography and terrain
* Climate zones and weather
* Population and economic indicators
* Roads, railways, airports, ports, pipelines, and submarine cables
* Land cover, vegetation, ecosystems, and environmental conditions
* Earthquakes, volcanoes, tectonic plates, fires, and other natural hazards
* Political borders and administrative divisions
* Historical countries and borders
* International organizations and regional groupings
* Military expenditure, nuclear sites, front lines, and strategic infrastructure
* Live aircraft and optional live ship traffic — click an aircraft for a photograph of that airframe, its full ADS-B readout, and a one-click flight from its own position, altitude, heading and airspeed
* Ocean surface currents, named and drawn as arrows sized by measured speed, with warm and cold currents separated by their poleward flow rather than by assumption
* Satellite and Earth-observation data
* Bilateral goods trade, electricity and primary-energy mix, crop yields, tides, and live weather and disaster warnings

Layers can be combined rather than viewed in isolation. For example, you can place population density over terrain, compare railway networks with economic indicators, or examine a current event alongside the geography and infrastructure surrounding it.

Some live and satellite services require a separate provider key, which is stored only in the browser.

## Time Machine

The Time Machine lets you explore changes from 1900 to the present.

Depending on the selected year and available data, it can update:

* Countries and political borders
* Historical states
* Population and GDP data
* Country rankings and comparisons
* NATO and European Union membership
* Climate-period layers
* Bilateral trade (1995-2024), energy mix, and crop yields

Historical coverage is not equally detailed for every year or region. Borders and historical data may be simplified, approximate, or based on the closest available dataset.

## Atlas

Atlas is the interface connecting IntMap’s map, data, tools, and analysis.

Instead of locating every control manually, you can describe what you want to explore.

Examples:

```text
Show railways and population density in Japan.

Take me to the Strait of Hormuz.

Show Europe in 1945.

Compare Germany, France, and Italy.

Turn on earthquakes and volcanoes.

Find nuclear sites near major rivers.

Change the map to a globe and show country borders.
```

Atlas can navigate the map, control layers, select and compare countries, activate tools, change historical periods, and perform a growing range of geographic actions.

It does not yet operate every feature reliably. Complex multi-step requests, current-information research, and newly added tools may fail or produce incomplete results.

Built-in AI is currently free for logged-in users, with a limit of up to 10 uses per day. Most non-AI map features can be used without an account.

Atlas may make factual or operational mistakes. Important information should always be checked against its original source.

## Countries

The Countries section provides a structured way to explore and compare national data.

Available tools include:

* Country profiles
* Global rankings
* Numeric filters
* Historical time-series charts
* Multi-country comparison
* Bar charts and data tables
* CSV export
* Pearson and Spearman correlation
* Regression and residual maps

Current data is generally more complete than historical data. Availability varies between countries, years, and indicators.

## Recent world news

IntMap places recent headlines on the map according to the location of the reported event.

You can switch between:

* **Subject** — where the event happened
* **Publisher** — where the news organization is based

The News section also supports searching, saved articles, multiple news languages, and optional AI-assisted title translation.

News collection and geographic classification are still being improved. Locations, translations, dates, and summaries may occasionally be incomplete or incorrect.

IntMap is not intended to replace a dedicated news service.

## Experimental exploration

IntMap also includes less serious, experimental ways to explore the world.

### Flight Simulator

Fly an aircraft directly over the same globe, terrain, and geographic environment used by IntMap.

You can also start a flight from a real airplane: click any aircraft in the live traffic layer and take off from exactly where it is, at its reported altitude, on its heading, at its airspeed.

The simulator is under active development and is not intended to match a dedicated professional flight simulator. Desktop use is recommended.

### World Explorer

A satellite-based geography challenge that places you somewhere on land and asks you to identify the location.

### Quiz

Test geographic knowledge directly through the map.

Other experimental features may appear, change substantially, or be removed as development continues.

## Beyond the map

Keep zooming out and the map does not stop at the edge of the world. There is no button: the same
gesture carries the Earth you were looking at into the solar system, at the same size, showing the
same face, at the same instant — and back again the same way.

* The Sun, the eight planets, Pluto and the Moon, positioned from published orbital elements rather than drawn to look right
* 177 satellites of the other planets, each propagated in the reference plane its own published elements declare
* Stars placed at their measured distances from Hipparcos parallaxes, so pulling far enough away actually changes the constellations. Where a parallax is not usable — about four percent are negative, which is measurement noise, not a nearby star — the star is placed at the furthest distance that *was* measured and reported as a lower bound rather than invented
* The sky from a point on the ground: right-click anywhere for the view from there at any date and time, with the real horizon computed from terrain, so mountains hide the stars they actually hide

## Interface

IntMap supports:

* Flat and globe projections
* Satellite imagery
* 3D terrain
* Light and dark themes
* Custom accent colors
* Solid and translucent sidebars
* Metric and imperial units
* Celsius and Fahrenheit
* Localized or English place labels
* Favorite layers
* Layer search and visual previews
* Screenshots and shareable map views - the link carries the layers, the camera (including its
  angle and 3-D terrain), the point in time, and the numbers typed into a simulation, so a shared
  view reopens on the same answer. A reload restores the same session, and falls back to the map
  alone if the previous attempt did not survive
* An explanation of the method behind every simulation - Settings > Science & logic
* Desktop keyboard shortcuts

Desktop users can also enable **Window Workspace**, which turns the map, Information, News, Countries, Layers, and Atlas into movable and resizable windows. Workspace layouts are saved locally.

The mobile interface supports most standard map features, although complex tools and experimental modes may work better on a larger screen.

## Languages

The interface currently supports:

* English
* 日本語
* Deutsch — beta
* Русский — beta
* Español — beta

Place-name labels support the same languages. Some recent or deeply nested content may still fall back to English or Japanese.

Atlas normally responds in the language used in the request.

## Free and ad-free

IntMap is currently free to use and does not display advertising.

Most map and data features are available without registration. An account is mainly required for built-in AI access and certain account-linked settings.

The project is being developed with the intention of remaining free of advertising.

## Current status

IntMap is under active development.

Some datasets, news features, Atlas actions, routes, live integrations, mobile interfaces, and experimental modes remain incomplete or unstable. External services may also become unavailable, impose limits, or change without notice.

The project is best treated as an evolving exploration platform rather than a finished professional product.

Bug reports and feature suggestions are welcome through [GitHub Issues](https://github.com/rwmqx7dwb5-arch/IntMap/issues). Pull requests are not currently being accepted.

## About the project

IntMap is independently developed and maintained by one university student.

It began without a conventional software-development background and has grown through continuous experimentation and AI-assisted development.

The project exists for two straightforward reasons:

1. I wanted this kind of tool for myself.
2. I want to turn it into a sustainable independent product.

## Support IntMap

IntMap has ongoing hosting, data-service, and AI API costs.

Voluntary support helps keep the project online and allows its development to continue.

[**Support independent development through Stripe →**](https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en)

Support is voluntary and does not currently unlock additional features.

## Data and attribution

IntMap combines data from many public institutions, open-data projects, news publishers, map providers, and external APIs.

Sources include organizations and projects such as:

* NASA
* World Bank
* WorldPop
* USGS
* Natural Earth
* OpenStreetMap contributors
* Open-Meteo
* GDELT
* Google News
* airplanes.live (community ADS-B) and Planespotters.net (aircraft photography)
* Other weather, satellite, geographic, and statistical providers

The complete current list is available under **Settings → Data & attribution**.

Each external dataset and service remains subject to its provider’s own license, attribution requirements, access restrictions, and terms of use. Inclusion does not imply endorsement of or affiliation with IntMap.

## License

IntMap is not an open-source project.

The source code is publicly visible under the custom [IntMap Personal & Research Use License](LICENSE).

The license permits use, copying, and modification for:

* Personal, non-revenue-generating use
* Teaching and study
* Non-commercial educational use
* Non-commercial research at an academic or nonprofit institution

Redistributed copies must retain the license and attribution, and modifications must be clearly identified.

Commercial use requires a separate prior written license from the copyright holder.

Third-party data, imagery, APIs, and other external materials are governed by their own terms.

## Disclaimer

IntMap is intended for exploration, general information, and education.

It should not be relied upon for emergency response, professional navigation, academic conclusions, medical or legal decisions, financial decisions, military operations, or other safety-critical activity.

Information may be delayed, incomplete, simplified, inaccurate, or unavailable. AI-generated output may contain errors.

Historical borders and territorial classifications are technical representations derived from external datasets. They do not express support for any political position or sovereignty claim.

---

<div align="center">

**Explore the world freely—without having to know which tool to open first.**

[Open IntMap](https://rwmqx7dwb5-arch.github.io/IntMap/) · [What IntMap is](https://rwmqx7dwb5-arch.github.io/IntMap/about.html) · [Support IntMap](https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en)

</div>
