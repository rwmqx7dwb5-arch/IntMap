/* js/atlas-image-continue.js — an IMAGE TURN THAT NEEDS MORE THAN READING CONTINUES INTO THE ORDINARY AGENT LOOP.
 *
 * An attached image used to end the turn in the dedicated reader (js/atlas-console.js _atlVisionTurn): it reads, re-checks sums and
 * pins named places, and stops — so «verify where this picture was taken against elevation and land-cover data and map it» could
 * never reach GIS, web research or delegation in the same turn.
 *
 * WHO DECIDES: the reader itself, in its own reply (`continueWithTools`), because only it has seen the picture AND the request. No
 * pattern over the question text decides this (no-ad-hoc-hardcoding.md). The reader's answer is kept and shown first; what it read is
 * handed to the agent loop as context, together with the images themselves, so nothing about the existing reading is lost or redone.
 * Pure: no DOM, no network. */
export const VISION_CONTINUE_RULE = 'CONTINUATION: set "continueWithTools":true ONLY when the request goes beyond what the image itself shows — it asks you to check, measure, look up, compare or map something against external data, the web or IntMap\'s own layers (elevation, land cover, statistics, news, other sources). Then give in "answer" what you read and concluded FROM THE IMAGE so far (the work continues in a tool-using step that receives your reading and the images). Leave it out when reading, transcribing, solving or explaining the image fully answers the request.\n';

export function wantsContinue(d) { return !!(d && d.continueWithTools === true); }

/* what the reader read, as the agent loop's context: its own words, marked as an image reading (not a verified fact about the world) */
export function agentContext(d) {
  if (!wantsContinue(d)) return '';
  const places = (Array.isArray(d.places) ? d.places : []).map((p) => p && p.n ? String(p.n) + (p.c ? ' (' + p.c + ')' : '') : '').filter(Boolean);
  const unsure = (Array.isArray(d.uncertain) ? d.uncertain : []).map(String).filter(Boolean);
  return '\n\n[IMAGE READING — already shown to the reader as the previous message; the attached images are available to you in this turn. This is what a reader of the picture concluded, NOT a checked fact about the world: verify what the request asks you to verify with the tools.]\n'
    + 'class: ' + String(d.contentClass || '?') + '\n'
    + (d.transcription ? 'transcription: ' + String(d.transcription).slice(0, 4000) + '\n' : '')
    + 'reading: ' + String(d.answer || '').slice(0, 6000) + '\n'
    + (places.length ? 'places named: ' + places.join('; ') + '\n' : '')
    + (d.focusPlace ? 'focus: ' + String(d.focusPlace) + '\n' : '')
    + (unsure.length ? 'uncertain: ' + unsure.join('; ') + '\n' : '');
}
