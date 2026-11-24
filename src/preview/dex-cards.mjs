import normalSheet from './assets/kanto-normal.png';
import shinySheet from './assets/kanto-shiny.png';

// Each PokéAPI sheet has sixteen 96 px sprites per row, in National Dex order.
export function setDexSprite(image, speciesId, shiny) {
  const index = speciesId - 1;
  const sheet = shiny ? shinySheet : normalSheet;
  image.style.objectPosition = `${-(index % 16) * 96}px ${-Math.floor(index / 16) * 96}px`;
  if (image.getAttribute('src') !== sheet) {
    image.hidden = false;
    image.setAttribute('src', sheet);
  }
}

export function renderDexCards(list, catalog, visible, selectedId, filter, nameFor, text) {
  const template = document.querySelector('#dex-card');
  if (list.children.length !== catalog.length) {
    list.replaceChildren(...catalog.map(() => template.content.cloneNode(true)));
  }
  const visibleIds = new Set(visible.map(entry => entry.speciesId));
  catalog.forEach(({ speciesId, normal, shiny }, index) => {
    const item = list.children[index];
    const button = item.firstElementChild;
    const owned = normal || shiny;
    const number = '#' + String(speciesId).padStart(3, '0');
    item.hidden = !visibleIds.has(speciesId);
    button.dataset.speciesId = speciesId;
    button.disabled = !owned;
    button.setAttribute('aria-pressed', String(owned && selectedId === speciesId));
    const name = owned ? nameFor(speciesId) : '???';
    const variants = [normal && text.normal, shiny && text.shiny].filter(Boolean).join(' · ');
    button.setAttribute('aria-label', owned ? `${number} ${name}, ${variants}` : `${number}, ${text.unknownSpecies}`);
    button.querySelector('.dex-number').textContent = number;
    button.querySelector('.dex-name').textContent = name;
    const badge = button.querySelector('.dex-variants');
    badge.textContent = variants;
    badge.classList.toggle('has-shiny', shiny);
    setDexSprite(button.querySelector('img'), speciesId, shiny && (!normal || filter === 'shiny'));
  });
}
