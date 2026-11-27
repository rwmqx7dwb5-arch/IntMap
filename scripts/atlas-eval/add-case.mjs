#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — add one of the reader's own cases   (atlas-autonomy)
 * ----------------------------------------------------------------------------
 *    node scripts/atlas-eval/add-case.mjs --text "なぜ山の稜線を挟んで植生が全然違う？" --ideal "…何を測り何と比べて答えたか…" [--lang jp|en] [--id my-id]
 *    node scripts/atlas-eval/add-case.mjs --list
 *  Appends to scripts/atlas-eval/user-cases.json (see its $comment). The case is asked and graded with `npm run atlas-eval -- --set open`.
 *  `lang` defaults from the text (any kana/kanji → jp). The id defaults to user-<YYYY-MM-DD>-<n>.
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOpenQuestions } from './initiative.mjs';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'user-cases.json');

export function addCase(set, { text, ideal, lang, id, today = new Date().toISOString().slice(0, 10) }) {
  const t = String(text || '').trim(), i = String(ideal || '').trim();
  if (!t) throw new Error('--text: the question, as the reader typed it');
  if (!i) throw new Error('--ideal: the outcome the reader would have wanted (a case without one is only an open question — put it in open-questions.json)');
  const l = lang || (/[\u3040-\u30ff\u3400-\u9fff]/.test(t) ? 'jp' : 'en');
  let n = 1; while (set.questions.some((q) => q.id === (id || 'user-' + today + '-' + n))) n++;
  const q = { id: id || 'user-' + today + '-' + n, lang: l, text: t, ideal: i };
  const next = { ...set, questions: [...set.questions, q] };
  const bad = validateOpenQuestions(next);
  if (bad.length) throw new Error(bad.join('; '));
  return { set: next, added: q };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2), get = (k) => { const x = args.indexOf('--' + k); return x >= 0 ? args[x + 1] : undefined; };
  const set = JSON.parse(readFileSync(FILE, 'utf8'));
  if (args.includes('--list')) { for (const q of set.questions) console.log(q.id + '  [' + q.lang + ']  ' + q.text + '\n    ideal: ' + q.ideal); if (!set.questions.length) console.log('(no cases yet)'); process.exit(0); }
  try {
    const r = addCase(set, { text: get('text'), ideal: get('ideal'), lang: get('lang'), id: get('id') });
    writeFileSync(FILE, JSON.stringify(r.set, null, 2) + '\n');
    console.log('added ' + r.added.id);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
