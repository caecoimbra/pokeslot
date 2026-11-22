import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openLocalGameStore } from '../src/server/local-game-store.mjs';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';

const round = () => ({ grid: [['pokeball']], winningLines: [], rewardTypes: [{ line: 'top', type: 'pokemon' }] });
const captures = () => [{ speciesId: 25, isShiny: false, rarity: 'common' }];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('persiste saldo e coleção por identidade fictícia e recupera resultado repetido', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeslot-local-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'game.sqlite');
  const options = { now: () => 0, makeRound: round, makeCaptures: captures };
  let store = openLocalGameStore(path, options);
  assert.equal(store.read('a').balance, 20);
  const first = store.spin('a', id(1));
  assert.equal(first.balance, 19);
  assert.equal(first.captures[0].status, 'new');
  store.close();
  store = openLocalGameStore(path, options);
  assert.deepEqual(store.read('a').ownedVariants, [{ speciesId: 25, isShiny: false }]);
  assert.equal(store.spin('a', id(1)).replayed, true);
  assert.equal(store.read('a').balance, 19);
  assert.equal(store.read('b').balance, 20);
  assert.deepEqual(store.read('b').ownedVariants, []);
  assert.equal(store.spin('a', id(2)).captures[0].status, 'duplicate');
  store.close();
});

test('requisições simultâneas com mesmo ID debitam uma única vez', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeslot-concurrency-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'game.sqlite');
  const setup = openLocalGameStore(path, { now: () => 0 });
  setup.read('a');
  setup.close();
  const workers = [1, 2].map(() => new Worker(new URL('./helpers/local-game-worker.mjs', import.meta.url), {
    workerData: { path, operationId: id(1) },
  }));
  await Promise.all(workers.map((worker) => once(worker, 'message')));
  const results = workers.map((worker) => once(worker, 'message').then(([result]) => result));
  workers.forEach((worker) => worker.postMessage('start'));
  const [a, b] = await Promise.all(results);
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]);
  assert.equal(a.balance, 19);
  assert.equal(b.balance, 19);
  await Promise.all(workers.map((worker) => worker.terminate()));
  const check = openLocalGameStore(path, { now: () => 0 });
  assert.equal(check.read('a').balance, 19);
  check.close();
});

test('duas rodadas simultâneas não gastam o mesmo último giro', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeslot-last-spin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'game.sqlite');
  const setup = openLocalGameStore(path, { now: () => 0, makeRound: round, makeCaptures: captures });
  for (let i = 1; i <= 19; i++) setup.spin('a', id(i));
  setup.close();
  const workers = [20, 21].map((n) => new Worker(new URL('./helpers/local-game-worker.mjs', import.meta.url), {
    workerData: { path, operationId: id(n) },
  }));
  await Promise.all(workers.map((worker) => once(worker, 'message')));
  const results = workers.map((worker) => once(worker, 'message').then(([result]) => result));
  workers.forEach((worker) => worker.postMessage('start'));
  const outcomes = await Promise.all(results);
  assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), ['no_balance', 'ok']);
  await Promise.all(workers.map((worker) => worker.terminate()));
  const check = openLocalGameStore(path, { now: () => 0 });
  assert.equal(check.read('a').balance, 0);
  check.close();
});

test('reposição acumulada, saldo zero e ausência de débito parcial em falha', () => {
  let clock = 0;
  let fail = false;
  const store = openLocalGameStore(':memory:', { now: () => clock, makeRound: () => {
    if (fail) throw new Error('simulated failure');
    return round();
  }, makeCaptures: captures });
  store.read('a');
  fail = true;
  assert.throws(() => store.spin('a', id(1)), /simulated failure/);
  assert.equal(store.read('a').balance, 20);
  assert.deepEqual(store.read('a').ownedVariants, []);
  fail = false;
  for (let i = 1; i <= 20; i++) store.spin('a', id(i));
  assert.equal(store.spin('a', id(21)).status, 'no_balance');
  clock = 53 * 60 * 60 * 1000;
  const state = store.read('a');
  assert.equal(state.balance, 20);
  assert.equal(state.cycleStartedAtMs, 48 * 60 * 60 * 1000);
  assert.equal(store.read('a').balance, 20);
  assert.deepEqual(store.spin('a', id(21)), { status: 'no_balance', balance: 0, replayed: true });
  store.close();
});

test('vales locais são persistidos e repetição não duplica saldo nem inventário', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeslot-vouchers-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'game.sqlite');
  const options = { now: () => 0, makeRound: () => ({ grid: [], winningLines: [], rewardTypes: [
    { line: 'top', type: 'voucher' }, { line: 'bottom', type: 'voucher' },
  ] }), makeCaptures: () => [], makeVouchers: () => [
    { line: 'top', type: 'spins' }, { line: 'bottom', type: 'pokemon' },
  ] };
  let store = openLocalGameStore(path, options);
  const first = store.spin('a', id(1));
  assert.equal(first.balance, 21);
  assert.equal(first.voucherSpins, 2);
  assert.equal(first.vouchers[0].spinsAwarded, 2);
  assert.deepEqual(store.read('a').vouchers, [{ type: 'pokemon', amount: 1 }]);
  assert.equal(store.spin('a', id(1)).replayed, true);
  assert.equal(store.spin('a', id(1)).vouchers[0].spinsAwarded, 2);
  assert.equal(store.read('a').balance, 21);
  assert.deepEqual(store.read('b').vouchers, []);
  store.close();
  store = openLocalGameStore(path, options);
  assert.deepEqual(store.read('a').vouchers, [{ type: 'pokemon', amount: 1 }]);
  assert.equal(store.read('a').balance, 21);
  store.close();
});

test('falha após inserir um vale reverte inventário, saldo e captura', () => {
  const store = openLocalGameStore(':memory:', { now: () => 0, makeRound: round, makeCaptures: captures,
    makeVouchers: () => [{ line: 'top', type: 'pokemon' }, { line: 'bottom', type: null }] });
  assert.throws(() => store.spin('a', id(1)));
  assert.equal(store.read('a').balance, 20);
  assert.deepEqual(store.read('a').ownedVariants, []);
  assert.deepEqual(store.read('a').vouchers, []);
  store.close();
});
