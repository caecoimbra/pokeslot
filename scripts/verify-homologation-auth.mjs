// Cria duas contas fictícias sem e-mail roteável. Senhas e sessões ficam em memória.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { defaultDeriveNeonUrls } from '@neon/neon-js';
import { createOperationId } from '../src/identity/operation-id.mjs';

const [origin] = process.argv.slice(2);
assert.ok(new URL(origin).origin === origin && origin.startsWith('https://'));
const localEnv = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const base = localEnv.match(/^VITE_NEON_PROOF_DATABASE_URL=(.+)$/m)?.[1].trim();
assert.ok(base, 'Endpoint de autenticação indisponível.');
const auth = defaultDeriveNeonUrls(base).auth.replace(/\/$/, '');
const api = 'https://br-dry-block-be4mfcuo-pokeslothml.compute.c-9.us-east-2.aws.neon.tech';
const headers = { Origin: origin, 'Content-Type': 'application/json' };
const post = (url, body, extraHeaders) => fetch(url, {
  method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000),
});
const cookiesFrom = (response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
const accounts = [];

async function signIn(account) {
  const response = await post(auth + '/sign-in/email', { email: account.email, password: account.password });
  assert.equal(response.status, 200, 'entrada com senha');
  account.cookie = cookiesFrom(response);
  assert.ok(account.cookie);
  const options = { headers: { Origin: origin, Cookie: account.cookie }, signal: AbortSignal.timeout(30000) };
  const sessionResponse = await fetch(auth + '/get-session', options);
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  const tokenResponse = await fetch(auth + '/token', options);
  assert.equal(tokenResponse.status, 200);
  account.userId = session.user.id;
  account.sessionToken = session.session.token;
  account.token = (await tokenResponse.json()).token;
  assert.ok(account.userId && account.sessionToken && account.token);
}

async function createAccount() {
  const account = {
    email: `homolog-${randomUUID()}@example.test`,
    password: randomBytes(24).toString('base64url'),
  };
  const signup = await post(auth + '/sign-up/email', {
    name: 'Jogador fictício', email: account.email, password: account.password,
  });
  assert.equal(signup.status, 200, 'cadastro');
  account.cookie = cookiesFrom(signup);
  assert.ok(account.cookie);
  accounts.push(account);
  assert.equal((await post(auth + '/sign-out', {}, { Cookie: account.cookie })).status, 200);
  account.cookie = '';
  await signIn(account);
  return account;
}

async function game(account, path, body) {
  const response = await post(api + path, body, {
    Authorization: `Bearer ${account.token}`, 'X-Session-Token': account.sessionToken,
  });
  return { status: response.status, body: await response.json() };
}

try {
  const a = await createAccount();
  const b = await createAccount();
  const initialA = await game(a, '/state', { expectedUserId: a.userId });
  const initialB = await game(b, '/state', { expectedUserId: b.userId });
  assert.equal(initialA.status, 200);
  assert.equal(initialB.status, 200);
  assert.equal(initialA.body.balance, 20);
  assert.equal(initialB.body.balance, 20);
  assert.deepEqual(initialB.body.ownedVariants, []);

  assert.equal((await game(b, '/state', { expectedUserId: a.userId })).status, 409);
  assert.equal((await game({ ...a, sessionToken: b.sessionToken }, '/state', { expectedUserId: a.userId })).status, 401);
  const operationId = createOperationId();
  const attempts = await Promise.all([1, 2].map(() => game(a, '/spin', { expectedUserId: a.userId, operationId })));
  assert.ok(attempts.every((result) => result.status === 200 && result.body.status === 'ok'));
  assert.deepEqual(attempts.map(({ body }) => body.replayed).sort(), [false, true]);
  const finalA = await game(a, '/state', { expectedUserId: a.userId });
  const finalB = await game(b, '/state', { expectedUserId: b.userId });
  assert.equal(finalA.body.balance, attempts[0].body.balance);
  assert.deepEqual(finalB.body, initialB.body);

  assert.equal((await post(auth + '/sign-out', {}, { Cookie: a.cookie })).status, 200);
  a.cookie = '';
  assert.equal((await game(a, '/state', { expectedUserId: a.userId })).status, 401);
  await signIn(a);
  const restored = await game(a, '/state', { expectedUserId: a.userId });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.balance, finalA.body.balance);
  assert.deepEqual(restored.body.ownedVariants, finalA.body.ownedVariants);
  console.log('Duas contas criadas, entrada, isolamento, rodada simultânea, saída e recuperação passaram.');
} catch (error) {
  console.error(`Verificação não concluída (${error.code ?? error.name}${Number.isInteger(error.actual) ? `, HTTP ${error.actual}` : ''}).`);
  process.exitCode = 1;
} finally {
  for (const account of accounts) {
    if (account.cookie) await post(auth + '/sign-out', {}, { Cookie: account.cookie }).catch(() => {});
  }
}
