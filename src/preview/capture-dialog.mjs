import { setDexSprite } from './dex-cards.mjs';
import './capture-dialog.css';

const messages = {
  pt: {
    intro: 'Prêmio da rodada', newCapture: 'Nova captura!', duplicate: 'Captura repetida!',
    voucher: 'Você ganhou um vale!', spins: 'Giros extras!', close: 'Continuar', next: 'Próximo prêmio',
    normal: 'Normal', shiny: 'Shiny', spinCount: (n) => `+${n} ${n === 1 ? 'giro creditado' : 'giros creditados'}!`,
    duplicateIntro: 'Esta variante já está na sua Pokédex.', unavailable: 'Valor da recompensa indisponível.',
    localDuplicate: 'Compensação não aplicada nesta demonstração.', localSpins: 'Giros por linha não são creditados nesta demonstração.',
    unknownVoucher: 'Tipo de vale indisponível para esta rodada.',
    rarities: { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', legendary: 'Lendário' },
    vouchers: { pokemon: 'Vale Pokémon', stone: 'Vale pedra', spins: 'Vale de giros', type: 'Vale de tipo', shiny_charm: 'Amuleto shiny' },
    lines: { top: 'Superior', middle: 'Central', bottom: 'Inferior', diagonal_down: 'Diagonal descendente', diagonal_up: 'Diagonal ascendente' },
  },
  en: {
    intro: 'Round reward', newCapture: 'New catch!', duplicate: 'Duplicate catch!',
    voucher: 'You won a voucher!', spins: 'Extra spins!', close: 'Continue', next: 'Next reward',
    normal: 'Normal', shiny: 'Shiny', spinCount: (n) => `+${n} ${n === 1 ? 'spin credited' : 'spins credited'}!`,
    duplicateIntro: 'This variant is already in your Pokédex.', unavailable: 'Reward amount unavailable.',
    localDuplicate: 'Compensation is not applied in this demo.', localSpins: 'Line spins are not credited in this demo.',
    unknownVoucher: 'Voucher type unavailable for this round.',
    rarities: { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' },
    vouchers: { pokemon: 'Pokémon voucher', stone: 'Stone voucher', spins: 'Spin voucher', type: 'Type voucher', shiny_charm: 'Shiny charm' },
    lines: { top: 'Top', middle: 'Middle', bottom: 'Bottom', diagonal_down: 'Downward diagonal', diagonal_up: 'Upward diagonal' },
  },
};

export function createCaptureDialog({ speciesName }) {
  const dialog = document.querySelector('#capture-dialog');
  const list = dialog.querySelector('#capture-dialog-list');
  const button = dialog.querySelector('#capture-dialog-close');
  let queue = [], index = 0, language = 'pt', onShow = () => {}, restoreFocus = false;

  function showCurrent() {
    const entry = queue[index], text = messages[language] ?? messages.pt;
    dialog.dataset.reward = entry.shiny ? 'shiny' : entry.kind;
    dialog.querySelector('#capture-dialog-intro').textContent = text.intro;
    dialog.querySelector('#capture-dialog-title').textContent = entry.kind === 'capture'
      ? entry.status === 'new' ? text.newCapture : text.duplicate : text[entry.kind];
    button.textContent = index + 1 < queue.length ? text.next : text.close;
    const item = document.createElement('li');
    item.className = 'capture-card';
    const portrait = document.createElement('div');
    portrait.className = 'capture-portrait';
    const name = document.createElement('strong');
    const details = document.createElement('span');
    if (entry.kind === 'capture') {
      const { capture } = entry;
      const sprite = document.createElement('img');
      sprite.width = 96; sprite.height = 96; sprite.alt = '';
      setDexSprite(sprite, capture.speciesId, capture.isShiny);
      portrait.append(sprite);
      name.textContent = speciesName(capture.speciesId);
      details.textContent = `${capture.isShiny ? text.shiny : text.normal} · ${text.rarities[capture.rarity]}`;
    } else {
      portrait.classList.add('reward-icon');
      portrait.textContent = entry.kind === 'voucher' ? '★' : '↻';
      portrait.setAttribute('aria-hidden', 'true');
      name.textContent = entry.kind === 'voucher' ? (text.vouchers[entry.type] ?? text.unknownVoucher) : text.spins;
      details.textContent = (entry.lines ?? [entry.line]).map((line) => text.lines[line]).filter(Boolean).join(' · ');
    }
    item.append(portrait, name, details);
    let description = '';
    if (entry.kind === 'capture' && entry.status === 'duplicate') {
      const compensation = entry.authenticated
        ? Number.isSafeInteger(entry.compensationSpins) && entry.compensationSpins >= 0
          ? text.spinCount(entry.compensationSpins) : text.unavailable
        : text.localDuplicate;
      description = `${text.duplicateIntro} ${compensation}`;
    } else if (entry.kind === 'spins') {
      description = entry.amount !== null ? text.spinCount(entry.amount) : entry.authenticated ? text.unavailable : text.localSpins;
    } else if (entry.kind === 'voucher' && entry.type === 'spins') {
      description = Number.isSafeInteger(entry.spinsAwarded) && entry.spinsAwarded > 0
        ? text.spinCount(entry.spinsAwarded) : text.unavailable;
    }
    if (description) {
      const outcome = document.createElement('span');
      outcome.className = 'reward-outcome';
      outcome.textContent = description;
      item.append(outcome);
    }
    list.replaceChildren(item);
    onShow(entry);
  }

  button.addEventListener('click', () => {
    if (++index < queue.length) { showCurrent(); button.focus(); }
    else dialog.close();
  });
  dialog.addEventListener('close', () => {
    delete dialog.dataset.ready;
    queue = [];
    if (!restoreFocus) return;
    restoreFocus = false;
    const spin = document.querySelector('#spin');
    const target = spin.disabled ? document.querySelector('#machine-title') : spin;
    target.focus({ preventScroll: true });
  });

  function show(entries, selectedLanguage, callback = () => {}) {
    if (!entries.length) return;
    queue = entries; index = 0; language = selectedLanguage; onShow = callback;
    showCurrent();
    if (!dialog.open) {
      restoreFocus = true;
      dialog.showModal();
      const machine = document.querySelector('#grid').getBoundingClientRect();
      const target = dialog.getBoundingClientRect();
      dialog.style.setProperty('--reward-origin-x', `${machine.left + machine.width / 2 - target.left - target.width / 2}px`);
      dialog.style.setProperty('--reward-origin-y', `${machine.top + machine.height / 2 - target.top - target.height / 2}px`);
      dialog.dataset.ready = 'true';
    }
  }

  function clear() {
    queue = []; restoreFocus = false;
    if (dialog.open) dialog.close();
    list.replaceChildren();
  }
  return { show, clear };
}
