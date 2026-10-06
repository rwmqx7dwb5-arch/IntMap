/* scripts/histrecon/withheld-file.mjs — where the reconstruction states the ground its dossiers researched and could
   not settle (js/border-coast.js `withheld`). It is build-time data (25 MB pooled, measured 2026-10-06), regenerated
   byte-for-byte from the committed dossiers and the pinned atom sets by scripts/build-hist-admin-recon.mjs, so it
   lives in the same cache as the atoms themselves — outside the repository — and the fill refuses to build without it. */
import path from 'node:path';
import { cacheDir } from './atoms/ne-admin1.mjs';
export const withheldFile = () => path.join(cacheDir(), 'recon-withheld.json');
