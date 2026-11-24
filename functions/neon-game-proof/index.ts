// Exclusivamente para o branch de prova; os dados e probabilidades são fictícios.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
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
const sql = neon(databaseUrl);
const app = new Hono<{ Variables: { userId: string; sessionToken: string } }>();
app.use('*', cors({ origin: 'http://localhost:5173', allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type', 'X-Session-Token'] }));
app.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });
const authenticated = createMiddleware<{ Variables: { userId: string; sessionToken: string } }>(async (c, next) => {
  const authorization = c.req.header('authorization');
  const sessionToken = c.req.header('x-session-token');
  if (!authorization?.startsWith('Bearer ') || !sessionToken || sessionToken.length > 1024) return c.json({ error: 'unauthorized' }, 401);
  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer, audience: issuer, algorithms: ['EdDSA'], requiredClaims: ['sub', 'iss', 'aud', 'exp'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return c.json({ error: 'unauthorized' }, 401);
    c.set('userId', payload.sub);
    c.set('sessionToken', sessionToken);
  } catch { return c.json({ error: 'unauthorized' }, 401); }
  await next();
});

app.post('/state', authenticated, async (c) => {
  const userId = c.get('userId');
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_request' }, 400); }
  if (!body || body.expectedUserId !== userId) return c.json({ error: 'session_changed' }, 409);
  try {
    const rows = await sql`SELECT pokeslot_proof.session_state(${userId}, ${c.get('sessionToken')}) AS result`;
    return c.json(rows[0].result);
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
    return c.json(rows[0].result);
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
    return c.json(rows[0].result);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PZ401') return c.json({ error: 'unauthorized' }, 401);
    if (error && typeof error === 'object' && 'code' in error && error.code === '22023') return c.json({ error: 'invalid_operation' }, 409);
    return c.json({ error: 'result_unknown' }, 503);
  }
});
app.notFound((c) => c.json({ error: 'not_found' }, 404));
export default app;
