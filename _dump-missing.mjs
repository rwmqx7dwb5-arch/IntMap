/* one-off (#R239): the inline strings a language has no entry for, as a plain JSON array. */
import { execFileSync, } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parse } from 'acorn';

const code = process.argv[2] || 'fr';
const out = execFileSync(process.execPath, ['scripts/i18n-report.mjs', '--missing', code],
  { encoding: 'utf8', maxBuffer: 64e6 });
/* each line is `    'english': 'english',   /* files *​/` — parse it as JS rather than un-escaping by hand */
const body = out.split('\n').filter((l) => l.trim().startsWith("'")).join('\n');
const ast = parse('({' + body + '})', { ecmaVersion: 2022 });
const props = ast.body[0].expression.properties;
const arr = props.map((p) => p.key.value);
writeFileSync(`_missing.${code}.json`, JSON.stringify(arr));
console.log(code, 'n=', arr.length, 'chars=', arr.join('').length);
const b = {}; arr.forEach((s) => { const k = s.length < 20 ? '<20' : s.length < 60 ? '20-60' : s.length < 140 ? '60-140' : '140+'; b[k] = (b[k] || 0) + 1; });
console.log(JSON.stringify(b));
