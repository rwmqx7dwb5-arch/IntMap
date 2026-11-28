/* The painter owns the opacity and its inputs. Register access under the layer's actual checkbox id so Atlas and
   other controls can read and write that value without guessing which DOM range belongs to the layer. */
const opacityAccess = new Map();
const opacityListeners = new Set();

export function registerLayerOpacityAccess(id, read, write) {
  opacityAccess.set(id, { read, write });
}

export function readLayerOpacity(id) {
  return opacityAccess.get(id)?.read() ?? null;
}

export function writeLayerOpacity(id, value) {
  const access = opacityAccess.get(id);
  if (!access || !Number.isFinite(value)) return false;
  access.write(Math.max(0, Math.min(1, value)));
  return true;
}

export function onLayerOpacityChange(fn) {
  opacityListeners.add(fn);
  return () => opacityListeners.delete(fn);
}

export function layerOpacityChanged(id, value) {
  for (const fn of opacityListeners) fn(id, value);
}
