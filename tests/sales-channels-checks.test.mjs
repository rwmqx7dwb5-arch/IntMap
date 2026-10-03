/* ============================================================================
 *  sales-channels — the organisation pages, the enquiry path and the supporters list
 * ----------------------------------------------------------------------------
 *  ① ONE VOCABULARY: the words and ceilings of an enquiry are declared once
 *     (supabase/functions/_shared/inquiry-shape.js); the table's CHECK constraints
 *     (20261003100000_org_inquiries.sql) and the contact form's choices (generated) must say the same.
 *  ② THE WRITE PATH, EVALUATED: reader-reports takes kind 'inquiry' to org_inquiries, through the same
 *     buckets as feedback, and refuses what it must refuse BEFORE touching the database (the honeypot,
 *     no consent, an unknown word, an address that is not one, a website that is not http(s)).
 *     The reply address is the one typed even when signed in; user_id is the verified account's.
 *  ③ THE PAGES ARE WHAT THE GENERATOR WRITES, and every file they load is shipped (vite STATIC_ASSETS).
 *  ④ THE PAGES CLAIM NOTHING NO RECORD HOLDS: no price, an «example, not a case study» note beside every
 *     example list, and the backend reachable only from the two pages that talk to it (CSP).
 *  ⑤ THE TERMS say what an embed must keep and what an enquiry and a donation are, in both languages.
 *  The database half (RLS, the purge) is supabase/tests/18_org_inquiries_test.sql.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p) => pathToFileURL(join(ROOT, p)).href;
const norm = (s) => s.replace(/\r\n/g, '\n');

const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SUPABASE_ANON_KEY: 'stub-publishable-key' };
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: () => {} };
const SHAPE = await import(modUrl('supabase/functions/_shared/inquiry-shape.js'));
const FN = await import(modUrl('supabase/functions/reader-reports/index.ts'));
const { PRODUCTION_ORIGIN: PROD } = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));
const GEN = await import(modUrl('scripts/org-pages.mjs'));
const MIG = src('supabase/migrations/20261003100000_org_inquiries.sql');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────── */
function checkList(column) {
  const m = new RegExp(column + '\\s+text\\s+not null check \\(' + column + '\\s+in \\(([^)]*)\\)\\)').exec(MIG);
  assert.ok(m, 'the migration still states the ' + column + ' CHECK as a list');
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}
test('sales-channels ① the audience and purpose words are the same in the function, the table and the form', () => {
  assert.deepEqual(checkList('audience'), [...SHAPE.INQUIRY.audiences]);
  assert.deepEqual(checkList('purpose'), [...SHAPE.INQUIRY.purposes]);
  const F = GEN.orgFacts();
  for (const [rel, html] of Object.entries(GEN.outputs(F)).filter(([r]) => r.endsWith('contact.html'))) {
    const opts = (name) => [...(new RegExp('<select id="og-' + name + '"[^>]*>([\\s\\S]*?)</select>').exec(html) || [, ''])[1].matchAll(/value="([a-z_]+)"/g)].map((x) => x[1]);
    assert.deepEqual(opts('audience'), [...SHAPE.INQUIRY.audiences], rel + ': the audience choices');
    assert.deepEqual(opts('purpose'), [...SHAPE.INQUIRY.purposes], rel + ': the purpose choices');
    assert.ok(html.includes('name="' + SHAPE.INQUIRY.honeypot + '"'), rel + ': the honeypot field is the declared one');
  }
});
test('sales-channels ① every ceiling the function enforces is the table\'s own', () => {
  for (const [col, max] of Object.entries(SHAPE.INQUIRY_LIMITS)) {
    const m = new RegExp('\\n\\s*' + col + '\\s+text[^\\n]*char_length\\(' + col + '\\)\\s*(?:<=\\s*(\\d+)|between \\d+ and (\\d+))').exec(MIG);
    assert.ok(m, col + ': the migration states a length CHECK');
    assert.equal(Number(m[1] || m[2]), max, col + ': the function and the table agree');
  }
  assert.equal(FN.LIMITS.inquiry, SHAPE.INQUIRY_LIMITS, 'reader-reports restates nothing — it imports the declaration');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────── */
const USER = { id: '11111111-2222-4333-8444-555555555555', email: 'account@example.test' };
function req(body, headers) {
  return new Request('https://stub.supabase.test/functions/v1/reader-reports', {
    method: 'POST', headers: { origin: PROD, 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  });
}
function stub() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url), h = new Headers((init && init.headers) || {});
    calls.push({ url: u, body: init && init.body ? String(init.body) : '', auth: h.get('authorization') || '' });
    if (u.endsWith('/rpc/relay_take')) return new Response(JSON.stringify([{ allowed: true, remaining: 3 }]), { status: 200 });
    if (u.endsWith('/auth/v1/user')) return h.get('authorization') === 'Bearer good' ? new Response(JSON.stringify(USER), { status: 200 }) : new Response('{}', { status: 401 });
    if (u.endsWith('/rest/v1/org_inquiries')) return new Response(null, { status: 201 });
    return new Response('{}', { status: 404 });
  };
  return calls;
}
const ENQ = { kind: 'inquiry', audience: 'newsroom', purpose: 'embed', name: 'A Reporter', email: 'desk@example.org', organization: 'Example Daily',
  role: 'Graphics editor', website: 'https://example.org', country: 'Japan', message: 'We would like to embed a map of 1914.', consent: true,
  page: '/IntMap/contact.html', lang: 'en', website_confirm: '' };

test('sales-channels ② an enquiry is written to org_inquiries by the service role, behind both buckets, with only the table\'s columns', async () => {
  const calls = stub();
  const res = await FN.handle(req({ ...ENQ, user_id: USER.id, status: 'replied', admin_note: 'x', id: 7, created_at: '2000-01-01' }));
  assert.equal(res.status, 201, await res.clone().text());
  assert.deepEqual(calls.map((c) => c.url.replace(ENV.SUPABASE_URL, '')), ['/rest/v1/rpc/relay_take', '/rest/v1/rpc/relay_take', '/rest/v1/org_inquiries']);
  const row = JSON.parse(calls[2].body);
  assert.equal(calls[2].auth, 'Bearer ' + ENV.SUPABASE_SERVICE_ROLE_KEY);
  assert.deepEqual(Object.keys(row).sort(),
    ['audience', 'consent', 'country', 'email', 'lang', 'message', 'name', 'organization', 'page', 'purpose', 'role', 'user_id', 'website'],
    'status, admin_note, id, created_at and the honeypot are the database\'s or nobody\'s');
  assert.equal(row.user_id, null, 'anonymous: the body cannot name an account');
  assert.equal(row.email, 'desk@example.org');
  assert.ok(!calls.some((c) => c.body.includes('203.0.113.9')), 'the caller\'s address is not written anywhere');
});

test('sales-channels ② a signed-in sender: user_id is the verified account\'s, the reply address is the one typed', async () => {
  const calls = stub();
  const res = await FN.handle(req(ENQ, { authorization: 'Bearer good' }));
  assert.equal(res.status, 201);
  const row = JSON.parse(calls.at(-1).body);
  assert.equal(row.user_id, USER.id);
  assert.equal(row.email, 'desk@example.org', 'an organisation is answered where it reads mail');
});

test('sales-channels ② what is refused never reaches the database or the buckets', async () => {
  const cases = [
    [{ ...ENQ, website_confirm: 'http://spam.example' }, 'the honeypot is filled'],
    [{ ...ENQ, consent: false }, 'no consent'],
    [{ ...ENQ, consent: 'true' }, 'consent must be the boolean true'],
    [{ ...ENQ, audience: 'advertiser' }, 'an unknown audience'],
    [{ ...ENQ, purpose: 'quote' }, 'an unknown purpose'],
    [{ ...ENQ, email: 'not-an-address' }, 'an address without @'],
    [{ ...ENQ, email: '' }, 'no reply address'],
    [{ ...ENQ, name: '  ' }, 'no name'],
    [{ ...ENQ, message: '' }, 'no message'],
    [{ ...ENQ, website: 'javascript:alert(1)' }, 'a website that is not http(s)'],
    [{ ...ENQ, message: 'x'.repeat(SHAPE.INQUIRY_LIMITS.message + 1) }, 'a message over the ceiling'],
    [{ ...ENQ, organization: { a: 1 } }, 'a text column takes text'],
  ];
  for (const [body, why] of cases) {
    const calls = stub();
    const res = await FN.handle(req(body));
    assert.equal(res.status, 400, why);
    assert.equal(calls.length, 0, why + ': nothing was asked of the backend');
  }
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────── */
test('sales-channels ③ every generated page is on disk exactly as the generator writes it', () => {
  const out = GEN.outputs();
  assert.equal(Object.keys(out).length, GEN.PAGES.length * 2 + 1, 'five pages in two languages and the console');
  for (const [rel, text] of Object.entries(out)) {
    assert.ok(existsSync(join(ROOT, rel)), rel + ' exists — run node scripts/org-pages.mjs --write');
    assert.equal(norm(src(rel)), text, rel + ' is what the generator writes');
  }
});

test('sales-channels ③ every page and every file a page loads is shipped (vite.config.js STATIC_ASSETS)', async () => {
  const { STATIC_ASSETS, STATIC_EXCLUDE } = await import(modUrl('vite.config.js'));
  /* …or a PNG at the root, which the build copies whole (vite.config.js ROOT_PNG) unless it is excluded */
  const shipped = (rel) => STATIC_ASSETS.some((a) => rel === a || rel.startsWith(a + '/'))
    || (/^[^/]+.png$/.test(rel) && !STATIC_EXCLUDE.includes(rel));
  for (const [rel, html] of Object.entries(GEN.outputs())) {
    assert.ok(shipped(rel), rel + ' is copied into dist/');
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
    for (const m of html.matchAll(/<(?:link|script|img)\b[^>]*?\b(?:href|src)="([^"#?]+)"/g)) {
      const ref = m[1];
      if (/^https?:|^__INTMAP_SITE_URL__/.test(ref) || ref.startsWith('vendor/')) continue;   /* vendor/ is the build's own copy (supabaseAdminSdk) */
      const target = new URL(ref, 'http://x/' + dir).pathname.slice(1);
      if (target.endsWith('.html')) continue;   /* a link to another page, not an asset */
      assert.ok(shipped(target), rel + ' loads ' + target + ', which is not in STATIC_ASSETS');
      assert.ok(existsSync(join(ROOT, target)), rel + ' loads ' + target + ', which does not exist');
    }
  }
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────── */
test('sales-channels ④ the pages name no price, call examples examples, and only the two talking pages may reach the backend', () => {
  const F = GEN.orgFacts();
  for (const [rel, html] of Object.entries(GEN.outputs(F))) {
    if (rel === 'admin-inquiries.html') continue;
    const text = html.replace(/<[^>]+>/g, ' ');
    assert.ok(!/[¥$€£]\s?\d|\d\s?(円|yen|USD|JPY)\b/i.test(text), rel + ': no price is stated (PRODUCT.md §2.4 — none is approved)');
    if (/data-showcase=/.test(html)) assert.ok(text.includes(src('scripts/org-pages-text.mjs').includes('not customer stories') && rel.startsWith('ja/') ? '導入事例ではありません' : 'not customer stories'),
      rel + ': the example maps are labelled as examples, not case studies');
    const csp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || '';
    const talks = /\/(contact|support)\.html$|^(contact|support)\.html$/.test(rel);
    assert.equal(csp.includes(F.backend), talks, rel + ': connect-src names the backend only where the page talks to it');
    assert.match(csp, /script-src 'self'(;|$)/, rel + ': script-src is this origin alone (no inline script)');
  }
});

test('sales-channels ④ the contact page says «sent» only when the function says «stored» (201)', () => {
  const js = src('js/org-page.js');
  assert.match(js, /res\.status === 201\) \{ form\.reset\(\); syncHint\(\); say\('sent', 'ok'\)/);
  assert.ok(!/innerHTML/.test(js), 'nothing from the backend is inserted as markup');
  assert.ok(!/innerHTML/.test(src('js/admin-inquiries.js')), 'the console inserts nothing as markup either');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────── */
test('sales-channels ⑤ the terms carry the embedding, enquiry and donation clauses in both languages', async () => {
  globalThis.window = globalThis.window || {};
  await import(modUrl('js/legal-text.js'));
  const L = globalThis.window.IntMapLegalText;
  const ja = L.html('terms', 'jp'), en = L.html('terms', 'en');
  assert.match(ja, /<b>12\. 埋め込み・組織での利用<\/b>/);
  assert.match(ja, /<b>13\. お問い合わせ・寄付・支援者の掲載<\/b>/);
  assert.match(en, /<b>12\. Embedding and use by organisations\.<\/b>/);
  assert.match(en, /<b>13\. Enquiries, donations and supporters\.<\/b>/);
  assert.match(en, /do not remove or hide the credit line/);
});
