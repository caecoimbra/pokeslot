import { createClient, defaultDeriveNeonUrls } from '@neon/neon-js';
import { openPendingOperations, claimPendingOperation, clearPendingOperation } from './pending-operations.mjs';
import { completeGameOperation } from './game-operation.mjs';
import './style.css';

const client = createClient(import.meta.env.VITE_NEON_PROOF_DATABASE_URL);
const authUrl = defaultDeriveNeonUrls(import.meta.env.VITE_NEON_PROOF_DATABASE_URL).auth.replace(/\/$/, '');
const functionUrl = 'https://br-dry-block-be4mfcuo-pokeslotgame.compute.c-9.us-east-2.aws.neon.tech';
const dbPromise = openPendingOperations();
const $ = (id) => document.getElementById(id);
let currentUser = null;
let generation = 0;
let busy = false;
if (import.meta.env.DEV) $('session-test').hidden = false;
function message(text) { $('status').textContent = text; }
function setBusy(value) {
  busy = value;
  for (const id of ['refresh', 'spin', 'concurrent', 'logout']) $(id).disabled = value;
}
function showUser(user) {
  generation++;
  currentUser = user;
  $('login-section').hidden = !!user;
  $('player').hidden = !user;
  $('player-name').textContent = user?.name || 'Conta fictícia';
  $('balance').textContent = '';
  $('collection').textContent = '';
  $('round').textContent = '';
}
async function pauseForSessionTest() {
  if (!import.meta.env.DEV || !$('pause-after-state').checked) return;
  $('pause-after-state').checked = false;
  $('switch-paused').hidden = false;
  $('resume-paused').hidden = false;
  message('Rodada concluída no banco e pausada antes da confirmação da sessão.');
  await new Promise((resolve) => $('resume-paused').addEventListener('click', resolve, { once: true }));
  $('switch-paused').hidden = true;
  $('resume-paused').hidden = true;
}
async function sessionFor(userId, version) {
  const result = await client.auth.getSession();
  if (result.error || generation !== version || currentUser?.id !== userId || result.data?.user?.id !== userId) throw new Error('session_changed');
  const tokenResponse = await fetch(`${authUrl}/token`, { credentials: 'include' });
  if (!tokenResponse.ok) throw new Error('token_unavailable');
  const { token } = await tokenResponse.json();
  const confirmed = await client.auth.getSession();
  if (confirmed.error || generation !== version || currentUser?.id !== userId || confirmed.data?.user?.id !== userId || typeof token !== 'string') throw new Error('session_changed');
  return token;
}
async function request(route, userId, version, operationId) {
  const token = await sessionFor(userId, version);
  const response = await fetch(`${functionUrl}/${route}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedUserId: userId, ...(operationId ? { operationId } : {}) }),
  });
  if (!response.ok) throw new Error('request_failed');
  return response.json();
}
async function readState(userId, version) {
  const state = await request('state', userId, version);
  if (!Number.isSafeInteger(state.balance) || !Array.isArray(state.ownedVariants)) throw new Error('invalid_state');
  return state;
}
function showState(state) {
  $('balance').textContent = `Saldo: ${state.balance} giros`;
  $('collection').textContent = `Coleção: ${state.ownedVariants.map((v) => `#${String(v.speciesId).padStart(3, '0')}${v.isShiny ? ' shiny' : ''}`).join(', ') || 'vazia'}`;
}
async function refresh(userId, version) {
  const state = await readState(userId, version);
  await sessionFor(userId, version);
  showState(state);
}
$('login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const result = await client.auth.signIn.email({ email: form.elements.email.value.trim(), password: form.elements.password.value });
    if (result.error || !result.data?.user) throw new Error('login_failed');
    form.elements.password.value = '';
    showUser(result.data.user);
    await refresh(currentUser.id, generation);
    message('Sessão conectada e progresso recuperado.');
  } catch { message('Não foi possível entrar ou recuperar o progresso. Confira as credenciais fictícias e tente novamente.'); }
  finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try { const result = await client.auth.signOut(); if (result.error) throw result.error; showUser(null); message('Sessão encerrada.'); }
  catch { message('Não foi possível confirmar a saída.'); }
  finally { setBusy(false); }
});
$('refresh').addEventListener('click', async () => {
  if (busy || !currentUser) return;
  const userId = currentUser.id, version = generation;
  setBusy(true);
  try { await refresh(userId, version); message('Progresso recuperado.'); }
  catch { if (version === generation) message('Não foi possível recuperar o progresso.'); }
  finally { setBusy(false); }
});
async function spin(concurrent) {
  if (busy || !currentUser) return;
  const userId = currentUser.id, version = generation;
  setBusy(true);
  try {
    const db = await dbPromise;
    await completeGameOperation({
      ensureSession: () => sessionFor(userId, version),
      claim: () => claimPendingOperation(db, `game-proof:${userId}`),
      send: (operation) => request('spin', userId, version, operation.operationId),
      readState: async () => {
        const state = await readState(userId, version);
        await pauseForSessionTest();
        return state;
      },
      present: (responses, state) => {
        const row = responses[0];
        showState(state);
        $('round').textContent = row.status === 'ok' ? `Rodada: ${row.winningLines.length} linha(s) vencedora(s); ${row.captures.length} captura(s).` : 'Saldo insuficiente.';
        message(concurrent ? `Respostas: ${responses.filter((v) => !v.replayed).length} nova e ${responses.filter((v) => v.replayed).length} recuperada.` : row.replayed ? 'Resultado anterior recuperado.' : 'Operação confirmada.');
      },
      clear: (operation) => clearPendingOperation(db, `game-proof:${userId}`, operation.operationId),
    }, concurrent);
  } catch (error) {
    if (version !== generation && error?.message === 'session_changed') {
      message('A sessão mudou: o resultado da conta anterior não foi exibido nesta conta e permanece pendente para recuperação.');
    } else if (version === generation) message('Resultado não confirmado. A próxima tentativa usará o mesmo identificador.');
  }
  finally { setBusy(false); }
}
$('spin').addEventListener('click', () => spin(false));
$('concurrent').addEventListener('click', () => spin(true));
if (import.meta.env.DEV) {
  $('switch-paused').addEventListener('click', async () => {
    $('switch-paused').disabled = true;
    try {
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
      showUser(null);
      message('Rodada pausada. Entre na outra conta fictícia e continue o teste.');
    } catch { message('Não foi possível confirmar a saída; a rodada continua pausada.'); }
    finally { $('switch-paused').disabled = false; }
  });
}
client.auth.getSession().then(async ({ data, error }) => {
  if (!error && data?.user) { showUser(data.user); await refresh(data.user.id, generation); message('Sessão e progresso recuperados.'); }
}).catch(() => message('Não foi possível recuperar a sessão.'));
