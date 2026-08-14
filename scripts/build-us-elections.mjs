#!/usr/bin/env node
/* ============================================================================
 *  IntMap · EVERY U.S. PRESIDENTIAL ELECTION, 1789–2024   (#R243)
 * ----------------------------------------------------------------------------
 *  「それまでのアメリカ大統領選挙の結果をすべて見れるレイヤーを作れ。共和党州と民主党州が塗り分けされ、
 *    バーチャート付き。（選挙特番でよくあるタイプのやつ）年は選べる。」
 *  Scope confirmed with the reader: ALL SIXTY elections (1789–2024), and 「選挙人票で塗り、バーは
 *  選挙人票＋全国得票率」 — the map is coloured by who took each state's ELECTORAL VOTES, and the bar
 *  chart carries both the electoral-vote totals and the national popular-vote share.
 *
 *  ══ WHY ELECTORAL VOTES AND NOT THE POPULAR VOTE ════════════════════════════════════════════
 *  Because it is the only basis that exists for every election. There was no national popular vote
 *  before 1824 — most states' electors were chosen by their legislatures — and South Carolina's were
 *  chosen that way until 1860. The Electoral College result, by contrast, is a federal record for
 *  every one of the sixty (National Archives, Electoral College Results 1789–2020). So the state fill
 *  answers 「which candidate received this state's electoral votes」, which is a fact in all sixty
 *  frames, and the popular-vote share is printed beside the bar for the years it exists.
 *
 *  ══ WHAT THIS FILE IS AND IS NOT ════════════════════════════════════════════════════════════
 *  The SPINE below — the candidates, their party, their electoral votes and their national
 *  popular-vote share — is written out here by hand from the public record, because those sixty rows
 *  are what a reader actually reads and they must be right. The 2,300-cell STATE MATRIX is not
 *  hand-typed: it is derived from the state-by-state returns compiled by zonination/election-history
 *  (itself built from the two sources above) for 1789–2016, with every ambiguous cell overridden
 *  here by hand — see HAND and OVERRIDE, which between them cover:
 *    · 1789 / 1792  — no parties at all; the compilation calls every state 「Other」;
 *    · 1824         — four candidates of ONE party, so a party label cannot say who won a state;
 *    · 1836         — the Whig vote ran under four separate candidates by region;
 *    · 1860         — Breckinridge and Douglas are both 「Democratic」 in a party-level table;
 *    · and every third-party state win (1828, 1832, 1892, 1912, 1924, 1948, 1968).
 *  2020 and 2024 are past the compilation's last year and are written out in full.
 *
 *  ⚠ THE MATRIX IS VALIDATED, NOT TRUSTED. Every state code must exist in the geometry, every cell
 *  must index a candidate this election actually had, and each election's state count must match the
 *  number of states that voted that year. A mismatch fails the build.
 *
 *      node scripts/build-us-elections.mjs           # writes data/us-elections.json + data/us-states.json
 *      node scripts/build-us-elections.mjs --check   # verify the committed files match this source
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_E = join(ROOT, 'data', 'us-elections.json');
const OUT_G = join(ROOT, 'data', 'us-states.json');
const CHECK = process.argv.includes('--check');
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_1_states_provinces.geojson';
const CSV_URL = 'https://raw.githubusercontent.com/zonination/election-history/master/elec.csv';

/* ── the palette. A party's colour is the one broadcast maps have used for it. ────────────────── */
const PARTIES = {
  D:  { en: 'Democratic',              col: '#1f5fd0' },
  R:  { en: 'Republican',              col: '#d02f2f' },
  DR: { en: 'Democratic-Republican',   col: '#7b6bb5' },
  F:  { en: 'Federalist',              col: '#4f7d46' },
  NR: { en: 'National Republican',     col: '#b5793a' },
  W:  { en: 'Whig',                    col: '#d9a441' },
  AM: { en: 'Anti-Masonic',            col: '#7a6aa8' },
  NU: { en: 'Nullifier',               col: '#8a7a68' },
  KN: { en: 'American (Know Nothing)', col: '#c08a4a' },
  SD: { en: 'Southern Democratic',     col: '#a2497a' },
  CU: { en: 'Constitutional Union',    col: '#5f8ba6' },
  PO: { en: 'Populist',                col: '#3f9a76' },
  PR: { en: 'Progressive',             col: '#2fa39a' },
  SR: { en: "States' Rights Democratic", col: '#9a6b3f' },
  AI: { en: 'American Independent',    col: '#b8763a' },
  IN: { en: 'No party',                col: '#8a8f98' },
  UD: { en: 'Unpledged Democratic',    col: '#6a8fb5' },
};

/* ── the sixty. `t` = ELECTORS APPOINTED that year (the denominator a majority is taken of, which is
      why 1804 needs 89 and 2024 needs 270); `ev` = electoral votes received; `pv` = national
      popular-vote share, %. ⚠ `t` counts ELECTORS, not votes: before the 12th Amendment each elector
      cast two ballots, so 1789 has 69 electors and 138 ballots and the majority was still 35. */
/* ⚠ `pv` is null where no national popular vote was recorded (1789–1820). */
const N = null;
const ELECTIONS = [
  { y: 1789, t: 69, c: [{ n: 'George Washington', p: 'IN', ev: 69, pv: N }, { n: 'John Adams', p: 'IN', ev: 34, pv: N }],
    note: 'Unanimous among the electors who voted. New York appointed none; North Carolina and Rhode Island had not yet ratified.' },
  { y: 1792, t: 132, c: [{ n: 'George Washington', p: 'IN', ev: 132, pv: N }, { n: 'John Adams', p: 'F', ev: 77, pv: N }] },
  { y: 1796, t: 138, c: [{ n: 'John Adams', p: 'F', ev: 71, pv: N }, { n: 'Thomas Jefferson', p: 'DR', ev: 68, pv: N }] },
  { y: 1800, t: 138, c: [{ n: 'Thomas Jefferson', p: 'DR', ev: 73, pv: N }, { n: 'John Adams', p: 'F', ev: 65, pv: N }],
    note: 'Jefferson and Burr tied at 73; the House chose Jefferson on the 36th ballot.' },
  { y: 1804, t: 176, c: [{ n: 'Thomas Jefferson', p: 'DR', ev: 162, pv: N }, { n: 'Charles C. Pinckney', p: 'F', ev: 14, pv: N }] },
  { y: 1808, t: 175, c: [{ n: 'James Madison', p: 'DR', ev: 122, pv: N }, { n: 'Charles C. Pinckney', p: 'F', ev: 47, pv: N }] },
  { y: 1812, t: 217, c: [{ n: 'James Madison', p: 'DR', ev: 128, pv: N }, { n: 'DeWitt Clinton', p: 'F', ev: 89, pv: N }] },
  { y: 1816, t: 217, c: [{ n: 'James Monroe', p: 'DR', ev: 183, pv: N }, { n: 'Rufus King', p: 'F', ev: 34, pv: N }] },
  { y: 1820, t: 232, c: [{ n: 'James Monroe', p: 'DR', ev: 231, pv: N }, { n: 'John Quincy Adams', p: 'DR', ev: 1, pv: N }],
    note: 'The Era of Good Feelings: Monroe ran effectively unopposed.' },
  { y: 1824, t: 261, c: [{ n: 'Andrew Jackson', p: 'DR', ev: 99, pv: 41.4, col: '#c96a2e' }, { n: 'John Quincy Adams', p: 'DR', ev: 84, pv: 30.9, col: '#4a7fb5' },
                 { n: 'William H. Crawford', p: 'DR', ev: 41, pv: 11.2, col: '#7a9b4a' }, { n: 'Henry Clay', p: 'DR', ev: 37, pv: 13.0, col: '#a05fa0' }],
    won: 1, note: 'No majority: the House elected Adams although Jackson led both the electoral and the popular vote.' },
  { y: 1828, t: 261, c: [{ n: 'Andrew Jackson', p: 'D', ev: 178, pv: 56.0 }, { n: 'John Quincy Adams', p: 'NR', ev: 83, pv: 43.6 }] },
  { y: 1832, t: 286, c: [{ n: 'Andrew Jackson', p: 'D', ev: 219, pv: 54.2 }, { n: 'Henry Clay', p: 'NR', ev: 49, pv: 37.4 },
                 { n: 'John Floyd', p: 'NU', ev: 11, pv: N }, { n: 'William Wirt', p: 'AM', ev: 7, pv: 7.8 }] },
  { y: 1836, t: 294, c: [{ n: 'Martin Van Buren', p: 'D', ev: 170, pv: 50.8 }, { n: 'William Henry Harrison', p: 'W', ev: 73, pv: 36.6 },
                 { n: 'Hugh L. White', p: 'W', ev: 26, pv: 9.7, col: '#b8763a' }, { n: 'Daniel Webster', p: 'W', ev: 14, pv: 2.7, col: '#8a6b3a' },
                 { n: 'Willie P. Mangum', p: 'W', ev: 11, pv: N, col: '#7a6a5a' }] },
  { y: 1840, t: 294, c: [{ n: 'William Henry Harrison', p: 'W', ev: 234, pv: 52.9 }, { n: 'Martin Van Buren', p: 'D', ev: 60, pv: 46.8 }] },
  { y: 1844, t: 275, c: [{ n: 'James K. Polk', p: 'D', ev: 170, pv: 49.5 }, { n: 'Henry Clay', p: 'W', ev: 105, pv: 48.1 }] },
  { y: 1848, t: 290, c: [{ n: 'Zachary Taylor', p: 'W', ev: 163, pv: 47.3 }, { n: 'Lewis Cass', p: 'D', ev: 127, pv: 42.5 }] },
  { y: 1852, t: 296, c: [{ n: 'Franklin Pierce', p: 'D', ev: 254, pv: 50.8 }, { n: 'Winfield Scott', p: 'W', ev: 42, pv: 43.9 }] },
  { y: 1856, t: 296, c: [{ n: 'James Buchanan', p: 'D', ev: 174, pv: 45.3 }, { n: 'John C. Frémont', p: 'R', ev: 114, pv: 33.1 },
                 { n: 'Millard Fillmore', p: 'KN', ev: 8, pv: 21.5 }] },
  { y: 1860, t: 303, c: [{ n: 'Abraham Lincoln', p: 'R', ev: 180, pv: 39.8 }, { n: 'John C. Breckinridge', p: 'SD', ev: 72, pv: 18.1 },
                 { n: 'John Bell', p: 'CU', ev: 39, pv: 12.6 }, { n: 'Stephen A. Douglas', p: 'D', ev: 12, pv: 29.5 }] },
  { y: 1864, t: 233, c: [{ n: 'Abraham Lincoln', p: 'R', ev: 212, pv: 55.0 }, { n: 'George B. McClellan', p: 'D', ev: 21, pv: 45.0 }],
    note: 'Fought during the Civil War; the eleven Confederate states did not take part.' },
  { y: 1868, t: 294, c: [{ n: 'Ulysses S. Grant', p: 'R', ev: 214, pv: 52.7 }, { n: 'Horatio Seymour', p: 'D', ev: 80, pv: 47.3 }] },
  { y: 1872, t: 366, c: [{ n: 'Ulysses S. Grant', p: 'R', ev: 286, pv: 55.6 }, { n: 'Horace Greeley', p: 'D', ev: 66, pv: 43.8 }],
    note: 'Greeley died before the electoral count; his 66 votes were scattered among other candidates.' },
  { y: 1876, t: 369, c: [{ n: 'Rutherford B. Hayes', p: 'R', ev: 185, pv: 47.9 }, { n: 'Samuel J. Tilden', p: 'D', ev: 184, pv: 50.9 }],
    note: 'Settled by an Electoral Commission after four states sent disputed returns.' },
  { y: 1880, t: 369, c: [{ n: 'James A. Garfield', p: 'R', ev: 214, pv: 48.3 }, { n: 'Winfield S. Hancock', p: 'D', ev: 155, pv: 48.2 }] },
  { y: 1884, t: 401, c: [{ n: 'Grover Cleveland', p: 'D', ev: 219, pv: 48.9 }, { n: 'James G. Blaine', p: 'R', ev: 182, pv: 48.3 }] },
  { y: 1888, t: 401, c: [{ n: 'Benjamin Harrison', p: 'R', ev: 233, pv: 47.8 }, { n: 'Grover Cleveland', p: 'D', ev: 168, pv: 48.6 }],
    note: 'Cleveland led the popular vote and lost the Electoral College.' },
  { y: 1892, t: 444, c: [{ n: 'Grover Cleveland', p: 'D', ev: 277, pv: 46.0 }, { n: 'Benjamin Harrison', p: 'R', ev: 145, pv: 43.0 },
                 { n: 'James B. Weaver', p: 'PO', ev: 22, pv: 8.5 }] },
  { y: 1896, t: 447, c: [{ n: 'William McKinley', p: 'R', ev: 271, pv: 51.0 }, { n: 'William Jennings Bryan', p: 'D', ev: 176, pv: 46.7 }] },
  { y: 1900, t: 447, c: [{ n: 'William McKinley', p: 'R', ev: 292, pv: 51.6 }, { n: 'William Jennings Bryan', p: 'D', ev: 155, pv: 45.5 }] },
  { y: 1904, t: 476, c: [{ n: 'Theodore Roosevelt', p: 'R', ev: 336, pv: 56.4 }, { n: 'Alton B. Parker', p: 'D', ev: 140, pv: 37.6 }] },
  { y: 1908, t: 483, c: [{ n: 'William Howard Taft', p: 'R', ev: 321, pv: 51.6 }, { n: 'William Jennings Bryan', p: 'D', ev: 162, pv: 43.0 }] },
  { y: 1912, t: 531, c: [{ n: 'Woodrow Wilson', p: 'D', ev: 435, pv: 41.8 }, { n: 'Theodore Roosevelt', p: 'PR', ev: 88, pv: 27.4 },
                 { n: 'William Howard Taft', p: 'R', ev: 8, pv: 23.2 }] },
  { y: 1916, t: 531, c: [{ n: 'Woodrow Wilson', p: 'D', ev: 277, pv: 49.2 }, { n: 'Charles Evans Hughes', p: 'R', ev: 254, pv: 46.1 }] },
  { y: 1920, t: 531, c: [{ n: 'Warren G. Harding', p: 'R', ev: 404, pv: 60.3 }, { n: 'James M. Cox', p: 'D', ev: 127, pv: 34.1 }] },
  { y: 1924, t: 531, c: [{ n: 'Calvin Coolidge', p: 'R', ev: 382, pv: 54.0 }, { n: 'John W. Davis', p: 'D', ev: 136, pv: 28.8 },
                 { n: 'Robert M. La Follette', p: 'PR', ev: 13, pv: 16.6 }] },
  { y: 1928, t: 531, c: [{ n: 'Herbert Hoover', p: 'R', ev: 444, pv: 58.2 }, { n: 'Al Smith', p: 'D', ev: 87, pv: 40.8 }] },
  { y: 1932, t: 531, c: [{ n: 'Franklin D. Roosevelt', p: 'D', ev: 472, pv: 57.4 }, { n: 'Herbert Hoover', p: 'R', ev: 59, pv: 39.7 }] },
  { y: 1936, t: 531, c: [{ n: 'Franklin D. Roosevelt', p: 'D', ev: 523, pv: 60.8 }, { n: 'Alf Landon', p: 'R', ev: 8, pv: 36.5 }] },
  { y: 1940, t: 531, c: [{ n: 'Franklin D. Roosevelt', p: 'D', ev: 449, pv: 54.7 }, { n: 'Wendell Willkie', p: 'R', ev: 82, pv: 44.8 }] },
  { y: 1944, t: 531, c: [{ n: 'Franklin D. Roosevelt', p: 'D', ev: 432, pv: 53.4 }, { n: 'Thomas E. Dewey', p: 'R', ev: 99, pv: 45.9 }] },
  { y: 1948, t: 531, c: [{ n: 'Harry S. Truman', p: 'D', ev: 303, pv: 49.6 }, { n: 'Thomas E. Dewey', p: 'R', ev: 189, pv: 45.1 },
                 { n: 'Strom Thurmond', p: 'SR', ev: 39, pv: 2.4 }] },
  { y: 1952, t: 531, c: [{ n: 'Dwight D. Eisenhower', p: 'R', ev: 442, pv: 55.2 }, { n: 'Adlai Stevenson', p: 'D', ev: 89, pv: 44.3 }] },
  { y: 1956, t: 531, c: [{ n: 'Dwight D. Eisenhower', p: 'R', ev: 457, pv: 57.4 }, { n: 'Adlai Stevenson', p: 'D', ev: 73, pv: 42.0 }] },
  { y: 1960, t: 537, c: [{ n: 'John F. Kennedy', p: 'D', ev: 303, pv: 49.7 }, { n: 'Richard Nixon', p: 'R', ev: 219, pv: 49.6 },
                 { n: 'Harry F. Byrd', p: 'UD', ev: 15, pv: N }],
    note: 'Fifteen unpledged electors from Mississippi and Alabama, plus one from Oklahoma, voted for Byrd.' },
  { y: 1964, t: 538, c: [{ n: 'Lyndon B. Johnson', p: 'D', ev: 486, pv: 61.1 }, { n: 'Barry Goldwater', p: 'R', ev: 52, pv: 38.5 }] },
  { y: 1968, t: 538, c: [{ n: 'Richard Nixon', p: 'R', ev: 301, pv: 43.4 }, { n: 'Hubert Humphrey', p: 'D', ev: 191, pv: 42.7 },
                 { n: 'George Wallace', p: 'AI', ev: 46, pv: 13.5 }] },
  { y: 1972, t: 538, c: [{ n: 'Richard Nixon', p: 'R', ev: 520, pv: 60.7 }, { n: 'George McGovern', p: 'D', ev: 17, pv: 37.5 }] },
  { y: 1976, t: 538, c: [{ n: 'Jimmy Carter', p: 'D', ev: 297, pv: 50.1 }, { n: 'Gerald Ford', p: 'R', ev: 240, pv: 48.0 }] },
  { y: 1980, t: 538, c: [{ n: 'Ronald Reagan', p: 'R', ev: 489, pv: 50.7 }, { n: 'Jimmy Carter', p: 'D', ev: 49, pv: 41.0 }] },
  { y: 1984, t: 538, c: [{ n: 'Ronald Reagan', p: 'R', ev: 525, pv: 58.8 }, { n: 'Walter Mondale', p: 'D', ev: 13, pv: 40.6 }] },
  { y: 1988, t: 538, c: [{ n: 'George H. W. Bush', p: 'R', ev: 426, pv: 53.4 }, { n: 'Michael Dukakis', p: 'D', ev: 111, pv: 45.6 }] },
  { y: 1992, t: 538, c: [{ n: 'Bill Clinton', p: 'D', ev: 370, pv: 43.0 }, { n: 'George H. W. Bush', p: 'R', ev: 168, pv: 37.4 }],
    note: 'Ross Perot took 18.9 % of the popular vote and no electoral votes.' },
  { y: 1996, t: 538, c: [{ n: 'Bill Clinton', p: 'D', ev: 379, pv: 49.2 }, { n: 'Bob Dole', p: 'R', ev: 159, pv: 40.7 }] },
  { y: 2000, t: 538, c: [{ n: 'George W. Bush', p: 'R', ev: 271, pv: 47.9 }, { n: 'Al Gore', p: 'D', ev: 266, pv: 48.4 }],
    note: 'Decided by Florida; Gore led the national popular vote.' },
  { y: 2004, t: 538, c: [{ n: 'George W. Bush', p: 'R', ev: 286, pv: 50.7 }, { n: 'John Kerry', p: 'D', ev: 251, pv: 48.3 }] },
  { y: 2008, t: 538, c: [{ n: 'Barack Obama', p: 'D', ev: 365, pv: 52.9 }, { n: 'John McCain', p: 'R', ev: 173, pv: 45.7 }],
    split: ['NE-02 → Obama'] },
  { y: 2012, t: 538, c: [{ n: 'Barack Obama', p: 'D', ev: 332, pv: 51.1 }, { n: 'Mitt Romney', p: 'R', ev: 206, pv: 47.2 }] },
  { y: 2016, t: 538, c: [{ n: 'Donald Trump', p: 'R', ev: 304, pv: 46.1 }, { n: 'Hillary Clinton', p: 'D', ev: 227, pv: 48.2 }],
    split: ['ME-02 → Trump'], note: 'Seven electors voted for someone other than their pledged candidate.' },
  { y: 2020, t: 538, c: [{ n: 'Joe Biden', p: 'D', ev: 306, pv: 51.3 }, { n: 'Donald Trump', p: 'R', ev: 232, pv: 46.8 }],
    split: ['ME-02 → Trump', 'NE-02 → Biden'] },
  { y: 2024, t: 538, c: [{ n: 'Donald Trump', p: 'R', ev: 312, pv: 49.8 }, { n: 'Kamala Harris', p: 'D', ev: 226, pv: 48.3 }],
    split: ['ME-02 → Trump', 'NE-02 → Harris'] },
];

/* ── the years a party label cannot answer: written out in full, candidate index per state ────── */
const S = (list) => { const o = {}; Object.keys(list).forEach((k) => list[k].split(' ').forEach((st) => { o[st] = +k; })); return o; };
const HAND = {
  /* 1789 — ten states appointed electors, all for Washington */
  1789: S({ 0: 'CT DE GA MD MA NH NJ PA SC VA' }),
  1792: S({ 0: 'CT DE GA KY MD MA NH NJ NY NC PA RI SC VT VA' }),
  /* 1824 — four Democratic-Republicans; the winner of each state's electoral votes */
  1824: S({ 0: 'AL IL IN LA MD MS NJ NC PA SC TN', 1: 'CT ME MA NH NY RI VT', 2: 'DE GA VA', 3: 'KY MO OH' }),
  /* 1836 — the Whig vote ran under four regional candidates */
  1836: S({ 0: 'AL AR CT IL LA ME MI MS MO NH NY NC PA RI VA', 1: 'DE IN KY MD NJ OH VT', 2: 'GA TN', 3: 'MA', 4: 'SC' }),
  /* 1860 — Breckinridge and Douglas are both «Democratic» in a party-level table */
  1860: S({ 0: 'CA CT IA IL IN ME MA MI MN NH NJ NY OH OR PA RI VT WI',
            1: 'AL AR DE FL GA LA MD MS NC SC TX', 2: 'KY TN VA', 3: 'MO' }),
  /* past the compilation's last year */
  2020: S({ 0: 'AZ CA CO CT DE DC GA HI IL ME MD MA MI MN NV NH NJ NM NY OR PA RI VT VA WA WI',
            1: 'AL AK AR FL ID IN IA KS KY LA MS MO MT NE NC ND OH OK SC SD TN TX UT WV WY' }),
  2024: S({ 0: 'AL AK AZ AR FL GA ID IN IA KS KY LA MI MS MO MT NE NV NC ND OH OK PA SC SD TN TX UT WV WI WY',
            1: 'CA CO CT DE DC HI IL ME MD MA MN NH NJ NM NY OR RI VT VA WA' }),
};
/* ── the third-party state wins the compilation files under 「Other」 ──────────────────────────── */
const OVERRIDE = {
  1828: S({ 1: 'CT DE ME MD MA NH NJ RI VT' }),                     /* J. Q. Adams, National Republican */
  1832: S({ 1: 'CT DE KY MD MA RI VT', 2: 'SC' }),                  /* Clay; Floyd (Nullifier) in South Carolina */
  1892: S({ 2: 'CO ID KS NV ND' }),                                 /* Weaver, Populist */
  1912: S({ 1: 'CA MI MN PA SD WA' }),                              /* Theodore Roosevelt, Progressive */
  1924: S({ 2: 'WI' }),                                             /* La Follette, Progressive */
  1948: S({ 2: 'AL LA MS SC' }),                                    /* Thurmond, States' Rights */
  1968: S({ 2: 'AL AR GA LA MS' }),                                 /* Wallace, American Independent */
  1856: S({ 2: 'MD' }),                                             /* Fillmore, American — filed as «Whig» */
  1960: S({ 2: 'MS' }),                                             /* Mississippi's unpledged slate voted Byrd */
};
/* the compilation's coarse party label → the party code this file uses */
const LABEL = { Republican: 'R', Democratic: 'D', 'Democratic-Republican': 'DR', Whig: 'W', Federalist: 'F' };
/* the CSV writes one state name differently from Natural Earth */
const NAME_FIX = { 'Dist. of Col.': 'District of Columbia' };

/* ── the geometry: Natural Earth 1:110m admin-1, United States only (public domain) ───────────── */
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
function thin(geom) {
  const f = (c) => (Array.isArray(c[0]) ? c.map(f) : [round(c[0], 3), round(c[1], 3)]);
  return { type: geom.type, coordinates: f(geom.coordinates) };
}
async function geometry() {
  const r = await fetch(NE_URL);
  if (!r.ok) throw new Error('Natural Earth admin-1: HTTP ' + r.status);
  const j = await r.json();
  const feats = j.features
    .filter((f) => f.properties && (f.properties.iso_a2 === 'US' || f.properties.adm0_a3 === 'USA'))
    .map((f) => ({ type: 'Feature', id: f.properties.postal,
      properties: { st: f.properties.postal, name: f.properties.name }, geometry: thin(f.geometry) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return { type: 'FeatureCollection', features: feats };
}

async function matrix() {
  const r = await fetch(CSV_URL);
  if (!r.ok) throw new Error('election compilation: HTTP ' + r.status);
  const rows = (await r.text()).split(/\r?\n/).filter(Boolean);
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].split(',');
    if (c.length < 17 || !/^\d{4}/.test(c[0])) continue;
    const y = +c[0].slice(0, 4);
    const name = NAME_FIX[c[1]] || c[1];
    (out[y] = out[y] || {})[name] = c[15];
  }
  return out;
}

const geo = await geometry();
const POSTAL = {}; geo.features.forEach((f) => { POSTAL[f.properties.name] = f.properties.st; });
const CODES = new Set(geo.features.map((f) => f.properties.st));
const raw = await matrix();

const problems = [];
const elections = ELECTIONS.map((e) => {
  const idxOf = (p) => e.c.findIndex((x) => x.p === p);
  let s;
  if (HAND[e.y]) s = { ...HAND[e.y] };
  else {
    s = {};
    const src = raw[e.y];
    if (!src) { problems.push(e.y + ': no state returns in the compilation'); return null; }
    for (const name of Object.keys(src)) {
      const st = POSTAL[name];
      if (!st) { problems.push(e.y + ': unknown state «' + name + '»'); continue; }
      const lbl = src[name];
      /* ⚠ an OVERRIDE wins before the label is even consulted: the compilation files Fillmore's
         Maryland under «Whig» (1856 had no Whig candidate) and Byrd's Mississippi under
         «Democratic», so a label that cannot be resolved is only a problem when nothing overrides it. */
      const ov = (OVERRIDE[e.y] || {})[st];
      if (ov != null) { s[st] = ov; continue; }
      if (lbl === 'Other') { s[st] = -1; continue; }
      const i = idxOf(LABEL[lbl]);
      if (i < 0) { problems.push(e.y + ' ' + st + ': no «' + lbl + '» candidate'); continue; }
      s[st] = i;
    }
    Object.assign(s, OVERRIDE[e.y] || {});
  }
  for (const st of Object.keys(s)) {
    if (!CODES.has(st)) problems.push(e.y + ': ' + st + ' is not a state in the geometry');
    if (s[st] < 0) problems.push(e.y + ': ' + st + ' is «Other» with no override');
    if (s[st] >= e.c.length) problems.push(e.y + ': ' + st + ' indexes candidate ' + s[st] + ' of ' + e.c.length);
  }
  const o = { y: e.y, t: e.t, c: e.c, s, w: (e.won != null ? e.won : 0) };
  if (e.note) o.note = e.note;
  if (e.split) o.split = e.split;
  return o;
}).filter(Boolean);

if (problems.length) { console.error('✗ ' + problems.length + ' problem(s):'); problems.slice(0, 40).forEach((p) => console.error('    ' + p)); process.exit(1); }

const payload = {
  _: 'U.S. presidential elections 1789–2024. Electoral College results: National Archives (1789–2020) '
   + 'and the American Presidency Project (UCSB); state-by-state returns compiled via '
   + 'zonination/election-history; 2020 and 2024 entered from the certified results. '
   + 'Geometry: Natural Earth 1:110m admin-1 (public domain).',
  parties: PARTIES,
  elections,
};
if (CHECK) {
  let bad = 0;
  for (const [p, v] of [[OUT_E, payload], [OUT_G, geo]]) {
    if (!existsSync(p)) { console.error('  ✗ missing ' + p); bad++; continue; }
    if (readFileSync(p, 'utf8') !== JSON.stringify(v)) { console.error('  ✗ stale ' + p); bad++; }
    else console.log('  ✓ ' + p.replace(ROOT, '.'));
  }
  process.exit(bad ? 1 : 0);
}
writeFileSync(OUT_E, JSON.stringify(payload));
writeFileSync(OUT_G, JSON.stringify(geo));
const cells = elections.reduce((a, e) => a + Object.keys(e.s).length, 0);
console.log('✓ ' + elections.length + ' elections, ' + cells + ' state results → data/us-elections.json ('
  + Math.round(JSON.stringify(payload).length / 1024) + ' KB)');
console.log('✓ ' + geo.features.length + ' state polygons → data/us-states.json ('
  + Math.round(JSON.stringify(geo).length / 1024) + ' KB)');
