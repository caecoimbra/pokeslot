import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openPendingOperations, readPendingOperation, claimPendingOperation, clearPendingOperation } from '../src/identity/pending-operations.mjs';

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
