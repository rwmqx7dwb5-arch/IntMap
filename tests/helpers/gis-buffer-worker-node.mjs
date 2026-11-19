/* A web-API `Worker` over a node:worker_threads thread running the product's OWN src/gis-buffer-worker.js
   (through gis-buffer-worker-node-entry.mjs), for the node check and the scale bench. Returns a counter of the
   threads started so far. */
import { Worker as NodeWorker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./gis-buffer-worker-node-entry.mjs', import.meta.url));

export function installNodeWorker() {
  const state = { spawned: 0 };
  globalThis.Worker = class {
    constructor() {
      state.spawned++;
      this.t = new NodeWorker(entry);
      this.t.on('message', (d) => { if (this.onmessage) this.onmessage({ data: d }); });
      this.t.on('error', (e) => { if (this.onerror) this.onerror(e); });
    }
    postMessage(m) { this.t.postMessage(m); }
    terminate() { this.t.terminate(); }
  };
  return state;
}
