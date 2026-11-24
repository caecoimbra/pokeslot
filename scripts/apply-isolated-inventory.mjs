// Aplicação restrita ao branch de prova já existente; conexão nunca é impressa.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { KANTO_STONES, kantoEvolutionOptions } from '../src/server/evolution.mjs';

async function applyInventory(pool) {
  const schema = await readFile(new URL('../db/neon/isolated_inventory.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    await client.query(`
      INSERT INTO pokeslot_proof.stone_types (type)
      SELECT unnest($1::text[]) ON CONFLICT DO NOTHING
    `, [KANTO_STONES]);
    await client.query(`
      INSERT INTO pokeslot_proof.evolution_recipes (source_id, target_id, stone)
      SELECT "sourceId", "targetId", stone
      FROM jsonb_to_recordset($1::jsonb) AS recipes("sourceId" integer, "targetId" integer, stone text)
      ON CONFLICT (source_id, target_id) DO UPDATE SET stone = EXCLUDED.stone
    `, [JSON.stringify(kantoEvolutionOptions())]);
    // A verificação anterior limitava o estoque a cinco pedras. A chave
    // estrangeira permite o catálogo aprovado sem recriar a tabela do jogador.
    await client.query(`
      ALTER TABLE pokeslot_proof.stones
        DROP CONSTRAINT IF EXISTS stones_type_check,
        DROP CONSTRAINT IF EXISTS stones_type_fkey;
      ALTER TABLE pokeslot_proof.stones
        ADD CONSTRAINT stones_type_fkey FOREIGN KEY (type) REFERENCES pokeslot_proof.stone_types(type);
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Conexão ao branch isolado indisponível.');
const connectionString = cli.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão ao branch isolado indisponível.');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });
try {
  await applyInventory(pool);
  console.log('Inventário e catálogo de evolução aplicados ao branch isolado.');
  await pool.query(await readFile(new URL('../db/neon/isolated_voucher_spin.sql', import.meta.url), 'utf8'));
  console.log('Vales de rodada aplicados ao branch isolado.');
} catch (error) {
  console.error(`Aplicação incompleta (código: ${error.code || 'desconhecido'}).`);
  process.exitCode = 1;
} finally { await pool.end(); }
