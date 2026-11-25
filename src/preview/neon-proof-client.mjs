import { createClient, defaultDeriveNeonUrls } from '@neon/neon-js';

// Esta conexão atende somente a prova isolada; não contém credenciais do banco.
export function createNeonProofClient(baseUrl, functionUrl, fetchImpl = fetch, { client = createClient(baseUrl), timeoutMs = 15000 } = {}) {
  const authUrl = defaultDeriveNeonUrls(baseUrl).auth.replace(/\/$/, '');
  const apiUrl = functionUrl.replace(/\/$/, '');
  async function timedJson(url, options, gameRequest = false) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { ...options, signal: controller.signal });
          if (!response.ok) {
            if (response.status === 401) throw new Error('session_changed');
            if (gameRequest && [400, 403, 409, 410, 429].includes(response.status)) {
              let error;
              try { ({ error } = await response.json()); } catch { /* A resposta também pode não ser JSON. */ }
              if (response.status === 403 && error === 'access_restricted') throw new Error(error);
              if (response.status === 409 && error === 'session_changed') throw new Error(error);
              if (response.status === 410 && error === 'operation_expired') throw new Error(error);
              if (response.status === 400 && error === 'operation_clock') throw new Error(error);
              if (response.status === 429) throw new Error(error === 'daily_limit' ? error : 'rate_limited');
            }
            throw new Error('request_failed');
          }
          return response.json();
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('request_timeout')); }, timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function session() {
    try {
      return await timedJson(`${authUrl}/get-session`, { credentials: 'include' });
    } catch (error) {
      if (error?.message === 'session_changed') throw error;
      if (error?.message === 'request_timeout') throw new Error('session_timeout');
      throw new Error('session_unavailable');
    }
  }
  async function user() { return (await session())?.user ?? null; }
  async function authAction(action) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        action({ signal: controller.signal, timeout: timeoutMs, retry: 0 }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('request_timeout'));
          }, timeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function ensureSession(userId, isCurrent) {
    if (!isCurrent()) throw new Error('session_changed');
    const initial = await session();
    const sessionToken = initial?.session?.token;
    if (!isCurrent() || initial?.user?.id !== userId || typeof sessionToken !== 'string' || !sessionToken) {
      throw new Error('session_changed');
    }
    const { token } = await timedJson(`${authUrl}/token`, { credentials: 'include' });
    if (!isCurrent() || typeof token !== 'string' || !token) throw new Error('session_changed');
    const confirmed = await session();
    if (!isCurrent() || confirmed?.user?.id !== userId || confirmed?.session?.token !== sessionToken) {
      throw new Error('session_changed');
    }
    return { token, sessionToken };
  }
  async function request(route, userId, isCurrent, operationId, payload = {}) {
    // Congele a intenção antes das verificações assíncronas de sessão.
    // Identidade e ID não podem ser sobrescritos por parâmetros adicionais.
    const body = JSON.stringify({ ...payload, expectedUserId: userId, ...(operationId ? { operationId } : {}) });
    const { token, sessionToken } = await ensureSession(userId, isCurrent);
    if (!isCurrent()) throw new Error('session_changed');
    return timedJson(`${apiUrl}/${route}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Session-Token': sessionToken },
      body,
    }, true);
  }
  const inventoryAction = (userId, isCurrent, operationId, action, args) =>
    request('inventory/action', userId, isCurrent, operationId, { action, args });
  return { user, ensureSession, request, inventoryAction,
    signIn: (email, password) => authAction((options) => client.auth.signIn.email({ email, password }, options)),
    signUp: ({ name, email, password }) => authAction((options) => client.auth.signUp.email({ name, email, password }, options)),
    signOut: () => authAction((options) => client.auth.signOut({}, options)) };
}
