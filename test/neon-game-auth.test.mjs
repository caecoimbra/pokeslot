import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
const jwk = { ...await exportJWK(publicKey), kid: 'game-key', alg: 'EdDSA', use: 'sig' };
process.env.NEON_AUTH_BASE_URL = 'https://auth.example.test/auth';
process.env.NEON_AUTH_JWKS_URL = 'https://auth.example.test/jwks';
process.env.DATABASE_URL = 'postgresql://proof:fake@db.example.test/neondb';
const originalFetch = globalThis.fetch;
let databaseCalls = 0;
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === 'https://auth.example.test/jwks') return Response.json({ keys: [jwk] });
  databaseCalls++;
  throw new Error('Unexpected external request');
};
const { default: app } = await import('../functions/neon-game-proof/index.ts');
async function token(subject) {
  return new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'game-key' }).setIssuer('https://auth.example.test')
    .setAudience('https://auth.example.test').setSubject(subject).setExpirationTime('5m').sign(privateKey);
}
function request(path, bearer, body) {
  return app.request(path, { method: 'POST', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
test('nega estado e rodada sem sessão antes de consultar banco', async () => {
  for (const path of ['/state', '/spin']) assert.equal((await request(path, null, {})).status, 401);
  assert.equal(databaseCalls, 0);
});
test('não usa uma identidade diferente da sessão validada', async () => {
  const bearer = await token('B');
  for (const path of ['/state', '/spin']) assert.equal((await request(path, bearer, { expectedUserId: 'A' })).status, 409);
  assert.equal(databaseCalls, 0);
});
test('recusa identificador de operação inválido antes de consultar banco', async () => {
  const response = await request('/spin', await token('A'), { expectedUserId: 'A', operationId: 'bad' });
  assert.equal(response.status, 400);
  assert.equal(databaseCalls, 0);
});
test('recusa token expirado antes de consultar banco', async () => {
  const expired = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'game-key' })
    .setIssuer('https://auth.example.test').setAudience('https://auth.example.test')
    .setSubject('A').setExpirationTime('1s ago').sign(privateKey);
  assert.equal((await request('/state', expired, { expectedUserId: 'A' })).status, 401);
  assert.equal(databaseCalls, 0);
});
test.after(() => { globalThis.fetch = originalFetch; });
