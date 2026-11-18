import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
const jwk = { ...await exportJWK(publicKey), kid: 'proof-key', alg: 'EdDSA', use: 'sig' };
process.env.NEON_AUTH_BASE_URL = 'https://auth.example.test/auth';
process.env.NEON_AUTH_JWKS_URL = 'https://auth.example.test/jwks';
process.env.DATABASE_URL = 'postgresql://proof:fake@db.example.test/neondb';
const originalFetch = globalThis.fetch;
let databaseCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === 'https://auth.example.test/jwks') {
    return Response.json({ keys: [jwk] });
  }
  databaseCalls += 1;
  throw new Error(`unexpected external request: ${url}`);
};
const { default: app } = await import('../functions/neon-authenticated-proof/index.ts');

async function token(subject, issuer = 'https://auth.example.test') {
  return new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'proof-key' })
    .setIssuer(issuer).setAudience('https://auth.example.test')
    .setSubject(subject).setExpirationTime('5m').sign(privateKey);
}
function request(path, bearer, body) {
  return app.request(path, {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('recusa pedido sem token antes de acessar o banco', async () => {
  const response = await request('/refresh', null, {});
  assert.equal(response.status, 401);
  assert.equal(databaseCalls, 0);
});

test('recusa token de emissor incorreto antes de acessar o banco', async () => {
  const response = await request('/refresh', await token('A', 'https://other.example.test'), {});
  assert.equal(response.status, 401);
  assert.equal(databaseCalls, 0);
});

test('recusa token sem prazo de expiração antes de acessar o banco', async () => {
  const bearer = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'proof-key' })
    .setIssuer('https://auth.example.test').setAudience('https://auth.example.test')
    .setSubject('A').sign(privateKey);
  const response = await request('/refresh', bearer, {});
  assert.equal(response.status, 401);
  assert.equal(databaseCalls, 0);
});

test('recusa token expirado antes de acessar o banco', async () => {
  const bearer = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'proof-key' })
    .setIssuer('https://auth.example.test').setAudience('https://auth.example.test')
    .setSubject('A').setExpirationTime('1s ago').sign(privateKey);
  const response = await request('/refresh', bearer, {});
  assert.equal(response.status, 401);
  assert.equal(databaseCalls, 0);
});

test('recusa ação da conta A apresentada com identidade válida da conta B', async () => {
  const response = await request('/spin', await token('B'), {
    expectedUserId: 'A', operationId: '00000000-0000-4000-8000-000000000001',
  });
  assert.equal(response.status, 409);
  assert.equal(databaseCalls, 0);
});

test('recusa recuperação da conta A apresentada com identidade válida da conta B', async () => {
  const response = await request('/refresh', await token('B'), { expectedUserId: 'A' });
  assert.equal(response.status, 409);
  assert.equal(databaseCalls, 0);
});

test('recusa identificador inválido antes de acessar o banco', async () => {
  const response = await request('/spin', await token('A'), { expectedUserId: 'A', operationId: 'bad' });
  assert.equal(response.status, 400);
  assert.equal(databaseCalls, 0);
});

test.after(() => { globalThis.fetch = originalFetch; });
