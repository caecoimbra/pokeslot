// Cria somente uma conta fictícia sem e-mail roteável. Não registra tokens.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { defaultDeriveNeonUrls } from '@neon/neon-js';

const [origin] = process.argv.slice(2);
assert.ok(new URL(origin).origin === origin && origin.startsWith('https://'));
const localEnv = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const base = localEnv.match(/^VITE_NEON_PROOF_DATABASE_URL=(.+)$/m)?.[1].trim();
assert.ok(base, 'Endpoint de prova indisponível.');
const auth = defaultDeriveNeonUrls(base).auth.replace(/\/$/, '');
const api = 'https://br-dry-block-be4mfcuo-pokeslothml.compute.c-9.us-east-2.aws.neon.tech';
const email = `homolog-${randomUUID()}@example.test`;
const password = randomBytes(24).toString('base64url');
const headers = { Origin: origin, 'Content-Type': 'application/json' };
const post = (url, body, extraHeaders) => fetch(url, {
  method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body),
});
const cookiesFrom = (response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
let cookie;
try {
  const signup = await post(auth + '/sign-up/email', { name: 'Conta fictícia de homologação', email, password });
  assert.equal(signup.status, 200, 'cadastro fictício');
  cookie = cookiesFrom(signup);
  assert.ok(cookie);
  assert.equal((await post(auth + '/sign-out', {}, { Cookie: cookie })).status, 200, 'saída');
  cookie = '';
  const login = await post(auth + '/sign-in/email', { email, password });
  assert.equal(login.status, 200, 'entrada com senha');
  cookie = cookiesFrom(login);
  assert.ok(cookie);
  assert.equal(login.headers.get('access-control-allow-origin'), origin);
  const sessionResponse = await fetch(auth + '/get-session', { headers: { Origin: origin, Cookie: cookie } });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.ok(session.user?.id && session.session?.token);
  const tokenResponse = await fetch(auth + '/token', { headers: { Origin: origin, Cookie: cookie } });
  assert.equal(tokenResponse.status, 200);
  const { token } = await tokenResponse.json();
  assert.ok(token);
  const game = await post(api + '/state', { expectedUserId: session.user.id }, {
    Authorization: `Bearer ${token}`, 'X-Session-Token': session.session.token,
  });
  assert.equal(game.status, 403, 'conta fora da lista não lê progresso');
  assert.equal((await game.json()).error, 'access_restricted');
  const reset = await post(auth + '/request-password-reset', {
    email: `missing-${randomUUID()}@example.test`,
    redirectTo: `${origin}/redefinir-senha.html?lang=pt`,
  });
  assert.equal(reset.status, 200, 'resposta genérica para endereço sem conta');
  console.log('Cadastro, saída, nova entrada e sessão na origem HTTPS passaram. A conta fora da lista recebeu 403.');
  console.log('Pedido de recuperação com endereço inexistente foi aceito sem provar entrega.');
} catch (error) {
  console.error(`Verificação não concluída (${error.code ?? error.name}${Number.isInteger(error.actual) ? `, HTTP ${error.actual}` : ''}).`);
  process.exitCode = 1;
} finally {
  if (cookie) await post(auth + '/sign-out', {}, { Cookie: cookie }).catch(() => {});
}
