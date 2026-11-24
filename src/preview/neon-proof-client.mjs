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
            if (gameRequest && response.status === 401) throw new Error('session_changed');
            if (gameRequest && response.status === 409) {
              let error;
              try { ({ error } = await response.json()); } catch { /* A resposta também pode não ser JSON. */ }
              if (error === 'session_changed') throw new Error('session_changed');
            }
            throw new Error('request_failed');
          }
          return response.json();
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('request_timeout')); }, timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function user() {
    let timer;
    let result;
    try {
      result = await Promise.race([
        client.auth.getSession(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('session_timeout')), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
    if (result.error) throw new Error('session_unavailable');
    return result.data?.user ?? null;
  }
  async function ensureSession(userId, isCurrent) {
    if (!isCurrent()) throw new Error('session_changed');
    const initial = await user();
    if (!isCurrent() || initial?.id !== userId) throw new Error('session_changed');
    const { token } = await timedJson(`${authUrl}/token`, { credentials: 'include' });
    if (!isCurrent() || typeof token !== 'string') throw new Error('session_changed');
    const confirmed = await user();
    if (!isCurrent() || confirmed?.id !== userId) throw new Error('session_changed');
    return token;
  }
  async function request(route, userId, isCurrent, operationId, payload = {}) {
    // Congele a intenção antes das verificações assíncronas de sessão.
    // Identidade e ID não podem ser sobrescritos por parâmetros adicionais.
    const body = JSON.stringify({ ...payload, expectedUserId: userId, ...(operationId ? { operationId } : {}) });
    const token = await ensureSession(userId, isCurrent);
    if (!isCurrent()) throw new Error('session_changed');
    return timedJson(`${apiUrl}/${route}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    }, true);
  }
  const inventoryAction = (userId, isCurrent, operationId, action, args) =>
    request('inventory/action', userId, isCurrent, operationId, { action, args });
  return { user, ensureSession, request, inventoryAction, signIn: (email, password) => client.auth.signIn.email({ email, password }),
    signOut: () => client.auth.signOut() };
}
