import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openLocalGameStore } from '../src/server/local-game-store.mjs';
import { demoRedemptionDetails } from '../src/domain/demo-redemption.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function options({ coupons = 0, capture = null } = {}) {
  return {
    now: () => 0,
    makeRound: () => ({ grid: [], winningLines: [], rewardTypes: capture ? [{ line: 'top', type: 'pokemon' }] : [] }),
    makeCaptures: () => capture ? [capture] : [],
    makeVouchers: () => Array.from({ length: coupons }, () => ({ line: 'top', type: 'pokemon' })),
  };
}

test('preços por raridade usam a proposta provisória do servidor', () => {
  for (const [speciesId, rarity, cost] of [[1, 'common', 1], [2, 'uncommon', 2], [3, 'rare', 3], [150, 'legendary', 4]]) {
    assert.deepEqual(demoRedemptionDetails(speciesId), { speciesId, rarity, cost });
  }
  for (const value of [0, 152, 1.5, '1', null]) assert.throws(() => demoRedemptionDetails(value), TypeError);
});

test('resgate debita o custo e registra variante normal; repetição não duplica', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pokeslot-redeem-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'game.sqlite');
  let store = openLocalGameStore(path, options({ coupons: 4 }));
  store.spin('a', id(1));
  const result = store.redeemPokemon('a', id(2), 3);
  assert.deepEqual(result, { status: 'ok', speciesId: 3, rarity: 'rare', cost: 3, replayed: false });
  assert.deepEqual(store.read('a').vouchers, [{ type: 'pokemon', amount: 1 }]);
  assert.deepEqual(store.read('a').ownedVariants, [{ speciesId: 3, isShiny: false }]);
  assert.deepEqual(store.redeemPokemon('a', id(2), 3), { ...result, replayed: true });
  assert.throws(() => store.redeemPokemon('a', id(2), 1), /another species/);
  assert.equal(store.redeemPokemon('a', id(3), 3).status, 'already_owned');
  assert.equal(store.redeemPokemon('a', id(4), 2).status, 'insufficient_vouchers');
  assert.deepEqual(store.read('a').vouchers, [{ type: 'pokemon', amount: 1 }]);
  store.close();
  store = openLocalGameStore(path, options());
  assert.deepEqual(store.redeemPokemon('a', id(2), 3), { ...result, replayed: true });
  assert.equal(store.read('a').ownedVariants.length, 1);
  assert.equal(store.read('b').ownedVariants.length, 0);
  store.close();
});

test('já ter apenas shiny permite registrar a normal; a shiny é preservada', () => {
  const store = openLocalGameStore(':memory:', options({ coupons: 1, capture: { speciesId: 1, isShiny: true, rarity: 'common' } }));
  store.spin('a', id(1));
  assert.equal(store.redeemPokemon('a', id(2), 1).status, 'ok');
  assert.deepEqual(store.read('a').ownedVariants, [{ speciesId: 1, isShiny: false }, { speciesId: 1, isShiny: true }]);
  assert.deepEqual(store.read('a').vouchers, []);
  store.close();
});

test('sem estoque suficiente e entradas inválidas não alteram inventário ou coleção', () => {
  const store = openLocalGameStore(':memory:', options({ coupons: 1 }));
  store.spin('a', id(1));
  const result = store.redeemPokemon('a', id(2), 150);
  assert.equal(result.status, 'insufficient_vouchers');
  assert.equal(store.redeemPokemon('a', id(2), 150).replayed, true);
  assert.throws(() => store.redeemPokemon('a', 'bad', 1), TypeError);
  assert.throws(() => store.redeemPokemon('a', id(3), 0), TypeError);
  assert.deepEqual(store.read('a').vouchers, [{ type: 'pokemon', amount: 1 }]);
  assert.deepEqual(store.read('a').ownedVariants, []);
  store.close();
});

test('duas solicitações simultâneas pelo mesmo vale concedem apenas uma espécie', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pokeslot-redeem-race-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'game.sqlite');
  const setup = openLocalGameStore(path, options({ coupons: 1 }));
  setup.spin('a', id(1));
  setup.close();
  const workers = [1, 4].map((speciesId, index) => new Worker(new URL('./helpers/local-redemption-worker.mjs', import.meta.url), {
    workerData: { path, speciesId, operationId: id(index + 2) },
  }));
  await Promise.all(workers.map((worker) => once(worker, 'message')));
  const pending = workers.map((worker) => once(worker, 'message').then(([value]) => value));
  workers.forEach((worker) => worker.postMessage('start'));
  const results = await Promise.all(pending);
  assert.deepEqual(results.map((result) => result.status).sort(), ['insufficient_vouchers', 'ok']);
  await Promise.all(workers.map((worker) => worker.terminate()));
  const store = openLocalGameStore(path, options());
  assert.equal(store.read('a').ownedVariants.length, 1);
  assert.deepEqual(store.read('a').vouchers, []);
  store.close();
});

test('falha após consumo restaura o vale e permite tentar a mesma operação', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pokeslot-redeem-rollback-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'game.sqlite');
  const store = openLocalGameStore(path, options({ coupons: 1 }));
  store.spin('a', id(1));
  const db = new DatabaseSync(path);
  db.exec("CREATE TRIGGER fail_demo_insert BEFORE INSERT ON variants BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
  assert.throws(() => store.redeemPokemon('a', id(2), 1), /falha simulada/);
  assert.deepEqual(store.read('a').vouchers, [{ type: 'pokemon', amount: 1 }]);
  assert.deepEqual(store.read('a').ownedVariants, []);
  db.exec('DROP TRIGGER fail_demo_insert');
  db.close();
  assert.equal(store.redeemPokemon('a', id(2), 1).status, 'ok');
  store.close();
});

test('duas solicitações simultâneas com mesmo identificador retornam o mesmo resgate', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pokeslot-redeem-replay-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'game.sqlite');
  const setup = openLocalGameStore(path, options({ coupons: 1 }));
  setup.spin('a', id(1));
  setup.close();
  const workers = Array.from({ length: 2 }, () => new Worker(new URL('./helpers/local-redemption-worker.mjs', import.meta.url), {
    workerData: { path, speciesId: 1, operationId: id(2) },
  }));
  await Promise.all(workers.map((worker) => once(worker, 'message')));
  const pending = workers.map((worker) => once(worker, 'message').then(([value]) => value));
  workers.forEach((worker) => worker.postMessage('start'));
  const results = await Promise.all(pending);
  assert.deepEqual(results.map((result) => result.status), ['ok', 'ok']);
  assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
  await Promise.all(workers.map((worker) => worker.terminate()));
  const store = openLocalGameStore(path, options());
  assert.deepEqual(store.read('a').ownedVariants, [{ speciesId: 1, isShiny: false }]);
  assert.deepEqual(store.read('a').vouchers, []);
  store.close();
});
