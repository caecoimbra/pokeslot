import test from 'node:test';
import assert from 'node:assert/strict';
import { evolutionOptions, setupStoneUI } from '../src/preview/stone-ui.mjs';
import { KANTO_STONES, kantoEvolutionOptions, knownEvolutionOptions } from '../src/server/evolution.mjs';

test('oferece as três evoluções clássicas para cada variante registrada de Eevee', () => {
  const variants = [{ speciesId: 133, isShiny: false }, { speciesId: 133, isShiny: true }];
  const recipes = knownEvolutionOptions();
  const before = structuredClone({ variants, recipes });
  const options = evolutionOptions(variants, recipes);
  assert.equal(options.length, 6);
  assert.deepEqual(options.filter(({ source }) => source.isShiny).map(({ targetId }) => targetId), [134, 135, 136]);
  assert.deepEqual(options.filter(({ source }) => !source.isShiny).map(({ stone }) => stone), ['water', 'thunder', 'fire']);
  assert.deepEqual({ variants, recipes }, before);
});

test('não apresenta evolução para espécie não registrada nem pedra fora do catálogo de teste', () => {
  const variants = [{ speciesId: 25, isShiny: false }];
  assert.deepEqual(evolutionOptions(variants, []), []);
  assert.deepEqual(evolutionOptions(variants, [{ sourceId: 25, targetId: 26, stone: 'unknown' }]), []);
  assert.deepEqual(evolutionOptions(variants, knownEvolutionOptions()), [
    { source: { speciesId: 25, isShiny: false }, targetId: 26, stone: 'thunder' },
  ]);
});

test('a coleção autenticada oferece adaptações com pedras próprias e conserva a variante', () => {
  const variants = [{ speciesId: 148, isShiny: true }];
  assert.deepEqual(evolutionOptions(variants, knownEvolutionOptions()), []);
  assert.deepEqual(evolutionOptions(variants, kantoEvolutionOptions(), KANTO_STONES), [
    { source: { speciesId: 148, isShiny: true }, targetId: 149, stone: 'dragon' },
  ]);
});

test('recupera troca pendente mesmo quando o vale já foi consumido', async (t) => {
  class Element {
    constructor() { this.value = ''; this.children = []; this.listeners = {}; this.hidden = false; this.disabled = false; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    replaceChildren(...children) { this.children = children; this.value = ''; }
    append(child) { this.children.push(child); }
    add(option) { this.children.push(option); if (this.children.length === 1) this.value = option.value; }
  }
  const elements = new Map();
  const section = new Element();
  section.querySelector = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const originalDocument = globalThis.document;
  const OriginalOption = globalThis.Option;
  globalThis.document = { querySelector: () => section, createElement: () => new Element() };
  globalThis.Option = class { constructor(label, value) { this.label = label; this.value = value; } };
  t.after(() => { globalThis.document = originalDocument; globalThis.Option = OriginalOption; });
  const calls = [];
  const state = { visible: true, enabled: true, language: 'pt', ownedVariants: [], vouchers: [], stones: [], recipes: [],
    pendingAction: { action: 'stone', payload: { stone: 'water' } } };
  const ui = setupStoneUI({
    getState: () => state,
    performAction: async (...args) => { calls.push(args); },
    speciesName: (id) => ({ 25: 'Pikachu', 26: 'Raichu' })[id],
  });
  ui.render();
  assert.equal(elements.get('#stone-exchange-button').disabled, true);
  assert.equal(elements.get('#stone-recover-button').hidden, false);
  assert.equal(elements.get('#stone-recover-button').disabled, false);
  assert.match(elements.get('#stone-recovery-message').textContent, /Pedra da Água/);
  await elements.get('#stone-recover-button').listeners.click({ preventDefault() {} });
  assert.deepEqual(calls, [['recover', {}]]);

  state.ownedVariants = [{ speciesId: 25, isShiny: true }];
  state.recipes = knownEvolutionOptions();
  state.pendingAction = { action: 'evolve', payload: {
    source: { speciesId: 25, isShiny: true }, targetId: 26, stone: 'thunder',
  } };
  ui.render();
  const evolution = elements.get('#stone-evolution-choice');
  assert.equal(evolution.children[1].label, 'Pikachu ✨ Shiny → Raichu · Pedra do Trovão');
  assert.match(elements.get('#stone-recovery-message').textContent, /Pikachu Shiny → Raichu/);
  const selected = evolution.children[1].value;
  evolution.value = selected;
  state.language = 'en';
  ui.render();
  assert.equal(evolution.children[1].label, 'Pikachu ✨ Shiny → Raichu · Thunder Stone');
  assert.equal(evolution.value, selected);
});
