import { createClient, defaultDeriveNeonUrls } from '@neon/neon-js';

// Esta conexão atende somente a prova isolada; não contém credenciais do banco.
export function createNeonProofClient(baseUrl, functionUrl, fetchImpl = fetch, { client = createClient(baseUrl), timeoutMs = 15000 } = {}) {
  const authUrl = defaultDeriveNeonUrls(baseUrl).auth.replace(/\/$/, '');
  const apiUrl = functionUrl.replace(/\/$/, '');
  async function timedJson(url, options) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { ...options, signal: controller.signal });
          if (!response.ok) throw new Error('request_failed');
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
    if (!isCurrent() || (await user())?.id !== userId) throw new Error('session_changed');
    const { token } = await timedJson(`${authUrl}/token`, { credentials: 'include' });
    if (!isCurrent() || (await user())?.id !== userId || typeof token !== 'string') throw new Error('session_changed');
    return token;
  }
  async function request(route, userId, isCurrent, operationId) {
    const token = await ensureSession(userId, isCurrent);
    return timedJson(`${apiUrl}/${route}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ expectedUserId: userId, ...(operationId ? { operationId } : {}) }),
    });
  }
  return { user, ensureSession, request, signIn: (email, password) => client.auth.signIn.email({ email, password }),
    signOut: () => client.auth.signOut() };
}
