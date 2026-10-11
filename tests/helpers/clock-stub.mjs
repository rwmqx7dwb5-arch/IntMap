/* ============================================================================
 *  clock-stub — a test's stand-in for js/chronos.js `IntMapTime`
 * ----------------------------------------------------------------------------
 *  The fields a test drives (on, when, year, isLive, min …) are its own. The clock's PREDICATES are the real
 *  ones, handed over (one-present-year): «is this year the present?» is decided in one place, and a stub that
 *  wrote its own answer would test its copy instead of the clock.
 * ==========================================================================*/
import { importModule } from './import-module.mjs';

const { IntMapTime: real } = await importModule('js/chronos.js', { globals: { window: {}, document: undefined } });

/** @param {object} fields the test's own members @returns {object} */
export const clockStub = (fields = {}) => Object.assign({ isPresentYear: real.isPresentYear }, fields);
