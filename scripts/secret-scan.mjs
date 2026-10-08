/* ============================================================================
 *  IntMap · THE SHAPES OF A COMMITTED SECRET, AND THE ONE JUDGEMENT OF A TEXT   (security-hardening)
 * ----------------------------------------------------------------------------
 *  Moved out of scripts/static-checks.mjs (rule 2) so the judgement is a function a test can evaluate
 *  instead of a loop only the gate runs. The repository is PUBLIC: a secret that reaches a commit is
 *  published. static-checks.mjs decides WHICH files are read (every file git would commit that is text);
 *  this decides what in a text is a secret.
 *
 *  ⚠ This file and static-checks.mjs are the only two the scan skips — they hold the patterns themselves.
 *  A test that needs a token builds it at run time, so its source never carries one.
 * ============================================================================ */

import { execFileSync } from 'node:child_process';
import { openSync, readSync, closeSync } from 'node:fs';
import { join, extname } from 'node:path';

export const SECRET_SCAN_SELF = new Set(['scripts/static-checks.mjs', 'scripts/secret-scan.mjs']);

export const SECRET_PATTERNS = [
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{12,}/ },
  { name: 'Stripe live secret', re: /\bsk_live_[A-Za-z0-9]{16,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },   // (#R138) ai-proxy provider key
  /* (security-hardening) the credentials this project's own operation uses and the list did not name: the
     Supabase CLI's personal access token (supabase-deploy.yml's SUPABASE_ACCESS_TOKEN — it can deploy to and
     read every project of the account), a Stripe restricted key and a webhook signing secret (donations),
     the Google OAuth client secret (the sign-in provider), and an npm token. Shapes from each issuer's
     documented format. */
  { name: 'Supabase personal access token', re: /\bsbp_[0-9a-f]{40}\b/ },
  { name: 'Stripe restricted live key', re: /\brk_live_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe webhook signing secret', re: /\bwhsec_[A-Za-z0-9+/=]{24,}/ },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'npm access token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
];

export function jwtIsServiceRole(tok) {
  try {
    const payload = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf8');
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch { return false; }
}

/**
 * findSecrets(text) → { secrets: [{ name, match }], jwts, serviceRoleJwt }
 *   secrets         every pattern that matches (its first match is enough to refuse the file)
 *   jwts            how many JWT-shaped strings the text holds
 *   serviceRoleJwt  true when ANY of them carries role=service_role — not only the first
 *   (security-hardening) the loop used `text.match` without /g, so a public anon JWT earlier in the file
 *   hid a service_role JWT after it.
 */
export function findSecrets(text) {
  const t = String(text || '');
  const secrets = [];
  for (const p of SECRET_PATTERNS) {
    const m = t.match(p.re);
    if (m) secrets.push({ name: p.name, match: m[0] });
  }
  const jwts = [...t.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)].map((m) => m[0]);
  return { secrets, jwts: jwts.length, serviceRoleJwt: jwts.some(jwtIsServiceRole) };
}

/* (security-hardening) WHAT CAN BE COMMITTED, NOT WHAT HAS A FAMILIAR EXTENSION. The scan read TEXT_EXT only, so
   a tracked shell script, PowerShell script, .env-style file or extensionless file was never read — measured
   2026-10-08: 11 tracked text files outside it (three .sh, a .ps1, .geojson, .tle, .webmanifest, .nvmrc, LICENSE, …).
   The universe is now the walk's text files PLUS every file git would commit (`ls-files --cached --others --exclude-standard`)
   that is text by its bytes (no NUL in its first 8 KiB). Nothing the walk read is dropped. */
function committableTextFiles(root, textFiles, binaryExt) {
  let names = [];
  try {
    names = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
  } catch { return []; }   /* not a git checkout (an unpacked archive): the walk's set is all there is */
  const seen = new Set(textFiles.map((f) => f.rel));
  const out = [];
  for (const name of names) {
    if (seen.has(name) || binaryExt.has(extname(name).toLowerCase())) continue;
    const abs = join(root, name);
    let head;
    try {
      const fd = openSync(abs, 'r');
      try { head = Buffer.alloc(8192); head = head.subarray(0, readSync(fd, head, 0, 8192, 0)); } finally { closeSync(fd); }
    } catch { continue; }   /* listed but gone from the tree (a deletion not yet staged) */
    if (head.includes(0)) continue;
    out.push({ abs, rel: name, ext: extname(name).toLowerCase() });
  }
  return out;
}
/** secretScanUniverse(root, walkTextFiles, binaryExt) → the walk's text files plus every committable text file it missed */
export function secretScanUniverse(root, textFiles, binaryExt) {
  return [...textFiles, ...committableTextFiles(root, textFiles, binaryExt)];
}
