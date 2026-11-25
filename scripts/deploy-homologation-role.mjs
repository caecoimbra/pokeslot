// Provisionamento da Function no branch isolado. Em atualizações apenas de
// código, use "neon functions deploy" sem --env para manter os segredos ativos.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';

const [cliEntry, origin, playerId] = process.argv.slice(2);
assert.ok(cliEntry && new URL(origin).origin === origin && origin.startsWith('https://'), 'Informe a CLI Neon e a origem HTTPS.');
assert.ok(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(playerId), 'Informe o ID da conta convidada.');
const password = process.env.POKESLOT_RUNTIME_PASSWORD;
delete process.env.POKESLOT_RUNTIME_PASSWORD;
assert.ok(typeof password === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(password),
  'Forneça o segredo do papel restrito em POKESLOT_RUNTIME_PASSWORD (32 a 128 caracteres base64url).');
const scope = ['--project-id', 'rapid-math-17905990', '--branch', 'br-dry-block-be4mfcuo', '--profile', 'pokeslot-proof'];
const cli = (args, options = {}) => spawnSync(process.execPath, [cliEntry, ...args, ...scope], {
  encoding: 'utf8', windowsHide: true, timeout: 50000, ...options,
});
const connection = cli(['connection-string', 'br-dry-block-be4mfcuo']);
const directUrl = connection.status === 0 && connection.stdout.split(/\r?\n/).find((line) => line.startsWith('postgres'));
assert.ok(directUrl, 'Conexão administrativa do branch indisponível.');

neonConfig.webSocketConstructor = WebSocket;
const admin = new Pool({ connectionString: directUrl });
const runtimeUrl = new URL(directUrl);
runtimeUrl.username = 'pokeslot_runtime';
runtimeUrl.password = password;
let stage = 'localizar a conta de teste';
try {
  const { rowCount } = await admin.query('SELECT id FROM neon_auth."user" WHERE id = $1', [playerId]);
  assert.equal(rowCount, 1, 'A conta convidada não foi encontrada.');

  stage = 'aplicar o papel dedicado';
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query(await readFile(new URL('../db/neon/isolated_runtime_permissions.sql', import.meta.url), 'utf8'));
    const { rows: [role] } = await client.query("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'pokeslot_runtime'");
    // Uma repetição usa a credencial existente. Se o valor informado estiver
    // incorreto, a verificação abaixo falha sem interromper o jogo publicado.
    if (!role.rolcanlogin) {
      await client.query(`ALTER ROLE pokeslot_runtime LOGIN PASSWORD '${password}'`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }

  stage = 'verificar privilégios da conexão restrita';
  const runtime = new Pool({ connectionString: runtimeUrl.href });
  try {
    const { rows: [acl] } = await runtime.query(`SELECT
      current_user = 'pokeslot_runtime' AS role,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolinherit) AS restricted,
      NOT has_table_privilege('pokeslot_proof.players', 'SELECT,INSERT,UPDATE,DELETE') AS players,
      NOT has_schema_privilege('neon_auth', 'USAGE') AS auth,
      NOT has_database_privilege(current_database(), 'CREATE') AS ddl,
      NOT has_function_privilege('pokeslot_proof.spin(text,uuid,jsonb)', 'EXECUTE') AS internal,
      (SELECT bool_and(prosecdef AND has_function_privilege(oid, 'EXECUTE'))
         FROM pg_proc WHERE oid IN (
           'pokeslot_proof.session_state(text,text)'::regprocedure,
           'pokeslot_proof.session_spin(text,text,uuid,jsonb)'::regprocedure,
           'pokeslot_proof.session_inventory_action(text,text,uuid,text,jsonb)'::regprocedure
         )) AS allowed
      FROM pg_roles WHERE rolname = current_user`);
    assert.ok(acl && Object.values(acl).every(Boolean), 'Privilégios incompatíveis.');
    await assert.rejects(runtime.query('SELECT pokeslot_proof.session_state($1,$2)', [playerId, '']), { code: 'PZ401' });
    console.log('Login restrito verificado no PostgreSQL. As três entradas exigem sessão; acesso direto bloqueado.');
  } finally { await runtime.end(); }

  stage = 'publicar credencial somente na Function de homologação';
  // O preloader insere a opção na memória do processo da CLI. A linha de
  // comando do sistema e os arquivos locais não contêm a senha.
  const load = 'data:text/javascript,' + encodeURIComponent(
    "process.argv.push('--env', 'DATABASE_URL=' + process.env.POKESLOT_DEPLOY_CONNECTION); delete process.env.POKESLOT_DEPLOY_CONNECTION;",
  );
  const deployed = spawnSync(process.execPath, ['--import', load, cliEntry, 'functions', 'deploy', 'pokeslothml',
    '--src', 'functions/neon-game-proof/index.ts', '--env', `POKESLOT_WEB_ORIGIN=${origin}`,
    '--env', 'POKESLOT_EXPECTED_DB_ROLE=pokeslot_runtime',
    '--env', 'POKESLOT_AUDIT_DB_ROLE=1', '--wait', ...scope], {
    encoding: 'utf8', windowsHide: true, timeout: 50000,
    env: { ...process.env, POKESLOT_DEPLOY_CONNECTION: runtimeUrl.href },
  });
  assert.equal(deployed.status, 0);
  console.log('Function atualizada com o papel de banco restrito.');
} catch (error) {
  console.error(`Falha ao ${stage} (${error.code ?? error.name}).`);
  process.exitCode = 1;
} finally { await admin.end(); }
