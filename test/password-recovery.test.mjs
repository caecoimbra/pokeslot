import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@neon/neon-js';
import { createPasswordRecovery, takePasswordRecoveryLink } from '../src/preview/password-recovery.mjs';

const page = 'http://localhost:5173/redefinir-senha.html';

test('retira o token e os demais dados do endereço e mantém o idioma', () => {
  const history = { replaceState: (...args) => { history.replaced = args; } };
  const link = `${page}?lang=en&token=fixture&redirectTo=https://example.test/#fixture`;
  assert.deepEqual(takePasswordRecoveryLink(link, history), { token: 'fixture', invalidLink: false, language: 'en' });
  assert.deepEqual(history.replaced, [null, '', `${page}?lang=en`]);
});

test('callback com erro, token vazio ou repetido não abre o formulário de nova senha', () => {
  for (const query of ['error=INVALID_TOKEN', 'token=', 'token=A&token=B', 'error=INVALID_TOKEN&token=A']) {
    const result = takePasswordRecoveryLink(`${page}?${query}`, { replaceState() {} });
    assert.deepEqual(result, { token: null, invalidLink: true, language: 'pt' });
  }
  assert.deepEqual(takePasswordRecoveryLink(page, {}), { token: null, invalidLink: false, language: 'pt' });
});

test('contrato do SDK para solicitar o link e alterar senha com token', async (t) => {
  const calls = [];
  const responses = [
    Response.json({ status: true, message: 'generic' }),
    Response.json({ status: true }),
    Response.json({ code: 'INVALID_TOKEN', message: 'provider detail' }, { status: 400 }),
  ];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ path: new URL(url).pathname.split('/').at(-1), method: options.method, body: JSON.parse(options.body) });
    return responses.shift();
  });
  const client = createClient('https://example.neon.tech/neondb');
  const recovery = createPasswordRecovery(client.auth, `${page}?token=fixture&next=https://example.test/`);
  assert.equal(await recovery.requestLink('owner@example.test', 'en'), 'requestAccepted');
  assert.equal(await recovery.resetPassword('fixture', 'new-password'), 'passwordChanged');
  assert.equal(await recovery.resetPassword('fixture', 'another-password'), 'invalidLink');
  assert.deepEqual(calls, [
    { path: 'request-password-reset', method: 'POST', body: { email: 'owner@example.test', redirectTo: `${page}?lang=en` } },
    { path: 'reset-password', method: 'POST', body: { token: 'fixture', newPassword: 'new-password' } },
    { path: 'reset-password', method: 'POST', body: { token: 'fixture', newPassword: 'another-password' } },
  ]);
});

test('distingue erro do provedor de confirmação e não apresenta seus detalhes', async () => {
  const auth = {
    requestPasswordReset: async () => ({ error: { code: 'RATE_LIMITED' } }),
    resetPassword: async () => ({ data: { status: false } }),
  };
  const recovery = createPasswordRecovery(auth, page);
  assert.equal(await recovery.requestLink('owner@example.test', 'pt'), 'requestFailed');
  assert.equal(await recovery.resetPassword('fixture', 'password'), 'resetFailed');
});
