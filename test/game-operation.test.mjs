import test from 'node:test';
import assert from 'node:assert/strict';
import { completeGameOperation } from '../src/identity/game-operation.mjs';

test('resposta perdida mantém operação e a próxima tentativa recupera o mesmo resultado', async () => {
  const operation = { operationId: 'id-ficticio' };
  let stored = null, calls = 0, presented = null, cleared = 0;
  const deps = {
    ensureSession: async () => {}, claim: async () => operation,
    send: async () => {
      calls++;
      if (!stored) { stored = { status: 'ok', balance: 19 }; throw new Error('resposta perdida'); }
      return { ...stored, replayed: true };
    },
    readState: async () => ({ balance: 19 }),
    present: (responses, state) => { presented = { responses, state }; },
    clear: async () => { cleared++; },
  };
  await assert.rejects(completeGameOperation(deps), /resposta perdida/);
  assert.equal(cleared, 0);
  assert.equal(presented, null);
  await completeGameOperation(deps);
  assert.equal(calls, 2);
  assert.equal(presented.responses[0].replayed, true);
  assert.equal(presented.state.balance, 19);
  assert.equal(cleared, 1);
});

test('troca de conta durante a espera impede apresentação e preserva operação', async () => {
  let account = 'A', presented = false, cleared = false;
  const deps = {
    ensureSession: async () => { if (account !== 'A') throw new Error('session_changed'); },
    claim: async () => ({ operationId: 'id-ficticio' }),
    send: async () => ({ status: 'ok', replayed: false }),
    readState: async () => { account = 'B'; return { balance: 19 }; },
    present: () => { presented = true; }, clear: async () => { cleared = true; },
  };
  await assert.rejects(completeGameOperation(deps), /session_changed/);
  assert.equal(presented, false);
  assert.equal(cleared, false);
});
