import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProofClient } from '../src/preview/neon-proof-client.mjs';
import { completeGameOperation } from '../src/identity/game-operation.mjs';

const base = 'https://example.neon.tech/neondb';
const api = 'https://function.example.test';
const account = { id: 'A' };
const auth = { auth: { getSession: async () => ({ data: { user: account } }) } };
const json = (value) => ({ ok: true, json: async () => value });

test('resposta da rodada que não chega expira e recuperação usa o mesmo identificador', async () => {
  let stored = null, calls = 0, cleared = false, presented = null;
  const client = createNeonProofClient(base, api, async (url, options) => {
    if (url.endsWith('/token')) return json({ token: 'token-ficticio' });
    if (url.endsWith('/state')) return json({ balance: 19 });
    const body = JSON.parse(options.body);
    assert.equal(body.expectedUserId, 'A');
    assert.equal(body.operationId, 'operacao-ficticia');
    calls++;
    if (!stored) {
      stored = { status: 'ok', balance: 19 };
      return new Promise(() => {});
    }
    return json({ ...stored, replayed: true });
  }, { client: auth, timeoutMs: 10 });
  const deps = {
    ensureSession: () => client.ensureSession('A', () => true),
    claim: async () => ({ operationId: 'operacao-ficticia' }),
    send: (operation) => client.request('spin', 'A', () => true, operation.operationId),
    readState: () => client.request('state', 'A', () => true),
    present: (responses, state) => { presented = { responses, state }; },
    clear: async () => { cleared = true; },
  };
  await assert.rejects(completeGameOperation(deps), /request_timeout/);
  assert.equal(cleared, false);
  assert.equal(presented, null);
  await completeGameOperation(deps);
  assert.equal(calls, 2);
  assert.equal(presented.responses[0].replayed, true);
  assert.equal(presented.state.balance, 19);
  assert.equal(cleared, true);
});

test('mudança de conta enquanto busca token impede envio à função', async () => {
  let user = { id: 'A' }, functionCalled = false;
  const client = createNeonProofClient(base, api, async (url) => {
    if (url.endsWith('/token')) { user = { id: 'B' }; return json({ token: 'token-ficticio' }); }
    functionCalled = true;
    return json({});
  }, { client: { auth: { getSession: async () => ({ data: { user } }) } }, timeoutMs: 100 });
  await assert.rejects(client.request('spin', 'A', () => true, 'operacao-ficticia'), /session_changed/);
  assert.equal(functionCalled, false);
});

test('corpo da resposta que não termina também expira', async () => {
  const client = createNeonProofClient(base, api, async () => ({ ok: true, json: () => new Promise(() => {}) }), { client: auth, timeoutMs: 10 });
  await assert.rejects(client.ensureSession('A', () => true), /request_timeout/);
});

test('consulta de sessão que não retorna também expira', async () => {
  const client = createNeonProofClient(base, api, async () => json({}), {
    client: { auth: { getSession: () => new Promise(() => {}) } }, timeoutMs: 10,
  });
  await assert.rejects(client.user(), /session_timeout/);
});
