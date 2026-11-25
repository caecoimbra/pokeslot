import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProofClient } from '../src/preview/neon-proof-client.mjs';
import { completeGameOperation } from '../src/identity/game-operation.mjs';

const base = 'https://example.neon.tech/neondb';
const api = 'https://function.example.test';
const account = { id: 'A' };
const testSession = { token: 'sessao-ficticia' };
const auth = { auth: { getSession: async () => ({ data: { user: account, session: testSession } }) } };
const json = (value) => ({ ok: true, json: async () => value });

// O provedor responde com a credencial opaca ao consultar /get-session.
function makeClient(baseUrl, functionUrl, fetchImpl, options = {}) {
  const sessionAuth = options.client ?? auth;
  return createNeonProofClient(baseUrl, functionUrl, async (url, init) => {
    if (url.endsWith('/get-session')) {
      assert.equal(init.credentials, 'include');
      const result = await sessionAuth.auth.getSession();
      return result.error ? new Response('', { status: 503 }) : json(result.data ?? null);
    }
    return fetchImpl(url, init);
  }, options);
}

test('limite temporário preserva a operação pendente para recuperação', async () => {
  let limited = true, cleared = false;
  const client = makeClient(base, api, async (url) => {
    if (url.endsWith('/token')) return json({ token: 'token-ficticio' });
    if (url.endsWith('/state')) return json({ balance: 19 });
    return limited ? new Response('', { status: 429 }) : json({ status: 'ok', replayed: false });
  }, { client: auth });
  const deps = {
    ensureSession: () => client.ensureSession('A', () => true),
    claim: async () => ({ operationId: 'mesma-operacao' }),
    send: (operation) => client.request('spin', 'A', () => true, operation.operationId),
    readState: () => client.request('state', 'A', () => true),
    present: () => {}, clear: async () => { cleared = true; },
  };
  await assert.rejects(completeGameOperation(deps), /rate_limited/);
  assert.equal(cleared, false);
  limited = false;
  await completeGameOperation(deps);
  assert.equal(cleared, true);
});

test('resposta da rodada que não chega expira e recuperação usa o mesmo identificador', async () => {
  let stored = null, calls = 0, cleared = false, presented = null;
  const client = makeClient(base, api, async (url, options) => {
    if (url.endsWith('/token')) return json({ token: 'token-ficticio' });
    if (url.endsWith('/state')) return json({ balance: 19 });
    const body = JSON.parse(options.body);
    assert.equal(body.expectedUserId, 'A');
    assert.equal(body.operationId, 'operacao-ficticia');
    calls++;
    if (!stored) {
      stored = { status: 'ok', balance: 19 };
      return new Promise(() => {});
    }
    return json({ ...stored, replayed: true });
  }, { client: auth, timeoutMs: 10 });
  const deps = {
    ensureSession: () => client.ensureSession('A', () => true),
    claim: async () => ({ operationId: 'operacao-ficticia' }),
    send: (operation) => client.request('spin', 'A', () => true, operation.operationId),
    readState: () => client.request('state', 'A', () => true),
    present: (responses, state) => { presented = { responses, state }; },
    clear: async () => { cleared = true; },
  };
  await assert.rejects(completeGameOperation(deps), /request_timeout/);
  assert.equal(cleared, false);
  assert.equal(presented, null);
  await completeGameOperation(deps);
  assert.equal(calls, 2);
  assert.equal(presented.responses[0].replayed, true);
  assert.equal(presented.state.balance, 19);
  assert.equal(cleared, true);
});

test('mudança de conta enquanto busca token impede envio à função', async () => {
  let user = { id: 'A' }, functionCalled = false;
  const client = makeClient(base, api, async (url) => {
    if (url.endsWith('/token')) { user = { id: 'B' }; return json({ token: 'token-ficticio' }); }
    functionCalled = true;
    return json({});
  }, { client: { auth: { getSession: async () => ({ data: { user, session: testSession } }) } }, timeoutMs: 100 });
  await assert.rejects(client.request('spin', 'A', () => true, 'operacao-ficticia'), /session_changed/);
  assert.equal(functionCalled, false);
});

test('corpo da resposta que não termina também expira', async () => {
  const client = makeClient(base, api, async () => ({ ok: true, json: () => new Promise(() => {}) }), { client: auth, timeoutMs: 10 });
  await assert.rejects(client.ensureSession('A', () => true), /request_timeout/);
});

test('a sessão precisa estar atual quando a última consulta termina', async () => {
  let current = true;
  let reads = 0;
  const started = Promise.withResolvers();
  const lastRead = Promise.withResolvers();
  const client = makeClient(base, api, async () => json({ token: 'token-ficticio' }), {
    client: { auth: { getSession: () => {
      if (++reads === 1) return Promise.resolve({ data: { user: account, session: testSession } });
      started.resolve();
      return lastRead.promise;
    } } },
  });
  const validation = client.ensureSession('A', () => current);
  await started.promise;
  current = false;
  lastRead.resolve({ data: { user: account, session: testSession } });
  await assert.rejects(validation, /session_changed/);
});

test('consulta de sessão que não retorna também expira', async () => {
  const client = makeClient(base, api, async () => json({}), {
    client: { auth: { getSession: () => new Promise(() => {}) } }, timeoutMs: 10,
  });
  await assert.rejects(client.user(), /session_timeout/);
});

test('envia a ação de inventário com identidade e parâmetros da intenção original', async () => {
  const started = Promise.withResolvers();
  const resume = Promise.withResolvers();
  let sent;
  const parameters = { source: { speciesId: 25, isShiny: true }, targetId: 26, stone: 'thunder' };
  const client = makeClient(base, api, async (url, options) => {
    if (url.endsWith('/token')) { started.resolve(); await resume.promise; return json({ token: 'token-ficticio' }); }
    sent = { url, options, body: JSON.parse(options.body) };
    return json({ status: 'ok', replayed: false });
  }, { client: auth });
  const pending = client.inventoryAction('A', () => true, 'operacao-ficticia', 'evolve', parameters);
  await started.promise;
  parameters.targetId = 27;
  resume.resolve();
  assert.equal((await pending).status, 'ok');
  assert.equal(sent.url, `${api}/inventory/action`);
  assert.equal(sent.options.headers.Authorization, 'Bearer token-ficticio');
  assert.equal(sent.options.headers['X-Session-Token'], 'sessao-ficticia');
  assert.deepEqual(sent.body, { expectedUserId: 'A', operationId: 'operacao-ficticia', action: 'evolve',
    args: { source: { speciesId: 25, isShiny: true }, targetId: 26, stone: 'thunder' } });
});

test('não envia ação de inventário se a conta mudar durante a obtenção do token', async () => {
  let user = { id: 'A' }, sent = false;
  const client = makeClient(base, api, async (url) => {
    if (url.endsWith('/token')) { user = { id: 'B' }; return json({ token: 'token-ficticio' }); }
    sent = true;
    return json({});
  }, { client: { auth: { getSession: async () => ({ data: { user, session: testSession } }) } } });
  await assert.rejects(client.inventoryAction('A', () => true, 'operacao-ficticia', 'stone', { stone: 'moon' }), /session_changed/);
  assert.equal(sent, false);
});

test('identifica uma conta sem convite apenas se a função confirmar o motivo da recusa', async () => {
  for (const [reason, expected] of [['access_restricted', 'access_restricted'], ['forbidden', 'request_failed']]) {
    const client = makeClient(base, api, async (url) => url.endsWith('/token')
      ? json({ token: 'token-ficticio' }) : Response.json({ error: reason }, { status: 403 }), { client: auth });
    await assert.rejects(client.request('state', 'A', () => true), { message: expected });
  }
});

test('trata 401 e o conflito de sessão da função como troca de conta', async () => {
  for (const reply of [Response.json({ error: 'unauthorized' }, { status: 401 }),
    Response.json({ error: 'session_changed' }, { status: 409 })]) {
    const client = makeClient(base, api, async (url) =>
      url.endsWith('/token') ? json({ token: 'token-ficticio' }) : reply, { client: auth });
    await assert.rejects(client.request('state', 'A', () => true), { message: 'session_changed' });
  }
});

test('não confunde troca de conta com conflito de operação, falha da API ou falha ao obter token', async () => {
  const scenarios = [
    { game: Response.json({ error: 'invalid_operation' }, { status: 409 }) },
    { game: new Response('Bad gateway', { status: 503 }) },
    { game: new Response('Conflict', { status: 409 }) },
    { token: new Response('Bad gateway', { status: 503 }) },
  ];
  for (const { game, token = json({ token: 'token-ficticio' }) } of scenarios) {
    const client = makeClient(base, api, async (url) => url.endsWith('/token') ? token : game, { client: auth });
    await assert.rejects(client.inventoryAction('A', () => true, 'operacao-ficticia', 'stone', { stone: 'moon' }),
      { message: 'request_failed' });
  }
});

test('uma recusa de autenticação ao obter o token encerra a sessão sem consultar a função', async () => {
  let functionCalled = false;
  const client = makeClient(base, api, async (url) => {
    if (url.endsWith('/token')) return Response.json({ error: 'unauthorized' }, { status: 401 });
    functionCalled = true;
    return json({});
  }, { client: auth });
  await assert.rejects(client.request('state', 'A', () => true), { message: 'session_changed' });
  assert.equal(functionCalled, false);
});

test('não envia uma operação quando a mesma conta troca de sessão', async () => {
  let currentToken = 'sessao-inicial';
  let functionCalled = false;
  const client = makeClient(base, api, async (url) => {
    if (url.endsWith('/token')) {
      currentToken = 'outra-sessao';
      return json({ token: 'token-ficticio' });
    }
    functionCalled = true;
    return json({});
  }, { client: { auth: { getSession: async () => ({ data: { user: account, session: { token: currentToken } } }) } } });
  await assert.rejects(client.request('spin', 'A', () => true, 'operacao-ficticia'), { message: 'session_changed' });
  assert.equal(functionCalled, false);
});

test('não envia uma operação sem credencial de sessão', async () => {
  let called = false;
  const client = makeClient(base, api, async () => {
    called = true;
    return json({});
  }, { client: { auth: { getSession: async () => ({ data: { user: account, session: {} } }) } } });
  await assert.rejects(client.request('state', 'A', () => true), { message: 'session_changed' });
  assert.equal(called, false);
});

test('usa o token opaco retornado pelo serviço e não o JWT exposto pelo adaptador', async () => {
  let sent;
  const client = createNeonProofClient(base, api, async (url, options) => {
    if (url.endsWith('/get-session')) {
      assert.equal(options.credentials, 'include');
      return json({ user: account, session: { token: 'sessao-opaca' } });
    }
    if (url.endsWith('/token')) return json({ token: 'jwt-assinado' });
    sent = options.headers;
    return json({});
  }, { client: { auth: { getSession: async () => ({ data: { user: account, session: { token: 'jwt-assinado' } } }) } } });
  await client.request('state', 'A', () => true);
  assert.equal(sent.Authorization, 'Bearer jwt-assinado');
  assert.equal(sent['X-Session-Token'], 'sessao-opaca');
});

test('distingue sessão recusada de falha temporária na consulta ao serviço', async () => {
  for (const [status, expected] of [[401, 'session_changed'], [503, 'session_unavailable']]) {
    const client = createNeonProofClient(base, api, async () => new Response('', { status }), { client: auth });
    await assert.rejects(client.ensureSession('A', () => true), { message: expected });
  }
});
