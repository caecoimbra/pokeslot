import './guest-intro.css';

const messages = {
  pt: {
    title: 'Professor Coimbra', next: 'Continuar', account: 'Abrir Sua conta', skip: 'Ir para o cadastro', close: 'Fechar introdução',
    portrait: 'Professor Coimbra, personagem inspirado em Caetano Coimbra, de jaleco.',
    pages: [
      'Opa! Parece que você acabou de chegar! Eu sou o Professor Coimbra. Bem-vindo ao PokéSlot!',
      'Alinhe três símbolos nas linhas da máquina para capturar Pokémon de Kanto, ganhar giros ou encontrar vales.',
      'Sua Pokédex, seus vales e seus giros ficam salvos na sua conta. Você pode voltar para continuar sua coleção!',
      'Antes de jogar, abra “Sua conta”, no canto superior direito, e faça seu cadastro. Vamos começar?',
    ],
    page: (index, total) => `Mensagem ${index} de ${total}`,
  },
  en: {
    title: 'Professor Coimbra', next: 'Continue', account: 'Open Your account', skip: 'Go to sign up', close: 'Close introduction',
    portrait: 'Professor Coimbra, a lab-coated character inspired by Caetano Coimbra.',
    pages: [
      'Hey there! Looks like you just arrived! I am Professor Coimbra. Welcome to PokéSlot!',
      'Match three symbols along the machine’s lines to catch Kanto Pokémon, earn spins or find vouchers.',
      'Your Pokédex, vouchers and spins are saved to your account. Come back whenever you want to keep collecting!',
      'Before playing, open “Your account” in the top-right corner and sign up. Ready to get started?',
    ],
    page: (index, total) => `Message ${index} of ${total}`,
  },
};

// This introduction is decorative: it never creates a round or touches player data.
export function createGuestIntro({ onChange, onRollingEnd, onDialogue, onAccount }) {
  const dialog = document.querySelector('#guest-intro');
  const visualText = dialog.querySelector('.guest-dialogue-visual');
  const spokenText = dialog.querySelector('.guest-dialogue-spoken');
  const nextButton = dialog.querySelector('.guest-next');
  const skipButton = dialog.querySelector('.guest-skip');
  const closeButton = dialog.querySelector('.guest-close');
  const progress = dialog.querySelector('.guest-progress');
  const portrait = dialog.querySelector('img');
  const portraitFallback = dialog.querySelector('.guest-portrait-fallback');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let generation = 0;
  let rolling = false;
  let delayTimer;
  let finishDelay;
  let typeTimer;
  let index = 0;
  let text = messages.pt;
  let written = 0;
  let restoreFocus = false;
  let balloonAnimation;

  function finishText() {
    clearInterval(typeTimer);
    written = text.pages[index].length;
    visualText.textContent = text.pages[index];
    dialog.classList.remove('is-typing');
  }

  function showPage() {
    clearInterval(typeTimer);
    const page = text.pages[index];
    written = 0;
    visualText.textContent = '';
    spokenText.textContent = page;
    progress.textContent = `${index + 1} / ${text.pages.length}`;
    progress.setAttribute('aria-label', text.page(index + 1, text.pages.length));
    nextButton.textContent = index + 1 < text.pages.length ? text.next : text.account;
    dialog.classList.add('is-typing');
    balloonAnimation?.cancel();
    if (!reducedMotion.matches) balloonAnimation = dialog.querySelector('.guest-balloon').animate(
      [{ opacity: .5, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 140, easing: 'ease-out' },
    );
    if (reducedMotion.matches) finishText();
    else typeTimer = setInterval(() => {
      written = Math.min(written + 2, page.length);
      visualText.textContent = page.slice(0, written);
      if (written === page.length) finishText();
    }, 22);
    onDialogue?.();
  }

  function cleanup() {
    clearTimeout(delayTimer);
    finishDelay?.();
    finishDelay = null;
    clearInterval(typeTimer);
    balloonAnimation?.cancel();
    document.body.classList.remove('guest-intro-active');
    dialog.classList.remove('is-typing');
    onChange();
  }

  function cancel() {
    if (!rolling && !dialog.open) return;
    generation++;
    rolling = false;
    restoreFocus = false;
    if (dialog.open) dialog.close();
    cleanup();
    onRollingEnd();
  }

  function openAccount(event) {
    event.stopPropagation();
    cancel();
    onAccount();
  }

  async function start(language) {
    if (rolling || dialog.open) return;
    const version = ++generation;
    text = messages[language] ?? messages.pt;
    rolling = true;
    portrait.src ||= '/professor-coimbra.png';
    void portrait.decode().then(() => {
      if (version !== generation) return;
      portrait.hidden = false;
      portraitFallback.hidden = true;
    }).catch(() => {
      if (version !== generation) return;
      portrait.hidden = true;
      portraitFallback.hidden = false;
    });
    onChange();
    await new Promise(resolve => { finishDelay = resolve; delayTimer = setTimeout(resolve, reducedMotion.matches ? 120 : 650); });
    finishDelay = null;
    if (version !== generation) return;
    rolling = false;
    onRollingEnd();
    index = 0;
    dialog.querySelector('.guest-speaker').textContent = text.title;
    portrait.alt = text.portrait;
    skipButton.textContent = text.skip;
    closeButton.setAttribute('aria-label', text.close);
    restoreFocus = true;
    document.body.classList.add('guest-intro-active');
    showPage();
    dialog.showModal();
    positionScreen();
    nextButton.focus({ preventScroll: true });
    onChange();
  }

  function positionScreen() {
    if (!dialog.open) return;
    const screen = document.querySelector('#grid').getBoundingClientRect();
    const padding = 14;
    dialog.style.left = `${Math.max(padding, Math.min(screen.left + screen.width / 2 - dialog.offsetWidth / 2,
      innerWidth - dialog.offsetWidth - padding))}px`;
    dialog.style.top = `${Math.max(padding, Math.min(screen.top, innerHeight - dialog.offsetHeight - padding))}px`;
  }

  nextButton.addEventListener('click', (event) => {
    if (written < text.pages[index].length) { finishText(); return; }
    if (index + 1 < text.pages.length) { index++; showPage(); }
    else openAccount(event);
  });
  skipButton.addEventListener('click', openAccount);
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    cleanup();
    onRollingEnd();
    if (restoreFocus) document.querySelector('#spin').focus({ preventScroll: true });
    restoreFocus = false;
  });
  reducedMotion.addEventListener('change', () => { if (dialog.open && reducedMotion.matches) finishText(); });
  window.addEventListener('resize', positionScreen);

  return { start, cancel, get busy() { return rolling || dialog.open; }, get spinning() { return rolling; } };
}
