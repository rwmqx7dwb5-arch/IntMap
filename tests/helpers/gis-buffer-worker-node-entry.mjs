/* The thread the test below starts: node has no module Worker with `self.onmessage`, so this entry gives the
   product's OWN src/gis-buffer-worker.js the two things a browser worker has (`self`, `postMessage`) and feeds
   it the messages. Nothing of the worker's logic is here. */
import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = (m) => parentPort.postMessage(m);
await import('../../src/gis-buffer-worker.js');
parentPort.on('message', (m) => globalThis.onmessage({ data: m }));
