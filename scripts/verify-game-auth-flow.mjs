// Cria somente contas fictícias no branch isolado; senhas e tokens ficam em memória.
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { defaultDeriveNeonUrls } from '@neon/neon-js';
import assert from 'node:assert/strict';

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const baseUrl = env.match(/^VITE_NEON_PROOF_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!baseUrl) throw new Error('Endpoint de prova indisponível');
const authUrl = defaultDeriveNeonUrls(baseUrl).auth.replace(/\/$/, '');
const functionUrl = 'https://br-dry-block-be4mfcuo-pokeslotgame.compute.c-9.us-east-2.aws.neon.tech';
const origin = 'http://localhost:5173';

async function createUser() {
  const email = `proof-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const response = await fetch(`${authUrl}/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ name: 'Jogador fictício automatizado', email, password }) });
  if (!response.ok) throw new Error(`signup_${response.status}`);
  const cookies = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (!cookies) throw new Error('signup_cookie_missing');
  const sessionResponse = await fetch(`${authUrl}/get-session`, { headers: { Origin: origin, Cookie: cookies } });
  if (!sessionResponse.ok) throw new Error(`session_${sessionResponse.status}`);
  const session = await sessionResponse.json();
  if (!session.user?.id || !session.session?.token) throw new Error('session_incomplete');
  const tokenResponse = await fetch(`${authUrl}/token`, { headers: { Origin: origin, Cookie: cookies } });
  if (!tokenResponse.ok) throw new Error(`token_${tokenResponse.status}`);
  const access = await tokenResponse.json();
  if (typeof access.token !== 'string') throw new Error('token_missing');
  return { userId: session.user.id, token: access.token };
}
async function request(user, path, body) {
  const response = await fetch(`${functionUrl}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}`, Origin: origin }, body: JSON.stringify(body) });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  return { status: response.status, payload };
}
try {
  const a = await createUser();
  const b = await createUser();
  const initialA = await request(a, 'state', { expectedUserId: a.userId });
  const initialB = await request(b, 'state', { expectedUserId: b.userId });
  console.log(`Estado inicial: HTTP ${initialA.status} e ${initialB.status}.`);
  assert.equal(initialA.status, 200);
  assert.equal(initialB.status, 200);
  assert.equal(initialA.payload.balance, 20);
  assert.equal(initialB.payload.balance, 20);
  const mismatch = await request(b, 'state', { expectedUserId: a.userId });
  console.log(`Troca de identidade: HTTP ${mismatch.status}.`);
  assert.equal(mismatch.status, 409);
  const operationId = randomUUID();
  const responses = await Promise.all([request(a, 'spin', { expectedUserId: a.userId, operationId }), request(a, 'spin', { expectedUserId: a.userId, operationId })]);
  console.log(`Rodadas simultâneas: HTTP ${responses.map((result) => result.status).join(' e ')}.`);
  assert.ok(responses.every((result) => result.status === 200 && result.payload.status === 'ok'));
  assert.deepEqual(responses.map((result) => result.payload.replayed).sort(), [false, true]);
  const finalA = await request(a, 'state', { expectedUserId: a.userId });
  const finalB = await request(b, 'state', { expectedUserId: b.userId });
  assert.equal(finalA.payload.balance, 19);
  assert.equal(finalB.payload.balance, 20);
  assert.deepEqual(finalB.payload.ownedVariants, []);
  // Simula perda após confirmação do servidor: descarta a primeira resposta
  // e repete a mesma operação, comparando o resultado persistido.
  const lostId = randomUUID();
  const lost = await request(a, 'spin', { expectedUserId: a.userId, operationId: lostId });
  assert.equal(lost.status, 200);
  assert.equal(lost.payload.replayed, false);
  const recovered = await request(a, 'spin', { expectedUserId: a.userId, operationId: lostId });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.payload.replayed, true);
  const { replayed: _firstFlag, ...firstResult } = lost.payload;
  const { replayed: _secondFlag, ...secondResult } = recovered.payload;
  assert.deepEqual(secondResult, firstResult);
  assert.equal((await request(a, 'state', { expectedUserId: a.userId })).payload.balance, 18);
  // Uma operação vinculada a A não é aceita com o JWT de B.
  const wrongSession = await request(b, 'spin', { expectedUserId: a.userId, operationId: lostId });
  assert.equal(wrongSession.status, 409);
  assert.equal((await request(b, 'state', { expectedUserId: b.userId })).payload.balance, 20);
  let captureResult = responses[0].payload.captures[0];
  let expectedBalance = 18;
  for (let attempt = 0; !captureResult && attempt < 12; attempt++) {
    const result = await request(a, 'spin', { expectedUserId: a.userId, operationId: randomUUID() });
    assert.equal(result.status, 200);
    assert.equal(result.payload.status, 'ok');
    expectedBalance--;
    captureResult = result.payload.captures[0];
  }
  if (!captureResult) throw new Error('no_capture_observed');
  const afterCapture = await request(a, 'state', { expectedUserId: a.userId });
  assert.equal(afterCapture.payload.balance, expectedBalance);
  assert.ok(afterCapture.payload.ownedVariants.some((variant) => variant.speciesId === captureResult.capture.speciesId && variant.isShiny === captureResult.capture.isShiny));
  console.log('Autenticação de duas contas fictícias, isolamento, rodada, captura persistida e repetição simultânea passaram.');
} catch (error) {
  console.error(`Fluxo autenticado não concluído: ${error.message?.startsWith('signup_') || error.message?.startsWith('session_') ? error.message : error.code || error.name}.`);
  process.exitCode = 1;
}
