import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openPendingOperations, claimPendingOperation, readPendingOperation } from '../src/identity/pending-operations.mjs';
import { claimProofGameOperation, claimProofInventoryOperation, readProofInventoryOperation, clearProofInventoryOperation, completeProofInventoryOperation } from '../src/identity/inventory-operation.mjs';

test('recupera parâmetros originais após reabrir e isola contas', async () => {
  const factory = new IDBFactory();
  const db = await openPendingOperations(factory);
  const args = { source: { speciesId: 25, isShiny: true }, targetId: 26, stone: 'thunder' };
  const original = await claimProofInventoryOperation(db, 'A', 'evolve', args, () => 'one');
  args.source.speciesId = 133;
  db.close();
  const reopened = await openPendingOperations(factory);
  assert.equal((await readProofInventoryOperation(reopened, 'A')).args.source.speciesId, 25);
  assert.equal(await readProofInventoryOperation(reopened, 'B'), null);
  assert.deepEqual(await claimProofInventoryOperation(reopened, 'A', 'stone', { stone: 'fire' }, () => 'two'), original);
  assert.equal((await claimProofInventoryOperation(reopened, 'B', 'stone', { stone: 'fire' }, () => 'two')).operationId, 'two');
  reopened.close();
});

test('abas disputando ações para uma conta preservam uma única intenção', async () => {
  const factory = new IDBFactory();
  const [db1, db2] = await Promise.all([openPendingOperations(factory), openPendingOperations(factory)]);
  const [first, second] = await Promise.all([
    claimProofInventoryOperation(db1, 'A', 'pokemon', { speciesId: 25 }, () => 'one'),
    claimProofInventoryOperation(db2, 'A', 'stone', { stone: 'fire' }, () => 'two'),
  ]);
  assert.deepEqual(first, second);
  db1.close(); db2.close();
});

test('rodada e inventário em abas distintas não iniciam simultaneamente para a mesma conta', async () => {
  const factory = new IDBFactory();
  const [db1, db2] = await Promise.all([openPendingOperations(factory), openPendingOperations(factory)]);
  const results = await Promise.allSettled([
    claimProofGameOperation(db1, 'A', () => 'game'),
    claimProofInventoryOperation(db2, 'A', 'stone', { stone: 'fire' }, () => 'inventory'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /other_operation_pending/);
  const game = await readPendingOperation(db1, 'game-proof:A');
  const inventory = await readProofInventoryOperation(db2, 'A');
  assert.equal(Number(!!game) + Number(!!inventory), 1);
  // Uma conta distinta pode iniciar sua própria operação.
  assert.equal((await claimProofInventoryOperation(db2, 'B', 'stone', { stone: 'water' }, () => 'other')).operationId, 'other');
  db1.close(); db2.close();
});

test('pendências legadas simultâneas continuam recuperáveis individualmente', async () => {
  const db = await openPendingOperations(new IDBFactory());
  const oldGame = await claimPendingOperation(db, 'game-proof:A', () => 'old-game');
  const oldInventory = await claimProofInventoryOperation(db, 'B', 'stone', { stone: 'fire' }, () => 'old-inventory');
  // Simula registros legados preexistentes para A sem usar os novos mecanismos.
  const tx = db.transaction('pending', 'readwrite');
  tx.objectStore('pending').put({ ...oldInventory, userId: 'inventory-proof:A' });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
  assert.deepEqual(await claimProofGameOperation(db, 'A', () => 'new-game'), oldGame);
  assert.equal((await claimProofInventoryOperation(db, 'A', 'pokemon', { speciesId: 25 }, () => 'new-inventory')).operationId, 'old-inventory');
  db.close();
});

test('resposta perdida preserva ID e parâmetros, e recuperação não repete o efeito', async () => {
  const db = await openPendingOperations(new IDBFactory());
  const args = { stone: 'fire' };
  let effect = 0, calls = 0, presented = null;
  const deps = {
    ensureSession: async () => {}, claim: () => claimProofInventoryOperation(db, 'A', 'stone', args, () => 'one'),
    send: async () => { calls++; if (calls === 1) { effect++; throw new Error('resposta perdida'); } return { status: 'ok', stone: 'fire', replayed: true }; },
    readState: async () => ({ stones: [{ type: 'fire', amount: effect }] }),
    present: (result, state) => { presented = { result, state }; },
    clear: (operation) => clearProofInventoryOperation(db, 'A', operation.operationId),
  };
  await assert.rejects(completeProofInventoryOperation(deps, { action: 'stone', args }), /resposta perdida/);
  assert.equal((await readProofInventoryOperation(db, 'A')).operationId, 'one');
  await completeProofInventoryOperation(deps, { action: 'stone', args });
  assert.equal(effect, 1);
  assert.equal(presented.result.replayed, true);
  assert.equal(presented.state.stones[0].amount, 1);
  assert.equal(await readProofInventoryOperation(db, 'A'), null);
  db.close();
});

test('troca de sessão depois da resposta não apresenta nem apaga pendência da conta original', async () => {
  const db = await openPendingOperations(new IDBFactory());
  let current = 'A', shown = false;
  const deps = {
    ensureSession: async () => { if (current !== 'A') throw new Error('session_changed'); },
    claim: () => claimProofInventoryOperation(db, 'A', 'stone', { stone: 'water' }, () => 'one'),
    send: async () => ({ status: 'ok', stone: 'water', replayed: false }),
    readState: async () => { current = 'B'; return {}; },
    present: () => { shown = true; }, clear: (op) => clearProofInventoryOperation(db, 'A', op.operationId),
  };
  await assert.rejects(completeProofInventoryOperation(deps), /session_changed/);
  assert.equal(shown, false);
  assert.equal((await readProofInventoryOperation(db, 'A')).operationId, 'one');
  assert.equal(await readProofInventoryOperation(db, 'B'), null);
  db.close();
});

test('troca de sessão durante criação da pendência impede envio', async () => {
  const db = await openPendingOperations(new IDBFactory());
  let current = 'A', sent = false;
  const deps = {
    ensureSession: async () => { if (current !== 'A') throw new Error('session_changed'); },
    claim: async () => { const op = await claimProofInventoryOperation(db, 'A', 'pokemon', { speciesId: 25 }, () => 'one'); current = 'B'; return op; },
    send: async () => { sent = true; }, readState: async () => ({}), present: () => {},
    clear: (op) => clearProofInventoryOperation(db, 'A', op.operationId),
  };
  await assert.rejects(completeProofInventoryOperation(deps), /session_changed/);
  assert.equal(sent, false);
  assert.equal((await readProofInventoryOperation(db, 'A')).operationId, 'one');
  db.close();
});

test('pendência diferente e resposta incompatível não são apresentadas nem apagadas', async () => {
  const db = await openPendingOperations(new IDBFactory());
  let sent = 0, shown = false;
  const deps = {
    ensureSession: async () => {}, claim: () => claimProofInventoryOperation(db, 'A', 'stone', { stone: 'fire' }, () => 'one'),
    send: async () => { sent++; return { status: 'ok', stone: 'water', replayed: false }; },
    readState: async () => ({}), present: () => { shown = true; },
    clear: (op) => clearProofInventoryOperation(db, 'A', op.operationId),
  };
  await assert.rejects(completeProofInventoryOperation(deps, { action: 'pokemon', args: { speciesId: 25 } }), /different_pending/);
  assert.equal(sent, 0);
  await assert.rejects(completeProofInventoryOperation(deps), /invalid_result/);
  assert.equal(shown, false);
  assert.equal((await readProofInventoryOperation(db, 'A')).operationId, 'one');
  db.close();
});

test('resposta antiga não apaga uma ação nova da mesma conta', async () => {
  const db = await openPendingOperations(new IDBFactory());
  await claimProofInventoryOperation(db, 'A', 'stone', { stone: 'fire' }, () => 'one');
  assert.equal(await clearProofInventoryOperation(db, 'A', 'one'), true);
  await claimProofInventoryOperation(db, 'A', 'stone', { stone: 'water' }, () => 'two');
  assert.equal(await clearProofInventoryOperation(db, 'A', 'one'), false);
  assert.equal((await readProofInventoryOperation(db, 'A')).operationId, 'two');
  db.close();
});
