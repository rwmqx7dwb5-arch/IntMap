import fs from 'node:fs';

/* ── index.html: both stamps take the NEW round number ─────────────────────────────────────── */
{
  const F = 'index.html';
  const L = fs.readFileSync(F, 'utf8').split('\n');
  const out = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i].startsWith('<<<<<<<')) {
      const mid = L.findIndex((l, k) => k > i && l.startsWith('======='));
      const end = L.findIndex((l, k) => k > mid && l.startsWith('>>>>>>>'));
      /* keep OURS (the incoming R553 line), then renumber below */
      out.push(...L.slice(mid + 1, end));
      i = end;
      continue;
    }
    out.push(L[i]);
  }
  fs.writeFileSync(F, out.join('\n'));
}

/* ── DEV-NOTES.md: keep BOTH sides. HEAD carries the rounds that merged while this one was open;
      the incoming side carries those same rounds plus this round's entry. Taking the incoming side
      whole would delete nothing only if it already contains HEAD's — it does not (it was written
      before R553..R556 landed), so the resolution is: HEAD's text, with this round's index line and
      body spliced back in at the top. ────────────────────────────────────────────────────────── */
{
  const F = 'DEV-NOTES.md';
  const L = fs.readFileSync(F, 'utf8').split('\n');
  const blocks = [];
  const out = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i].startsWith('<<<<<<<')) {
      const mid = L.findIndex((l, k) => k > i && l.startsWith('======='));
      const end = L.findIndex((l, k) => k > mid && l.startsWith('>>>>>>>'));
      blocks.push({ head: L.slice(i + 1, mid), ours: L.slice(mid + 1, end), at: out.length });
      out.push('@@CONFLICT' + (blocks.length - 1) + '@@');
      i = end;
      continue;
    }
    out.push(L[i]);
  }
  if (blocks.length !== 2) throw new Error('expected 2 conflicts, saw ' + blocks.length);

  /* ① the index: HEAD's newest line(s) + this round's line, this round's first */
  const idxMine = blocks[0].ours.filter((l) => l.startsWith('- **#R553**'));
  if (idxMine.length !== 1) throw new Error('index line not found in ours');
  const idxHead = blocks[0].head;

  /* ② the body: HEAD's rounds + this round's body, this round's first */
  const oursBody = blocks[1].ours;
  const start = oursBody.findIndex((l) => l.startsWith('## R553 —'));
  const stop = oursBody.findIndex((l, k) => k > start && l.startsWith('## R552 —'));
  if (start < 0 || stop < 0) throw new Error('body block not found in ours');
  const mineBody = oursBody.slice(start, stop);
  const headBody = blocks[1].head;

  const text = out.join('\n')
    .replace('@@CONFLICT0@@', idxMine.concat(idxHead).join('\n'))
    .replace('@@CONFLICT1@@', mineBody.concat(headBody).join('\n'));
  fs.writeFileSync(F, text);
}
console.log('ok');
