// Carregado somente no servidor de desenvolvimento e com ?test=1.
export function setupProofTestControls({ signOut }) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Controles locais de teste');
  section.innerHTML = `
    <h2>Controles locais de teste</h2>
    <label><input type="checkbox" id="test-discard"> Simular resposta perdida após a rodada</label><br>
    <label><input type="checkbox" id="test-pause"> Pausar rodada para trocar de conta</label>
    <p id="test-status" role="status"></p>
    <button type="button" id="test-switch" hidden>Trocar conta durante pausa</button>
    <button type="button" id="test-resume" hidden>Continuar rodada pausada</button>`;
  document.querySelector('#proof-auth').after(section);
  const discard = section.querySelector('#test-discard');
  const pause = section.querySelector('#test-pause');
  const status = section.querySelector('#test-status');
  const switchButton = section.querySelector('#test-switch');
  const resumeButton = section.querySelector('#test-resume');
  switchButton.addEventListener('click', async () => {
    switchButton.disabled = true;
    try { await signOut(); status.textContent = 'Entre em outra conta nesta aba e continue a rodada pausada.'; }
    catch { status.textContent = 'Não foi possível sair; a rodada continua pausada.'; switchButton.disabled = false; }
  });
  return async function afterRound() {
    if (discard.checked) {
      discard.checked = false;
      status.textContent = 'Resposta recebida e descartada para simular perda.';
      throw new Error('simulated_lost_response');
    }
    if (!pause.checked) return;
    pause.checked = false;
    status.textContent = 'Rodada recebida; apresentação pausada para testar a troca de conta.';
    switchButton.hidden = false;
    switchButton.disabled = false;
    resumeButton.hidden = false;
    await new Promise((resolve) => resumeButton.addEventListener('click', resolve, { once: true }));
    switchButton.hidden = true;
    resumeButton.hidden = true;
    status.textContent = 'Pausa encerrada.';
  };
}
