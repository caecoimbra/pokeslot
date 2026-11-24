import { findWinningLines } from '../domain/paylines.mjs';
import { rewardTypesForLines } from '../domain/rewards.mjs';
import { getKantoCollectionProgress } from '../domain/collection-progress.mjs';
import { openPendingOperations, readPendingOperation, readPendingLocalAction, claimPendingLocalAction, claimPendingOperation, clearPendingOperation, requirePendingOperation } from '../identity/pending-operations.mjs';
import { createPokeApiClient } from '../pokeapi/client.mjs';
import { preparePokedexData } from '../pokeapi/pokedex-data.mjs';
import { createSpeciesDetailsStore } from './species-details.mjs';
import { selectDescription } from './description.mjs';
import { createNeonProofClient } from './neon-proof-client.mjs';
import { completeGameOperation } from '../identity/game-operation.mjs';
import { claimProofGameOperation, claimProofInventoryOperation, readProofInventoryOperation, clearProofInventoryOperation, completeProofInventoryOperation } from '../identity/inventory-operation.mjs';
import { validateProofState, validateProofRound } from './proof-result.mjs';
import { nextRefillAt, formatNextRefill } from './next-refill.mjs';
import { capturePresentationMessages, formatCaptureResult } from './capture-result.mjs';
import { buildKantoCatalog, filterKantoCatalog } from './kanto-catalog.mjs';
import { DEMO_VOUCHER_TYPES } from '../domain/demo-vouchers.mjs';
import { demoRedemptionSpecies, demoRedemptionDetails, normalVariantOwned } from '../domain/demo-redemption.mjs';
import { setupStoneUI } from './stone-ui.mjs';
import { knownEvolutionOptions, kantoEvolutionOptions, DEMO_STONES } from '../server/evolution.mjs';
import { createRedemptionNamesLoader } from './redemption-names.mjs';

const neonProof = new URLSearchParams(location.search).get('backend') === 'neon';
const proofUrl = 'https://br-dry-block-be4mfcuo-pokeslotgame.compute.c-9.us-east-2.aws.neon.tech';
// Permite verificar uma falha de cada consulta no navegador de desenvolvimento.
const failNextPokeApi = new Set(import.meta.env.DEV && new URLSearchParams(location.search).get('test') === 'pokeapi'
  ? ['details', 'names'] : []);

function previewPokeApiClient(signal, purpose) {
  return createPokeApiClient((url, options) => {
    if (import.meta.env.DEV && failNextPokeApi.delete(purpose)) throw new Error('Simulated PokéAPI failure');
    return fetch(url, { ...options, signal });
  });
}

// A grade inicial é fixa; as rodadas demonstrativas vêm do servidor local.
let grid = [
  ['pokeball', 'pokeball', 'pokeball'],
  ['spin', 'pokeball', 'voucher'],
  ['voucher', 'spin', 'pokeball'],
];
const initialGrid = grid;
const messages = {
  pt: {
    eyebrow: 'Prévia de desenvolvimento', title: 'Uma primeira olhada na máquina',
    intro: 'Explore as linhas vencedoras com rodadas geradas pelo servidor local.',
    machineLabel: 'MÁQUINA DE TESTE', machineTitle: 'Linhas em destaque',
    results: 'LINHAS VENCEDORAS', caption: 'Os símbolos destacados fazem parte de uma ou mais linhas vencedoras.',
    footnote: 'Demonstração local compartilhada neste computador: não usa uma conta autenticada nem concede prêmios reais.',
    balance: (value) => `Saldo de teste: ${value} giros`, noBalance: 'Sem giros no saldo de teste.',
    nextRefill: (date) => `Próxima reposição prevista: ${date} (horário local). Atualize o saldo para confirmar.`,
    refreshBalance: 'Atualizar saldo', balanceRefreshed: 'Saldo atualizado pelo servidor.',
    spinButton: 'Girar demonstração', spinning: 'Gerando rodada…', noWins: 'Nenhuma nesta rodada',
    reelsSpinning: 'Rodada em andamento',
    rewardHeading: 'Tipos de recompensa — demonstração', noRewards: 'Nenhuma recompensa indicada nesta rodada.',
    rewardTypes: { pokemon: 'Captura de Pokémon', extra_spins: 'Giros extras', voucher: 'Vale' },
    initial: 'A grade inicial é um exemplo fixo. Clique para gerar uma rodada.',
    success: 'Rodada demonstrativa concluída.', failure: 'Não foi possível confirmar a operação. Verifique o servidor local e tente novamente; uma rodada pendente será recuperada.',
    pokedexEyebrow: 'Coleção local de teste', pokedexTitle: 'Pokédex de teste',
    progressLabel: (count, total) => `Kanto: ${count} de ${total} espécies registradas`,
    variantProgress: ({ normal, shiny }) => `Normais: ${normal} · Shiny: ${shiny} (opcionais)`,
    completedKanto: 'Kanto completo! Você registrou as 151 espécies.',
    pokedexNote: 'Nesta prévia local, as 151 espécies têm chances iguais apenas para teste. O saldo e a coleção ficam no computador, sem login.',
    lastCaptures: 'Capturas da última rodada', collectionTitle: 'Catálogo de Kanto',
    beforeRound: 'Gire para ver as capturas de teste.', noCaptures: 'Nenhuma captura nesta rodada.',
    normal: 'Normal', shiny: 'Shiny', registered: 'Registrada', missing: 'Faltante',
    numberFilter: 'Nome ou número', variantFilter: 'Variante', allVariants: 'Todas',
    registrationFilter: 'Registro', allRegistrations: 'Todos',
    filterCount: (count) => `${count} ${count === 1 ? 'espécie encontrada' : 'espécies encontradas'}.`, noFilterMatches: 'Nenhuma espécie corresponde aos filtros.',
    captureTier: (rarity) => `Raridade na captura: ${rarity}.`,
    shinyPath: 'Shiny pode vir em uma captura ou ao evoluir uma origem shiny compatível.',
    normalPath: (cost) => `Você pode capturar esta espécie ou resgatar a variante normal por ${cost} ${cost === 1 ? 'vale Pokémon' : 'vales Pokémon'}.`,
    evolveFrom: (names) => `Você já tem uma origem compatível: ${names}. Confira as pedras necessárias no painel de evolução.`,
    viewRedemption: 'Ver no resgate',
    vouchersTitle: 'Vales — demonstração local', vouchersNote: 'Cinco tipos equiprováveis são uma hipótese de teste. O vale de giros concede 2 giros; os vales Pokémon e pedra podem ser trocados abaixo. Tipo e amuleto ficam guardados sem uso implementado. Nesta prévia, linhas de giro e repetidos ainda não concedem giros.',
    voucherRoundTitle: 'Vales da última rodada', voucherInventoryTitle: 'Vales guardados', voucherBefore: 'Gire para ver os vales sorteados.', voucherNone: 'Nenhum vale nesta rodada.', voucherInventoryEmpty: 'Nenhum vale guardado.', voucherUnknown: 'Detalhes dos vales indisponíveis para esta rodada antiga.',
    voucherNames: { pokemon: 'Vale Pokémon', stone: 'Vale pedra', spins: 'Vale de giros', type: 'Vale de tipo', shiny_charm: 'Amuleto shiny' }, voucherSpins: (value) => `+${value} giros de teste`, voucherValueUnknown: 'valor indisponível',
    redeemTitle: 'Trocar vale Pokémon — teste', redeemNote: 'O resgate registra a variante normal. As raridades e os custos ainda estão em teste.', redeemSpecies: 'Pokémon de Kanto', redeemPlaceholder: 'Escolha uma espécie', redeemButton: 'Trocar vales',
    namesLoading: 'Carregando nomes da PokéAPI…', namesUnavailable: 'Nomes indisponíveis. Você ainda pode escolher pelo número.', retryNames: 'Tentar carregar nomes novamente',
    redeemStock: (count) => `Vales Pokémon disponíveis: ${count}.`,
    redeemChoice: (id, rarity, cost, name) => `#${String(id).padStart(3, '0')}${name ? ` ${name}` : ''} · ${rarity} · ${cost} ${cost === 1 ? 'vale' : 'vales'} Pokémon`,
    redeemOk: 'Resgate concluído e registrado na coleção.', redeemOwned: 'Você já possui a variante normal desta espécie.', redeemInsufficient: 'Você não possui vales Pokémon suficientes.', redeemFailure: 'Não foi possível confirmar o resgate. Tente novamente com o mesmo número para recuperar a operação.',
    redeemPending: 'Há um resgate anterior pendente. Recupere-o antes de escolher outra espécie.', redeemRecover: 'Recuperar resgate pendente', localActionOtherPending: 'Há outra ação local pendente; confirme-a antes de resgatar.',
    captureStatus: { new: 'Nova captura', duplicate: 'Repetida (compensação ainda não aplicada)' },
    detailsTitle: 'Pokémon selecionado — PokéAPI', loadingDetails: 'Carregando dados do Pokémon…',
    failedDetails: 'Não foi possível carregar os dados da PokéAPI.', retry: 'Tentar novamente',
    typeLabel: 'Tipo', electric: 'Elétrico', unknownType: 'Tipo indisponível',
    noDescription: 'Descrição indisponível em português na PokéAPI.',
    descriptionSource: (version) => `Descrição da PokéAPI · versão ${version}`,
    unknownVersion: 'não informada',
    missingSprite: 'Imagem indisponível.', spriteAlt: 'Sprite normal',
    authTitle: 'Conta fictícia da prova Neon', emailLabel: 'E-mail de teste', passwordLabel: 'Senha de teste', loginButton: 'Entrar', logoutButton: 'Sair',
    authSignedOut: 'Entre com uma conta fictícia para recuperar seu progresso.', authFailed: 'Não foi possível confirmar a sessão ou o progresso. Tente novamente.',
    showSignup: 'Criar conta de teste', showLogin: 'Voltar para entrar', signupButton: 'Criar conta',
    signupNote: 'Use um nome fictício, um endereço @example.test e uma senha exclusiva para esta prova.',
    signupName: 'Nome fictício', signupPassword: 'Senha de teste (8 caracteres ou mais)',
    signupEmailRequired: 'Para esta prova, use um endereço fictício terminado em @example.test.',
    signupNameRequired: 'Informe um nome fictício.',
    signupFailed: 'Não foi possível confirmar o cadastro. Se você já criou a conta, volte para entrar.',
    signupNeedsEntry: 'A conta ainda não está conectada. Volte para entrar.',
    authWorking: 'Confirmando com o serviço de conta…',
    recoverPending: 'Há uma rodada pendente de confirmação. Recupere-a antes de iniciar outra.', recoverButton: 'Recuperar rodada pendente',
    earned: (lines, duplicates) => `Giros de teste: +${lines} por linhas e +${duplicates} por repetidos.`,
    earnedUnavailable: 'Detalhes totais de giros indisponíveis para esta rodada.',
    symbols: { pokeball: 'Pokébola', spin: 'Giro', voucher: 'Vale' },
    lines: { top: 'Superior', middle: 'Central', bottom: 'Inferior', diagonal_down: 'Diagonal descendente', diagonal_up: 'Diagonal ascendente' },
  },
  en: {
    eyebrow: 'Development preview', title: 'A first look at the machine',
    intro: 'Explore winning lines with rounds generated by the local server.',
    machineLabel: 'TEST MACHINE', machineTitle: 'Highlighted lines',
    results: 'WINNING LINES', caption: 'Highlighted symbols belong to one or more winning lines.',
    footnote: 'Local demonstration shared on this computer: no authenticated account or real rewards.',
    balance: (value) => `Test balance: ${value} spins`, noBalance: 'No test spins available.',
    nextRefill: (date) => `Next refill expected: ${date} (local time). Refresh balance to confirm.`,
    refreshBalance: 'Refresh balance', balanceRefreshed: 'Balance refreshed from the server.',
    spinButton: 'Spin demonstration', spinning: 'Generating round…', noWins: 'None this round',
    reelsSpinning: 'Round in progress',
    rewardHeading: 'Reward types — demonstration', noRewards: 'No rewards indicated this round.',
    rewardTypes: { pokemon: 'Pokémon capture', extra_spins: 'Extra spins', voucher: 'Voucher' },
    initial: 'The starting grid is a fixed example. Click to generate a round.',
    success: 'Demonstration round complete.', failure: 'Could not confirm the operation. Check the local server and try again; a pending round will be recovered.',
    pokedexEyebrow: 'Local test collection', pokedexTitle: 'Test Pokédex',
    progressLabel: (count, total) => `Kanto: ${count} of ${total} registered species`,
    variantProgress: ({ normal, shiny }) => `Normal: ${normal} · Shiny: ${shiny} (optional)`,
    completedKanto: 'Kanto complete! You registered all 151 species.',
    pokedexNote: 'In this local preview, all 151 species have equal odds for testing only. Balance and collection stay on this computer without a login.',
    lastCaptures: 'Last round captures', collectionTitle: 'Kanto catalog',
    beforeRound: 'Spin to see test captures.', noCaptures: 'No captures this round.',
    normal: 'Normal', shiny: 'Shiny', registered: 'Registered', missing: 'Missing',
    numberFilter: 'Name or number', variantFilter: 'Variant', allVariants: 'All',
    registrationFilter: 'Registration', allRegistrations: 'All',
    filterCount: (count) => `${count} species found.`, noFilterMatches: 'No species match these filters.',
    captureTier: (rarity) => `Capture rarity: ${rarity}.`,
    shinyPath: 'Shiny variants can be captured or evolved from a compatible shiny Pokémon.',
    normalPath: (cost) => `You can capture this species or redeem the normal variant for ${cost} Pokémon ${cost === 1 ? 'voucher' : 'vouchers'}.`,
    evolveFrom: (names) => `You have a compatible Pokémon: ${names}. Check the evolution panel for compatible stones.`,
    viewRedemption: 'View redemption',
    vouchersTitle: 'Vouchers — local demonstration', vouchersNote: 'Five equally likely types are a test assumption. The spin voucher grants 2 spins; Pokémon and stone vouchers can be redeemed below. Type and charm are saved but cannot be used yet. Spin lines and duplicates do not grant spins in this preview yet.',
    voucherRoundTitle: 'Last round vouchers', voucherInventoryTitle: 'Saved vouchers', voucherBefore: 'Spin to see drawn vouchers.', voucherNone: 'No vouchers this round.', voucherInventoryEmpty: 'No vouchers saved.', voucherUnknown: 'Voucher details unavailable for this older round.',
    voucherNames: { pokemon: 'Pokémon voucher', stone: 'Stone voucher', spins: 'Spin voucher', type: 'Type voucher', shiny_charm: 'Shiny charm' }, voucherSpins: (value) => `+${value} test spins`, voucherValueUnknown: 'value unavailable',
    redeemTitle: 'Redeem Pokémon vouchers — test', redeemNote: 'Redemption registers the normal variant. Rarities and costs are still being tested.', redeemSpecies: 'Kanto Pokémon', redeemPlaceholder: 'Choose a species', redeemButton: 'Redeem vouchers',
    namesLoading: 'Loading names from PokéAPI…', namesUnavailable: 'Names are unavailable. You can still choose by number.', retryNames: 'Try loading names again',
    redeemStock: (count) => `Pokémon vouchers available: ${count}.`,
    redeemChoice: (id, rarity, cost, name) => `#${String(id).padStart(3, '0')}${name ? ` ${name}` : ''} · ${rarity} · ${cost} Pokémon ${cost === 1 ? 'voucher' : 'vouchers'}`,
    redeemOk: 'Redemption complete and registered in the collection.', redeemOwned: 'You already own the normal variant of this species.', redeemInsufficient: 'You do not have enough Pokémon vouchers.', redeemFailure: 'Could not confirm the redemption. Retry with the same number to recover the operation.',
    redeemPending: 'A previous redemption is pending. Recover it before choosing another species.', redeemRecover: 'Recover pending redemption', localActionOtherPending: 'Another local action is pending; confirm it before redeeming.',
    captureStatus: { new: 'New capture', duplicate: 'Duplicate (compensation not yet applied)' },
    detailsTitle: 'Selected Pokémon — PokéAPI', loadingDetails: 'Loading Pokémon data…',
    failedDetails: 'Could not load data from PokéAPI.', retry: 'Try again',
    typeLabel: 'Type', electric: 'Electric', unknownType: 'Type unavailable',
    noDescription: 'Description unavailable in English on PokéAPI.',
    descriptionSource: (version) => `PokéAPI description · ${version} version`,
    unknownVersion: 'unspecified',
    missingSprite: 'Image unavailable.', spriteAlt: 'Normal sprite',
    authTitle: 'Fictional Neon proof account', emailLabel: 'Test email', passwordLabel: 'Test password', loginButton: 'Sign in', logoutButton: 'Sign out',
    authSignedOut: 'Sign in with a fictional account to recover your progress.', authFailed: 'Could not confirm the session or progress. Try again.',
    showSignup: 'Create test account', showLogin: 'Back to sign in', signupButton: 'Create account',
    signupNote: 'Use a fictional name, an @example.test address, and a password unique to this test.',
    signupName: 'Fictional name', signupPassword: 'Test password (8 characters or more)',
    signupEmailRequired: 'For this test, use a fictional address ending in @example.test.',
    signupNameRequired: 'Enter a fictional name.',
    signupFailed: 'Could not confirm registration. If you already created the account, go back to sign in.',
    signupNeedsEntry: 'The account is not signed in yet. Go back to sign in.',
    authWorking: 'Confirming with the account service…',
    recoverPending: 'A round is awaiting confirmation. Recover it before starting another.', recoverButton: 'Recover pending round',
    earned: (lines, duplicates) => `Test spins: +${lines} from lines and +${duplicates} from duplicates.`,
    earnedUnavailable: 'Total spin details are unavailable for this round.',
    symbols: { pokeball: 'Poké Ball', spin: 'Spin', voucher: 'Voucher' },
    lines: { top: 'Top', middle: 'Middle', bottom: 'Bottom', diagonal_down: 'Descending diagonal', diagonal_up: 'Ascending diagonal' },
  },
};
Object.assign(messages.pt, capturePresentationMessages.pt);
Object.assign(messages.en, capturePresentationMessages.en);
if (neonProof) {
  Object.assign(messages.pt, { intro: 'Rodadas autenticadas no branch isolado da Neon, com valores de teste.', footnote: 'Prova isolada: contas fictícias, probabilidades e recompensas provisórias; não é o jogo publicado.',
    pokedexEyebrow: 'Coleção da conta de teste', pokedexNote: 'Qualquer variante registra a espécie para o progresso de Kanto. Você pode acompanhar as duas separadamente.',
    vouchersTitle: 'Vales — prova autenticada', vouchersNote: 'Vales Pokémon, pedra e giros têm a mesma chance. Cada vale de giros credita 2 giros ao sair na rodada. Itens de tipo e amuletos de testes anteriores podem aparecer no estoque.',
    failure: 'Não foi possível confirmar a rodada. Entre na mesma conta e tente novamente para recuperar uma operação pendente.',
    captureStatus: { new: 'Nova captura', duplicate: 'Repetida' } });
  Object.assign(messages.en, { intro: 'Authenticated rounds on the isolated Neon branch, using test values.', footnote: 'Isolated proof: fictional accounts and provisional odds and rewards; not the published game.',
    pokedexEyebrow: 'Test account collection', pokedexNote: 'Either variant registers the species for Kanto progress. You can track both separately.',
    vouchersTitle: 'Vouchers — authenticated proof', vouchersNote: 'Pokémon, stone and spin vouchers have equal odds. Each spin voucher credits 2 spins when awarded. Type vouchers and charms from earlier tests may appear in the inventory.',
    failure: 'Could not confirm the round. Sign in to the same account and retry to recover a pending operation.',
    captureStatus: { new: 'New capture', duplicate: 'Duplicate' } });
}
const icons = { pokeball: '●', spin: '↻', voucher: '★' };
const positions = {
  top: [0, 1, 2], middle: [3, 4, 5], bottom: [6, 7, 8],
  diagonal_down: [0, 4, 8], diagonal_up: [6, 4, 2],
};
let wins = findWinningLines(grid);
let language = 'pt';
let status = 'initial';
let pending = true;
let spinning = false;
let balance = null;
let nextRefill = null;
let pendingDb = null;
let ownedVariants = [];
let lastCaptures = null;
let demoVouchers = [];
let demoStones = [];
let stoneActionMessage = '';
let lastVouchers = null;
let redeemStatus = '';
let pendingLocalAction = null;
const redeemSpecies = document.querySelector('#redeem-species');
let redeemNames = new Map();
let pokemonData = null;
let detailStatus = 'idle';
let spriteFailed = false;
let selectedSpeciesId = null;
let detailsRequest = 0;
let selectedShiny = false;
let proofClient = null;
let proofUser = null;
let proofGeneration = 0;
let signingOut = false;
let authSubmitting = false;
let authMode = 'login';
const proofSessions = neonProof && typeof BroadcastChannel === 'function'
  ? new BroadcastChannel('pokeslot-proof-session') : null;
let authStatus = '';
let lastProofReward = null;
let proofPendingRoundId = null;
let afterProofRound = null;
const evolutionRecipes = neonProof ? kantoEvolutionOptions() : knownEvolutionOptions();
const stoneUI = setupStoneUI({
  getState: () => ({ visible: !neonProof || (!!proofUser && balance !== null), authenticated: neonProof, enabled: !!pendingDb && (!neonProof || (!!proofUser && (!proofPendingRoundId || !!pendingLocalAction))), language, ownedVariants,
    vouchers: demoVouchers, stones: demoStones, recipes: evolutionRecipes, pending,
    pendingAction: pendingLocalAction, actionMessage: stoneActionMessage }),
  performAction: performStoneAction,
});
const detailsStore = createSpeciesDetailsStore(async (speciesId) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const client = previewPokeApiClient(controller.signal, 'details');
    return preparePokedexData(await client.getKantoPokemon(speciesId));
  } finally {
    clearTimeout(timeout);
  }
});
const portugueseTypes = { normal: 'Normal', fighting: 'Lutador', flying: 'Voador', poison: 'Venenoso', ground: 'Terrestre', rock: 'Pedra', bug: 'Inseto', ghost: 'Fantasma', steel: 'Aço', fire: 'Fogo', water: 'Água', grass: 'Planta', electric: 'Elétrico', psychic: 'Psíquico', ice: 'Gelo', dragon: 'Dragão', dark: 'Sombrio', fairy: 'Fada' };

// A imagem é servida pelo repositório oficial de sprites da PokéAPI.
function trustedSpriteUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'raw.githubusercontent.com' &&
      url.port === '' && url.pathname.startsWith('/PokeAPI/sprites/') ? url.href : null;
  } catch { return null; }
}

async function loadPokemon() {
  if (selectedSpeciesId === null) return;
  const speciesId = selectedSpeciesId;
  const requestId = ++detailsRequest;
  detailStatus = 'loading';
  spriteFailed = false;
  render();
  try {
    const data = await detailsStore.load(speciesId);
    if (requestId !== detailsRequest) return;
    pokemonData = data;
    detailStatus = 'ready';
  } catch {
    if (requestId !== detailsRequest) return;
    pokemonData = null;
    detailStatus = 'error';
  } finally {
    render();
  }
}

function speciesLabel(id) {
  const data = detailsStore.get(id);
  const name = data?.names[language] || data?.names.en || redeemNames.get(id);
  return `#${String(id).padStart(3, '0')}${name ? ` ${name}` : ''}`;
}

const redemptionNamesLoader = createRedemptionNamesLoader({
  expectedIds: demoRedemptionSpecies,
  onChange: () => render(),
  fetchNames: () => {
    const signal = AbortSignal.timeout(10000);
    return previewPokeApiClient(signal, 'names').listKantoSpecies();
  },
  applyNames: (entries) => {
    redeemNames = new Map(entries.map(({ id, name }) => [id, name.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())]));
    for (const option of redeemSpecies.options) {
      const name = redeemNames.get(Number(option.value));
      if (name) option.textContent = `${name} · #${String(option.value).padStart(3, '0')}`;
    }
  },
});

function setupRedemptionPicker() {
  redeemSpecies.append(new Option('', '', true, true));
  for (const id of demoRedemptionSpecies) {
    redeemSpecies.append(new Option(`#${String(id).padStart(3, '0')}`, id));
  }

  redemptionNamesLoader.load();
}

function showPendingLocalAction(operation) {
  pendingLocalAction = operation;
  if (operation?.action === 'redeem-pokemon' && demoRedemptionSpecies.includes(operation.payload?.speciesId)) {
    redeemSpecies.value = String(operation.payload.speciesId);
  }
}

function showProofInventoryPending(operation) {
  showPendingLocalAction(operation ? { ...operation, action: operation.action === 'pokemon' ? 'redeem-pokemon' : operation.action, payload: operation.args } : null);
}

async function performProofInventoryAction(action, payload) {
  if (!proofUser || pending || !pendingDb) return;
  const userId = proofUser.id, version = proofGeneration;
  const current = () => version === proofGeneration && proofUser?.id === userId;
  const recover = action === 'recover';
  const expectedId = pendingLocalAction?.operationId;
  pending = true;
  redeemStatus = '';
  stoneActionMessage = '';
  render();
  try {
    await completeProofInventoryOperation({
      ensureSession: () => proofClient.ensureSession(userId, current),
      claim: async () => {
        const operation = recover ? requirePendingOperation(await readProofInventoryOperation(pendingDb, userId), expectedId)
          : await claimProofInventoryOperation(pendingDb, userId, action, payload);
        if (current()) showProofInventoryPending(operation);
        return operation;
      },
      send: async (operation) => {
        const result = await proofClient.inventoryAction(userId, current, operation.operationId, operation.action, operation.args);
        if (import.meta.env.DEV && afterProofRound) await afterProofRound.afterInventory?.();
        return result;
      },
      readState: async () => validateProofState(await proofClient.request('state', userId, current)),
      present: (result, state, operation) => {
        if (!current()) throw new Error('session_changed');
        setProofState(state);
        if (operation.action === 'pokemon') {
          redeemStatus = { ok: 'redeemOk', already_owned: 'redeemOwned', insufficient_vouchers: 'redeemInsufficient' }[result.status];
          if (result.status === 'ok') { selectedSpeciesId = operation.args.speciesId; selectedShiny = false; pokemonData = null; loadPokemon(); }
        } else {
          stoneActionMessage = result.status === 'ok' ? (operation.action === 'stone' ? 'stoneOk' : 'evolveOk') : result.status;
          if (operation.action === 'evolve' && result.status === 'ok') {
            selectedSpeciesId = operation.args.targetId; selectedShiny = operation.args.source.isShiny; pokemonData = null; loadPokemon();
          }
        }
        render();
      },
      clear: async (operation) => {
        await clearProofInventoryOperation(pendingDb, userId, operation.operationId);
        const remaining = await readProofInventoryOperation(pendingDb, userId);
        if (current()) showProofInventoryPending(remaining);
      },
    }, recover ? null : { action, args: payload });
  } catch (error) {
    if (current()) {
      if (['other_operation_pending', 'pending_changed'].includes(error?.message)) { await recoverProofSession(); return; }
      if (error?.message === 'session_changed') {
        resetProofSession('authSignedOut');
      } else if (error?.message !== 'different_pending') {
        if (action === 'pokemon' || pendingLocalAction?.action === 'redeem-pokemon') redeemStatus = 'redeemFailure';
        else stoneActionMessage = 'failure';
      }
    }
  } finally { if (current()) { pending = false; render(); } }
}

function renderRedemption(text) {
  const selected = Number(redeemSpecies.value);
  const stock = demoVouchers.find(({ type }) => type === 'pokemon')?.amount ?? 0;
  const choice = document.querySelector('#redeem-choice');
  document.querySelector('#redeem-names-status').textContent = redemptionNamesLoader.state === 'loading' ? text.namesLoading : redemptionNamesLoader.state === 'error' ? text.namesUnavailable : '';
  if (redemptionNamesLoader.state === 'error') document.querySelector('#retry-redeem-names').hidden = false;
  redeemSpecies.options[0].textContent = text.redeemPlaceholder;
  choice.textContent = text.redeemStock(stock);
  if (selected) {
    const { rarity, cost } = demoRedemptionDetails(selected);
    const names = detailsStore.get(selected)?.names;
    const name = names?.[language] || names?.en || redeemNames.get(selected);
    choice.textContent += ` ${text.redeemChoice(selected, text.rarities[rarity], cost, name)}.`;
    if (!redeemStatus && normalVariantOwned(ownedVariants, selected)) choice.textContent += ` ${text.redeemOwned}`;
  }
  redeemSpecies.disabled = pending || !!pendingLocalAction || (neonProof && (!proofUser || !!proofPendingRoundId));
  const recoverable = pendingLocalAction?.action === 'redeem-pokemon' && demoRedemptionSpecies.includes(pendingLocalAction.payload?.speciesId);
  const submit = document.querySelector('#redeem-submit');
  submit.disabled = pending || !selected || (neonProof && (!proofUser || (!!proofPendingRoundId && !recoverable))) || (!!pendingLocalAction && !recoverable);
  submit.textContent = recoverable ? text.redeemRecover : text.redeemButton;
  const retry = document.querySelector('#retry-redeem-names');
  retry.setAttribute('aria-disabled', String(redemptionNamesLoader.state === 'loading'));
  if (redemptionNamesLoader.state === 'ready' && !retry.hidden) {
    if (document.activeElement === retry && !redeemSpecies.disabled) redeemSpecies.focus();
    retry.hidden = true;
  }
  document.querySelector('#redeem-status').textContent = redeemStatus ? text[redeemStatus]
    : pendingLocalAction ? text[recoverable ? 'redeemPending' : 'localActionOtherPending'] : '';
}

function variantLabel(text, shiny, owned) {
  return `${shiny ? text.shiny : text.normal}: ${owned ? text.registered : text.missing}`;
}

function renderCollection(text, catalog) {
  const list = document.querySelector('#collection');
  const visible = filterKantoCatalog(catalog, document.querySelector('#collection-number').value,
    document.querySelector('#collection-variant').value, document.querySelector('#collection-registration').value, speciesLabel);
  const visibleIds = new Set(visible.map(({ speciesId }) => speciesId));
  if (list.children.length !== catalog.length) {
    const rows = catalog.map(({ speciesId }) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'collection-entry';
      button.dataset.speciesId = speciesId;
      item.append(button);
      return item;
    });
    list.replaceChildren(...rows);
  }
  catalog.forEach(({ speciesId, normal, shiny }, index) => {
    const row = list.children[index];
    const button = row.firstElementChild;
    const label = `${speciesLabel(speciesId)} · ${variantLabel(text, false, normal)} · ${variantLabel(text, true, shiny)}`;
    if (button.textContent !== label) button.textContent = label;
    row.hidden = !visibleIds.has(speciesId);
    button.setAttribute('aria-pressed', String(speciesId === selectedSpeciesId));
  });
  document.querySelector('#filter-count').textContent = text.filterCount(visible.length);
  return visible;
}

function renderPokemonDetails(text, visible) {
  const detail = document.querySelector('#pokemon-detail');
  const record = visible.find(({ speciesId }) => speciesId === selectedSpeciesId);
  detail.hidden = !record;
  if (!record) return;
  const selectedOwned = selectedShiny ? record.shiny : record.normal;
  document.querySelector('#selected-pokemon').textContent = speciesLabel(record.speciesId);
  document.querySelector('#detail-variants').setAttribute('aria-label', text.variantFilter);
  for (const button of detail.querySelectorAll('#detail-variants button')) {
    const shiny = button.dataset.variant === 'shiny';
    button.textContent = variantLabel(text, shiny, shiny ? record.shiny : record.normal);
    button.setAttribute('aria-pressed', String(shiny === selectedShiny));
  }
  const { rarity, cost } = demoRedemptionDetails(record.speciesId);
  document.querySelector('#capture-rarity').textContent = neonProof ? text.captureTier(text.rarities[rarity]) : '';
  document.querySelector('#variant-path').textContent = selectedOwned ? ''
    : selectedShiny ? text.shinyPath : text.normalPath(cost);
  const origins = selectedOwned ? [] : evolutionRecipes
    .filter(({ sourceId, targetId }) => targetId === record.speciesId &&
      ownedVariants.some(({ speciesId, isShiny }) => speciesId === sourceId && isShiny === selectedShiny))
    .map(({ sourceId }) => speciesLabel(sourceId));
  document.querySelector('#evolution-path').textContent = origins.length ? text.evolveFrom(origins.join(', ')) : '';
  const redemption = document.querySelector('#open-redemption');
  redemption.hidden = selectedShiny || record.normal;
  redemption.disabled = pending || !!pendingLocalAction || !!proofPendingRoundId;
  const content = document.querySelector('#detail-content');
  content.hidden = detailStatus !== 'ready';
  document.querySelector('#detail-status').textContent = detailStatus === 'loading' ? text.loadingDetails
    : detailStatus === 'error' ? text.failedDetails : '';
  document.querySelector('#retry-detail').hidden = detailStatus !== 'error';
  if (!pokemonData) return;

  const name = pokemonData.names[language] || pokemonData.names.en || `#${selectedSpeciesId}`;
  const types = pokemonData.types.map(({ key }) => language === 'pt' ? (portugueseTypes[key] || key) : key);
  document.querySelector('#pokemon-types').textContent = `${text.typeLabel}: ${types.join(', ') || text.unknownType}`;
  const description = selectDescription(pokemonData.descriptions, language);
  document.querySelector('#pokemon-description').textContent = description?.text || text.noDescription;
  document.querySelector('#description-source').textContent = description
    ? text.descriptionSource(description.version || text.unknownVersion) : '';

  const sprite = document.querySelector('#pokemon-sprite');
  const url = trustedSpriteUrl(selectedShiny ? pokemonData.sprites.shiny : pokemonData.sprites.normal);
  sprite.alt = `${selectedShiny ? text.shiny : text.spriteAlt}: ${name}`;
  sprite.hidden = !url || spriteFailed;
  if (url && !spriteFailed && sprite.getAttribute('src') !== url) sprite.setAttribute('src', url);
  document.querySelector('#sprite-status').textContent = !url || spriteFailed ? text.missingSprite : '';
}

function renderList(selector, values) {
  const items = values.map((value) => {
    const item = document.createElement('li');
    item.textContent = value;
    return item;
  });
  document.querySelector(selector).replaceChildren(...items);
}

function render() {
  const text = messages[language];
  document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';
  document.title = language === 'pt' ? 'PokéSlot — prévia da máquina' : 'PokéSlot — machine preview';
  document.querySelectorAll('[data-text]').forEach((element) => { element.textContent = text[element.dataset.text]; });
  const button = document.querySelector('#language');
  button.textContent = language === 'pt' ? 'EN' : 'PT';
  button.setAttribute('aria-label', language === 'pt' ? 'Switch to English' : 'Mudar para português');
  const highlighted = new Set(wins.flatMap(({ line }) => positions[line]));
  const cells = grid.flat().map((symbol, index) => {
    const cell = document.createElement('div');
    cell.className = `cell ${symbol}${highlighted.has(index) ? ' winning' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'symbol';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[symbol];
    const label = document.createElement('span');
    label.textContent = text.symbols[symbol];
    cell.append(icon, label);
    return cell;
  });
  const gridElement = document.querySelector('#grid');
  gridElement.replaceChildren(...cells);
  gridElement.classList.toggle('spinning', spinning);
  gridElement.setAttribute('aria-busy', String(spinning));
  gridElement.setAttribute('aria-label', spinning ? text.reelsSpinning : text.machineTitle);
  document.querySelector('.results').hidden = spinning;
  document.querySelector('.reward-preview').hidden = spinning;
  document.querySelector('#lines').textContent = wins.length ? wins.map(({ line }) => text.lines[line]).join(' · ') : text.noWins;
  const rewards = rewardTypesForLines(wins);
  const rewardItems = rewards.map(({ line, type }) => {
    const item = document.createElement('li');
    item.textContent = `${text.lines[line]} — ${text.rewardTypes[type]}`;
    return item;
  });
  document.querySelector('#rewards').replaceChildren(...rewardItems);
  document.querySelector('#no-rewards').textContent = rewards.length ? '' : text.noRewards;
  const ready = !neonProof || (!!proofUser && balance !== null);
  document.querySelector('#kanto-pokedex').hidden = !ready;
  const progress = getKantoCollectionProgress(ownedVariants);
  document.querySelector('#progress-label').textContent = text.progressLabel(progress.species, progress.total);
  document.querySelector('#kanto-progress').value = progress.species;
  document.querySelector('#variant-progress').textContent = text.variantProgress(progress);
  document.querySelector('#kanto-complete').textContent = progress.species === progress.total ? text.completedKanto : '';
  renderList('#capture-results', (lastCaptures ?? []).map((entry) =>
    formatCaptureResult(entry, text, speciesLabel(entry.capture.speciesId), { authenticated: neonProof })
  ));
  document.querySelector('#no-captures').textContent = lastCaptures === null
    ? text.beforeRound : lastCaptures.length === 0 ? text.noCaptures : '';
  const visible = ready ? renderCollection(text, buildKantoCatalog(ownedVariants)) : [];
  document.querySelector('#empty-collection').textContent = ready && !visible.length ? text.noFilterMatches : '';
  renderPokemonDetails(text, visible);
  if (ready) {
    document.querySelector('#demo-vouchers').hidden = false;
    renderList('#voucher-inventory', demoVouchers.map(({ type, amount }) => `${text.voucherNames[type]}: ${amount}`));
    document.querySelector('#voucher-inventory-empty').textContent = demoVouchers.length ? '' : text.voucherInventoryEmpty;
    renderList('#voucher-results', Array.isArray(lastVouchers) ? lastVouchers.map(({ line, type, spinsAwarded }) =>
      `${text.lines[line]} — ${text.voucherNames[type]}${type === 'spins' ? ` · ${Number.isSafeInteger(spinsAwarded) && spinsAwarded >= 0 ? text.voucherSpins(spinsAwarded) : text.voucherValueUnknown}` : ''}`) : []);
    document.querySelector('#voucher-results-empty').textContent = lastVouchers === null ? text.voucherBefore
      : lastVouchers === 'unknown' ? text.voucherUnknown : lastVouchers.length ? '' : text.voucherNone;
    renderRedemption(text);
  } else document.querySelector('#demo-vouchers').hidden = true;
  stoneUI.render();
  const spin = document.querySelector('#spin');
  spin.disabled = pending || (neonProof && (!proofUser || (!!pendingLocalAction && !proofPendingRoundId)));
  spin.textContent = spinning ? text.spinning : neonProof && proofPendingRoundId ? text.recoverButton : text.spinButton;
  document.querySelector('#status').textContent = status ? text[status] : '';
  document.querySelector('#demo-balance').textContent = balance === null ? '' : text.balance(balance);
  document.querySelector('#next-refill').textContent = nextRefill === null ? '' : text.nextRefill(formatNextRefill(nextRefill, language));
  document.querySelector('#refresh-balance').disabled = pending || (neonProof && !proofUser);
  document.querySelector('#proof-logout').disabled = pending;
  document.querySelector('#proof-rewards').textContent = spinning || !lastProofReward ? ''
    : lastProofReward.available ? text.earned(lastProofReward.lines, lastProofReward.duplicates) : text.earnedUnavailable;
  if (neonProof) {
    const busy = authSubmitting || signingOut;
    document.querySelector('#proof-auth-status').textContent = busy ? text.authWorking : text[authStatus] ?? '';
    for (const button of document.querySelectorAll('#proof-login button, #proof-signup button')) button.disabled = busy;
  }
}

async function refreshDemoState() {
  const response = await fetch('/api/demo-state');
  if (!response.ok) throw new Error('Demo state unavailable');
  const state = await response.json();
  if (!Number.isSafeInteger(state.balance) || state.balance < 0 || !Array.isArray(state.ownedVariants)) throw new Error('Invalid state');
  getKantoCollectionProgress(state.ownedVariants);
  if (!Array.isArray(state.vouchers) || state.vouchers.some(({ type, amount }) =>
    !DEMO_VOUCHER_TYPES.includes(type) || type === 'spins' || !Number.isSafeInteger(amount) || amount <= 0)) throw new Error('Invalid vouchers');
  if (!Array.isArray(state.stones) || state.stones.some(({ type, amount }) =>
    !DEMO_STONES.includes(type) || !Number.isSafeInteger(amount) || amount <= 0)) throw new Error('Invalid stones');
  const next = nextRefillAt(state.cycleStartedAtMs);
  balance = state.balance;
  ownedVariants = state.ownedVariants;
  demoVouchers = state.vouchers;
  demoStones = state.stones;
  nextRefill = next;
}

function clearProofDisplay() {
  spinning = false;
  proofPendingRoundId = null;
  balance = null;
  nextRefill = null;
  ownedVariants = [];
  demoVouchers = [];
  demoStones = [];
  lastVouchers = null;
  pendingLocalAction = null;
  redeemStatus = '';
  stoneActionMessage = '';
  lastCaptures = null;
  lastProofReward = null;
  selectedSpeciesId = null;
  selectedShiny = false;
  pokemonData = null;
  detailStatus = 'idle';
  detailsRequest++;
  grid = initialGrid;
  wins = findWinningLines(grid);
  document.querySelector('#collection').replaceChildren();
  document.querySelector('#collection-number').value = '';
  document.querySelector('#collection-variant').value = 'all';
  document.querySelector('#collection-registration').value = 'all';
  redeemSpecies.value = '';
  document.querySelector('#stone-choice').value = '';
  document.querySelector('#stone-evolution-choice').replaceChildren();
  for (const id of ['voucher-inventory', 'voucher-results', 'stone-inventory']) {
    document.getElementById(id).replaceChildren();
  }
  for (const id of ['voucher-inventory-empty', 'voucher-results-empty', 'redeem-choice', 'redeem-status',
    'stone-stock', 'stone-recovery-message', 'stone-evolution-info', 'stone-action-status',
    'selected-pokemon', 'capture-rarity', 'variant-path', 'evolution-path', 'detail-status',
    'pokemon-types', 'pokemon-description', 'description-source', 'sprite-status', 'filter-count']) {
    document.getElementById(id).textContent = '';
  }
  for (const button of document.querySelectorAll('#detail-variants button')) {
    button.textContent = '';
    button.setAttribute('aria-pressed', 'false');
  }
  const sprite = document.querySelector('#pokemon-sprite');
  sprite.removeAttribute('src');
  sprite.alt = '';
  status = 'initial';
}
function resetProofSession(nextAuthStatus = '') {
  const version = ++proofGeneration;
  pending = true;
  authStatus = nextAuthStatus;
  proofUser = null;
  clearProofDisplay();
  showProofIdentity(null);
  render();
  return version;
}
function showProofIdentity(user) {
  document.querySelector('#proof-login').hidden = !!user || authMode !== 'login';
  document.querySelector('#proof-signup').hidden = !!user || authMode !== 'signup';
  document.querySelector('#proof-logout').hidden = !user;
  document.querySelector('#proof-user').textContent = user?.name || '';
}
function setProofState(state) {
  validateProofState(state);
  const next = nextRefillAt(Date.parse(state.cycleAt));
  balance = state.balance;
  ownedVariants = state.ownedVariants;
  demoVouchers = state.vouchers ?? [];
  demoStones = state.stones ?? [];
  nextRefill = next;
}
async function startNeonProof() {
  document.querySelector('#proof-auth').hidden = false;
  try {
    proofClient = createNeonProofClient(import.meta.env.VITE_NEON_PROOF_DATABASE_URL, proofUrl);
    pendingDb = await openPendingOperations();
    await recoverProofSession();
  } catch { clearProofDisplay(); authStatus = 'authFailed'; pending = true; render(); }
}
async function recoverProofSession(expectedUserId) {
  if (!proofClient || !pendingDb) return;
  const version = resetProofSession();
  try {
    const user = await proofClient.user();
    if (version !== proofGeneration) return;
    if (expectedUserId && user?.id !== expectedUserId) throw new Error('session_changed');
    if (!user) { authStatus = 'authSignedOut'; return; }
    proofUser = user;
    const current = () => version === proofGeneration && proofUser?.id === user.id;
    const state = validateProofState(await proofClient.request('state', user.id, current));
    const savedOperation = await readPendingOperation(pendingDb, `game-proof:${user.id}`);
    const inventoryOperation = await readProofInventoryOperation(pendingDb, user.id);
    await proofClient.ensureSession(user.id, current);
    if (!current()) return;
    setProofState(state);
    showProofIdentity(user);
    showProofInventoryPending(inventoryOperation);
    proofPendingRoundId = savedOperation?.operationId ?? null;
    if (proofPendingRoundId) status = 'recoverPending';
    authStatus = '';
    if (ownedVariants.length) {
      const last = ownedVariants.at(-1);
      selectedSpeciesId = last.speciesId;
      selectedShiny = last.isShiny;
      loadPokemon();
    }
    pending = false;
  } catch {
    if (version === proofGeneration) resetProofSession('authFailed');
  } finally { if (version === proofGeneration) render(); }
}
async function spinNeonProof() {
  if (!proofUser || !pendingDb) return;
  const userId = proofUser.id, version = proofGeneration;
  const expectedId = proofPendingRoundId;
  const current = () => version === proofGeneration && proofUser?.id === userId;
  pending = true;
  spinning = true;
  status = '';
  render();
  try {
    await completeGameOperation({
      ensureSession: () => proofClient.ensureSession(userId, current),
      claim: async () => {
        const operation = expectedId
          ? requirePendingOperation(await readPendingOperation(pendingDb, `game-proof:${userId}`), expectedId)
          : await claimProofGameOperation(pendingDb, userId);
        if (current()) proofPendingRoundId = operation.operationId;
        return operation;
      },
      send: async (operation) => {
        const result = validateProofRound(await proofClient.request('spin', userId, current, operation.operationId));
        if (import.meta.env.DEV && afterProofRound) await afterProofRound();
        return result;
      },
      readState: async () => validateProofState(await proofClient.request('state', userId, current)),
      present: ([result], state) => {
        if (!current()) throw new Error('session_changed');
        setProofState(state);
        if (result.status === 'no_balance') { status = 'noBalance'; return; }
        grid = result.grid;
        wins = result.winningLines;
        lastCaptures = result.captures;
        lastVouchers = result.vouchers ?? 'unknown';
        lastProofReward = {
          lines: result.lineSpins, duplicates: result.duplicateSpins,
          available: [result.lineSpins, result.duplicateSpins].every((value) => Number.isSafeInteger(value) && value >= 0),
        };
        status = 'success';
        if (lastCaptures.length) {
          const last = lastCaptures.at(-1).capture;
          selectedSpeciesId = last.speciesId;
          selectedShiny = last.isShiny;
          pokemonData = null;
          loadPokemon();
          for (const { capture } of lastCaptures) detailsStore.load(capture.speciesId).then(render, render);
        }
      },
      clear: async (operation) => {
        await clearPendingOperation(pendingDb, `game-proof:${userId}`, operation.operationId);
        const remaining = await readPendingOperation(pendingDb, `game-proof:${userId}`);
        if (current()) proofPendingRoundId = remaining?.operationId ?? null;
      },
    });
  } catch (error) {
    if (current()) {
      if (['other_operation_pending', 'pending_changed'].includes(error?.message)) { await recoverProofSession(); return; }
      if (error?.message === 'session_changed') resetProofSession('authSignedOut');
      else status = 'failure';
    }
  } finally { if (current()) { pending = false; spinning = false; render(); } }
}

function showAuthForm(mode) {
  if (authSubmitting || signingOut || proofUser) return;
  authMode = mode;
  authStatus = '';
  for (const form of document.querySelectorAll('#proof-login, #proof-signup')) {
    form.elements.password.value = '';
  }
  showProofIdentity(null);
  render();
  document.querySelector(mode === 'signup' ? '#proof-signup [name=name]' : '#proof-login [name=email]').focus();
}
document.querySelector('#open-proof-signup').addEventListener('click', () => showAuthForm('signup'));
document.querySelector('#open-proof-login').addEventListener('click', () => showAuthForm('login'));

async function submitProofAuth(event, registering) {
  event.preventDefault();
  if (!neonProof || !proofClient || !pendingDb || signingOut || authSubmitting || proofUser) return;
  const form = event.currentTarget;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const name = registering ? form.elements.name.value.trim() : '';
  if (registering && (!name || !email.toLowerCase().endsWith('@example.test'))) {
    authStatus = name ? 'signupEmailRequired' : 'signupNameRequired';
    render();
    return;
  }
  authSubmitting = true;
  render();
  try {
    const result = registering ? await proofClient.signUp({ name, email, password })
      : await proofClient.signIn(email, password);
    if (result.error || !result.data?.user?.id) throw new Error('login_failed');
    form.elements.password.value = '';
    if (registering && result.data.token === null) {
      authStatus = 'signupNeedsEntry';
      return;
    }
    form.reset();
    authMode = 'login';
    proofSessions?.postMessage('session-changed');
    await recoverProofSession(result.data.user.id);
  } catch { authStatus = registering ? 'signupFailed' : 'authFailed'; }
  finally { authSubmitting = false; render(); }
}
document.querySelector('#proof-login').addEventListener('submit', (event) => submitProofAuth(event, false));
document.querySelector('#proof-signup').addEventListener('submit', (event) => submitProofAuth(event, true));
document.querySelector('#proof-logout').addEventListener('click', async () => {
  if (!neonProof || !proofClient || pending) return;
  signingOut = true;
  resetProofSession();
  try {
    const result = await proofClient.signOut();
    if (result.error) throw new Error('logout_failed');
    proofSessions?.postMessage('session-changed');
    await recoverProofSession();
  } catch { resetProofSession('authFailed'); }
  finally { signingOut = false; render(); }
});
proofSessions?.addEventListener('message', ({ data }) => {
  if (data === 'session-changed') recoverProofSession();
});
document.addEventListener('visibilitychange', () => {
  if (neonProof && proofClient && document.visibilityState === 'visible') recoverProofSession();
});
window.addEventListener('pageshow', (event) => {
  if (neonProof && event.persisted) recoverProofSession();
});

document.querySelector('#language').addEventListener('click', () => {
  language = language === 'pt' ? 'en' : 'pt';
  render();
});
document.querySelector('#refresh-balance').addEventListener('click', async () => {
  if (pending) return;
  if (neonProof) {
    if (!proofUser) return;
    const userId = proofUser.id, version = proofGeneration;
    const current = () => version === proofGeneration && proofUser?.id === userId;
    pending = true;
    render();
    try {
      const state = validateProofState(await proofClient.request('state', userId, current));
      const [round, inventory] = await Promise.all([
        readPendingOperation(pendingDb, `game-proof:${userId}`),
        readProofInventoryOperation(pendingDb, userId),
      ]);
      await proofClient.ensureSession(userId, current);
      if (!current()) return;
      setProofState(state);
      proofPendingRoundId = round?.operationId ?? null;
      showProofInventoryPending(inventory);
      status = proofPendingRoundId ? 'recoverPending' : 'balanceRefreshed';
    } catch (error) {
      if (current() && error?.message === 'session_changed') {
        resetProofSession('authSignedOut');
      } else if (current()) status = 'failure';
    } finally { if (current()) pending = false; render(); }
    return;
  }
  pending = true;
  render();
  try {
    await refreshDemoState();
    if (pendingDb) showPendingLocalAction(await readPendingLocalAction(pendingDb));
    status = 'balanceRefreshed';
  }
  catch { status = 'failure'; }
  finally { pending = false; render(); }
});
document.querySelector('#retry-detail').addEventListener('click', loadPokemon);
async function performStoneAction(action, payload) {
  if (neonProof) return performProofInventoryAction(action, payload);
  if (pending || !pendingDb) return;
  const expectedId = pendingLocalAction?.operationId;
  pending = true;
  stoneActionMessage = '';
  render();
  try {
    const operation = action === 'recover'
      ? requirePendingOperation(await readPendingLocalAction(pendingDb), expectedId)
      : await claimPendingLocalAction(pendingDb, action, payload);
    showPendingLocalAction(operation);
    if (!operation || !['stone', 'evolve'].includes(operation.action)) return;
    if (action !== 'recover' && (operation.action !== action || JSON.stringify(operation.payload) !== JSON.stringify(payload))) return;
    const route = operation.action === 'stone' ? '/api/demo-stone' : '/api/demo-evolve';
    const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...operation.payload, operationId: operation.operationId }) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('action unavailable');
    const result = await response.json();
    const validStatus = operation.action === 'stone'
      ? ['ok', 'insufficient_vouchers'] : ['ok', 'incompatible', 'source_unavailable', 'already_registered', 'missing_stone'];
    if (!validStatus.includes(result.status) || typeof result.replayed !== 'boolean' || result.stone !== operation.payload.stone ||
      (operation.action === 'evolve' && (result.targetId !== operation.payload.targetId ||
        result.source?.speciesId !== operation.payload.source.speciesId || result.source?.isShiny !== operation.payload.source.isShiny))) throw new Error('invalid action result');
    await refreshDemoState();
    stoneActionMessage = result.status === 'ok' ? (operation.action === 'stone' ? 'stoneOk' : 'evolveOk') : result.status;
    if (operation.action === 'evolve' && result.status === 'ok') {
      selectedSpeciesId = operation.payload.targetId;
      selectedShiny = operation.payload.source.isShiny;
      pokemonData = null;
      loadPokemon();
    }
    render();
    await clearPendingOperation(pendingDb, operation.userId, operation.operationId);
    showPendingLocalAction(await readPendingLocalAction(pendingDb));
  } catch (error) {
    if (error?.message === 'pending_changed') {
      try {
        showPendingLocalAction(await readPendingLocalAction(pendingDb));
        await refreshDemoState();
        return;
      } catch { /* A atualização também pode falhar. */ }
    }
    stoneActionMessage = 'failure';
    throw error;
  } finally { pending = false; render(); }
}
redeemSpecies.addEventListener('change', () => { redeemStatus = ''; render(); });
document.querySelector('#retry-redeem-names').addEventListener('click', () => redemptionNamesLoader.load());
document.querySelector('#demo-redeem').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending || !pendingDb) return;
  const speciesId = Number(redeemSpecies.value);
  if (!demoRedemptionSpecies.includes(speciesId)) return;
  const expectedId = pendingLocalAction?.action === 'redeem-pokemon' ? pendingLocalAction.operationId : null;
  if (neonProof) {
    await performProofInventoryAction(expectedId ? 'recover' : 'pokemon', { speciesId });
    return;
  }
  pending = true;
  redeemStatus = '';
  render();
  try {
    const operation = expectedId
      ? requirePendingOperation(await readPendingLocalAction(pendingDb), expectedId)
      : await claimPendingLocalAction(pendingDb, 'redeem-pokemon', { speciesId });
    showPendingLocalAction(operation);
    if (operation.action !== 'redeem-pokemon' || operation.payload?.speciesId !== speciesId) {
      redeemStatus = '';
      return;
    }
    const response = await fetch('/api/demo-redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId, operationId: operation.operationId }) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('redemption unavailable');
    const result = await response.json();
    if (result.speciesId !== speciesId || !['ok', 'already_owned', 'insufficient_vouchers'].includes(result.status) || typeof result.replayed !== 'boolean') throw new Error('invalid redemption');
    await refreshDemoState();
    redeemStatus = { ok: 'redeemOk', already_owned: 'redeemOwned', insufficient_vouchers: 'redeemInsufficient' }[result.status];
    if (result.status === 'ok') { selectedSpeciesId = speciesId; selectedShiny = false; pokemonData = null; loadPokemon(); }
    render();
    await clearPendingOperation(pendingDb, operation.userId, operation.operationId);
    showPendingLocalAction(await readPendingLocalAction(pendingDb));
    if (pendingLocalAction) redeemStatus = '';
  } catch (error) {
    if (error?.message === 'pending_changed') {
      try {
        showPendingLocalAction(await readPendingLocalAction(pendingDb));
        await refreshDemoState();
        return;
      } catch { /* A atualização também pode falhar. */ }
    }
    redeemStatus = 'redeemFailure';
  }
  finally { pending = false; render(); }
});
document.querySelector('#collection-number').addEventListener('input', render);
document.querySelector('#collection-variant').addEventListener('change', render);
document.querySelector('#collection-registration').addEventListener('change', render);
document.querySelector('#collection').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-species-id]');
  if (!button) return;
  selectedSpeciesId = Number(button.dataset.speciesId);
  const variant = document.querySelector('#collection-variant').value;
  selectedShiny = variant === 'shiny' || (variant === 'all' &&
    ownedVariants.some(({ speciesId, isShiny }) => speciesId === selectedSpeciesId && isShiny) &&
    !normalVariantOwned(ownedVariants, selectedSpeciesId));
  pokemonData = null;
  loadPokemon();
  document.querySelector('#selected-pokemon').focus();
});
document.querySelector('#detail-variants').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-variant]');
  if (!button || selectedSpeciesId === null) return;
  selectedShiny = button.dataset.variant === 'shiny';
  spriteFailed = false;
  render();
});
document.querySelector('#open-redemption').addEventListener('click', () => {
  if (redeemSpecies.disabled || pending || pendingLocalAction || selectedSpeciesId === null || selectedShiny) return;
  redeemSpecies.value = String(selectedSpeciesId);
  redeemStatus = '';
  render();
  redeemSpecies.focus();
});
document.querySelector('#pokemon-sprite').addEventListener('error', () => {
  spriteFailed = true;
  render();
});
document.querySelector('#spin').addEventListener('click', async () => {
  if (pending) return;
  if (neonProof) { await spinNeonProof(); return; }
  pending = true;
  spinning = true;
  status = '';
  render();
  try {
    const operation = await claimPendingOperation(pendingDb, 'local-demo');
    const response = await fetch('/api/demo-round', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: operation.operationId }) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Demo round unavailable');
    }
    const result = await response.json();
    if (result.status === 'no_balance') {
      await clearPendingOperation(pendingDb, 'local-demo', operation.operationId);
      await refreshDemoState();
      status = 'noBalance';
      return;
    }
    if (result.status !== 'ok') throw new Error('Invalid round');
    // Valida a grade recebida antes de atualizar a interface.
    const checkedWins = findWinningLines(result.grid);
    if (JSON.stringify(checkedWins) !== JSON.stringify(result.winningLines)) throw new Error('Invalid round');
    if (!Array.isArray(result.captures) || result.captures.some(({ capture }) =>
      !Number.isInteger(capture?.speciesId) || capture.speciesId < 1 || capture.speciesId > 151 ||
      !['common', 'uncommon', 'rare', 'legendary'].includes(capture?.rarity) || capture?.isShiny !== false
    )) throw new Error('Invalid demo captures');
    const captures = result.captures;
    const voucherLines = rewardTypesForLines(checkedWins).filter(({ type }) => type === 'voucher');
    if (result.vouchers !== undefined && (!Array.isArray(result.vouchers) || result.vouchers.length !== voucherLines.length ||
      result.vouchers.some(({ line, type }, index) => line !== voucherLines[index].line || !DEMO_VOUCHER_TYPES.includes(type)))) throw new Error('Invalid vouchers');
    await refreshDemoState();
    await clearPendingOperation(pendingDb, 'local-demo', operation.operationId);
    // Só publicamos os estados depois de validar a rodada inteira.
    grid = result.grid;
    wins = checkedWins;
    lastCaptures = captures;
    lastVouchers = result.vouchers ?? 'unknown';
    status = 'success';
    if (captures.length) {
      selectedSpeciesId = captures.at(-1).capture.speciesId;
      selectedShiny = captures.at(-1).capture.isShiny;
      pokemonData = null;
      loadPokemon();
      for (const { capture } of captures) {
        if (capture.speciesId !== selectedSpeciesId) {
          detailsStore.load(capture.speciesId).then(render, render);
        }
      }
    }
  } catch {
    status = 'failure';
  } finally {
    pending = false;
    spinning = false;
    render();
  }
});
setupRedemptionPicker();
render();
if (import.meta.env.DEV && neonProof && new URLSearchParams(location.search).get('test') === '1') {
  import('./proof-test-controls.mjs').then(({ setupProofTestControls }) => {
    afterProofRound = setupProofTestControls({ signOut: async () => {
      const result = await proofClient.signOut();
      if (result.error) throw new Error('logout_failed');
      await recoverProofSession();
    } });
  });
}
if (neonProof) startNeonProof();
else Promise.all([openPendingOperations(), refreshDemoState()]).then(async ([db]) => {
  pendingDb = db;
  showPendingLocalAction(await readPendingLocalAction(db));
  if (ownedVariants.length) {
    selectedSpeciesId = ownedVariants.at(-1).speciesId;
    loadPokemon();
  }
  pending = false;
  render();
}).catch(() => { status = 'failure'; render(); });
