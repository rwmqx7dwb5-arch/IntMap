#!/usr/bin/env node
/* ============================================================================
 *  scripts/data-unbuilt.mjs — THE BUNDLES NO SCRIPT IN THIS REPOSITORY WRITES
 * ----------------------------------------------------------------------------
 *  check:datagov asks every bundle under data/ for a cadence (how often its upstream publishes
 *  new material of the kind it carries), and the place it looks is the GOVERNANCE declaration of
 *  the script that writes the bundle. Measured 2026-09-30, five bundles have no such script: they
 *  were converted once, by hand or by a tool that was never committed, and have been carried since.
 *  Their facts still exist — who published them, and whether a newer edition can appear — so they
 *  are stated HERE, in the same shape a builder would state them, and read by the same reader.
 *
 *  ⚠ THIS IS NOT A PLACE TO PARK A BUILDER'S DECLARATION. check:datagov fails when two scripts
 *  declare the same bundle, so the day a builder for one of these is committed, its own GOVERNANCE
 *  must take the row and this file must lose it. What remains here is the list of bundles that
 *  cannot be rebuilt from this repository — which is itself a fact worth reading.
 *
 *  ⚠ NOTHING RUNS. Executing this file does nothing; it exists to be read (statically) by
 *  scripts/data-governance.mjs.
 * ==========================================================================*/
import { AUTHORED_HERE, GPCC_FULL_DATA } from './lib/upstream-cadence.mjs';

export const GOVERNANCE = {
  'data/basins_mrb.json': {
    publisher: 'GRDC / World Bank — Major River Basins of the World',
    url: 'https://datacatalog.worldbank.org/search/dataset/0041426',
    cadence: 'static',
    cadenceBasis: {
      observed: 'the Major River Basins of the World are a published GRDC edition (2nd revised edition, 2020) redistributed by the World Bank data catalogue; the bundle carries only basin names and outlines from it (first committed 2026-07-11)',
      expires: 'if GRDC publishes a revised edition of the Major River Basins',
      canon: 'this record (no script in the repository rebuilds data/basins_mrb.json)',
    },
  },
  'data/ecoregions_2017.geojson': {
    publisher: 'RESOLVE / WWF Ecoregions 2017',
    url: 'https://ecoregions.appspot.com/',
    cadence: 'static',
    cadenceBasis: {
      observed: 'Ecoregions 2017 (Dinerstein et al. 2017) is a named, finished edition; the .geojson and the .js wrapper beside it are the same features',
      expires: 'if RESOLVE publishes a successor edition',
      canon: 'this record (no script in the repository rebuilds data/ecoregions_2017.*)',
    },
  },
  'data/precip-mm.json': {
    publisher: 'CHELSA V2.1 (WSL)',
    url: 'https://chelsa-climate.org/',
    cadence: 'static',
    cadenceBasis: {
      observed: 'the bundle is CHELSA V2.1 bio12, the 1981-2010 climatological normal (its own manifest says so) — a fixed period that no later release revises within V2.1',
      expires: 'if the layer is moved to a later normal period (1991-2020) or a CHELSA V3',
      canon: 'this record (no script in the repository rebuilds data/precip-mm.*)',
    },
  },
  'data/precip-year.json': {
    publisher: 'Deutscher Wetterdienst — GPCC Full Data Monthly',
    url: 'https://opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/05/',
    ...GPCC_FULL_DATA,
  },
  'data/subcable-overrides.json': {
    /* read by scripts/build-subcables.mjs; every hand-made decision about the cable dataset */
    ...AUTHORED_HERE,
  },
};
