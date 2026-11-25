// Exclusivamente para o branch de prova; os dados e probabilidades são fictícios.
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, errors } from 'jose';
import { neon } from '@neondatabase/serverless';
import { createEvaluatedReelRound } from '../../src/server/reel-round.mjs';
import { createStudyCaptures } from '../../src/server/study-capture.mjs';
import { validInventoryAction } from '../../src/server/inventory-request.mjs';
import { createKantoVouchers } from '../../src/server/demo-vouchers.mjs';

const authUrl = process.env.NEON_AUTH_BASE_URL;
const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const databaseUrl = process.env.DATABASE_URL;
if (!authUrl || !jwksUrl || !databaseUrl) throw new Error('Missing Neon proof configuration');
const issuer = new URL(authUrl).origin;
const jwks = createRemoteJWKSet(new URL(jwksUrl));
// jose usa o erro genérico quando a resposta HTTP das chaves está indisponível ou ilegível.
const keyServiceErrors = new Set([errors.JOSEError.code, errors.JWKSTimeout.code, errors.JWKSInvalid.code]);
const sql = neon(databaseUrl);
let roleAudit: Promise<void> | undefined;
function auditRuntimeRole() {
  if (process.env.POKESLOT_AUDIT_DB_ROLE !== '1') return;
  return roleAudit ??= sql`SELECT current_user AS role,
    has_database_privilege(current_database(), 'CREATE') AS create_schema,
    has_schema_privilege('pokeslot_proof', 'CREATE') AS create_game_objects,
    CASE WHEN has_schema_privilege('neon_auth', 'USAGE')
      THEN has_table_privilege('neon_auth.session', 'SELECT') ELSE false END AS read_auth_sessions,
    has_table_privilege('pokeslot_proof.players', 'SELECT,UPDATE') AS access_player_rows,
    has_function_privilege('pokeslot_proof.spin(text,uuid,jsonb)', 'EXECUTE') AS call_internal_spin`
    .then(([audit]) => { console.info('POKESLOT_DB_ROLE_AUDIT', JSON.stringify(audit)); })
    .catch(() => { roleAudit = undefined; console.warn('POKESLOT_DB_ROLE_AUDIT unavailable'); });
}
// Somente no deploy de auditoria. Nenhum diagnóstico de banco fica exposto por HTTP.
void auditRuntimeRole();
const app = new Hono<{ Variables: { userId: string; sessionToken: string } }>();
const allowedOrigin = process.env.POKESLOT_WEB_ORIGIN || 'http://localhost:5173';
const hosted = allowedOrigin !== 'http://localhost:5173';
const expectedRole = process.env.POKESLOT_EXPECTED_DB_ROLE;
let databaseRoleCheck: Promise<boolean> | undefined;
function matchesDatabaseRole() {
  return databaseRoleCheck ??= sql`SELECT current_user = ${expectedRole} AS allowed`
    .then(([check]) => check.allowed === true)
    .catch(() => { databaseRoleCheck = undefined; return false; });
}
if (hosted && (new URL(allowedOrigin).origin !== allowedOrigin || !allowedOrigin.startsWith('https://'))) {
  throw new Error('Set an HTTPS origin for the hosted game');
}
app.use('*', cors({ origin: allowedOrigin, allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type', 'X-Session-Token'] }));
app.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });
app.use('*', bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: 'request_too_large' }, 413) }));
const authenticated = createMiddleware<{ Variables: { userId: string; sessionToken: string } }>(async (c, next) => {
  const authorization = c.req.header('authorization');
  const sessionToken = c.req.header('x-session-token');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4096 || !sessionToken || sessionToken.length > 1024) return c.json({ error: 'unauthorized' }, 401);
  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer, audience: issuer, algorithms: ['EdDSA'], requiredClaims: ['sub', 'iss', 'aud', 'exp'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return c.json({ error: 'unauthorized' }, 401);
    c.set('userId', payload.sub);
    c.set('sessionToken', sessionToken);
  } catch (error) {
    // Falha de rede ou de disponibilidade das chaves não encerra uma sessão válida.
    if (!(error instanceof errors.JOSEError) || keyServiceErrors.has(error.code)) {
      return c.json({ error: 'authentication_unavailable' }, 503);
    }
    return c.json({ error: 'unauthorized' }, 401);
  }
  if (expectedRole && !await matchesDatabaseRole()) return c.json({ error: 'database_role_unavailable' }, 503);
  await next();
});

function gameResponse(c: Context, result: { status?: string }) {
  const status = result?.status;
  if (status === 'rate_limited' || status === 'daily_limit') return c.json({ error: status }, 429);
  if (status === 'operation_expired') return c.json({ error: status }, 410);
  if (status === 'operation_clock') return c.json({ error: status }, 400);
  return c.json(result);
}

app.post('/state', authenticated, async (c) => {
  const userId = c.get('userId');
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_request' }, 400); }
  if (!body || body.expectedUserId !== userId) return c.json({ error: 'session_changed' }, 409);
  try {
    const rows = await sql`SELECT pokeslot_proof.session_state(${userId}, ${c.get('sessionToken')}) AS result`;
    await auditRuntimeRole();
    return gameResponse(c, rows[0].result);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PZ401') return c.json({ error: 'unauthorized' }, 401);
    return c.json({ error: 'state_unavailable' }, 503);
  }
});

app.post('/spin', authenticated, async (c) => {
  const userId = c.get('userId');
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_request' }, 400); }
  if (!body || body.expectedUserId !== userId) return c.json({ error: 'session_changed' }, 409);
  if (typeof body.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId)) return c.json({ error: 'invalid_operation' }, 400);
  // O cliente não informa grade, captura, saldo nem relógio.
  try {
    const round = createEvaluatedReelRound();
    const selected = createStudyCaptures(round.rewardTypes);
    let index = 0;
    const captures = round.rewardTypes.filter(({ type }) => type === 'pokemon').map(({ line }) => ({ line, capture: selected[index++] }));
    const vouchers = createKantoVouchers(round.rewardTypes);
    const payload = JSON.stringify({ grid: round.grid, winningLines: round.winningLines, captures, vouchers });
    const rows = await sql`SELECT pokeslot_proof.session_spin(${userId}, ${c.get('sessionToken')}, ${body.operationId}::uuid, ${payload}::jsonb) AS result`;
    return gameResponse(c, rows[0].result);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PZ401') return c.json({ error: 'unauthorized' }, 401);
    return c.json({ error: 'result_unknown' }, 503);
  }
});
app.post('/inventory/action', authenticated, async (c) => {
  const userId = c.get('userId');
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_request' }, 400); }
  if (!body || body.expectedUserId !== userId) return c.json({ error: 'session_changed' }, 409);
  if (typeof body.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId)) return c.json({ error: 'invalid_operation' }, 400);
  if (!validInventoryAction(body.action, body.args)) return c.json({ error: 'invalid_request' }, 400);
  try {
    const rows = await sql`SELECT pokeslot_proof.session_inventory_action(${userId}, ${c.get('sessionToken')}, ${body.operationId}::uuid, ${body.action}, ${JSON.stringify(body.args)}::jsonb) AS result`;
    return gameResponse(c, rows[0].result);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PZ401') return c.json({ error: 'unauthorized' }, 401);
    if (error && typeof error === 'object' && 'code' in error && error.code === '22023') return c.json({ error: 'invalid_operation' }, 409);
    return c.json({ error: 'result_unknown' }, 503);
  }
});
app.notFound((c) => c.json({ error: 'not_found' }, 404));
export default app;
