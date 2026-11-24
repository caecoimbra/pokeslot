// Exerce as funções em transação revertida no branch isolado.
// A conta é fictícia e seus segredos permanecem somente na memória.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { defaultDeriveNeonUrls } from '@neon/neon-js';
import { Pool, neonConfig } from '@neondatabase/serverless';

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const base = env.match(/^VITE_NEON_PROOF_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!base) throw new Error('Endpoint isolado indisponível');
const authUrl = defaultDeriveNeonUrls(base).auth.replace(/\/$/, '');
const origin = 'http://localhost:5173';
const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Conexão isolada indisponível');
const connectionString = cli.stdout.trim().split(/\r?\n/).find(line => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão isolada indisponível');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });
let client;
let cookie;

try {
  const signup = await fetch(`${authUrl}/sign-up/email`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Prova de bloqueio de sessão',
      email: `session-lock-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  });
  if (!signup.ok) throw new Error(`cadastro HTTP ${signup.status}`);
  cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const response = await fetch(`${authUrl}/get-session`, { headers: { Origin: origin, Cookie: cookie } });
  const session = await response.json();
  if (!response.ok || !session?.user?.id || !session?.session?.token) throw new Error('Sessão não confirmada');
  const { id } = session.user;
  const token = session.session.token;
  const round = JSON.stringify({ grid: [], winningLines: [], captures: [], vouchers: [] });
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../db/neon/isolated_session_guard.sql', import.meta.url), 'utf8'));
  const state = await client.query('SELECT pokeslot_proof.session_state($1,$2) AS result', [id, token]);
  assert.equal(state.rows[0].result.balance, 20);
  const operation = randomUUID();
  const spin = await client.query('SELECT pokeslot_proof.session_spin($1,$2,$3,$4) AS result', [id, token, operation, round]);
  assert.equal(spin.rows[0].result.balance, 19);
  const retry = await client.query('SELECT pokeslot_proof.session_spin($1,$2,$3,$4) AS result', [id, token, operation, round]);
  assert.equal(retry.rows[0].result.replayed, true);
  const inventory = await client.query('SELECT pokeslot_proof.session_inventory_action($1,$2,$3,$4,$5) AS result',
    [id, token, randomUUID(), 'stone', JSON.stringify({ stone: 'moon' })]);
  assert.equal(inventory.rows[0].result.status, 'insufficient_vouchers');

  // Uma revogação concorrente não conclui enquanto a operação mantém a trava.
  const other = await pool.connect();
  try {
    await other.query('BEGIN');
    await other.query("SET LOCAL lock_timeout = '250ms'");
    await assert.rejects(other.query('DELETE FROM neon_auth.session WHERE token = $1 AND "userId" = $2', [token, id]),
      error => error.code === '55P03');
    await other.query('ROLLBACK');
  } finally { other.release(); }
  await client.query('ROLLBACK');

  // Sessão errada ou revogada é rejeitada antes de executar a operação.
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../db/neon/isolated_session_guard.sql', import.meta.url), 'utf8'));
  await client.query('SAVEPOINT invalid_session');
  await assert.rejects(client.query('SELECT pokeslot_proof.session_state($1,$2)', [randomUUID(), token]),
    error => error.code === 'PZ401');
  await client.query('ROLLBACK TO SAVEPOINT invalid_session');
  await assert.rejects(client.query('SELECT pokeslot_proof.session_state($1,$2)', [id, '']),
    error => error.code === 'PZ401');
  await client.query('ROLLBACK TO SAVEPOINT invalid_session');
  await client.query('UPDATE neon_auth.session SET "expiresAt" = now() - interval \'1 second\' WHERE token = $1', [token]);
  await assert.rejects(client.query('SELECT pokeslot_proof.session_state($1,$2)', [id, token]),
    error => error.code === 'PZ401');
  await client.query('ROLLBACK');
  const logout = await fetch(`${authUrl}/sign-out`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!logout.ok) throw new Error(`saída HTTP ${logout.status}`);
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../db/neon/isolated_session_guard.sql', import.meta.url), 'utf8'));
  for (const [query, parameters] of [
    ['SELECT pokeslot_proof.session_state($1,$2)', [id, token]],
    ['SELECT pokeslot_proof.session_spin($1,$2,$3,$4)', [id, token, randomUUID(), round]],
    ['SELECT pokeslot_proof.session_inventory_action($1,$2,$3,$4,$5)', [id, token, randomUUID(), 'stone', JSON.stringify({ stone: 'moon' })]],
  ]) {
    await client.query('SAVEPOINT revoked_session');
    await assert.rejects(client.query(query, parameters), error => error.code === 'PZ401');
    await client.query('ROLLBACK TO SAVEPOINT revoked_session');
  }
  await client.query('ROLLBACK');
  console.log('Sessão ativa, identidade divergente, expiração, replay, inventário, trava e sessão revogada passaram. Funções revertidas.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(`Verificação inconclusiva: ${error.code || error.name || 'erro'}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
