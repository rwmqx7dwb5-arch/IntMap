/*
 * news-search-count-age — THE NEWS LIST AND THE NUMBERS ON ITS TOPIC CHIPS COUNT ONE SET.
 *
 * Measured on production 2026-11-18: «Kerch» counted 2 and listed 1 (the list's search text lacked the summary the
 * server matched — fixed in news-quality-followup), then «cheating» counted 18 and listed 13 (the list cut events older
 * than 72 h, the count did not). Both were the same shape: the chips counted `globalData` raw while the list applied
 * conditions of its own. A check on one word would have caught only the word. So this check is about EVERY condition:
 * it EVALUATES js/app-body.js computeFilteredNews (the list's predicate, extracted from the source) over items that vary
 * every axis the predicate reads, in every state it reads, and requires that for every topic the chip's number — what
 * js/news-events.js counts, `computeFilteredNews({ allTopics:true })` per category — equals the length of the list
 * shown when that topic is chosen. A condition added later to one side and not the other fails here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function fnSource(file, name) {
  const src = rd(file);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let hit = null;
  (function walk(n) {
    if (!n || typeof n !== 'object' || hit) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { hit = src.slice(n.start, n.end); return; }
    for (const k of Object.keys(n)) if (k !== 'type') walk(n[k]);
  })(ast);
  assert.ok(hit, name + ' found in ' + file);
  return hit;
}

/* every free name the predicate reads is a parameter here, so a NEW name it starts reading fails loudly (ReferenceError)
   instead of silently reading undefined — the check has to be taught the new axis */
const FREE = ['searchVal', 'window', 'currentMode', 'newsDate', 'NEWS_MAX_AGE_MS', 'newsSurfaceMode', 'globalData', 'bookmarks', 'parseDate', 'newsSourceAllows', 'activeSearchQuery'];
const build = (env) => new Function(...FREE, fnSource('js/app-body.js', 'computeFilteredNews') + '\nreturn computeFilteredNews;')(...FREE.map((k) => env[k]));

const NOW = Date.now();
const H = 3600e3;
const CATS = ['world', 'business', 'tech'];
function items() {
  const out = [];
  let i = 0;
  for (const ev of [true, false]) for (const age of [1 * H, 100 * H, 20 * 24 * H]) for (const cat of CATS)
    for (const word of ['cheating exam', 'weather']) for (const pub of ['ok', 'blocked']) for (const inArea of [true, false]) for (const saved of [true, false]) {
      const id = 'i' + (i++);
      const it = { title: word + ' ' + id, link: 'https://x/' + id, publisher: pub, pubDate: new Date(NOW - age).toISOString(),
        analysis: { loc: inArea ? [10, 10] : [100, 50] } };
      if (ev) { it._event = { publicId: id, category: cat, saved }; it._search = (word + ' ' + id).toLowerCase(); }
      else it._saved = saved;
      out.push(it);
    }
  return out;
}

test('news-search-count-age: for every state and every topic, the chip number equals the list shown under that topic', () => {
  const data = items();
  const bookmarks = data.filter((x) => !x._event && x._saved).map((x) => x.link);
  let checked = 0;
  for (const mode of ['news', 'saved']) for (const query of ['', 'cheating']) for (const date of [null, new Date(NOW - 5 * 24 * H)]) for (const area of [null, (x) => x < 50]) {
    let category = 'all';
    const EV = {
      passes: (it) => !it._event || category === 'all' || it._event.category === category,
      isSaved: (pid) => !!data.find((x) => x._event && x._event.publicId === pid && x._event.saved),
    };
    const win = { IntMapNewsEvents: EV, IntMapNewsSaved: null, _newsAreaTest: area };
    const f = build({ searchVal: () => query, window: win, currentMode: mode, newsDate: date, NEWS_MAX_AGE_MS: 72 * H,
      newsSurfaceMode: () => 'events', globalData: data, bookmarks, parseDate: (s) => new Date(s),
      newsSourceAllows: (p) => p !== 'blocked', activeSearchQuery: query });
    /* what js/news-events.js renderChips counts */
    const counted = f({ allTopics: true }).filter((x) => x._event);
    for (const cat of ['all', ...CATS]) {
      category = cat;
      const listed = f().filter((x) => x._event).length;
      const chip = cat === 'all' ? counted.length : counted.filter((x) => x._event.category === cat).length;
      assert.equal(chip, listed, `mode=${mode} query=«${query}» date=${!!date} area=${!!area} topic=${cat}: chip ${chip} ≠ list ${listed}`);
      checked++;
    }
    category = 'all';
  }
  assert.equal(checked, 2 * 2 * 2 * 2 * 4);
});

test('news-search-count-age: an Event search reaches the event table’s 30 days; the live feed keeps its 72-hour cut', () => {
  const data = items().filter((x) => x._event);
  const env = (query) => ({ searchVal: () => query, window: { IntMapNewsEvents: { passes: () => true, isSaved: () => false } }, currentMode: 'news',
    newsDate: null, NEWS_MAX_AGE_MS: 72 * H, newsSurfaceMode: () => 'events', globalData: data, bookmarks: [],
    parseDate: (s) => new Date(s), newsSourceAllows: () => true, activeSearchQuery: query });
  const old = (xs) => xs.filter((x) => Date.parse(x.pubDate) < NOW - 72 * H).length;
  assert.ok(old(build(env('cheating'))()) > 0, 'a search lists its events older than 72 h');
  assert.equal(old(build(env(''))()), 0, 'the live list still drops them');
});

test('news-search-count-age: the chips read no list of their own', () => {
  const chips = fnSource('js/news-events.js', 'renderChips');
  assert.ok(!/globalData/.test(chips), 'renderChips counts the predicate’s set, never globalData directly');
  assert.ok(/listedAllTopics\(\)/.test(chips));
  assert.ok(/computeFilteredNews\(\{ allTopics: true \}\)/.test(fnSource('js/news-events.js', 'listedAllTopics')));
});
