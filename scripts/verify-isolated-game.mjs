// Verifica apenas o branch isolado com identidades sintéticas; não imprime credenciais.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool, neonConfig } from '@neondatabase/serverless';

const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Não foi possível obter a conexão de teste.');
const connectionString = cli.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão de teste indisponível.');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });
const a = `game-test-${randomUUID()}`;
const b = `game-test-${randomUUID()}`;
const op = randomUUID();
const round = JSON.stringify({ grid: [['pokeball']], winningLines: [], captures: [{ line: 'top', capture: { speciesId: 25, isShiny: false, rarity: 'common' } }] });
const state = async (user) => (await pool.query('SELECT pokeslot_proof.get_state($1) AS result', [user])).rows[0].result;
const spin = async (user, operation, data = round) => (await pool.query('SELECT pokeslot_proof.spin($1, $2::uuid, $3::jsonb) AS result', [user, operation, data])).rows[0].result;
try {
  assert.equal((await state(a)).balance, 20);
  assert.equal((await state(b)).balance, 20);
  const responses = await Promise.all([spin(a, op), spin(a, op)]);
  assert.deepEqual(responses.map((r) => r.replayed).sort(), [false, true]);
  assert.equal(responses[0].balance, 19);
  assert.equal(responses[1].balance, 19);
  assert.deepEqual((await state(a)).ownedVariants, [{ speciesId: 25, isShiny: false }]);
  assert.deepEqual((await state(b)).ownedVariants, []);
  assert.equal((await spin(a, randomUUID())).captures[0].status, 'duplicate');
  const shinyRound = JSON.stringify({ grid: [['pokeball']], winningLines: [], captures: [{ line: 'top', capture: { speciesId: 25, isShiny: true, rarity: 'common' } }] });
  assert.equal((await spin(a, randomUUID(), shinyRound)).captures[0].status, 'new');
  assert.equal((await spin(a, randomUUID(), shinyRound)).captures[0].status, 'duplicate');
  assert.deepEqual((await state(a)).ownedVariants, [{ speciesId: 25, isShiny: false }, { speciesId: 25, isShiny: true }]);
  const before = await state(a);
  await assert.rejects(spin(a, randomUUID(), JSON.stringify({ grid: [], winningLines: [], captures: [{ line: 'top', capture: { speciesId: 152, isShiny: false } }] })));
  assert.deepEqual(await state(a), before);
  await pool.query("UPDATE pokeslot_proof.players SET cycle_at = clock_timestamp() - interval '23 hours 59 minutes' WHERE user_id = $1", [b]);
  assert.equal((await state(b)).balance, 20);
  await pool.query("UPDATE pokeslot_proof.players SET cycle_at = clock_timestamp() - interval '24 hours' WHERE user_id = $1", [b]);
  assert.equal((await state(b)).balance, 30);
  await pool.query('UPDATE pokeslot_proof.players SET balance = 20 WHERE user_id = $1', [b]);
  await pool.query("UPDATE pokeslot_proof.players SET cycle_at = clock_timestamp() - interval '53 hours' WHERE user_id = $1", [b]);
  const refreshed = await state(b);
  assert.equal(refreshed.balance, 40);
  assert.equal((await state(b)).balance, 40);
  await pool.query('UPDATE pokeslot_proof.players SET balance = 1 WHERE user_id = $1', [b]);
  const lastSpin = await Promise.all([spin(b, randomUUID()), spin(b, randomUUID())]);
  assert.deepEqual(lastSpin.map((result) => result.status).sort(), ['no_balance', 'ok']);
  assert.equal((await state(b)).balance, 0);
  const access = await pool.query("SELECT has_schema_privilege('authenticated', 'pokeslot_proof', 'USAGE') AS auth, has_schema_privilege('anonymous', 'pokeslot_proof', 'USAGE') AS anon");
  assert.equal(access.rows[0].auth, false);
  assert.equal(access.rows[0].anon, false);
  console.log('PostgreSQL isolado: recuperação, variantes normal e shiny, concorrência, repetição, rollback, períodos de 24h e permissões básicas passaram.');
} catch (error) {
  console.error(`Verificação falhou: ${error.code || error.name || 'erro'}`);
  process.exitCode = 1;
} finally { await pool.end(); }
