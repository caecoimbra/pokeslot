import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSING_IDENTITY_CODE, MISSING_IDENTITY_MESSAGE, requestWithIdentityRetry } from '../src/identity/identity-retry.mjs';

const identityFailure = () => ({ error: { code: MISSING_IDENTITY_CODE, message: MISSING_IDENTITY_MESSAGE } });
const success = () => ({ data: [{ balance: 20, periods_added: 1 }], error: null });

test('não repete uma operação que já foi confirmada', async () => {
  let calls = 0;
  const result = await requestWithIdentityRetry(async () => { calls += 1; return success(); }, {
    wait: async () => { throw new Error('não deveria esperar'); },
  });
  assert.equal(calls, 1);
  assert.equal(result.attempts, 1);
});

test('repete somente a recusa identificada e devolve o sucesso', async () => {
  let calls = 0;
  const waits = [];
  const result = await requestWithIdentityRetry(async () => ++calls === 1 ? identityFailure() : success(), {
    wait: async (ms) => { waits.push(ms); },
    random: () => 0,
  });
  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.data[0].balance, 20);
  assert.deepEqual(waits, [150]);
});

test('limita tentativas quando a identidade continua indisponível', async () => {
  let calls = 0;
  const waits = [];
  const result = await requestWithIdentityRetry(async () => { calls += 1; return identityFailure(); }, {
    wait: async (ms) => { waits.push(ms); },
    random: () => 0,
  });
  assert.equal(calls, 5);
  assert.equal(result.attempts, 5);
  assert.equal(result.error.code, MISSING_IDENTITY_CODE);
  assert.deepEqual(waits, [150, 300, 600, 1200]);
});

test('acrescenta variação limitada aos intervalos entre tentativas', async () => {
  let calls = 0;
  const waits = [];
  await requestWithIdentityRetry(async () => ++calls < 3 ? identityFailure() : success(), {
    wait: async (ms) => { waits.push(ms); },
    random: () => 0.999,
  });
  assert.deepEqual(waits, [300, 450]);
});

test('não repete outros erros, mesmo com uma mensagem parecida', async () => {
  for (const error of [
    { code: '42501', message: MISSING_IDENTITY_MESSAGE },
    { code: MISSING_IDENTITY_CODE, message: 'outro erro' },
    { code: 'PGRST301', message: 'token expirado' },
  ]) {
    let calls = 0;
    const result = await requestWithIdentityRetry(async () => { calls += 1; return { error }; }, {
      wait: async () => { throw new Error('não deveria esperar'); },
    });
    assert.equal(calls, 1);
    assert.equal(result.error, error);
  }
});

test('não repete exceção de rede com resultado desconhecido', async () => {
  let calls = 0;
  await assert.rejects(requestWithIdentityRetry(async () => { calls += 1; throw new Error('rede'); }, {
    wait: async () => { throw new Error('não deveria esperar'); },
  }), /rede/);
  assert.equal(calls, 1);
});
