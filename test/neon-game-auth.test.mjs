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
  return app.request(path, { method: 'POST', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}`, 'X-Session-Token': 'test-session' } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
test('nega estado e rodada sem sessão antes de consultar banco', async () => {
  for (const path of ['/state', '/spin', '/inventory/action']) assert.equal((await request(path, null, {})).status, 401);
  assert.equal(databaseCalls, 0);
});
test('nega JWT sem credencial de sessão antes de consultar banco', async () => {
  const bearer = await token('A');
  const response = await app.request('/state', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUserId: 'A' }),
  });
  assert.equal(response.status, 401);
  assert.equal(databaseCalls, 0);
});
test('recusa requisições maiores que o limite antes de consultar o banco', async () => {
  const bearer = await token('A');
  for (const path of ['/state', '/spin', '/inventory/action']) {
    const response = await request(path, bearer, { expectedUserId: 'A', extra: 'x'.repeat(4096) });
    assert.equal(response.status, 413);
  }
  assert.equal(databaseCalls, 0);
});
test('não usa uma identidade diferente da sessão validada', async () => {
  const bearer = await token('B');
  for (const path of ['/state', '/spin', '/inventory/action']) assert.equal((await request(path, bearer, { expectedUserId: 'A' })).status, 409);
  assert.equal(databaseCalls, 0);
});
test('recusa identificador de operação inválido antes de consultar banco', async () => {
  const response = await request('/spin', await token('A'), { expectedUserId: 'A', operationId: 'bad' });
  assert.equal(response.status, 400);
  assert.equal(databaseCalls, 0);
});
test('recusa preço fornecido pelo cliente antes de consultar banco', async () => {
  const response = await request('/inventory/action', await token('A'), { expectedUserId: 'A', operationId: '00000000-0000-4000-8000-000000000001', action: 'pokemon', args: { speciesId: 25, cost: 0 } });
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
test('prévia hospedada recusa uma conta autenticada fora da lista antes de consultar o banco', async () => {
  process.env.POKESLOT_WEB_ORIGIN = 'https://preview.example.test';
  process.env.POKESLOT_ALLOWED_PLAYERS = 'A';
  try {
    const { default: hostedApp } = await import('../functions/neon-game-proof/index.ts?hosted-test');
    const bearer = await token('B');
    const response = await hostedApp.request('/state', { method: 'POST', headers: {
      Origin: 'https://preview.example.test',
      Authorization: `Bearer ${bearer}`, 'X-Session-Token': 'test-session', 'Content-Type': 'application/json',
    }, body: JSON.stringify({ expectedUserId: 'B' }) });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://preview.example.test');
    assert.equal(databaseCalls, 0);
  } finally {
    delete process.env.POKESLOT_WEB_ORIGIN;
    delete process.env.POKESLOT_ALLOWED_PLAYERS;
  }
});
test.after(() => { globalThis.fetch = originalFetch; });
