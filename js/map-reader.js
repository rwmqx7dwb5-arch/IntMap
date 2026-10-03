/* ============================================================================
 *  IntMap · the map, read in words — Alt+R and the reading mode   (keyboard-and-offline)
 * ----------------------------------------------------------------------------
 *  A reader who cannot see the map, or who does not use a mouse, already had the first half
 *  (js/map-narrator.js): the map is a named region, the arrow keys and +/- move and zoom it, a
 *  settled view is said in one short paragraph, and Alt+N walks the features near the centre.
 *  What was missing is the answer to «what is HERE» — the place and its administrative chain, the
 *  country, the elevation, the local time, and the value of every layer that is on — which the
 *  place profile (js/place-dossier.js) already computes for a click. This file speaks that record.
 *
 *    Alt+R         say what is at the centre of the view, now
 *    Alt+Shift+R   turn the reading mode on or off. On, every settled move (an arrow key, +/-, a jump
 *                  to a place) says how far and which way the centre moved and then the same paragraph.
 *                  Off is the default; the choice is kept (Settings ▸ Keyboard shortcuts has the switch).
 *
 *  ⚠ NOTHING HERE IS GATHERED OR DECIDED BY THIS FILE. `placeProfile` builds the record, `profileSpeech`
 *  (the card's own sibling) turns it into sentences, the narrator's live region is the one place anything
 *  is said. A section the source could not answer is SAID with its reason — silence would read as
 *  «there is nothing there» (.agents/rules/one-pass-or-a-reason.md §5).
 *  ⚠ ONE WRITER OF THE LIVE REGION. The narrator speaks; this file hands it text (narratorApi.say /
 *  narratorApi.enrich), so two writers never race on the same node.
 *  Alt was chosen like Alt+N: the single-key shortcuts (js/keyboard-shortcuts.js) return on any modifier,
 *  the renderer reads arrows and +/-, and no browser default found binds Alt+R. Strings are en + jp.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { placeProfile, profileSpeech } from './place-dossier.js';
import { narratorApi } from './narrator-api.js';

const READING_KEY = 'intmap_map_reading';

const L = IntMapLang.pick(() => { try { return narratorApi.host.lang; } catch (_) { return 'en'; } });

/** distance and direction of a move, in words — the bearing is the initial great-circle one. Pure. */
export function moveWords(from, to, lang) {
  const R = 6371.0088, rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad, dLng = (to.lng - from.lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  if (!(km >= 0.05)) return '';
  const y = Math.sin(dLng) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLng);
  const brg = (Math.atan2(y, x) / rad + 360) % 360;
  const en = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const jp = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  const i = Math.round(brg / 45) % 8;
  const d = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return lang === 'jp' ? '約 ' + d + ' km ' + jp[i] + ' へ移動。' : 'Moved about ' + d + ' km ' + en[i] + '.';
}

let last = null;   /* the centre the reader was last told about */

function centre() {
  const c = narratorApi.engine().camera.getCenter();
  return { lng: c.lng, lat: c.lat };
}
async function profileHere(pt) {
  return placeProfile(pt, narratorApi.host, {});
}

/** what the reading mode adds to the narrator's short paragraph: the move, then the profile of the centre */
async function enrich(summary) {
  const pt = centre();
  const moved = last ? moveWords(last, pt, narratorApi.host.lang) : '';
  last = pt;
  const prof = await profileHere(pt);
  return [summary, moved, profileSpeech(prof, narratorApi.host)].filter(Boolean).join(' ');
}

/** Alt+R — say what is at the centre of the view, now. Returns the text (Atlas and the spec read it back). */
export async function describeHere() {
  const pt = centre();
  narratorApi.say(L('Reading this place…', 'この場所を読み上げます…'));
  let text;
  try { text = narratorApi.summarise() + ' ' + profileSpeech(await profileHere(pt), narratorApi.host); }
  catch (_) { text = L('This place could not be read.', 'この場所を読み取れませんでした。'); }
  last = pt;
  narratorApi.say(text);
  return text;
}

export function readingOn() { return narratorApi.enrich === enrich; }

/** turn the mode on or off and SAY which; the stored switch is what start-up reads (js/map-narrator.js) */
export function setReading(on, quiet) {
  on = !!on;
  try { localStorage.setItem(READING_KEY, on ? 'on' : 'off'); } catch (_) { /* a private tab keeps it for the session only */ }
  narratorApi.enrich = on ? enrich : null;
  if (on) { try { last = centre(); } catch (_) { last = null; } }
  try { const sel = document.getElementById('setting-map-reading'); if (sel) sel.value = on ? 'on' : 'off'; } catch (_) { /* no Settings row */ }
  if (!quiet && narratorApi.say) {
    narratorApi.say(on
      ? L('Reading mode on. Every move of the map will be described: the place, the country, the elevation, the local time and the layers on. Alt+Shift+R turns it off.',
        '読み上げモードをオンにしました。地図を動かすたびに、場所・国・標高・現地時刻・表示中のレイヤーの値を読み上げます。Alt+Shift+R でオフにします。')
      : L('Reading mode off.', '読み上げモードをオフにしました。'));
  }
  return on;
}
export function toggleReading() { return setReading(!readingOn()); }
/** start-up with the stored switch on: no announcement, the next settled move speaks */
export function restore() { return setReading(true, true); }
