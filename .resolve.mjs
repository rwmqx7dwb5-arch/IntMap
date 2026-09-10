import fs from 'node:fs';
/* Keep both sides of every hunk. DEV-NOTES is newest-first, so MINE goes first there; the two
   ledgers (DECISIONS, FILES) are plain lists, so MINE goes after HEAD. Abort on any hunk where the
   two sides touch the SAME line — keep-both is wrong there (#R674). */
function resolve(file, mineFirst) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  let i = 0, hunks = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const head = [], mine = [];
      i++;
      while (!lines[i].startsWith('=======')) head.push(lines[i++]);
      i++;
      while (!lines[i].startsWith('>>>>>>>')) mine.push(lines[i++]);
      i++;
      const overlap = head.filter((h) => h.trim() && mine.some((m) => m.trim() && (h.slice(0, 40) === m.slice(0, 40))));
      if (overlap.length) { console.error('⚠ same-line hunk in ' + file + ': ' + overlap[0].slice(0, 80)); process.exit(1); }
      out.push(...(mineFirst ? [...mine, ...head] : [...head, ...mine]));
      hunks++;
    } else out.push(lines[i++]);
  }
  fs.writeFileSync(file, out.join('\n'));
  console.log(file, 'hunks:', hunks);
}
resolve('DEV-NOTES.md', true);
resolve('DECISIONS.md', false);
resolve('docs/FILES.md', false);
for (const f of ['DEV-NOTES.md', 'DECISIONS.md', 'docs/FILES.md']) {
  if (/^(<{7}|>{7})/m.test(fs.readFileSync(f, 'utf8'))) { console.error('⚠ residue in ' + f); process.exit(1); }
}
console.log('ok');
