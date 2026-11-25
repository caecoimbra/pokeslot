import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';

test('indisponibilidade das chaves não é tratada como sessão encerrada', async (t) => {
  const { privateKey } = await generateKeyPair('EdDSA');
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'missing' })
    .setIssuer('https://auth.example.test').setAudience('https://auth.example.test')
    .setSubject('A').setExpirationTime('5m').sign(privateKey);
  process.env.NEON_AUTH_BASE_URL = 'https://auth.example.test/auth';
  process.env.NEON_AUTH_JWKS_URL = 'https://auth.example.test/jwks';
  process.env.DATABASE_URL = 'postgresql://proof:fake@db.example.test/neondb';
  const original = globalThis.fetch;
  try {
    const { default: app } = await import('../functions/neon-game-proof/index.ts');
    for (const [label, reply] of [
      ['rede indisponível', () => { throw new TypeError('network unavailable'); }],
      ['serviço em manutenção', () => new Response(null, { status: 503 })],
      ['documento de chaves ilegível', () => new Response('invalid JSON')],
    ]) {
      await t.test(label, async () => {
        globalThis.fetch = async () => reply();
        const response = await app.request('/state', { method: 'POST', headers: {
          Authorization: `Bearer ${token}`, 'X-Session-Token': 'test', 'Content-Type': 'application/json',
        }, body: JSON.stringify({ expectedUserId: 'A' }) });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error, 'authentication_unavailable');
      });
    }
  } finally { globalThis.fetch = original; }
});
