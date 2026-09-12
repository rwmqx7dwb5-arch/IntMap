/* Registration is not necessarily exclusive ownership: a background explanation
 * can yield to a place reader. The registry knows no renderer or layer names.
 * Weak adapter/callback keys avoid retaining disposed views through their handlers.
 */
export function makeClickOwnership() {
  const owners = new Map(), callbacks = new WeakMap();
  return {
    on(adapter, layer, callback, options) {
      if (typeof layer !== 'string' || typeof callback !== 'function') return;
      let byCallback = callbacks.get(adapter);
      if (!byCallback) { byCallback = new WeakMap(); callbacks.set(adapter, byCallback); }
      let handlers = byCallback.get(callback);
      if (!handlers) { handlers = new Map(); byCallback.set(callback, handlers); }
      const counts = owners.get(layer) || { total: 0, exclusive: 0 };
      const previous = handlers.get(layer);
      const exclusive = previous === true || !(options && options.ownership === 'fallback');
      if (previous === undefined) counts.total++;
      if (exclusive && previous !== true) counts.exclusive++;
      handlers.set(layer, exclusive); owners.set(layer, counts);
    },
    off(adapter, layer, callback) {
      const byCallback = callbacks.get(adapter), handlers = byCallback && byCallback.get(callback);
      const counts = owners.get(layer);
      if (!handlers || !handlers.has(layer) || !counts) return;
      counts.total--; if (handlers.get(layer)) counts.exclusive--;
      handlers.delete(layer);
      if (!counts.total) owners.delete(layer);
    },
    layers(options) {
      return Array.from(owners.keys()).filter(layer => !options || !options.ownersOnly || owners.get(layer).exclusive > 0);
    },
  };
}
