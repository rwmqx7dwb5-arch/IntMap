#!/usr/bin/env node
/*  scripts/agent-sync.mjs — ONE source of truth for the agent context, two products.
 *
 *  (#R503) Before this existed, the repository described how to work on IntMap in files only
 *  Claude Code reads. A session opened with Codex started with NOTHING: not the standing
 *  instructions, not the execution strategy, not the round procedure, not the five roles.
 *  The first attempt at fixing that ran `Claude` → `Codex` over a copy of every file, which
 *  produced a second 33 KB rulebook naming `~/.Codex/projects/…` and `.Codex/rules/…` —
 *  paths that do not exist — and left two copies of every rule to drift apart. That is the
 *  failure §9 of AGENTS.md names by its own word: 正本が2つある状態.
 *
 *  So: the SOURCE is provider-neutral and lives under `.agents/`. The per-product files are
 *  RENDERED from it and committed, because each product only reads its own location:
 *
 *      .agents/roles/<name>.md        →  .claude/agents/<name>.md      (Claude Code)
 *                                     →  .codex/agents/<name>.toml     (Codex)
 *      .agents/skills/<skill>/…       →  .claude/skills/<skill>/…      (Claude Code)
 *                                        (Codex reads .agents/skills/ natively — no copy)
 *
 *  ⚠ THE RENDERED FILES ARE NOT EDITABLE. `--check` re-renders and compares, so an edit to a
 *    copy fails the gate instead of silently becoming a second source.
 *
 *  It also measures the two facts that have no other guard:
 *
 *   1. AGENTS.md against Codex's `project_doc_max_bytes` (32,768 by default). MEASURED #R503
 *      with codex-cli 0.150.0: a 36,095-byte AGENTS.md loaded its FIRST row and did not load
 *      its LAST one — the overflow is dropped with no warning anywhere. A rulebook that ends
 *      in silence is worse than a short one, so this is a hard failure, not a note.
 *   2. CLAUDE.md actually importing AGENTS.md. Claude Code reads `CLAUDE.md`, never
 *      `AGENTS.md`; the one line that connects them is `@AGENTS.md`, and if it is deleted the
 *      loss is invisible — every session just quietly stops having standing instructions.
 *
 *      npm run check:agents        # gate: render into memory and compare
 *      node scripts/agent-sync.mjs --write   # rewrite the rendered copies
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const lf = (s) => s.replace(/\r\n/g, '\n');

const problems = [];
const notes = [];
const fail = (tag, msg) => problems.push(`${tag}: ${msg}`);
const ok = (tag, msg) => notes.push(`${tag}: ${msg}`);

/* ── the byte ceiling on the standing instructions ────────────────────────────────────────
   Codex reads AGENTS.md up to `project_doc_max_bytes` and stops. We ship a `.codex/config.toml`
   that raises it, but that layer only loads in a TRUSTED project — and trust is recorded per
   PATH, so every fresh worktree starts without it (AGENTS.md §6 gives every round a new one).
   The number that always applies is therefore the DEFAULT, and that is what is asserted. */
const DOC_CEILING = 32768;
{
  const bytes = Buffer.byteLength(readFileSync(join(ROOT, 'AGENTS.md')));
  const margin = DOC_CEILING - bytes;
  if (bytes >= DOC_CEILING) {
    fail('doc-size', `AGENTS.md is ${bytes} bytes; Codex reads the first ${DOC_CEILING} and drops the rest without a warning. Move a section to docs/AGENT-SETUP.md, .agents/rules/ or the round skill — do not raise this number.`);
  } else {
    ok('doc-size', `AGENTS.md ${bytes}/${DOC_CEILING} bytes (margin ${margin})`);
    if (margin < 400) notes.push(`doc-size: ⚠ only ${margin} bytes left before Codex starts dropping the tail`);
  }
}

/* ── the one line that connects the two rulebooks ─────────────────────────────────────── */
{
  const claude = rd('CLAUDE.md');
  /* Claude Code skips imports inside code spans and fenced blocks, so the needle has to be a
     BARE @AGENTS.md — a backticked mention is exactly the thing that does not load. */
  const bare = lf(claude)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .split('\n')
    .some((l) => /(^|\s)@AGENTS\.md(\s|$)/.test(l));
  if (!bare) fail('claude-import', 'CLAUDE.md no longer imports AGENTS.md with a bare `@AGENTS.md` line — a Claude Code session would start with no standing instructions at all');
  else ok('claude-import', 'CLAUDE.md imports AGENTS.md');

  for (const rule of readdirSync(join(ROOT, '.agents/rules')).filter((f) => f.endsWith('.md'))) {
    const needle = `@.agents/rules/${rule}`;
    if (!lf(claude).includes(needle)) fail('claude-import', `.agents/rules/${rule} exists but CLAUDE.md does not import it (${needle}) — Claude Code would never load it`);
  }
  if (!problems.some((p) => p.startsWith('claude-import'))) ok('claude-import', `${readdirSync(join(ROOT, '.agents/rules')).length} rule file(s) imported`);
}

/* ── frontmatter ──────────────────────────────────────────────────────────────────────────
   Deliberately not a YAML library: the shape is fixed (scalars, plus one level of nesting for
   the per-product blocks) and a strict reader that REFUSES anything else is what keeps the
   source honest. A key this parser does not understand is a key no renderer would have read. */
const parseRole = (rel) => {
  const raw = lf(rd(rel));
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`${rel}: no frontmatter`);
  const out = { body: raw.slice(m[0].length).replace(/^\n+/, '') };
  let section = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const nested = line.match(/^ {2}([a-z_]+):\s*(.*)$/);
    const top = line.match(/^([a-z_]+):\s*(.*)$/);
    if (nested && section) { out[section][nested[1]] = nested[2]; continue; }
    if (!top) throw new Error(`${rel}: cannot read frontmatter line ${JSON.stringify(line)}`);
    if (top[2] === '') { section = top[1]; out[section] = {}; continue; }
    section = null;
    out[top[1]] = top[2];
  }
  for (const k of ['name', 'description', 'claude', 'codex']) {
    if (!out[k]) throw new Error(`${rel}: frontmatter has no ${k}`);
  }
  if (out.name !== rel.split('/').pop().replace(/\.md$/, '')) throw new Error(`${rel}: name «${out.name}» does not match the filename`);
  return out;
};

/* ── TOML emitters ────────────────────────────────────────────────────────────────────────
   A literal string ('…') processes no escapes, which is what instructions written in prose
   need — the first attempt at these files emitted BASIC strings and every line ending in the
   source turned into a visible «\r» in the agent's own instructions. */
const tomlStr = (v) => {
  if (v.includes("'") || v.includes('\n')) return JSON.stringify(v);   /* basic string, escaped */
  return `'${v}'`;
};
const tomlBlock = (v) => {
  if (v.includes("'''")) throw new Error('instructions contain ‹\'\'\'› and cannot be a TOML literal block');
  return `'''\n${v.replace(/\n+$/, '')}\n'''`;
};

/* ── renderers ────────────────────────────────────────────────────────────────────────── */
const renderClaudeRole = (r) => {
  const fm = ['---', `name: ${r.name}`, `description: ${r.description}`];
  if (r.claude.tools) fm.push(`tools: ${r.claude.tools}`);
  if (r.claude.model) fm.push(`model: ${r.claude.model}`);
  fm.push('---', '');
  return `${fm.join('\n')}\n${GENERATED_MD}\n${r.body}`;
};

const renderCodexRole = (r) => {
  const out = [
    GENERATED_TOML,
    `name = ${tomlStr(r.name)}`,
    `description = ${tomlStr(r.description)}`,
  ];
  /* Codex reads a custom agent file as a CONFIG LAYER, so anything valid in config.toml is
     valid here. `network_access` is not a top-level key — it lives under the workspace-write
     sandbox table — so it is mapped rather than copied through. */
  const net = r.codex.network_access;
  for (const [k, v] of Object.entries(r.codex)) {
    if (k === 'network_access') continue;
    out.push(`${k} = ${/^(true|false|\d+)$/.test(v) ? v : tomlStr(v)}`);
  }
  out.push(`developer_instructions = ${tomlBlock(r.body)}`);
  if (net === 'true') out.push('', '[sandbox_workspace_write]', 'network_access = true');
  return out.join('\n') + '\n';
};

const GENERATED_MD = `<!-- ⚠ 生成物。編集しない。正本は .agents/roles/ で、\`node scripts/agent-sync.mjs --write\` が書く（\`npm run check:agents\` が照合）。 -->`;
const GENERATED_TOML = `# ⚠ 生成物。編集しない。正本は .agents/roles/ で、\`node scripts/agent-sync.mjs --write\` が書く（\`npm run check:agents\` が照合）。`;

/* ── the render plan: every rendered path, and what should be in it ───────────────────── */
const plan = new Map();                                   /* rel path → expected content */

const ROLE_DIR = '.agents/roles';
const roles = readdirSync(join(ROOT, ROLE_DIR)).filter((f) => f.endsWith('.md')).sort();
if (roles.length === 0) fail('roles', `${ROLE_DIR} is empty — the五つの役 are the source, not the copies`);
for (const f of roles) {
  const r = parseRole(`${ROLE_DIR}/${f}`);
  plan.set(`.claude/agents/${r.name}.md`, renderClaudeRole(r));
  plan.set(`.codex/agents/${r.name}.toml`, renderCodexRole(r));
}

/* Codex reads `.agents/skills/` at the repository root by itself; Claude Code only reads
   `.claude/skills/`. So the skill tree is copied one way, verbatim, files and all. */
const walk = (rel, out = []) => {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${rel}/${e.name}`, out);
    else out.push(`${rel}/${e.name}`);
  }
  return out;
};
const SKILL_SRC = '.agents/skills';
const skillFiles = existsSync(join(ROOT, SKILL_SRC)) ? walk(SKILL_SRC) : [];
if (!skillFiles.some((f) => f.endsWith('/SKILL.md'))) fail('skills', `${SKILL_SRC} holds no SKILL.md — the round procedure is the source, not the copy`);
for (const f of skillFiles) plan.set(f.replace(SKILL_SRC, '.claude/skills'), rd(f));

/* ── apply, or compare ────────────────────────────────────────────────────────────────── */
{
  /* A rendered file left behind after its source is deleted is the same defect as a stale one:
     Claude Code would keep offering a role nothing describes any more. */
  const owned = (dir, ext) => (existsSync(join(ROOT, dir)) ? walk(dir).filter((f) => f.endsWith(ext)) : []);
  const strays = [...owned('.claude/agents', '.md'), ...owned('.codex/agents', '.toml'), ...owned('.claude/skills', '')]
    .filter((f) => !plan.has(f));
  for (const f of strays) {
    if (WRITE) { rmSync(join(ROOT, f)); console.log(`  removed  ${f}`); }
    else fail('stray', `${f} has no source under .agents/ — it is a copy nothing generates`);
  }

  let stale = 0;
  for (const [rel, want] of plan) {
    const abs = join(ROOT, rel);
    const got = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    if (got !== null && lf(got) === lf(want)) continue;
    stale++;
    if (WRITE) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, rel.endsWith('.toml') ? lf(want) : want);
      console.log(`  ${got === null ? 'created' : 'updated'}  ${rel}`);
    } else {
      fail('stale', `${rel} is ${got === null ? 'missing' : 'not what .agents/ renders to'} — run \`node scripts/agent-sync.mjs --write\``);
    }
  }
  if (!stale && !strays.length) ok('render', `${plan.size} rendered file(s) match .agents/`);
  if (WRITE && !stale && !strays.length) console.log('  (nothing to do — every copy already matches)');
}

/* ── report ───────────────────────────────────────────────────────────────────────────── */
if (!WRITE) {
  for (const n of notes) console.log(`  ok    ${n}`);
  for (const p of problems) console.error(`  FAIL  ${p}`);
  if (problems.length) {
    console.error(`\ncheck:agents — ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('\ncheck:agents — the agent context renders from one source');
}
