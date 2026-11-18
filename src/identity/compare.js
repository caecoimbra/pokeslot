import { createClient } from '@neon/neon-js';
import { requestWithIdentityRetry } from './identity-retry.mjs';
import { openPendingOperations, claimPendingOperation, clearPendingOperation } from './pending-operations.mjs';
import { describeLoginError } from './login-errors.mjs';
import './style.css';

// Endpoint público do branch de prova; nunca colocar aqui usuário ou senha do banco.
const baseUrl = import.meta.env.VITE_NEON_PROOF_DATABASE_URL;
const functionUrl = import.meta.env.VITE_NEON_PROOF_FUNCTION_URL;
if (!baseUrl) {
  document.querySelector('#result').textContent = 'Configure VITE_NEON_PROOF_DATABASE_URL no arquivo .env.local para usar a prova isolada.';
  document.querySelector('#login button').disabled = true;
  throw new Error('Configuração da prova isolada ausente');
}
const neon = createClient(baseUrl);
const dbPromise = openPendingOperations();
const $ = (selector) => document.querySelector(selector);
const result = $('#result');
if (import.meta.env.DEV) {
  $('#simulate-label').classList.remove('hidden');
  $('#pause-label').classList.remove('hidden');
  $('#pause-after-label').classList.remove('hidden');
  $('#concurrent-spend').classList.remove('hidden');
}
let currentUser = null;
let busy = false;
let generation = 0;

function message(text, tone = 'info') { result.textContent = text; result.dataset.tone = tone; }
function toggleBusy(value) {
  busy = value;
  for (const selector of ['#refresh', '#spend', '#logout', '#path', '#concurrent-spend']) $(selector).disabled = value;
}
async function pauseProof(text) {
  $('#resume-spend').classList.remove('hidden');
  $('#switch-paused').classList.remove('hidden');
  message(text);
  await new Promise((resolve) => $('#resume-spend').addEventListener('click', resolve, { once: true }));
  $('#resume-spend').classList.add('hidden');
  $('#switch-paused').classList.add('hidden');
}
function showAuth() {
  generation += 1;
  currentUser = null;
  $('#balance').textContent = '—';
  $('#player').classList.add('hidden');
  $('#auth').classList.remove('hidden');
}
function showUser(user) {
  generation += 1;
  currentUser = user;
  $('#name').textContent = user.name || 'Jogador de teste';
  $('#user-id').textContent = user.id;
  $('#balance').textContent = '—';
  $('#auth').classList.add('hidden');
  $('#player').classList.remove('hidden');
}
async function sessionFor(userId, version) {
  const session = await neon.auth.getSession();
  if (session.error || version !== generation || currentUser?.id !== userId || session.data?.user?.id !== userId) {
    throw new Error('session_changed');
  }
  return session.data;
}
function firstRow(data) { return Array.isArray(data) ? data[0] : data; }
async function functionRequest(route, userId, version, operationId) {
  const session = await sessionFor(userId, version);
  const token = session.session?.token;
  if (!token) throw new Error('session_unavailable');
  const response = await fetch(`${functionUrl.replace(/\/$/, '')}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedUserId: userId, ...(operationId ? { operationId } : {}) }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'request_failed');
  return payload;
}
async function refresh(userId, version, path) {
  await sessionFor(userId, version);
  let row;
  if (path === 'function') {
    row = await functionRequest('refresh', userId, version);
  } else {
    const response = await requestWithIdentityRetry(async () => {
      await sessionFor(userId, version);
      return neon.rpc('refresh_test_replenishment_bound', { p_expected_user_id: userId });
    });
    if (response.error) throw new Error(response.error.code || 'request_failed');
    row = firstRow(response.data);
  }
  if (!row || !Number.isInteger(row.balance)) throw new Error('incomplete_response');
  await sessionFor(userId, version);
  $('#balance').textContent = String(row.balance);
  return row;
}

$('#login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const loginForm = event.currentTarget;
  const submit = loginForm.querySelector('button');
  const form = new FormData(loginForm);
  submit.disabled = true;
  message('Conectando à conta fictícia…');
  try {
    let response;
    try {
      response = await neon.auth.signIn.email({ email: String(form.get('email')).trim(), password: String(form.get('password')) });
      if (response.error) throw response.error;
    } catch (error) {
      message(describeLoginError(error), 'error');
      return;
    }
    if (!response.data?.user) throw new Error('login_failed');
    loginForm.elements.password.value = '';
    showUser(response.data.user);
    message('Conta conectada. Recupere o saldo para começar.', 'success');
  } catch {
    message('A resposta de entrada não pôde ser apresentada. Recarregue a página para verificar sua sessão.', 'error');
  } finally { submit.disabled = false; }
});

$('#logout').addEventListener('click', async () => {
  if (busy) return;
  toggleBusy(true);
  try {
    const response = await neon.auth.signOut();
    if (response.error) throw new Error('signout_failed');
    showAuth();
    message('Sessão encerrada.');
  } catch { message('Não foi possível confirmar a saída.', 'error'); }
  finally { toggleBusy(false); }
});

$('#refresh').addEventListener('click', async () => {
  if (busy || !currentUser) return;
  const userId = currentUser.id, version = generation, path = $('#path').value;
  toggleBusy(true);
  try {
    const row = await refresh(userId, version, path);
    message(`Saldo confirmado. Períodos acrescentados: ${row.periods_added}.`, 'success');
  } catch (error) {
    if (error.message === 'session_changed') { showAuth(); message('A sessão mudou. Entre novamente para continuar.', 'error'); }
    else if (version === generation) message('Não foi possível confirmar o saldo. Tente novamente.', 'error');
  } finally { toggleBusy(false); }
});

$('#spend').addEventListener('click', async () => {
  if (busy || !currentUser) return;
  const userId = currentUser.id, version = generation, path = $('#path').value;
  toggleBusy(true);
  try {
    await sessionFor(userId, version);
    const db = await dbPromise;
    const pending = await claimPendingOperation(db, userId);
    if (import.meta.env.DEV && $('#pause-spend').checked) {
      $('#pause-spend').checked = false;
      await pauseProof('Gasto pausado antes do envio. A operação continua vinculada à conta que a iniciou.');
    }
    let row;
    if (path === 'function') {
      row = await functionRequest('spin', userId, version, pending.operationId);
    } else {
      const response = await requestWithIdentityRetry(async () => {
        await sessionFor(userId, version);
        return neon.rpc('consume_test_spin_once', {
          p_expected_user_id: userId, p_operation_id: pending.operationId,
        });
      });
      if (response.error) throw new Error(response.error.code || 'request_failed');
      row = firstRow(response.data);
    }
    if (!row || !Number.isInteger(row.balance) || typeof row.replayed !== 'boolean') throw new Error('incomplete_response');
    if (import.meta.env.DEV && $('#pause-after').checked) {
      $('#pause-after').checked = false;
      await pauseProof('Servidor respondeu ao gasto. A apresentação está pausada para testar a troca de conta.');
    }
    // Só na prova local: descarta a resposta já recebida, antes de confirmar o resultado na interface.
    if (import.meta.env.DEV && $('#simulate-lost').checked) {
      $('#simulate-lost').checked = false;
      throw new Error('simulated_lost_response');
    }
    await clearPendingOperation(db, userId, pending.operationId);
    await sessionFor(userId, version);
    // Um replay pode devolver um saldo histórico: recupere o saldo atual separadamente.
    try {
      await refresh(userId, version, path);
      message(row.replayed ? 'Resultado recuperado sem descontar de novo.' : 'Giro descontado uma vez.', 'success');
    } catch (error) {
      if (error.message === 'session_changed') { showAuth(); message('A sessão mudou. Entre novamente para continuar.', 'error'); }
      else if (version === generation) message('Gasto confirmado; recupere o saldo atual antes de continuar.', 'info');
    }
  } catch (error) {
    if (error.message === 'session_changed' || error.message === 'PZ002') {
      showAuth(); message('A sessão mudou. Entre novamente na conta que iniciou a ação.', 'error');
    }
    else if (version === generation) message('Resultado não confirmado. A próxima tentativa reutilizará a mesma operação.', 'error');
  } finally { toggleBusy(false); }
});

if (import.meta.env.DEV) {
  $('#concurrent-spend').addEventListener('click', async () => {
    if (busy || !currentUser) return;
    const userId = currentUser.id, version = generation, path = $('#path').value;
    let confirmed = false;
    toggleBusy(true);
    try {
      await sessionFor(userId, version);
      const db = await dbPromise;
      const pending = await claimPendingOperation(db, userId);
      const send = async () => {
        if (path === 'function') return functionRequest('spin', userId, version, pending.operationId);
        const response = await requestWithIdentityRetry(async () => {
          await sessionFor(userId, version);
          return neon.rpc('consume_test_spin_once', { p_expected_user_id: userId, p_operation_id: pending.operationId });
        });
        if (response.error) throw new Error(response.error.code || 'request_failed');
        return firstRow(response.data);
      };
      const rows = await Promise.all([send(), send()]);
      if (!rows.every((row) => Number.isInteger(row?.balance) && typeof row.replayed === 'boolean')) throw new Error('incomplete_response');
      await clearPendingOperation(db, userId, pending.operationId);
      confirmed = true;
      await sessionFor(userId, version);
      await refresh(userId, version, path);
      message(`Respostas: ${rows.filter((row) => !row.replayed).length} gasto novo e ${rows.filter((row) => row.replayed).length} recuperação.`, 'success');
    } catch (error) {
      if (error.message === 'session_changed' || error.message === 'PZ002') { showAuth(); message('A sessão mudou durante o teste.', 'error'); }
      else if (version === generation) message(confirmed ? 'Gasto confirmado, mas o saldo atual não pôde ser recuperado.' : 'Teste simultâneo não confirmado; a operação permanece pendente.', 'error');
    } finally { toggleBusy(false); }
  });
  $('#switch-paused').addEventListener('click', async () => {
    $('#switch-paused').disabled = true;
    try {
      const response = await neon.auth.signOut();
      if (response.error) throw response.error;
      showAuth();
      message('Gasto pausado. Entre em outra conta de teste e depois continue a operação.');
    } catch {
      message('Não foi possível confirmar a saída. A operação continua pausada.', 'error');
    } finally { $('#switch-paused').disabled = false; }
  });
}

if (functionUrl) {
  const option = $('#path').querySelector('option[value="function"]');
  option.disabled = false;
  option.textContent = 'Neon Functions';
}
neon.auth.getSession().then(({ data, error }) => {
  if (!error && data?.user) { showUser(data.user); message('Sessão recuperada. Recupere o saldo para começar.'); }
}).catch(() => message('Não foi possível recuperar a sessão. Tente entrar novamente.', 'error'));
