/* ============================================================================
 *  IntMap · hostSlice — a factory is handed the members it reads, not the shell  (host-narrow-deps)
 * ----------------------------------------------------------------------------
 *  Every split-out factory used to be called `factory(IM_HOST)`: the whole 281-member shell
 *  (55 of them writable), whatever the factory read. A factory that reads `HOST.lang` and nothing
 *  else could still reach — and, through the 55 setters, change — anything else, and nobody could
 *  tell from its call site what it depended on.
 *
 *  hostSlice(HOST, ['lang', …]) returns an object with exactly those members. Each one is a LIVE
 *  accessor onto the same member of HOST (never a snapshot: the shell reassigns closure values such
 *  as the reader's language at runtime — #R165), and carries a setter only when HOST's member has one.
 *  A member HOST does not have is an error at hand-off, not an `undefined` found later.
 *
 *  The list at the call site is the dependency contract. tests/host-narrow-deps-checks.test.mjs
 *  derives, from the factory's own source, the members it reads and requires the list to equal them,
 *  so the contract can neither under-declare (a silent `undefined`) nor over-declare (a dependency
 *  nobody uses), and scripts/global-surface.mjs ratchets which factories are still given the whole
 *  shell (`hostWhole`) — a new one has to be named in review.
 * ==========================================================================*/
export function hostSlice(HOST, names) {
  const slice = {};
  for (const name of names) {
    const d = describe(HOST, name);
    if (!d) throw new Error('hostSlice: IM_HOST has no member "' + name + '"');
    const prop = { enumerable: true, get: () => HOST[name] };
    if (d.set) prop.set = (v) => { HOST[name] = v; };
    Object.defineProperty(slice, name, prop);
  }
  return Object.freeze(slice);
}

function describe(obj, name) {
  for (let o = obj; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d) return d;
  }
  return null;
}
