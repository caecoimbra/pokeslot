import { createClient, defaultDeriveNeonUrls } from '@neon/neon-js';

// Esta conexão atende somente a prova isolada; não contém credenciais do banco.
export function createNeonProofClient(baseUrl, functionUrl, fetchImpl = fetch) {
  const client = createClient(baseUrl);
  const authUrl = defaultDeriveNeonUrls(baseUrl).auth.replace(/\/$/, '');
  const apiUrl = functionUrl.replace(/\/$/, '');
  async function user() {
    const result = await client.auth.getSession();
    if (result.error) throw new Error('session_unavailable');
    return result.data?.user ?? null;
  }
  async function ensureSession(userId, isCurrent) {
    if (!isCurrent() || (await user())?.id !== userId) throw new Error('session_changed');
    const response = await fetchImpl(`${authUrl}/token`, { credentials: 'include' });
    if (!response.ok) throw new Error('token_unavailable');
    const { token } = await response.json();
    if (!isCurrent() || (await user())?.id !== userId || typeof token !== 'string') throw new Error('session_changed');
    return token;
  }
  async function request(route, userId, isCurrent, operationId) {
    const token = await ensureSession(userId, isCurrent);
    const response = await fetchImpl(`${apiUrl}/${route}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ expectedUserId: userId, ...(operationId ? { operationId } : {}) }),
    });
    if (!response.ok) throw new Error('request_failed');
    return response.json();
  }
  return { user, ensureSession, request, signIn: (email, password) => client.auth.signIn.email({ email, password }),
    signOut: () => client.auth.signOut() };
}
