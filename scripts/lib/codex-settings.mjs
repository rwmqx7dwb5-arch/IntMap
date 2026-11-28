import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { updateSettings } from './local-settings.mjs';

export const codexConfigPath = () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');

const samePath = (a, b) => a.length === b.length && a.every((key, i) => key === b[i]);
const prefixOf = (a, b) => a.length <= b.length && a.every((key, i) => key === b[i]);
const names = key => key.keys.map(node => node.name ?? node.value);
const literal = value => JSON.stringify(value).replace(/\x7f/g, '\\u007f');
const bareOrQuoted = key => /^[A-Za-z0-9_-]+$/.test(key) ? key : literal(key);

export async function codexToml() {
  // Worktree setup also runs on fresh clones before npm ci. Load the parser
  // only when there is a Codex settings file, and report an unavailable parser.
  const { parseTOML, getStaticTOMLValue } = await import('toml-eslint-parser');
  return function parse(source) {
    const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
    const input = source.slice(bom.length);
    let ast;
    try { ast = parseTOML(input, { tomlVersion: '1.0' }); }
    catch (err) {
      throw new Error('Invalid Codex TOML at line ' + err.lineNumber + ', column ' + err.column);
    }
    const data = getStaticTOMLValue(ast);
    const newline = input.includes('\r\n') ? '\r\n' : '\n';
    const root = ast.body[0];
    const get = path => path.reduce((obj, key) => obj != null && Object.hasOwn(obj, key) ? obj[key] : undefined, data);
    const insert = (pos, value) => bom + input.slice(0, pos) + value + input.slice(pos);
    const set = (path, value) => {
      const visit = (nodes, base) => {
        for (const node of nodes) {
          if (node.type === 'TOMLTable') {
            if (node.kind === 'standard') {
              const found = visit(node.body, names(node.key));
              if (found) return found;
            }
            continue;
          }
          const key = [...base, ...names(node.key)];
          if (samePath(key, path)) return { replace: node.value.range };
          if (prefixOf(key, path) && node.value.type === 'TOMLInlineTable') {
            return visit(node.value.body, key) ?? { inline: node.value, key };
          }
        }
        return null;
      };
      const found = visit(root.body, []);
      if (found?.replace) {
        const [start, end] = found.replace;
        return bom + input.slice(0, start) + literal(value) + input.slice(end);
      }
      const entry = base => path.slice(base.length).map(bareOrQuoted).join('.') + ' = ' + literal(value);
      if (found?.inline) {
        const { inline, key } = found;
        return insert(inline.range[0] + 1, ' ' + entry(key) + (inline.body.length ? ',' : ' '));
      }
      let table = null, base = [];
      for (const node of root.body) {
        if (node.type !== 'TOMLTable' || node.kind !== 'standard') continue;
        const key = names(node.key);
        if (key.length > base.length && key.length < path.length && prefixOf(key, path)) {
          table = node;
          base = key;
        }
      }
      if (!table) {
        if (path.length === 2 && get([path[0]]) === undefined) {
          return insert(input.length, (input.endsWith('\n') ? '' : newline) + newline +
            '[' + bareOrQuoted(path[0]) + ']' + newline + entry([path[0]]) + newline);
        }
        return insert(0, entry(base) + newline);
      }
      const end = input.indexOf('\n', table.key.range[1]);
      return end < 0 ? insert(input.length, newline + entry(base) + newline) : insert(end + 1, entry(base) + newline);
    };
    return { get, set, text: source };
  };
}

export async function trustCodexProject(dir, file = codexConfigPath()) {
  if (!existsSync(file)) return 'absent';
  const project = ['projects', resolve(dir), 'trust_level'];
  const parse = await codexToml();
  return updateSettings(file, text => {
    if (text == null) return { result: 'absent' };
    const doc = parse(text);
    const current = doc.get(project);
    if (current !== undefined) return { result: current === 'trusted' ? 'trusted' : 'unchanged' };
    const next = doc.set(project, 'trusted');
    if (parse(next).get(project) !== 'trusted') throw new Error('Codex project trust edit did not apply');
    return { text: next, result: 'added' };
  });
}
