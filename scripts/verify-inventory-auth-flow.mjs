// Contas são fictícias. Vales e variante inicial são injetados no PostgreSQL de
// prova para reproduzir o fluxo; não representam prêmios sorteados. Nenhuma
// credencial, token, identificador de usuário ou conexão é impresso.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { defaultDeriveNeonUrls } from '@neon/neon-js';
import { Pool, neonConfig } from '@neondatabase/serverless';

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const baseUrl = env.match(/^VITE_NEON_PROOF_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!baseUrl) throw new Error('Endpoint de prova indisponível');
const authUrl = defaultDeriveNeonUrls(baseUrl).auth.replace(/\/$/, '');
const functionUrl = 'https://br-dry-block-be4mfcuo-pokeslotgame.compute.c-9.us-east-2.aws.neon.tech';
const origin = 'http://localhost:5173';
const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Não foi possível obter a conexão do branch isolado.');
const connectionString = cli.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão de prova indisponível.');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });

async function createUser() {
  const email = `inventory-proof-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const response = await fetch(`${authUrl}/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ name: 'Inventário de teste', email, password }) });
  if (!response.ok) throw new Error(`signup_${response.status}`);
  const cookies = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (!cookies) throw new Error('signup_cookie_missing');
  const sessionResponse = await fetch(`${authUrl}/get-session`, { headers: { Origin: origin, Cookie: cookies } });
  if (!sessionResponse.ok) throw new Error(`session_${sessionResponse.status}`);
  const session = await sessionResponse.json();
  if (!session.user?.id) throw new Error('session_incomplete');
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
const inventoryAction = (user, operationId, action, args, expectedUserId = user.userId) => request(user, 'inventory/action', { expectedUserId, operationId, action, args });
const getState = (user) => request(user, 'state', { expectedUserId: user.userId });
const amount = (entries, type) => entries.find((entry) => entry.type === type)?.amount ?? 0;

try {
  const a = await createUser();
  const b = await createUser();
  assert.equal((await getState(a)).status, 200);
  assert.equal((await getState(b)).status, 200);
  await pool.query("INSERT INTO pokeslot_proof.vouchers (user_id, type, amount) VALUES ($1, 'pokemon', 4), ($1, 'stone', 2), ($1, 'type', 1)", [a.userId]);
  await pool.query('INSERT INTO pokeslot_proof.variants (user_id, species_id, shiny) VALUES ($1, 25, true), ($1, 148, false)', [a.userId]);

  const pokemonId = randomUUID();
  const mismatched = await inventoryAction(b, pokemonId, 'pokemon', { speciesId: 25 }, a.userId);
  assert.equal(mismatched.status, 409);
  const [p1, p2] = await Promise.all([
    inventoryAction(a, pokemonId, 'pokemon', { speciesId: 25 }),
    inventoryAction(a, pokemonId, 'pokemon', { speciesId: 25 }),
  ]);
  assert.equal(p1.status, 200);
  assert.equal(p2.status, 200);
  assert.deepEqual([p1.payload.replayed, p2.payload.replayed].sort(), [false, true]);
  assert.equal(p1.payload.status, 'ok');
  assert.equal(p2.payload.status, 'ok');
  const conflict = await inventoryAction(a, pokemonId, 'pokemon', { speciesId: 26 });
  assert.equal(conflict.status, 409);

  const stoneId = randomUUID();
  const stoneArgs = { stone: 'thunder' };
  const first = await inventoryAction(a, stoneId, 'stone', stoneArgs);
  assert.equal(first.status, 200);
  assert.equal(first.payload.status, 'ok');
  assert.equal(first.payload.replayed, false);
  // Simula resposta descartada após recebimento; não simula interrupção real da rede.
  const recovered = await inventoryAction(a, stoneId, 'stone', stoneArgs);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.payload.replayed, true);
  const { replayed: _firstFlag, ...firstResult } = first.payload;
  const { replayed: _secondFlag, ...secondResult } = recovered.payload;
  assert.deepEqual(secondResult, firstResult);

  const evolveId = randomUUID();
  const evolveArgs = { source: { speciesId: 25, isShiny: true }, targetId: 26, stone: 'thunder' };
  const evolved = await inventoryAction(a, evolveId, 'evolve', evolveArgs);
  assert.equal(evolved.status, 200);
  assert.equal(evolved.payload.status, 'ok');
  assert.equal((await inventoryAction(a, evolveId, 'evolve', evolveArgs)).payload.replayed, true);

  const dragonExchange = await inventoryAction(a, randomUUID(), 'stone', { stone: 'dragon' });
  assert.equal(dragonExchange.status, 200);
  assert.equal(dragonExchange.payload.status, 'ok');
  assert.equal(amount((await getState(a)).payload.stones, 'dragon'), 1);
  const dragonEvolution = { source: { speciesId: 148, isShiny: false }, targetId: 149, stone: 'dragon' };
  const newEvolutionId = randomUUID();
  const newest = await inventoryAction(a, newEvolutionId, 'evolve', dragonEvolution);
  assert.equal(newest.status, 200);
  assert.equal(newest.payload.status, 'ok');
  assert.equal((await inventoryAction(a, newEvolutionId, 'evolve', dragonEvolution)).payload.replayed, true);
  const finalA = await getState(a);
  const finalB = await getState(b);
  assert.equal(finalA.status, 200);
  assert.equal(finalB.status, 200);
  assert.equal(amount(finalA.payload.stones, 'thunder'), 0);
  assert.equal(amount(finalA.payload.stones, 'dragon'), 0);
  assert.equal(amount(finalA.payload.vouchers, 'type'), 1);
  assert.equal(amount(finalA.payload.vouchers, 'stone'), 0);
  for (const [speciesId, isShiny] of [[25, true], [25, false], [26, true], [148, false], [149, false]]) {
    assert.ok(finalA.payload.ownedVariants.some((v) => v.speciesId === speciesId && v.isShiny === isShiny));
  }
  assert.deepEqual(finalB.payload.ownedVariants, []);
  assert.deepEqual(finalB.payload.vouchers, []);
  assert.deepEqual(finalB.payload.stones, []);
  const wrongSession = await inventoryAction(b, evolveId, 'evolve', evolveArgs, a.userId);
  assert.equal(wrongSession.status, 409);
  assert.deepEqual((await getState(b)).payload.ownedVariants, []);
  console.log('Duas contas fictícias: resgate, retomada, isolamento, Pikachu shiny → Raichu shiny e Dragonair → Dragonite passaram. Estoque inicial inserido administrativamente.');
} catch (error) {
  const line = error.stack?.match(/verify-inventory-auth-flow\.mjs:(\d+):/)?.[1];
  const location = line ? ` na linha ${line}` : '';
  const status = Number.isInteger(error.actual) ? ` (recebido: ${error.actual})` : '';
  console.error(`Fluxo autenticado não concluído${location}: ${error.code || error.name || 'erro'}${status}.`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
