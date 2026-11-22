import { parentPort, workerData } from 'node:worker_threads';
import { openLocalGameStore } from '../../src/server/local-game-store.mjs';

if (parentPort) {
const store = openLocalGameStore(workerData.path, {
  now: () => 0,
  makeRound: () => ({ grid: [], winningLines: [], rewardTypes: [] }),
  makeCaptures: () => [],
});
parentPort.postMessage('ready');
parentPort.on('message', () => {
  try { parentPort.postMessage(store.spin('a', workerData.operationId)); }
  catch (error) { parentPort.postMessage({ error: error.message }); }
  finally { store.close(); parentPort.close(); }
});
}
