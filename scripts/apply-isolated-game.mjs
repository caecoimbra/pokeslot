// Executa somente no branch isolado identificado abaixo. A URI fica em memória.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';

const project = 'rapid-math-17905990';
const branch = 'br-dry-block-be4mfcuo';
const command = `pnpm dlx neon@8.11.0 connection-string ${branch} --project-id ${project} --profile pokeslot-proof`;
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Não foi possível obter a conexão do branch isolado.');
const connectionString = cli.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão do branch isolado indisponível.');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });
try {
  const sql = await readFile(new URL('../db/neon/isolated_game.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Esquema de jogo aplicado ao branch isolado.');
} catch (error) {
  console.error(`Não foi possível aplicar o SQL ao branch isolado (código: ${error.code || 'desconhecido'}).`);
  process.exitCode = 1;
} finally { await pool.end(); }
