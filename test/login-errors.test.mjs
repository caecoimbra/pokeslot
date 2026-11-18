import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { describeLoginError } from '../src/identity/login-errors.mjs';

test('classifica credenciais recusadas pelo SDK', () => {
  assert.match(describeLoginError({ code: 'invalid_credentials' }), /e-mail ou a senha/);
});
test('classifica erro de origem sem expor conteúdo arbitrário', () => {
  assert.match(describeLoginError({ error: { code: 'INVALID_ORIGIN' } }), /origem/);
  assert.doesNotMatch(describeLoginError({ message: 'segredo de exemplo' }), /segredo/);
});
test('classifica falha de conexão', () => {
  assert.match(describeLoginError(new TypeError('fetch failed')), /conectar/);
});
