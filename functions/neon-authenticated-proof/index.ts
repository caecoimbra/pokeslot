// Código histórico da prova. A função pública foi encerrada no branch isolado;
// não republicar este endpoint. O jogo utiliza neon-game-proof.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { neon } from '@neondatabase/serverless';

const authUrl = process.env.NEON_AUTH_BASE_URL;
const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const databaseUrl = process.env.DATABASE_URL;
if (!authUrl || !jwksUrl || !databaseUrl) throw new Error('Missing Neon proof configuration');
const issuer = new URL(authUrl).origin;
const jwks = createRemoteJWKSet(new URL(jwksUrl));
const sql = neon(databaseUrl);
const app = new Hono<{ Variables: { userId: string } }>();

// O endereço local é apenas para a prova. CORS não substitui autenticação.
app.use('*', cors({ origin: 'http://localhost:5173', allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'] }));
app.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });

const authenticated = createMiddleware<{ Variables: { userId: string } }>(async (c, next) => {
  const authorization = c.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);
  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer, audience: issuer, algorithms: ['EdDSA'], requiredClaims: ['sub', 'iss', 'aud', 'exp'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return c.json({ error: 'unauthorized' }, 401);
    c.set('userId', payload.sub);
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

app.post('/refresh', authenticated, async (c) => {
  const userId = c.get('userId');
  let body: { expectedUserId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_request' }, 400); }
  if (!body || body.expectedUserId !== userId) return c.json({ error: 'session_changed' }, 409);
  try {
    const rows = await sql`SELECT * FROM proof_private.refresh_verified_state(${userId})`;
    return c.json(rows[0]);
  } catch {
    return c.json({ error: 'state_unavailable' }, 503);
  }
});

app.post('/spin', authenticated, async (c) => {
  const userId = c.get('userId');
  let body: { expectedUserId?: unknown; operationId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_request' }, 400); }
  if (!body || body.expectedUserId !== userId) return c.json({ error: 'session_changed' }, 409);
  if (typeof body.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId)) {
    return c.json({ error: 'invalid_operation' }, 400);
  }
  try {
    const rows = await sql`SELECT * FROM proof_private.consume_verified_spin(${userId}, ${body.operationId}::uuid)`;
    return c.json(rows[0]);
  } catch {
    // Pode haver falha após o commit; a recuperação deve reutilizar operationId.
    return c.json({ error: 'result_unknown' }, 503);
  }
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));
export default app;
