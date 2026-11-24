import { createClient } from '@neon/neon-js';
import { createPasswordRecovery, takePasswordRecoveryLink } from './password-recovery.mjs';

const messages = {
  pt: {
    title: 'Redefinir senha', back: 'Voltar à máquina', testInbox: 'Use o endereço da conta de teste que recebe e-mail.',
    createTestAccount: 'Criar conta com uma caixa de teste',
    email: 'E-mail', send: 'Solicitar link', password: 'Nova senha (8 caracteres ou mais)', confirm: 'Repita a nova senha', save: 'Salvar nova senha',
    working: 'Aguarde…', unavailable: 'A recuperação de conta está indisponível nesta prévia.',
    requestAccepted: 'Se houver uma conta cadastrada com esse e-mail, você receberá um link. Verifique a caixa de entrada e o spam.',
    requestFailed: 'Não foi possível confirmar a solicitação. Tente novamente em instantes.',
    invalidLink: 'Este link está inválido, foi usado ou expirou. Solicite um novo.',
    passwordsDiffer: 'As senhas precisam ser iguais.',
    resetFailed: 'Não foi possível confirmar a alteração. Tente entrar com a nova senha ou solicite um novo link.',
    passwordChanged: 'Senha alterada. Volte à máquina para entrar com a nova senha.',
  },
  en: {
    title: 'Reset password', back: 'Back to the machine', testInbox: 'Use the address of the test account that can receive email.',
    createTestAccount: 'Create an account with a test inbox',
    email: 'Email', send: 'Request reset link', password: 'New password (8 characters or more)', confirm: 'Repeat your new password', save: 'Save new password',
    working: 'Please wait…', unavailable: 'Account recovery is unavailable in this preview.',
    requestAccepted: 'If an account is registered with that email, you will receive a link. Check your inbox and spam folder.',
    requestFailed: 'Could not confirm the request. Please try again shortly.',
    invalidLink: 'This link is invalid, has been used, or has expired. Request a new one.',
    passwordsDiffer: 'The passwords must match.',
    resetFailed: 'Could not confirm the change. Try signing in with the new password or request a new link.',
    passwordChanged: 'Password changed. Return to the machine to sign in with your new password.',
  },
};

let { token, language, invalidLink } = takePasswordRecoveryLink(location.href, history);
let status = invalidLink ? 'invalidLink' : '';
let busy = false;
let recovery;
try {
  const client = createClient(import.meta.env.VITE_NEON_PROOF_DATABASE_URL);
  recovery = createPasswordRecovery(client.auth, location.href);
} catch { status = 'unavailable'; }

const request = document.querySelector('#request-link');
const reset = document.querySelector('#reset-password');
const feedback = document.querySelector('#recovery-status');
const languageButton = document.querySelector('#language');
const back = document.querySelector('#return-to-machine');
const createTestAccount = document.querySelector('#create-recovery-test-account');
const localTest = import.meta.env.DEV && location.hostname === 'localhost';

function render() {
  const text = messages[language];
  document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
  document.title = `PokéSlot — ${text.title}`;
  for (const node of document.querySelectorAll('[data-text]')) node.textContent = text[node.dataset.text];
  languageButton.textContent = language === 'en' ? 'PT' : 'EN';
  languageButton.ariaLabel = language === 'en' ? 'Mudar para português' : 'Switch to English';
  back.href = `./previa-maquina.html?backend=neon&lang=${language}`;
  request.hidden = !recovery || !!token || status === 'passwordChanged';
  reset.hidden = !recovery || !token;
  createTestAccount.hidden = !localTest || request.hidden;
  if (localTest) createTestAccount.href = `${back.href}&recovery-test=1`;
  request.querySelector('button').disabled = busy;
  reset.querySelector('button').disabled = busy;
  feedback.textContent = text[busy ? 'working' : status] ?? '';
}

languageButton.addEventListener('click', () => {
  language = language === 'en' ? 'pt' : 'en';
  render();
});

request.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || request.hidden) return;
  busy = true;
  render();
  try {
    status = await recovery.requestLink(request.elements.email.value.trim(), language);
    if (status === 'requestAccepted') request.reset();
  } catch { status = 'requestFailed'; }
  finally { busy = false; render(); }
});

reset.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || reset.hidden) return;
  const { password, confirmation } = reset.elements;
  if (password.value !== confirmation.value) { status = 'passwordsDiffer'; render(); confirmation.focus(); return; }
  busy = true;
  render();
  try {
    status = await recovery.resetPassword(token, password.value);
    if (status === 'passwordChanged' || status === 'invalidLink') token = null;
    if (status === 'passwordChanged' && typeof BroadcastChannel === 'function') {
      const sessions = new BroadcastChannel('pokeslot-proof-session');
      sessions.postMessage('session-changed');
      sessions.close();
    }
  } catch { status = 'resetFailed'; }
  finally { reset.reset(); busy = false; render(); }
});

render();
