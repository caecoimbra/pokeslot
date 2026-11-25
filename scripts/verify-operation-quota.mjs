// Teste administrativo com transação revertida exclusivamente no branch isolado.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool, neonConfig } from '@neondatabase/serverless';

const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
const connectionString = cli.status === 0 && cli.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão isolada indisponível');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });
const client = await pool.connect();
const a = `quota-${randomUUID()}`, b = `quota-${randomUUID()}`;
const round = JSON.stringify({ grid: [], winningLines: [], captures: [], vouchers: [] });
const spin = async (user, id) => (await client.query('SELECT pokeslot_proof.spin($1, $2, $3) AS result', [user, id, round])).rows[0].result;
const inventory = async (user, id) => (await client.query("SELECT pokeslot_proof.inventory_action($1, $2, 'stone', $3) AS result", [user, id, JSON.stringify({ stone: 'moon' })])).rows[0].result;
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../db/neon/isolated_inventory.sql', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../db/neon/isolated_voucher_spin.sql', import.meta.url), 'utf8');
  await client.query(source.replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/m, ''));
  await client.query('SELECT pokeslot_proof.get_state($1), pokeslot_proof.get_state($2)', [a, b]);
  await client.query('UPDATE pokeslot_proof.players SET balance = 0 WHERE user_id = $1', [a]);
  const original = randomUUID();
  assert.equal((await spin(a, original)).status, 'no_balance');
  for (let i = 1; i < 30; i++) assert.equal((await inventory(a, randomUUID())).status, 'insufficient_vouchers');
  const blocked = randomUUID();
  assert.equal((await spin(a, blocked)).status, 'rate_limited');
  assert.equal((await inventory(a, randomUUID())).status, 'rate_limited');
  assert.equal((await spin(a, original)).replayed, true);
  assert.equal((await spin(b, randomUUID())).status, 'ok');
  const { rows } = await client.query('SELECT count(*)::int AS n FROM pokeslot_proof.operations WHERE user_id = $1 AND operation_id = $2', [a, blocked]);
  assert.equal(rows[0].n, 0);
  await client.query("UPDATE pokeslot_proof.operation_quota SET window_started_at = clock_timestamp() - interval '1 minute' WHERE user_id = $1", [a]);
  assert.equal((await spin(a, blocked)).status, 'no_balance');
  assert.equal((await spin(a, blocked)).replayed, true);
  console.log('Cota compartilhada, replay, contas separadas, ausência de registro bloqueado e recuperação após janela passaram. Alterações revertidas.');
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
