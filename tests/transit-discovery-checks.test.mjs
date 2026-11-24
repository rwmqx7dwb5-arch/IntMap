/* The discovered catalogue of open timetables and the licence rule that sorts it
   (js/transit-licence.js · scripts/transit-discover.mjs · js/transit-catalogue.js). Offline: reads the committed
   catalogue and runs the pure functions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyLicence, spdxAllowsCommercial } from '../js/transit-licence.js';
import { knownAt, feedsAt, sentence } from '../js/transit-catalogue.js';
import { FEEDS, COMMERCIAL_OK } from '../js/transit-feeds.js';
import { deriveCatalogue, summarise, parseCsv } from '../scripts/transit-discover.mjs';

const CAT = JSON.parse(fs.readFileSync(new URL('../data/transit-feed-catalogue.json', import.meta.url), 'utf8'));

test('① a Creative Commons URL is read by its terms: NC and ND forbid, BY / BY-SA / CC0 permit, in any language deed', () => {
  const v = (u) => classifyLicence(u);
  assert.equal(v('https://creativecommons.org/licenses/by/4.0/deed.ja').verdict, 'usable-lead');
  assert.equal(v('https://creativecommons.org/licenses/by/2.1/jp').spdx, 'CC-BY-2.1');
  assert.equal(v('https://creativecommons.org/licenses/by-sa/3.0/').commercial, true);
  assert.equal(v('https://creativecommons.org/publicdomain/zero/1.0/deed.it').spdx, 'CC0-1.0');
  for (const nc of ['by-nc', 'by-nc-sa', 'by-nc-nd']) { const r = v('https://creativecommons.org/licenses/' + nc + '/4.0/'); assert.equal(r.verdict, 'unusable', nc); assert.equal(r.commercial, false, nc); assert.match(r.reason, /NonCommercial/); }
  const nd = v('https://creativecommons.org/licenses/by-nd/4.0/'); assert.equal(nd.verdict, 'unusable'); assert.match(nd.reason, /NoDerivatives/);
});

test('② no licence is not permission, and a page nobody has read is not a verdict of "allowed"', () => {
  for (const none of ['', '   ', null, undefined]) { const r = classifyLicence(none); assert.equal(r.verdict, 'none'); assert.equal(r.commercial, null); }
  for (const u of ['https://www.bctransit.com/open-data/terms-of-use', 'https://example.org/licence', 'not a url at all', 'https://creativecommons.org/about']) {
    const r = classifyLicence(u); assert.equal(r.verdict, 'unknown', u); assert.equal(r.commercial, null, u);
  }
});

test('③ the national licences are recognised by their canonical URL only', () => {
  assert.equal(classifyLicence('https://www.data.gouv.fr/pages/legal/licences/etalab-2.0').spdx, 'etalab-2.0');
  assert.equal(classifyLicence('https://opendatacommons.org/licenses/odbl/1.0').spdx, 'ODbL-1.0');
  assert.equal(classifyLicence('https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/').spdx, 'OGL-UK-3.0');
  assert.equal(classifyLicence('https://www.data.gouv.fr/some/other/page').verdict, 'unknown');
});

test('④ the rule and the registry agree: every licence the registry accepts, and every shipped feed\'s own licence link, passes the classifier', () => {
  for (const s of COMMERCIAL_OK) assert.ok(spdxAllowsCommercial(s) || /^(MIT|Apache)/.test(s), s + ' is in COMMERCIAL_OK but the classifier would not accept it');
  for (const f of FEEDS) { const c = classifyLicence(f.licence.url); assert.equal(c.commercial, true, f.id + ': ' + f.licence.url); assert.equal(c.spdx, f.licence.spdx, f.id); }
  assert.equal(spdxAllowsCommercial('CC-BY-NC-4.0'), false); assert.equal(spdxAllowsCommercial('CC-BY-ND-4.0'), false); assert.equal(spdxAllowsCommercial(''), false);
});

test('⑤ every verdict in the committed catalogue is what the classifier derives from the row\'s own licence link', () => {
  assert.ok(CAT.feeds.length > 2000, 'the catalogue should hold the discovered feeds, not a sample (' + CAT.feeds.length + ')');
  const bad = CAT.feeds.filter((r) => { const c = classifyLicence(r[4]); return c.verdict !== r[6] || (c.spdx || '') !== r[5]; });
  assert.deepEqual(bad.map((r) => r[0]), []);
  assert.deepEqual(CAT.summary, summarise(CAT.feeds));
});

test('⑥ nothing without a stated commercial-permitting licence is called usable, and no credential is stored', () => {
  const usable = CAT.feeds.filter((r) => r[6] === 'usable-lead');
  assert.ok(usable.length > 100, 'the discovery should find many licence-compatible leads, found ' + usable.length);
  for (const r of CAT.feeds) {
    if (r[6] === 'usable-lead') assert.equal(classifyLicence(r[4]).commercial, true, r[0]);
    if (r[6] === 'none') assert.equal(r[4], '', r[0] + ': a feed with a licence link cannot be "none"');
    assert.doesNotMatch(r[7], /[?&](token|key|secret|auth)[^=]*=/i, r[0] + ' stores a credential in its download link');
  }
});

test('⑦ the CSV reader and the derivation: only active, key-free GTFS schedule feeds; a column that moved stops the run', () => {
  const head = 'id,data_type,entity_type,location.country_code,location.subdivision_name,location.municipality,provider,is_official,name,note,feed_contact_email,static_reference,urls.direct_download,urls.authentication_type,urls.authentication_info,urls.api_key_parameter_name,urls.latest,urls.license,location.bounding_box.minimum_latitude,location.bounding_box.maximum_latitude,location.bounding_box.minimum_longitude,location.bounding_box.maximum_longitude,location.bounding_box.extracted_on,status,features,redirect.id,redirect.comment';
  const row = (id, type, auth, status, lic) => [id, type, '', 'LU', '', 'Luxembourg', 'Prov, "Q" Ltd', '', '', '', '', '', 'https://x.example/f.zip?token=SECRET&a=1', auth, '', '', '', lic, '49.4', '49.8', '5.9', '6.5', '', status, '', '', ''].map((c) => /[",]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',');
  const csv = [head, row('a', 'gtfs', '0', 'active', 'https://creativecommons.org/licenses/by/4.0/'), row('b', 'gtfs-rt', '0', 'active', ''), row('c', 'gtfs', '1', 'active', ''), row('d', 'gtfs', '0', 'deprecated', ''), row('e', 'gtfs', '0', 'active', '')].join('\n');
  const rows = deriveCatalogue(csv);
  assert.deepEqual(rows.map((r) => r[0]), ['a', 'e']);
  assert.equal(rows[0][2], 'Prov, "Q" Ltd'); assert.equal(rows[0][6], 'usable-lead'); assert.equal(rows[1][6], 'none');
  assert.equal(rows[0][7], 'https://x.example/f.zip?a=1', 'the credential is dropped, the rest of the link kept');
  assert.deepEqual(parseCsv('a,"b\nc",d\n')[0], ['a', 'b\nc', 'd']);
  assert.throws(() => deriveCatalogue(head.replace('urls.license', 'urls.licence') + '\n'), /no longer has the column/);
});

test('⑧ what Atlas can say about a place: what exists, and the reason each part is not used', () => {
  const lyon = knownAt(CAT.feeds, { lng: 4.83, lat: 45.76 });
  assert.ok(lyon.total > 5); assert.equal(lyon.counts.usable + lyon.counts.blocked + lyon.counts.unstated + lyon.counts.unread, lyon.total);
  const s = sentence(lyon); assert.match(s[0], /never used/); assert.match(s[0], /not yet read at the publisher/); assert.match(s[1], /使いません/);
  assert.equal(sentence(knownAt(CAT.feeds, { lng: -140, lat: -50 })), null, 'open ocean: the catalogue lists nothing, and says nothing');
  assert.deepEqual(feedsAt(CAT.feeds, { lng: NaN, lat: 0 }), []);
  const tokyo = knownAt(CAT.feeds, { lng: 139.7, lat: 35.68 }); assert.ok(tokyo.counts.usable > 0, 'Japan publishes GTFS-JP under CC BY: the catalogue finds it');
});
