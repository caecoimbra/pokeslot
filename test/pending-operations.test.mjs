import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openPendingOperations, readPendingOperation, readPendingLocalAction, claimPendingLocalAction, claimPendingOperation, clearPendingOperation } from '../src/identity/pending-operations.mjs';

test('recupera ação local com destino depois de reabrir sem criar outra', async () => {
  const factory = new IDBFactory();
  const first = await openPendingOperations(factory);
  assert.equal(await readPendingLocalAction(first), null);
  const created = await claimPendingLocalAction(first, 'redeem-pokemon', { speciesId: 25 }, () => 'original');
  first.close();
  const reopened = await openPendingOperations(factory);
  assert.deepEqual(await readPendingLocalAction(reopened), created);
  const conflict = await claimPendingLocalAction(reopened, 'redeem-pokemon', { speciesId: 133 }, () => 'new');
  assert.deepEqual(conflict, created);
  assert.deepEqual(conflict.payload, { speciesId: 25 });
  reopened.close();
});

test('abas disputando ações distintas obtêm a mesma pendência e o mesmo payload', async () => {
  const factory = new IDBFactory();
  const [first, second] = await Promise.all([openPendingOperations(factory), openPendingOperations(factory)]);
  const [a, b] = await Promise.all([
    claimPendingLocalAction(first, 'redeem-pokemon', { speciesId: 25 }, () => 'one'),
    claimPendingLocalAction(second, 'redeem-stone', { stone: 'water' }, () => 'two'),
  ]);
  assert.deepEqual(a, b);
  assert.ok(a.operationId === 'one' || a.operationId === 'two');
  assert.deepEqual(a.payload, a.operationId === 'one' ? { speciesId: 25 } : { stone: 'water' });
  first.close(); second.close();
});

test('recupera vários resgates legados sem perdê-los e aceita ação nova após confirmação', async () => {
  const db = await openPendingOperations(new IDBFactory());
  await claimPendingOperation(db, 'local-redeem:25', () => 'old-25');
  await claimPendingOperation(db, 'local-redeem:133', () => 'old-133');
  const first = await readPendingLocalAction(db);
  assert.equal(first.action, 'redeem-pokemon');
  assert.equal(first.payload.speciesId, Number(first.userId.split(':')[1]));
  assert.equal((await claimPendingLocalAction(db, 'redeem-pokemon', { speciesId: 1 }, () => 'fresh')).operationId, first.operationId);
  assert.equal(await clearPendingOperation(db, first.userId, first.operationId), true);
  const next = await readPendingLocalAction(db);
  assert.notEqual(next.operationId, first.operationId);
  assert.equal(await clearPendingOperation(db, next.userId, next.operationId), true);
  assert.equal(await readPendingLocalAction(db), null);
  const fresh = await claimPendingLocalAction(db, 'redeem-pokemon', { speciesId: 1 }, () => 'fresh');
  assert.equal(fresh.operationId, 'fresh');
  assert.deepEqual(fresh.payload, { speciesId: 1 });
  db.close();
});

test('resposta atrasada não apaga outra ação local', async () => {
  const db = await openPendingOperations(new IDBFactory());
  const first = await claimPendingLocalAction(db, 'redeem-pokemon', { speciesId: 25 }, () => 'one');
  await clearPendingOperation(db, first.userId, first.operationId);
  const second = await claimPendingLocalAction(db, 'redeem-stone', { stone: 'water' }, () => 'two');
  assert.equal(await clearPendingOperation(db, first.userId, first.operationId), false);
  assert.deepEqual(await readPendingLocalAction(db), second);
  db.close();
});

test('consulta pendência sem criar operação e mantém contas separadas após reabrir', async () => {
  const indexedDB = new IDBFactory();
  const first = await openPendingOperations(indexedDB);
  assert.equal(await readPendingOperation(first, 'A'), null);
  await claimPendingOperation(first, 'A', () => 'original');
  first.close();
  const reopened = await openPendingOperations(indexedDB);
  assert.equal((await readPendingOperation(reopened, 'A')).operationId, 'original');
  assert.equal(await readPendingOperation(reopened, 'B'), null);
  await clearPendingOperation(reopened, 'A', 'original');
  assert.equal(await readPendingOperation(reopened, 'A'), null);
  reopened.close();
});

test('duas abas obtêm o mesmo ID pendente para a mesma conta', async () => {
  const indexedDB = new IDBFactory();
  const [first, second] = await Promise.all([openPendingOperations(indexedDB), openPendingOperations(indexedDB)]);
  const [a, b] = await Promise.all([
    claimPendingOperation(first, 'A', () => 'one'),
    claimPendingOperation(second, 'A', () => 'two'),
  ]);
  assert.equal(a.operationId, b.operationId);
  first.close(); second.close();
});
test('recupera operação depois de reabrir e separa contas', async () => {
  const indexedDB = new IDBFactory();
  const first = await openPendingOperations(indexedDB);
  await claimPendingOperation(first, 'A', () => 'original');
  first.close();
  const reopened = await openPendingOperations(indexedDB);
  assert.equal((await claimPendingOperation(reopened, 'A', () => 'new')).operationId, 'original');
  assert.equal((await claimPendingOperation(reopened, 'B', () => 'other')).operationId, 'other');
  reopened.close();
});

test('resposta antiga não apaga uma nova operação da conta', async () => {
  const db = await openPendingOperations(new IDBFactory());
  await claimPendingOperation(db, 'A', () => 'first');
  assert.equal(await clearPendingOperation(db, 'A', 'first'), true);
  await claimPendingOperation(db, 'A', () => 'second');
  assert.equal(await clearPendingOperation(db, 'A', 'first'), false);
  assert.equal((await claimPendingOperation(db, 'A')).operationId, 'second');
  db.close();
});

test('falha ao gerar identificador aborta a transação', async () => {
  const db = await openPendingOperations(new IDBFactory());
  await assert.rejects(claimPendingOperation(db, 'A', () => { throw new Error('sem ID'); }), /sem ID/);
  assert.equal((await claimPendingOperation(db, 'A', () => 'ok')).operationId, 'ok');
  db.close();
});
