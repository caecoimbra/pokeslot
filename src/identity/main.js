import { createClient } from '@neon/neon-js';
import { MISSING_IDENTITY_CODE, MISSING_IDENTITY_MESSAGE, requestWithIdentityRetry } from './identity-retry.mjs';
import './style.css';

const root = document.querySelector('#app');
const databaseUrl = import.meta.env.VITE_NEON_DATABASE_URL;

if (!databaseUrl || databaseUrl.includes('SEU-ENDPOINT')) {
  root.innerHTML = '<section class="card"><h2>Falta configurar o endpoint</h2><p>Copie <code>.env.example</code> para <code>.env.local</code> e informe a URL HTTPS pública do branch, sem usuário, senha ou parâmetros.</p></section>';
} else {
  const neon = createClient(databaseUrl);
  let mode = 'sign-in';
  let currentUser = null;
  let stateRow = null;
  let spendInFlight = false;
  let stateReady = false;
  let loadVersion = 0;

  root.innerHTML = `
    <section class="card auth-card" id="auth-card">
      <h2 id="auth-title">Entrar na conta de teste</h2>
      ${import.meta.env.DEV && window.location.hostname === '127.0.0.1' ? '<p class="result" data-tone="error">O Neon não aceita este endereço local. Abra a interface em <a href="http://localhost:5173/">localhost:5173</a> para autenticar.</p>' : ''}
      <form id="auth-form">
        <label id="name-label" class="hidden">Nome fictício<input name="name" autocomplete="nickname" value="Jogador de teste"></label>
        <label>E-mail de teste<input name="email" type="email" autocomplete="username" required placeholder="jogador-a@example.test"></label>
        <label>Senha de teste<input name="password" type="password" autocomplete="current-password" required minlength="8"></label>
        <button class="primary" id="auth-submit" type="submit">Entrar</button>
      </form>
      <button class="text-button" id="mode-toggle" type="button">Criar conta fictícia</button>
      <div id="auth-result" class="result hidden" role="status"></div>
      <p class="fine-print">Não use sua senha habitual. A senha é enviada apenas ao serviço de autenticação do Neon.</p>
    </section>
    <section class="card hidden" id="player-card">
      <div class="player-heading"><div><p class="eyebrow">Sessão autenticada</p><h2 id="player-name"></h2></div><button class="quiet" id="sign-out" type="button">Sair</button></div>
      <p class="identity-line">ID do usuário: <code id="user-id"></code></p>
      <div class="balance-panel"><span>Saldo fictício</span><strong id="balance">—</strong><small>giros de teste</small></div>
      <div class="actions">
        <button class="primary" id="spend-spin" type="button" disabled>Gastar 1 giro pela função segura</button>
        <button class="quiet" id="reload-state" type="button">Recuperar saldo do banco</button>
      </div>
      <hr />
      <h3>Teste de solicitações simultâneas</h3>
      <p class="fine-print">Envia duas solicitações de reposição ao mesmo tempo para a conta conectada.</p>
      <button class="quiet" id="concurrent-replenishment" type="button">Solicitar reposição duas vezes</button>
      <hr />
      <h3>Testes de isolamento</h3>
      <label>ID fictício da outra conta<input id="other-user-id" autocomplete="off" placeholder="Copie o ID mostrado ao entrar na outra conta"></label>
      <div class="actions">
        <button class="quiet" id="read-other" type="button">Tentar ler a outra conta</button>
        <button class="quiet" id="create-other" type="button">Tentar criar saldo para a outra conta</button>
        <button class="danger" id="tamper-other" type="button">Tentar alterar saldo da outra conta</button>
        <button class="danger" id="tamper-own" type="button">Tentar definir meu saldo como 999</button>
      </div>
      <div id="result" class="result" role="status"></div>
    </section>
  `;

  const authCard = document.querySelector('#auth-card');
  const playerCard = document.querySelector('#player-card');
  const authForm = document.querySelector('#auth-form');
  const resultBox = document.querySelector('#result');
  const authResultBox = document.querySelector('#auth-result');

  function showResult(message, tone = 'info') {
    const box = authCard.classList.contains('hidden') ? resultBox : authResultBox;
    box.textContent = message;
    box.dataset.tone = tone;
    box.classList.remove('hidden');
  }

  function setLoading(button, loading, label) {
    button.disabled = loading;
    if (loading) button.dataset.previousLabel = button.textContent;
    button.textContent = loading ? label : button.dataset.previousLabel || button.textContent;
  }

  function showAuth() {
    authCard.classList.remove('hidden');
    playerCard.classList.add('hidden');
    document.querySelector('#auth-title').textContent = mode === 'sign-up' ? 'Criar conta fictícia' : 'Entrar na conta de teste';
    document.querySelector('#name-label').classList.toggle('hidden', mode !== 'sign-up');
    document.querySelector('#auth-submit').textContent = mode === 'sign-up' ? 'Criar conta' : 'Entrar';
    document.querySelector('#mode-toggle').textContent = mode === 'sign-up' ? 'Já tenho uma conta de teste' : 'Criar conta fictícia';
  }

  async function loadPlayerState() {
    if (!currentUser) return;
    if (spendInFlight) {
      showResult('Aguarde a conclusão do gasto antes de recuperar o saldo.');
      return;
    }
    const version = ++loadVersion;
    const userId = currentUser.id;
    stateReady = false;
    document.querySelector('#spend-spin').disabled = true;
    showResult('Buscando o saldo associado a esta identidade…');
    // A função verifica a identidade antes de criar ou recuperar o próprio saldo.
    let refreshed;
    try {
      refreshed = await requestWithIdentityRetry(() => neon.rpc('refresh_own_replenishment'));
    } catch {
      if (version === loadVersion && currentUser?.id === userId) {
        showResult('Não foi possível recuperar o saldo. Verifique a conexão e tente novamente.', 'error');
      }
      return;
    }
    if (version !== loadVersion || currentUser?.id !== userId) return;
    if (refreshed.error) {
      const identityUnavailable = refreshed.error.code === MISSING_IDENTITY_CODE && refreshed.error.message === MISSING_IDENTITY_MESSAGE;
      showResult(identityUnavailable ? 'Não foi possível confirmar sua identidade agora. Aguarde um pouco e tente recuperar o saldo novamente.' : `Não foi possível atualizar as reposições: ${refreshed.error.message}`, 'error');
      return;
    }
    const replenishment = Array.isArray(refreshed.data) ? refreshed.data[0] : refreshed.data;
    if (!replenishment || !Number.isInteger(replenishment.balance)) {
      showResult('A API não confirmou o saldo atualizado.', 'error');
      return;
    }

    stateRow = { user_id: userId, balance: replenishment.balance, refills_accounted_until: replenishment.accounted_until };
    stateReady = true;
    if (!spendInFlight) document.querySelector('#spend-spin').disabled = false;
    document.querySelector('#balance').textContent = String(replenishment.balance);
    const next = new Date(replenishment.next_replenishment_at).toLocaleString('pt-BR');
    showResult(`Saldo recuperado do banco. Períodos adicionados: ${replenishment.periods_added}. Próxima reposição: ${next}.`, 'success');
  }

  async function enterSession(user) {
    currentUser = user;
    authCard.classList.add('hidden');
    playerCard.classList.remove('hidden');
    document.querySelector('#player-name').textContent = user.name || user.email || 'Jogador de teste';
    document.querySelector('#user-id').textContent = user.id;
    await loadPlayerState();
  }

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.querySelector('#auth-submit');
    const form = new FormData(authForm);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    const submittedMode = mode;
    setLoading(button, true, submittedMode === 'sign-up' ? 'Criando…' : 'Entrando…');
    document.querySelector('#mode-toggle').disabled = true;
    authResultBox.classList.add('hidden');
    let timer;
    try {
      const request = submittedMode === 'sign-up'
        ? neon.auth.signUp.email({ email, name: String(form.get('name')).trim(), password })
        : neon.auth.signIn.email({ email, password });
      const result = await Promise.race([
        request,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('O Neon não respondeu dentro de 20 segundos. O resultado do cadastro é incerto; tente entrar com a mesma conta antes de tentar criar outra.')), 20000);
        }),
      ]);
      if (result.error) {
        showResult(`Autenticação: ${result.error.message}`, 'error');
      } else if (result.data?.user) {
        authForm.elements.password.value = '';
        await enterSession(result.data.user);
      } else {
        showResult('O Neon respondeu sem confirmar uma sessão. Tente entrar com a conta informada.', 'error');
      }
    } catch (error) {
      showResult(`Não foi possível confirmar a autenticação: ${error.message}`, 'error');
    } finally {
      clearTimeout(timer);
      setLoading(button, false);
      document.querySelector('#mode-toggle').disabled = false;
    }
  });

  document.querySelector('#mode-toggle').addEventListener('click', () => {
    mode = mode === 'sign-up' ? 'sign-in' : 'sign-up';
    showAuth();
    showResult('Use somente endereços fictícios e uma senha criada para esta prova.');
  });

  document.querySelector('#sign-out').addEventListener('click', async () => {
    const { error } = await neon.auth.signOut();
    if (error) {
      showResult(`Não foi possível encerrar a sessão: ${error.message}`, 'error');
      return;
    }
    currentUser = null;
    stateRow = null;
    stateReady = false;
    loadVersion += 1;
    mode = 'sign-in';
    showAuth();
    showResult('Sessão encerrada. Entre com a outra conta fictícia para testar o isolamento.');
  });

  document.querySelector('#reload-state').addEventListener('click', loadPlayerState);

  document.querySelector('#concurrent-replenishment').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setLoading(button, true, 'Consultando…');
    showResult('Enviando as duas solicitações autenticadas…');
    try {
      const calls = await Promise.allSettled([
        requestWithIdentityRetry(() => neon.rpc('refresh_own_replenishment')),
        requestWithIdentityRetry(() => neon.rpc('refresh_own_replenishment')),
      ]);
      const describe = (call, index) => {
        if (call.status === 'rejected') return `Solicitação ${index + 1}: falhou (${call.reason?.message ?? 'erro de rede'}).`;
        if (call.value.error) return `Solicitação ${index + 1}: falhou (${call.value.error.message}).`;
        const row = Array.isArray(call.value.data) ? call.value.data[0] : call.value.data;
        if (!row || !Number.isInteger(row.balance) || !Number.isInteger(row.periods_added)) return `Solicitação ${index + 1}: resposta incompleta.`;
        const attempts = call.value.attempts > 1 ? `, tentativas ${call.value.attempts}` : '';
        return `Solicitação ${index + 1}: saldo ${row.balance}, períodos adicionados ${row.periods_added}${attempts}.`;
      };
      const read = await neon.from('proof_player_state')
        .select('balance,refills_accounted_until')
        .eq('user_id', currentUser.id);
      const saved = read.data?.[0];
      if (!read.error && saved && Number.isInteger(saved.balance)) {
        stateRow = { ...stateRow, ...saved };
        document.querySelector('#balance').textContent = String(saved.balance);
      }
      const stored = read.error ? ` Leitura final falhou: ${read.error.message}.` : saved ? ` Saldo final no banco: ${saved.balance}.` : ' A linha final não foi retornada.';
      showResult(`${calls.map(describe).join(' ')}${stored}`, 'info');
    } catch (error) {
      showResult(`Teste simultâneo inconclusivo: ${error.message}`, 'error');
    } finally {
      setLoading(button, false);
    }
  });

  document.querySelector('#spend-spin').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (spendInFlight || !stateReady) return;
    spendInFlight = true;
    setLoading(button, true, 'Atualizando…');
    let mustRefresh = false;
    try {
      const result = await requestWithIdentityRetry(() => neon.rpc('consume_test_spin'));
      if (result.error) {
        const identityUnavailable = result.error.code === MISSING_IDENTITY_CODE && result.error.message === MISSING_IDENTITY_MESSAGE;
        if (identityUnavailable) {
          showResult('Não foi possível confirmar sua identidade agora. Nenhum giro foi gasto nesta tentativa.', 'error');
        } else {
          mustRefresh = true;
          showResult('Não foi possível confirmar o resultado. Recupere o saldo antes de tentar gastar novamente.', 'error');
        }
        return;
      }
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row || !Number.isInteger(row.balance)) {
        mustRefresh = true;
        showResult('A resposta não confirmou o saldo. Recupere o saldo antes de tentar gastar novamente.', 'error');
        return;
      }
      stateRow.balance = row.balance;
      document.querySelector('#balance').textContent = String(row.balance);
      showResult('A função autorizada gastou 1 giro no banco.', 'success');
    } catch {
      mustRefresh = true;
      showResult('Não foi possível confirmar o resultado. Recupere o saldo antes de tentar gastar novamente.', 'error');
    } finally {
      spendInFlight = false;
      setLoading(button, false);
      if (mustRefresh) stateReady = false;
      button.disabled = !stateReady;
    }
  });

  document.querySelector('#read-other').addEventListener('click', async () => {
    const otherId = document.querySelector('#other-user-id').value.trim();
    if (!otherId) return showResult('Informe o ID da outra conta fictícia.');
    const result = await neon.from('proof_player_state').select('user_id,balance').eq('user_id', otherId);
    if (result.error) return showResult(`Consulta cruzada inconclusiva: ${result.error.message}`, 'error');
    showResult(result.data?.length ? 'A outra linha ficou visível — revisar a política RLS.' : 'Nenhuma linha da outra conta foi retornada.', result.data?.length ? 'error' : 'success');
  });

  document.querySelector('#create-other').addEventListener('click', async () => {
    const otherId = document.querySelector('#other-user-id').value.trim();
    if (!otherId) return showResult('Informe o ID da outra conta fictícia.');
    const result = await neon.from('proof_player_state').insert({ user_id: otherId }).select('user_id,balance');
    if (result.error) return showResult(`A criação para outra identidade não foi concluída: ${result.error.message}. Confira o código do erro antes de atribuí-lo ao RLS.`, 'error');
    showResult('Uma linha para outra identidade foi criada — revisar a política RLS.', 'error');
  });

  document.querySelector('#tamper-own').addEventListener('click', async () => {
    const result = await neon.from('proof_player_state')
      .update({ balance: 999 })
      .eq('user_id', currentUser.id)
      .select('balance');
    if (result.error) return showResult(`Alteração direta recusada pelo banco: ${result.error.message}`, 'success');
    if (result.data?.length) {
      showResult('A API alterou o saldo diretamente — revisar grants e políticas.', 'error');
    } else {
      showResult('Nenhuma linha foi retornada pela tentativa de alteração direta; confira o saldo no banco.', 'info');
    }
  });

  document.querySelector('#tamper-other').addEventListener('click', async () => {
    const otherId = document.querySelector('#other-user-id').value.trim();
    if (!otherId || otherId === currentUser.id) return showResult('Informe o ID de outra conta fictícia.');
    try {
      const result = await neon.from('proof_player_state')
        .update({ balance: 999 })
        .eq('user_id', otherId)
        .select('user_id,balance');
      if (result.error) return showResult(`A tentativa de alteração cruzada não foi concluída: ${result.error.message}`, 'info');
      showResult(result.data?.length ? 'Uma linha foi alterada pela tentativa cruzada — revisar as permissões.' : 'A tentativa cruzada não retornou linhas alteradas; confirme o saldo da outra conta.', result.data?.length ? 'error' : 'info');
    } catch (error) {
      showResult(`Tentativa cruzada inconclusiva: ${error.message}`, 'error');
    }
  });

  neon.auth.getSession().then(({ data, error }) => {
    if (error) {
      showAuth();
      showResult(`Não foi possível recuperar a sessão: ${error.message}`, 'error');
    } else if (data?.user) {
      enterSession(data.user);
    } else {
      showAuth();
    }
  }).catch((error) => {
    showAuth();
    showResult(`Falha ao iniciar o cliente Neon: ${error.message}`, 'error');
  });
}
