/* ============================================================================
 *  IntMap · THE TWO WORLD WARS — the record, assembled   (#R349)
 * ----------------------------------------------------------------------------
 *  One list, in the order the wars happened. The record itself is in ./ww1.mjs and ./ww2.mjs; the
 *  rules both obey and the vocabulary they share are in ./lang.mjs; the coordinates every front line
 *  is quoted through are in ./places.mjs. scripts/build-wars.mjs is what turns all four into
 *  data/wars.json, and it is the only thing that is allowed to decide the file is correct.
 * ==========================================================================*/
import { WW1 } from './ww1.mjs';
import { WW2 } from './ww2.mjs';

export const WARS = [WW1, WW2];
