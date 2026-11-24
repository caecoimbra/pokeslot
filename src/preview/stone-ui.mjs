import { DEMO_STONES, KANTO_STONES } from '../server/evolution.mjs';
import { inventoryCard } from './inventory-card.mjs';

const translations = {
  pt: {
    title: 'Oficina de evolução', inventoryTitle: 'Estojo de pedras',
    note: 'Troque um vale pela pedra de sua escolha. Nesta demonstração, ela ativa as evoluções clássicas por pedra de Kanto.',
    proofNote: 'Um vale pedra dá direito a uma pedra à sua escolha. Cada evolução usa uma pedra compatível e mantém a variante de origem na Pokédex.',
    stock: (n) => `Vales pedra disponíveis: ${n}.`, emptyInventory: 'Nenhuma pedra guardada.',
    recoverStone: (stone) => `Troca pendente: 1 vale pedra por ${stone}.`,
    recoverEvolution: (from, variant, to, stone) => `Evolução pendente: ${from} ${variant} → ${to}, com ${stone}.`,
    recoverElsewhere: 'Há outra operação pendente. Recupere-a no painel correspondente antes de continuar.', recover: 'Recuperar operação pendente',
    names: {
      thunder: 'Pedra do Trovão', moon: 'Pedra da Lua', fire: 'Pedra do Fogo', leaf: 'Pedra da Folha', water: 'Pedra da Água',
      bug: 'Pedra de Inseto', normal: 'Pedra Normal', poison: 'Pedra de Veneno', ground: 'Pedra de Terra',
      fighting: 'Pedra de Luta', psychic: 'Pedra Psíquica', rock: 'Pedra de Rocha', ghost: 'Pedra Fantasma', dragon: 'Pedra de Dragão',
    },
    exchangeTitle: 'Resgatar uma pedra', chooseStone: 'Escolha a pedra', exchange: 'Trocar vale',
    evolveTitle: 'Evoluir Pokémon registrado', chooseEvolution: 'Evolução e variante', choosePlaceholder: 'Escolha uma evolução',
    noOptions: 'Nenhuma evolução disponível na coleção.',
    evolutionInfo: (n) => `Pedras compatíveis disponíveis: ${n}.`, evolve: 'Evoluir',
    owned: 'A variante de destino já está registrada; nenhuma pedra será gasta.',
    statuses: { stoneOk: 'Pedra adicionada ao inventário.', insufficient_vouchers: 'Você não possui vale pedra.',
      evolveOk: 'Evolução registrada. A forma anterior permanece na Pokédex.', incompatible: 'A pedra ou evolução não é compatível.',
      source_unavailable: 'A variante de origem não está disponível.', already_registered: 'A variante evoluída já está registrada; nenhuma pedra foi gasta.',
      missing_stone: 'Você não possui a pedra necessária.', failure: 'Não foi possível confirmar a operação; recupere a ação pendente antes de iniciar outra.' },
  },
  en: {
    title: 'Evolution workshop', inventoryTitle: 'Stone case',
    note: 'Exchange one voucher for a stone of your choice. This demo supports the classic Kanto stone evolutions.',
    proofNote: 'One stone voucher gives you a stone of your choice. Each evolution uses a compatible stone and keeps the source variant in the Pokédex.',
    stock: (n) => `Stone vouchers available: ${n}.`, emptyInventory: 'No stones saved.',
    recoverStone: (stone) => `Pending exchange: 1 stone voucher for ${stone}.`,
    recoverEvolution: (from, variant, to, stone) => `Pending evolution: ${from} ${variant} → ${to}, using ${stone}.`,
    recoverElsewhere: 'Another operation is pending. Recover it in the corresponding panel before continuing.', recover: 'Recover pending operation',
    names: {
      thunder: 'Thunder Stone', moon: 'Moon Stone', fire: 'Fire Stone', leaf: 'Leaf Stone', water: 'Water Stone',
      bug: 'Bug Stone', normal: 'Normal Stone', poison: 'Poison Stone', ground: 'Ground Stone',
      fighting: 'Fighting Stone', psychic: 'Psychic Stone', rock: 'Rock Stone', ghost: 'Ghost Stone', dragon: 'Dragon Stone',
    },
    exchangeTitle: 'Redeem a stone', chooseStone: 'Choose a stone', exchange: 'Exchange voucher',
    evolveTitle: 'Evolve a registered Pokémon', chooseEvolution: 'Evolution and variant', choosePlaceholder: 'Choose an evolution',
    noOptions: 'No evolution available in the collection.',
    evolutionInfo: (n) => `Compatible stones available: ${n}.`, evolve: 'Evolve',
    owned: 'The target variant is already registered; no stone will be spent.',
    statuses: { stoneOk: 'Stone added to inventory.', insufficient_vouchers: 'You have no stone voucher.',
      evolveOk: 'Evolution registered. The previous form remains in the Pokédex.', incompatible: 'The stone or evolution is incompatible.',
      source_unavailable: 'The source variant is unavailable.', already_registered: 'The evolved variant is already registered; no stone was spent.',
      missing_stone: 'You do not have the required stone.', failure: 'Could not confirm the operation; recover the pending action before starting another.' },
  },
};

// Apenas uma lista para apresentação. O servidor confere receita, posse e estoque.
export function evolutionOptions(ownedVariants, recipes, stoneTypes = DEMO_STONES) {
  return ownedVariants.flatMap((source) => recipes
    .filter((recipe) => recipe.sourceId === source.speciesId && stoneTypes.includes(recipe.stone))
    .map(({ targetId, stone }) => ({ source: { speciesId: source.speciesId, isShiny: source.isShiny }, targetId, stone })));
}

export function setupStoneUI({ getState, performAction }) {
  const section = document.querySelector('#demo-stones');
  const element = (id) => section.querySelector(`#${id}`);
  const stoneChoice = element('stone-choice');
  const evolutionChoice = element('stone-evolution-choice');
  let active = false;
  let failure = false;

  function options(select, entries, placeholder) {
    const current = select.value;
    select.replaceChildren();
    if (placeholder) select.add(new Option(placeholder, ''));
    for (const [value, label] of entries) select.add(new Option(label, value));
    if (entries.some(([value]) => value === current)) select.value = current;
  }

  function render() {
    const state = getState();
    section.hidden = !state.visible;
    if (!state.visible) return;
    const text = translations[state.language] ?? translations.pt;
    const owned = state.ownedVariants ?? [];
    const inventory = state.stones ?? [];
    const vouchers = state.vouchers ?? [];
    const stoneTypes = state.authenticated ? KANTO_STONES : DEMO_STONES;
    const count = (type) => inventory.find((entry) => entry.type === type)?.amount ?? 0;
    const voucherCount = vouchers.find((entry) => entry.type === 'stone')?.amount ?? 0;
    const setText = (id, value) => { element(id).textContent = value; };
    setText('stone-title', text.title);
    setText('stone-inventory-title', text.inventoryTitle);
    setText('stone-note', state.authenticated ? text.proofNote : text.note);
    setText('stone-stock', text.stock(voucherCount));
    const pendingAction = state.pendingAction;
    const pendingPayload = pendingAction?.payload;
    const pendingHere = pendingAction?.action === 'stone' || pendingAction?.action === 'evolve';
    const number = (id) => `#${String(id).padStart(3, '0')}`;
    const description = pendingAction?.action === 'stone' ? text.recoverStone(text.names[pendingPayload?.stone] ?? '?')
      : pendingAction?.action === 'evolve' ? text.recoverEvolution(number(pendingPayload?.source?.speciesId ?? '?'),
        pendingPayload?.source?.isShiny ? 'Shiny' : 'Normal', number(pendingPayload?.targetId ?? '?'), text.names[pendingPayload?.stone] ?? '?')
      : text.recoverElsewhere;
    setText('stone-recovery-message', description);
    setText('stone-recover-button', text.recover);
    element('stone-recovery-message').hidden = !state.pendingAction;
    element('stone-recover-button').hidden = !pendingHere;
    element('stone-recover-button').disabled = state.enabled !== true || state.pending || active;
    setText('stone-exchange-title', text.exchangeTitle);
    setText('stone-choice-label', text.chooseStone);
    setText('stone-exchange-button', text.exchange);
    setText('stone-evolve-title', text.evolveTitle);
    setText('stone-evolution-label', text.chooseEvolution);
    setText('stone-evolve-button', text.evolve);
    setText('stone-action-status', text.statuses[failure ? 'failure' : state.actionMessage] ?? '');
    const list = element('stone-inventory');
    list.replaceChildren(...inventory.map(({ type, amount }) => inventoryCard(
      'gem gem-' + type, text.names[type] ?? type, '× ' + amount
    )));
    if (!inventory.length) {
      const item = document.createElement('li');
      item.className = 'empty-tray';
      item.textContent = text.emptyInventory;
      list.append(item);
    }
    options(stoneChoice, stoneTypes.map((stone) => [stone, text.names[stone]]));
    element('stone-preview').className = 'gem gem-' + stoneChoice.value;
    const choices = evolutionOptions(owned, state.recipes ?? [], stoneTypes);
    options(evolutionChoice, choices.map((option) => [JSON.stringify(option),
      `${number(option.source.speciesId)}${option.source.isShiny ? ' ✨ Shiny' : ''} → ${number(option.targetId)} · ${text.names[option.stone]}`]), text.choosePlaceholder);
    let selected;
    try { selected = JSON.parse(evolutionChoice.value); } catch { selected = null; }
    const alreadyOwned = selected && owned.some((entry) => entry.speciesId === selected.targetId && entry.isShiny === selected.source.isShiny);
    setText('stone-evolution-info', !choices.length ? text.noOptions : alreadyOwned ? text.owned : selected ? text.evolutionInfo(count(selected.stone)) : '');
    const disabled = state.enabled !== true || state.pending || !!state.pendingAction || active;
    stoneChoice.disabled = disabled;
    evolutionChoice.disabled = disabled || !choices.length;
    element('stone-exchange-button').disabled = disabled || voucherCount < 1;
    element('stone-evolve-button').disabled = disabled || !selected || alreadyOwned || count(selected.stone) < 1;
  }

  for (const select of [stoneChoice, evolutionChoice]) select.addEventListener('change', render);
  async function submit(event, action, makePayload) {
    event.preventDefault();
    const state = getState();
    if (state.enabled !== true || state.pending || active || (state.pendingAction && action !== 'recover')) return;
    const payload = makePayload(state);
    if (!payload) return;
    active = true;
    failure = false;
    render();
    try { await performAction(action, payload); }
    catch { failure = true; }
    finally { active = false; render(); }
  }
  element('stone-exchange').addEventListener('submit', (event) => submit(event, 'stone', (state) =>
    (state.authenticated ? KANTO_STONES : DEMO_STONES).includes(stoneChoice.value) ? { stone: stoneChoice.value } : null));
  element('stone-evolve').addEventListener('submit', (event) => submit(event, 'evolve', () => {
    try { return JSON.parse(evolutionChoice.value); } catch { return null; }
  }));
  element('stone-recover-button').addEventListener('click', (event) => submit(event, 'recover', () => ({})));
  return { render };
}
