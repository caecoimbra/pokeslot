// Exerce as funções em transação revertida no branch isolado.
// A conta é fictícia e seus segredos permanecem somente na memória.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createOperationId } from '../src/identity/operation-id.mjs';
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
  const operation = createOperationId();
  const spin = await client.query('SELECT pokeslot_proof.session_spin($1,$2,$3,$4) AS result', [id, token, operation, round]);
  assert.equal(spin.rows[0].result.balance, 19);
  const retry = await client.query('SELECT pokeslot_proof.session_spin($1,$2,$3,$4) AS result', [id, token, operation, round]);
  assert.equal(retry.rows[0].result.replayed, true);
  const inventory = await client.query('SELECT pokeslot_proof.session_inventory_action($1,$2,$3,$4,$5) AS result',
    [id, token, createOperationId(), 'stone', JSON.stringify({ stone: 'moon' })]);
  assert.equal(inventory.rows[0].result.status, 'insufficient_vouchers');

  await client.query('SAVEPOINT runtime_permissions');
  await client.query(await readFile(new URL('../db/neon/isolated_runtime_permissions.sql', import.meta.url), 'utf8'));
  await client.query('GRANT pokeslot_runtime TO CURRENT_USER WITH SET TRUE');
  await client.query('SET LOCAL ROLE pokeslot_runtime');
  const { rows: permissions } = await client.query(`SELECT current_user AS role,
    CASE WHEN has_schema_privilege('neon_auth', 'USAGE')
      THEN has_table_privilege('neon_auth.session', 'SELECT,UPDATE') ELSE false END AS auth,
    has_table_privilege('pokeslot_proof.players', 'SELECT,UPDATE') AS players,
    has_function_privilege('pokeslot_proof.spin(text,uuid,jsonb)', 'EXECUTE') AS spin,
    has_database_privilege(current_database(), 'CREATE') AS schema`);
  assert.deepEqual(permissions, [{ role: 'pokeslot_runtime', auth: false, players: false, spin: false, schema: false }]);
  const restrictedState = await client.query('SELECT pokeslot_proof.session_state($1,$2) AS result', [id, token]);
  assert.equal(restrictedState.rows[0].result.balance, 19);
  const restrictedSpin = await client.query('SELECT pokeslot_proof.session_spin($1,$2,$3,$4) AS result', [id, token, operation, round]);
  assert.equal(restrictedSpin.rows[0].result.replayed, true);
  const restrictedInventory = await client.query('SELECT pokeslot_proof.session_inventory_action($1,$2,$3,$4,$5) AS result',
    [id, token, createOperationId(), 'stone', JSON.stringify({ stone: 'moon' })]);
  assert.equal(restrictedInventory.rows[0].result.status, 'insufficient_vouchers');
  await client.query('ROLLBACK TO SAVEPOINT runtime_permissions');
  console.log('Papel restrito: as três entradas funcionam e o acesso direto permanece bloqueado. Permissões revertidas.');

  const oldId = createOperationId(Date.now() - 9 * 86400000);
  const legacy = randomUUID();
  const future = createOperationId(Date.now() + 10 * 60000);
  const play = async (operationId) => (await client.query('SELECT pokeslot_proof.session_spin($1,$2,$3,$4) AS result', [id, token, operationId, round])).rows[0].result;
  for (const key of [oldId, legacy]) {
    await client.query("INSERT INTO pokeslot_proof.operations (user_id, operation_id, result, recorded_at) VALUES ($1, $2, '{}', clock_timestamp() - interval '9 days')", [id, key]);
  }
  assert.equal((await play(legacy)).replayed, true);
  assert.equal((await play(oldId)).status, 'operation_expired');
  assert.equal((await play(future)).status, 'operation_clock');
  await client.query('SELECT pokeslot_proof.prune_results()');
  const pruned = await client.query('SELECT count(*)::int AS total FROM pokeslot_proof.operations WHERE user_id = $1 AND operation_id = ANY($2::uuid[])', [id, [legacy, oldId]]);
  assert.equal(pruned.rows[0].total, 0);
  for (const key of [oldId, legacy]) assert.equal((await play(key)).status, 'operation_expired');
  assert.equal((await play(operation)).replayed, true);
  assert.equal((await client.query('SELECT balance FROM pokeslot_proof.players WHERE user_id = $1', [id])).rows[0].balance, '19');
  await client.query("UPDATE pokeslot_proof.request_budget SET bucket = floor(extract(epoch FROM clock_timestamp()) / 86400), used = 5000 WHERE scope = 'state_day'");
  const capped = await client.query('SELECT pokeslot_proof.session_state($1,$2) AS result', [id, token]);
  assert.equal(capped.rows[0].result.status, 'daily_limit');
  await client.query("UPDATE pokeslot_proof.request_budget SET bucket = floor(extract(epoch FROM clock_timestamp()) / 86400), used = 1500 WHERE scope = 'mutation_day'");
  assert.equal((await play(createOperationId())).status, 'daily_limit');
  console.log('Retenção: replay legado antes da limpeza, exclusão em lote, recusa após limpeza e saldo preservado.');

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
