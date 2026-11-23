import { parentPort, workerData } from 'node:worker_threads';
import { openLocalGameStore } from '../../src/server/local-game-store.mjs';

if (parentPort) {
  const store = openLocalGameStore(workerData.path, { now: () => 0 });
  parentPort.postMessage('ready');
  parentPort.on('message', () => {
    try {
      const w = workerData;
      parentPort.postMessage(w.action === 'stone' ? store.redeemStone('a', w.operationId, w.stone)
        : store.evolve('a', w.operationId, w.source, w.targetId, w.stone));
    } catch (error) { parentPort.postMessage({ error: error.message }); }
    finally { store.close(); parentPort.close(); }
  });
}
