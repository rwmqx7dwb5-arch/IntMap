/* (studio-wait-edge-cursor) two things production showed after data-studio and compare-window-resize landed (2026-10-04):
 *   ① a window's resize cursor reaches through its children — the map canvas inside the compare window kept «grab» on the edge;
 *   ② the data studio waits for a map that is still loading instead of telling the reader to switch to the flat map. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('studio-wait-edge-cursor ① addEdgeResize makes every child inherit the edge cursor while the pointer is in the edge zone', () => {
  const src = read('js/window-manager.js');
  const body = src.slice(src.indexOf('function addEdgeResize('), src.indexOf('function _armCornerCatch('));
  assert.match(body, /\.im-edge-hover, \.im-edge-hover \*\{cursor:inherit !important;\}/, 'the inherit rule is not installed');
  assert.match(body, /panel\.classList\.toggle\('im-edge-hover',!!cv\)/, 'hover in the edge zone does not set the class');
  assert.match(body, /pointerleave[\s\S]{0,200}panel\.classList\.remove\('im-edge-hover'\)/, 'leaving does not clear the class');
  /* the class is toggled only when the cursor changes — the #R311 rule that hover must not churn the style attribute */
  assert.match(body, /if\(panel\.style\.cursor!==cv\)\{ panel\.style\.cursor=cv; panel\.classList\.toggle/);
});

test('studio-wait-edge-cursor ② the studio waits for the engine before it draws, and says it is waiting', () => {
  const src = read('js/data-studio.js');
  assert.match(src, /import \{ IntMapGeoEngine \} from '\.\/geo-engine\.js';/);
  const at = src.indexOf('const d = window.IntMapGis.draw(resultId);');
  assert.ok(at > 0, 'the draw call moved');
  const before = src.slice(Math.max(0, at - 1600), at);
  assert.match(before, /if \(!IntMapGeoEngine\.canDraw\(\)\) \{[^}]*await IntMapGeoEngine\.whenCanDraw\(\);/, 'the draw does not wait for the map');
  assert.match(before, /Waiting for the map to finish loading/, 'the wait is not said');
});
