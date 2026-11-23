// Aplicação restrita ao branch de prova já existente; conexão nunca é impressa.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';

const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Conexão ao branch isolado indisponível.');
const connectionString = cli.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão ao branch isolado indisponível.');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });
try {
  for (const file of ['isolated_inventory.sql', 'isolated_voucher_spin.sql']) {
    await pool.query(await readFile(new URL(`../db/neon/${file}`, import.meta.url), 'utf8'));
    console.log(`Aplicado ao branch isolado: ${file}`);
  }
} catch (error) {
  console.error(`Aplicação incompleta (código: ${error.code || 'desconhecido'}).`);
  process.exitCode = 1;
} finally { await pool.end(); }
