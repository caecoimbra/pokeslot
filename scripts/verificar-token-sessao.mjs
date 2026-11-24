// Prova no branch isolado. Credenciais e tokens existem apenas em memória.
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { defaultDeriveNeonUrls } from '@neon/neon-js';
import { Pool, neonConfig } from '@neondatabase/serverless';

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const baseUrl = env.match(/^VITE_NEON_PROOF_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!baseUrl) throw new Error('Endpoint de prova indisponível');
const authUrl = defaultDeriveNeonUrls(baseUrl).auth.replace(/\/$/, '');
const functionUrl = 'https://br-dry-block-be4mfcuo-pokeslotgame.compute.c-9.us-east-2.aws.neon.tech';
const origin = 'http://localhost:5173';
const jsonHeaders = { 'Content-Type': 'application/json', Origin: origin };
const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Conexão isolada indisponível');
const connectionString = cli.stdout.trim().split(/\r?\n/).find(line => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão isolada indisponível');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });

try {
  const signup = await fetch(`${authUrl}/sign-up/email`, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ name: 'Prova de sessão', email: `session-proof-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url') }),
  });
  if (!signup.ok) throw new Error(`cadastro HTTP ${signup.status}`);
  const cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('sessão não recebida');
  const sessionHeaders = { Origin: origin, Cookie: cookie };
  const sessionResponse = await fetch(`${authUrl}/get-session`, { headers: sessionHeaders });
  const session = await sessionResponse.json();
  if (!sessionResponse.ok || !session?.user?.id) throw new Error('sessão não confirmada');
  const sessionToken = session.session?.token;
  if (typeof sessionToken !== 'string') throw new Error('token de sessão não recebido');
  const sessionExists = async () => (await pool.query(
    'SELECT EXISTS (SELECT 1 FROM neon_auth.session WHERE token = $1 AND "userId" = $2 AND "expiresAt" > now()) AS active',
    [sessionToken, session.user.id],
  )).rows[0].active;
  if (!await sessionExists()) throw new Error('vínculo da sessão ativa não confirmado');
  const sessionByBearer = () => fetch(`${authUrl}/get-session`, {
    headers: { Origin: origin, Authorization: `Bearer ${sessionToken}` },
  });
  const activeBearer = await sessionByBearer();
  const activeBearerData = await activeBearer.json();
  const bearerSupported = activeBearer.ok && activeBearerData?.user?.id === session.user.id;
  const tokenResponse = await fetch(`${authUrl}/token`, { headers: sessionHeaders });
  const token = (await tokenResponse.json()).token;
  if (!tokenResponse.ok || typeof token !== 'string') throw new Error('token não recebido');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  if (!Number.isFinite(claims.exp)) throw new Error('prazo do token indisponível');
  console.log(`JWT contém identificador de sessão: ${typeof claims.sid === 'string' ? 'sim' : 'não'}.`);
  const readState = () => fetch(`${functionUrl}/state`, {
    method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedUserId: session.user.id }),
  });
  const before = await readState();
  if (!before.ok) throw new Error(`consulta inicial HTTP ${before.status}`);
  const logout = await fetch(`${authUrl}/sign-out`, { method: 'POST', headers: { ...jsonHeaders, Cookie: cookie }, body: '{}' });
  if (!logout.ok) throw new Error(`saída HTTP ${logout.status}`);
  const afterSession = await fetch(`${authUrl}/get-session`, { headers: sessionHeaders });
  if (!afterSession.ok || (await afterSession.json())?.user) throw new Error('encerramento da sessão não confirmado');
  if (await sessionExists()) throw new Error('sessão encerrada ainda consta ativa no banco');
  console.log('Credencial de sessão vinculada ao usuário no banco antes da saída e ausente após a saída.');
  if (bearerSupported) {
    const revokedBearer = await sessionByBearer();
    const revokedBearerData = await revokedBearer.json();
    console.log(`Consulta por token de sessão: ativa antes da saída; usuário após saída: ${revokedBearerData?.user ? 'presente' : 'ausente'} (HTTP ${revokedBearer.status}).`);
  } else {
    console.log('Consulta por token de sessão: não confirmada nesse serviço.');
  }
  const replay = await readState();
  if (Date.now() / 1000 >= claims.exp) throw new Error('token expirou durante a prova');
  console.log(`Sessão encerrada confirmada. Reutilização do token: HTTP ${replay.status}.`);
  if (replay.status === 200) console.log('A função aceitou o token depois do encerramento da sessão.');
  else if (replay.status === 401) console.log('A função recusou o token depois do encerramento da sessão.');
  else { console.log('Resultado inconclusivo.'); process.exitCode = 1; }
} catch (error) {
  console.error(`Prova inconclusiva: ${error.message}`);
  process.exitCode = 1;
} finally { await pool.end(); }
