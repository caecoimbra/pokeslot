import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { openLocalGameStore } from '../src/server/local-game-store.mjs';
import { knownEvolutionOptions, DEMO_STONES } from '../src/server/evolution.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const variant = (speciesId, isShiny = false) => ({ speciesId, isShiny });
function setupOptions({ coupons = 0, captures = [] } = {}) {
  return { now: () => 0,
    makeRound: () => ({ grid: [], winningLines: [], rewardTypes: captures.map((_, i) => ({ line: `line-${i}`, type: 'pokemon' })) }),
    makeCaptures: () => captures.map((entry) => ({ ...entry, rarity: 'common' })),
    makeVouchers: () => Array.from({ length: coupons }, () => ({ line: 'top', type: 'stone' })) };
}
function tmp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pokeslot-stones-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'game.sqlite');
}
async function runRace(path, a, b) {
  const workers = [a, b].map((data) => new Worker(new URL('./helpers/local-stone-worker.mjs', import.meta.url), { workerData: { path, ...data } }));
  await Promise.all(workers.map((worker) => once(worker, 'message')));
  const results = workers.map((worker) => once(worker, 'message').then(([value]) => value));
  workers.forEach((worker) => worker.postMessage('start'));
  const output = await Promise.all(results);
  await Promise.all(workers.map((worker) => worker.terminate()));
  return output;
}

test('catálogo permite listar cópias sem alterar receitas do servidor', () => {
  const first = knownEvolutionOptions();
  assert.equal(first.length, 16);
  first[0].stone = 'altered';
  assert.notEqual(knownEvolutionOptions()[0].stone, 'altered');
  assert.deepEqual([...DEMO_STONES].sort(), ['fire', 'leaf', 'moon', 'thunder', 'water']);
});

test('troca pedra por vale, persiste, rejeita alteração de operação e não duplica', (t) => {
  const path = tmp(t);
  let store = openLocalGameStore(path, setupOptions({ coupons: 2 }));
  store.spin('a', id(1));
  const result = store.redeemStone('a', id(2), 'water');
  assert.deepEqual(result, { status: 'ok', stone: 'water', replayed: false });
  assert.deepEqual(store.redeemStone('a', id(2), 'water'), { ...result, replayed: true });
  assert.throws(() => store.redeemStone('a', id(2), 'fire'), /another stone/);
  assert.deepEqual(store.read('a').stones, [{ type: 'water', amount: 1 }]);
  assert.deepEqual(store.read('a').vouchers, [{ type: 'stone', amount: 1 }]);
  store.close();
  store = openLocalGameStore(path, setupOptions());
  assert.deepEqual(store.read('a').stones, [{ type: 'water', amount: 1 }]);
  assert.deepEqual(store.read('b').stones, []);
  assert.equal(store.redeemStone('a', id(2), 'water').replayed, true);
  assert.throws(() => store.redeemStone('a', id(3), 'bug'), TypeError);
  store.close();
});

test('evolução shiny preserva origem, registra destino, consome uma pedra e é idempotente', () => {
  const store = openLocalGameStore(':memory:', setupOptions({ coupons: 2, captures: [variant(133, true)] }));
  store.spin('a', id(1));
  store.redeemStone('a', id(2), 'water');
  store.redeemStone('a', id(3), 'water');
  const result = store.evolve('a', id(4), variant(133, true), 134, 'water');
  assert.equal(result.status, 'ok');
  assert.deepEqual(store.read('a').ownedVariants, [variant(133, true), variant(134, true)]);
  assert.deepEqual(store.read('a').stones, [{ type: 'water', amount: 1 }]);
  assert.equal(store.evolve('a', id(4), variant(133, true), 134, 'water').replayed, true);
  assert.throws(() => store.evolve('a', id(4), variant(133, true), 135, 'thunder'), /another evolution/);
  assert.equal(store.evolve('a', id(5), variant(133, true), 134, 'water').status, 'already_registered');
  assert.deepEqual(store.read('a').stones, [{ type: 'water', amount: 1 }]);
  store.close();
});

test('incompatibilidade, origem ausente ou pedra ausente não gastam item', () => {
  const store = openLocalGameStore(':memory:', setupOptions({ coupons: 1, captures: [variant(25)] }));
  store.spin('a', id(1));
  store.redeemStone('a', id(2), 'fire');
  assert.equal(store.evolve('a', id(3), variant(25), 26, 'fire').status, 'incompatible');
  assert.equal(store.evolve('a', id(4), variant(37), 38, 'fire').status, 'source_unavailable');
  assert.equal(store.evolve('a', id(5), variant(25), 26, 'thunder').status, 'missing_stone');
  assert.deepEqual(store.read('a').stones, [{ type: 'fire', amount: 1 }]);
  assert.throws(() => store.evolve('a', id(6), { speciesId: 25, isShiny: 'false' }, 26, 'thunder'), TypeError);
  store.close();
});

test('duas trocas simultâneas não gastam o mesmo último vale', async (t) => {
  const path = tmp(t);
  const store = openLocalGameStore(path, setupOptions({ coupons: 1 }));
  store.spin('a', id(1));
  store.close();
  const results = await runRace(path, { action: 'stone', operationId: id(2), stone: 'water' }, { action: 'stone', operationId: id(3), stone: 'fire' });
  assert.deepEqual(results.map((r) => r.status).sort(), ['insufficient_vouchers', 'ok']);
  const check = openLocalGameStore(path, setupOptions());
  assert.equal(check.read('a').stones.reduce((sum, item) => sum + item.amount, 0), 1);
  assert.deepEqual(check.read('a').vouchers, []);
  check.close();
});

test('duas evoluções simultâneas não gastam a mesma pedra', async (t) => {
  const path = tmp(t);
  const store = openLocalGameStore(path, setupOptions({ coupons: 1, captures: [variant(37), variant(58)] }));
  store.spin('a', id(1));
  store.redeemStone('a', id(2), 'fire');
  store.close();
  const results = await runRace(path,
    { action: 'evolve', operationId: id(3), source: variant(37), targetId: 38, stone: 'fire' },
    { action: 'evolve', operationId: id(4), source: variant(58), targetId: 59, stone: 'fire' });
  assert.deepEqual(results.map((r) => r.status).sort(), ['missing_stone', 'ok']);
  const check = openLocalGameStore(path, setupOptions());
  assert.equal(check.read('a').ownedVariants.length, 3);
  assert.deepEqual(check.read('a').stones, []);
  check.close();
});

test('duas chamadas simultâneas com mesmo ID repetem o resultado sem nova concessão', async (t) => {
  const path = tmp(t);
  const store = openLocalGameStore(path, setupOptions({ coupons: 1, captures: [variant(25)] }));
  store.spin('a', id(1));
  store.close();
  const stone = { action: 'stone', operationId: id(2), stone: 'thunder' };
  const stoneResults = await runRace(path, stone, stone);
  assert.deepEqual(stoneResults.map((r) => r.status), ['ok', 'ok']);
  assert.deepEqual(stoneResults.map((r) => r.replayed).sort(), [false, true]);
  const evolution = { action: 'evolve', operationId: id(3), source: variant(25), targetId: 26, stone: 'thunder' };
  const evolutionResults = await runRace(path, evolution, evolution);
  assert.deepEqual(evolutionResults.map((r) => r.status), ['ok', 'ok']);
  assert.deepEqual(evolutionResults.map((r) => r.replayed).sort(), [false, true]);
  const check = openLocalGameStore(path, setupOptions());
  assert.deepEqual(check.read('a').ownedVariants, [variant(25), variant(26)]);
  assert.deepEqual(check.read('a').stones, []);
  check.close();
});

test('erro ao registrar evolução reverte consumo da pedra e permite nova tentativa', (t) => {
  const path = tmp(t);
  const store = openLocalGameStore(path, setupOptions({ coupons: 1, captures: [variant(25)] }));
  store.spin('a', id(1));
  store.redeemStone('a', id(2), 'thunder');
  const db = new DatabaseSync(path);
  db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON variants BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
  assert.throws(() => store.evolve('a', id(3), variant(25), 26, 'thunder'), /falha simulada/);
  assert.deepEqual(store.read('a').stones, [{ type: 'thunder', amount: 1 }]);
  assert.deepEqual(store.read('a').ownedVariants, [variant(25)]);
  db.exec('DROP TRIGGER fail_insert');
  db.close();
  assert.equal(store.evolve('a', id(3), variant(25), 26, 'thunder').status, 'ok');
  store.close();
});
