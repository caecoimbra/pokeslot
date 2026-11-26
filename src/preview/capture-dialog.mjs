import { setDexSprite } from './dex-cards.mjs';
import './capture-dialog.css';

const messages = {
  pt: {
    intro: 'Registrado na Pokédex',
    single: 'Nova captura!',
    multiple: 'Novas capturas!',
    close: 'Continuar',
    normal: 'Normal',
    shiny: 'Shiny',
    rarities: { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', legendary: 'Lendário' },
  },
  en: {
    intro: 'Added to your Pokédex',
    single: 'New catch!',
    multiple: 'New catches!',
    close: 'Continue',
    normal: 'Normal',
    shiny: 'Shiny',
    rarities: { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' },
  },
};

// The server has already resolved new versus duplicate for each winning line.
export function createCaptureDialog({ speciesName }) {
  const dialog = document.querySelector('#capture-dialog');
  const list = dialog.querySelector('#capture-dialog-list');
  let restoreFocus = false;
  dialog.querySelector('#capture-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (!restoreFocus) return;
    restoreFocus = false;
    const spin = document.querySelector('#spin');
    const target = spin.disabled ? document.querySelector('#machine-title') : spin;
    target.focus({ preventScroll: true });
  });

  function show(entries, language) {
    const captures = entries.filter((entry) => entry.status === 'new');
    if (!captures.length) return;
    const text = messages[language] ?? messages.pt;
    dialog.querySelector('#capture-dialog-intro').textContent = text.intro;
    dialog.querySelector('#capture-dialog-title').textContent = captures.length === 1 ? text.single : text.multiple;
    dialog.querySelector('#capture-dialog-close').textContent = text.close;
    list.replaceChildren(...captures.map(({ capture }) => {
      const item = document.createElement('li');
      item.className = 'capture-card';
      const portrait = document.createElement('div');
      portrait.className = 'capture-portrait';
      const sprite = document.createElement('img');
      sprite.width = 96;
      sprite.height = 96;
      sprite.alt = '';
      setDexSprite(sprite, capture.speciesId, capture.isShiny);
      portrait.append(sprite);
      const name = document.createElement('strong');
      name.textContent = speciesName(capture.speciesId);
      const details = document.createElement('span');
      details.textContent = `${capture.isShiny ? text.shiny : text.normal} · ${text.rarities[capture.rarity]}`;
      item.append(portrait, name, details);
      return item;
    }));
    if (!dialog.open) {
      restoreFocus = true;
      dialog.showModal();
    }
  }

  function clear() {
    restoreFocus = false;
    if (dialog.open) dialog.close();
    list.replaceChildren();
  }

  return { show, clear };
}
