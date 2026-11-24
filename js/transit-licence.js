/* ============================================================================
 *  IntMap · js/transit-licence.js — WHAT A TIMETABLE'S LICENCE LETS A COMMERCIAL SERVICE DO
 * ----------------------------------------------------------------------------
 *  IntMap is a commercial service (js/transit-feeds.js header). Of the ~2 750 open, key-free GTFS
 *  schedules the Mobility Database lists, whether one may be compiled and shown depends on ONE
 *  thing: what the licence its publisher attached says. This file turns a licence URL into that
 *  answer by the GRAMMAR of the licence families, never by a list of feeds:
 *
 *    · Creative Commons URLs carry their own terms in the path  (/licenses/by-nc-sa/4.0/ →
 *      attribution + NonCommercial + ShareAlike). NC forbids commercial use; ND forbids the
 *      derivative a compiled bundle is; BY and BY-SA are accepted (the owner's decision of
 *      2026-10-06: share-alike is met by offering the bundle under the same terms), CC0 is free.
 *    · a few national open-data licences have one canonical URL each (Licence Ouverte / Etalab 2.0,
 *      ODbL, UK OGL v3, Datenlizenz Deutschland BY 2.0, NLOD 2.0); they are recognised by that URL
 *      and nothing else.
 *    · ANYTHING ELSE — a publisher's own terms page, a portal landing page, no licence at all — is
 *      `unknown`. Unknown is neither usable nor forbidden: it is «nobody has read it». A feed with
 *      no stated licence is NOT public domain (the default in law is all rights reserved), so
 *      `none` is its own verdict and is never used.
 *
 *  ⚠ THIS IS A CLASSIFICATION OF WHAT AN AGGREGATOR SAYS, NOT A VERIFICATION. The Mobility Database
 *  copies the licence link a feed's contributor gave; the publisher may say something else
 *  (js/transit-feeds.js: «a licence copied from an aggregator is a lead, not a verification»). The
 *  verdict `usable-lead` therefore means «worth reading the publisher's page», and the catalogue
 *  keeps the two apart (`js/transit-catalogue.js`).
 *
 *  Pure, no DOM, no network: imported by the discovery script (node) and Atlas (browser).
 * ==========================================================================*/

/** the answer for one licence URL. `commercial` is true / false / null (null = not known) */
export function classifyLicence(url) {
  const raw = String(url == null ? '' : url).trim();
  if (!raw) return { verdict: 'none', spdx: null, commercial: null, reason: 'the feed states no licence' };
  let u; try { u = new URL(raw.indexOf('//') < 0 ? 'https://' + raw : raw); } catch (_) { return { verdict: 'unknown', spdx: null, commercial: null, reason: 'the licence link is not a URL' }; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const path = u.pathname.replace(/\/+$/, '').toLowerCase();

  if (host === 'opendefinition.org') {
    const od = /^\/licenses\/cc-(by(?:-sa)?)$/.exec(path);
    return od ? cc(od[1], null) : { verdict: 'unknown', spdx: null, commercial: null, reason: 'an opendefinition.org page that is not a CC deed' };
  }
  if (host === 'creativecommons.org') {
    const z = /^\/publicdomain\/zero\/([\d.]+)/.exec(path);
    if (z) return { verdict: 'usable-lead', spdx: 'CC0-' + z[1], commercial: true, family: 'cc0', reason: 'CC0: no rights reserved' };
    if (/^\/publicdomain\/mark/.test(path)) return { verdict: 'usable-lead', spdx: null, commercial: true, family: 'pdm', reason: 'public-domain mark' };
    const m = /^\/licenses\/(by(?:-nc)?(?:-nd|-sa)?)\/([\d.]+)(?:\/([a-z]{2,3}))?/.exec(path);
    if (m) return cc(m[1], m[2]);
    return { verdict: 'unknown', spdx: null, commercial: null, reason: 'a creativecommons.org page that is not a licence deed' };
  }
  if (host === 'data.gouv.fr' && /\/licences\/etalab-2\.0$/.test(path)) return ok('etalab-2.0', 'etalab', 'Licence Ouverte / Open Licence 2.0');
  if (host === 'opendatacommons.org' && /\/licenses\/odbl(\/1\.0)?$/.test(path)) return ok('ODbL-1.0', 'odbl', 'ODbL 1.0 (share-alike on the database)');
  if (host === 'nationalarchives.gov.uk' && /\/open-government-licence\/version\/3$/.test(path)) return ok('OGL-UK-3.0', 'ogl', 'UK Open Government Licence v3');
  if (host === 'govdata.de' && /^\/dl-de\/by-2-0$/.test(path)) return ok('DL-DE-BY-2.0', 'dl-de', 'Datenlizenz Deutschland, attribution 2.0');
  if (host === 'data.norge.no' && /\/nlod\/(en|no)\/2\.0$/.test(path)) return ok('NLOD-2.0', 'nlod', 'Norwegian Licence for Open Government Data 2.0');
  return { verdict: 'unknown', spdx: null, commercial: null, reason: 'a licence page this classifier does not recognise — nobody has read its terms' };
}

function ok(spdx, family, why) { return { verdict: 'usable-lead', spdx, commercial: true, family, reason: why }; }

/* the CC grammar: by | by-sa | by-nc | by-nc-sa | by-nd | by-nc-nd */
function cc(terms, ver) {
  const nc = /-nc/.test(terms), nd = /-nd/.test(terms), sa = /-sa/.test(terms);
  const spdx = 'CC-' + terms.toUpperCase() + (ver ? '-' + ver : '');
  const fam = 'cc-' + terms;
  if (nc) return { verdict: 'unusable', spdx, commercial: false, family: fam, reason: 'NonCommercial: IntMap is a commercial service' };
  if (nd) return { verdict: 'unusable', spdx, commercial: false, family: fam, reason: 'NoDerivatives: a compiled timetable is a derivative' };
  return { verdict: 'usable-lead', spdx, commercial: true, family: fam, reason: sa ? 'attribution + share-alike' : 'attribution' };
}

/** the SPDX identifiers the registry (js/transit-feeds.js COMMERCIAL_OK) accepts for a BUILT feed: every CC BY / BY-SA / CC0 version plus the national licences */
export function spdxAllowsCommercial(spdx) {
  const s = String(spdx || '');
  if (/^CC-BY(-SA)?-[\d.]+$/.test(s) || /^CC0-[\d.]+$/.test(s)) return true;
  return ['etalab-2.0', 'ODbL-1.0', 'OGL-UK-3.0', 'DL-DE-BY-2.0', 'NLOD-2.0', 'MIT', 'Apache-2.0'].indexOf(s) >= 0;
}
