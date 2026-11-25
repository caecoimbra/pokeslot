import { findWinningLines } from '../domain/paylines.mjs';
import { createArcadeReels } from './arcade-reels.mjs';
import { createArcadeSound } from './arcade-sound.mjs';
import { renderDexCards, setDexSprite } from './dex-cards.mjs';
import kantoNames from './assets/kanto-names.json';
import { inventoryCard } from './inventory-card.mjs';
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
import { DEMO_VOUCHER_TYPES, DEMO_SPIN_VOUCHER_VALUE } from '../domain/demo-vouchers.mjs';
import { demoRedemptionSpecies, demoRedemptionDetails, normalVariantOwned } from '../domain/demo-redemption.mjs';
import { setupStoneUI } from './stone-ui.mjs';
import { knownEvolutionOptions, kantoEvolutionOptions, DEMO_STONES } from '../server/evolution.mjs';
import { createRedemptionNamesLoader } from './redemption-names.mjs';

const previewParams = new URLSearchParams(location.search);
const neonProof = import.meta.env.MODE === 'homologacao' || previewParams.get('backend') === 'neon';
const recoveryTest = import.meta.env.DEV && location.hostname === 'localhost' && previewParams.get('recovery-test') === '1';
const publicSignup = neonProof && !import.meta.env.DEV;
const proofUrl = import.meta.env.VITE_NEON_PROOF_FUNCTION_URL || 'https://br-dry-block-be4mfcuo-pokeslotgame.compute.c-9.us-east-2.aws.neon.tech';
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
  ['pokeball', 'spin', 'voucher'],
  ['spin', 'voucher', 'pokeball'],
  ['pokeball', 'voucher', 'spin'],
];
const initialGrid = grid;
const messages = {
  pt: {
    machineTitle: 'Kanto Spin', credits: 'Giros', paytable: 'Combinações',
    ballLine: '3 Pokébolas', spinLine: '3 símbolos de giro', ticketLine: '3 vales',
    ballPrize: 'Capture um Pokémon', spinPrize: 'Ganhe giros extras', ticketPrize: 'Receba um vale',
    aboutProject: 'Sobre o projeto',
    balance: (value) => `Saldo: ${value} ${value === 1 ? 'giro' : 'giros'}`, noBalance: 'Seus giros acabaram. Confira a próxima reposição.',
    nextRefill: (date) => `Próxima reposição: ${date} (hora local).`,
    refreshBalance: 'Atualizar saldo', balanceRefreshed: 'Saldo atualizado.',
    spinButton: 'Girar', spinning: 'Girando…',
    reelsSpinning: 'Rodada em andamento',
    navLabel: 'Áreas do jogo', navMachine: 'Máquina', navPokedex: 'Pokédex', navVouchers: 'Vales', navStones: 'Pedras',
    rewardHeading: 'Prêmios da rodada', noRewards: 'Rodada sem prêmio.',
    rewardTypes: { pokemon: 'Captura de Pokémon', extra_spins: 'Giros extras', voucher: 'Vale' },
    initial: 'Cada rodada custa 1 giro. Alinhe três símbolos iguais na horizontal ou na diagonal.',
    success: 'Rodada concluída.', failure: 'Não foi possível confirmar a rodada. Tente novamente para recuperá-la.',
    pokedexTitle: 'Pokédex de Kanto', unknownSpecies: 'Espécie desconhecida', backToCatalog: 'Voltar ao cartão',
    progressLabel: (count, total) => `Kanto: ${count} de ${total} espécies registradas`,
    variantProgress: ({ normal, shiny }) => `Normais: ${normal} · Shiny: ${shiny} (opcionais)`,
    completedKanto: 'Kanto completo! Você registrou as 151 espécies.',
    pokedexNote: 'Registre uma espécie para ver seu nome e suas cores.',
    lastCaptures: 'Capturas da última rodada',
    beforeRound: 'Nenhuma rodada por enquanto.', noCaptures: 'Nenhuma captura nesta rodada.',
    normal: 'Normal', shiny: 'Shiny', registered: 'Registrada', missing: 'Faltante',
    numberFilter: 'Nome ou número', variantFilter: 'Variante', allVariants: 'Todas',
    registrationFilter: 'Registro', allRegistrations: 'Todos',
    filterCount: (count) => `${count} ${count === 1 ? 'cartão visível' : 'cartões visíveis'}.`, noFilterMatches: 'Nenhuma espécie corresponde aos filtros.',
    captureTier: (rarity) => `Raridade na captura: ${rarity}.`,
    shinyPath: 'Shiny pode vir em uma captura ou ao evoluir uma origem shiny compatível.',
    normalPath: (cost) => `Você pode capturar esta espécie ou resgatar a variante normal por ${cost} ${cost === 1 ? 'vale Pokémon' : 'vales Pokémon'}.`,
    evolveFrom: (names) => `Você já tem uma origem compatível: ${names}. Confira as pedras necessárias no painel de evolução.`,
    viewRedemption: 'Ver no resgate',
    vouchersTitle: 'Vales', vouchersNote: 'Cada tipo de vale tem a mesma chance de sair.',
    voucherRoundTitle: 'Última rodada', voucherInventoryTitle: 'Sua carteira', voucherBefore: 'Nenhuma rodada por enquanto.', voucherNone: 'Nenhum vale nesta rodada.', voucherUnknown: 'Detalhes dos vales indisponíveis para esta rodada.',
    voucherEffects: { pokemon: 'Resgate uma espécie de Kanto.', stone: 'Escolha uma pedra de evolução.', spins: 'Giros creditados ao ganhar.', type: 'Guardado para uso futuro.', shiny_charm: 'Guardado para uso futuro.' },
    visitStones: 'Trocar vale por pedra →',
    voucherNames: { pokemon: 'Vale Pokémon', stone: 'Vale pedra', spins: 'Vale de giros', type: 'Vale de tipo', shiny_charm: 'Amuleto shiny' }, voucherSpins: (value) => `+${value} giros`, voucherValueUnknown: 'valor indisponível',
    redeemTitle: 'Resgatar Pokémon', redeemNote: 'Escolha uma espécie para registrar a variante normal. O custo depende da raridade.', redeemSpecies: 'Pokémon de Kanto', redeemPlaceholder: 'Escolha uma espécie', redeemButton: 'Trocar vales',
    namesLoading: 'Consultando a PokéAPI…', namesUnavailable: 'Exibindo os nomes do catálogo local de Kanto.', retryNames: 'Tentar atualizar nomes',
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
    account: 'Jogador', signInTitle: 'Sua conta', emailLabel: 'E-mail', passwordLabel: 'Senha', loginButton: 'Entrar', logoutButton: 'Sair',
    authSignedOut: 'Entre para continuar a jogar.', authFailed: 'Não foi possível entrar e carregar seu progresso. Confira seus dados e tente novamente.',
    authUnavailable: 'O serviço de conta demorou para responder. Tente novamente em instantes.',
    accessRestricted: 'O acesso ao jogo está indisponível para esta conta.',
    showSignup: 'Criar conta de teste', showLogin: 'Voltar para entrar', signupButton: 'Criar conta',
    passwordRecovery: 'Esqueci a senha',
    signupNote: 'Use um nome fictício, um endereço @example.test e uma senha exclusiva para esta prova.',
    recoveryTestNote: 'Use um nome fictício, um endereço de teste privado que receba e-mail e uma senha exclusiva para esta prova.',
    signupName: 'Nome fictício', signupPassword: 'Senha de teste (8 caracteres ou mais)',
    signupEmailRequired: 'Para esta prova, use um endereço fictício terminado em @example.test.',
    signupNameRequired: 'Informe um nome fictício.',
    signupFailed: 'Não foi possível confirmar o cadastro. Se você já criou a conta, volte para entrar.',
    signupTimeout: 'O cadastro demorou para responder e pode ter sido concluído. Aguarde um instante e tente entrar com os mesmos dados.',
    signupNeedsEntry: 'A conta ainda não está conectada. Volte para entrar.',
    authWorking: 'Confirmando com o serviço de conta…',
    recoverPending: 'Há uma rodada pendente de confirmação. Recupere-a antes de iniciar outra.', recoverButton: 'Recuperar rodada pendente',
    earned: (lines, duplicates) => [lines && `+${lines} giros por linhas`, duplicates && `+${duplicates} por capturas repetidas`].filter(Boolean).join(' · '),
    earnedUnavailable: 'Detalhes totais de giros indisponíveis para esta rodada.',
    symbols: { pokeball: 'Pokébola', spin: 'Giro', voucher: 'Vale' },
    lines: { top: 'Superior', middle: 'Central', bottom: 'Inferior', diagonal_down: 'Diagonal descendente', diagonal_up: 'Diagonal ascendente' },
  },
  en: {
    machineTitle: 'Kanto Spin', credits: 'Spins', paytable: 'Combinations',
    ballLine: '3 Poké Balls', spinLine: '3 spin symbols', ticketLine: '3 vouchers',
    ballPrize: 'Catch a Pokémon', spinPrize: 'Earn extra spins', ticketPrize: 'Draw a voucher',
    aboutProject: 'About the project',
    balance: (value) => `Balance: ${value} ${value === 1 ? 'spin' : 'spins'}`, noBalance: 'You are out of spins. Check your next refill.',
    nextRefill: (date) => `Next refill: ${date} (local time).`,
    refreshBalance: 'Refresh balance', balanceRefreshed: 'Balance updated.',
    spinButton: 'Spin', spinning: 'Spinning…',
    reelsSpinning: 'Round in progress',
    navLabel: 'Game areas', navMachine: 'Machine', navPokedex: 'Pokédex', navVouchers: 'Vouchers', navStones: 'Stones',
    rewardHeading: 'Round rewards', noRewards: 'No prize this round.',
    rewardTypes: { pokemon: 'Pokémon capture', extra_spins: 'Extra spins', voucher: 'Voucher' },
    initial: 'Each round costs 1 spin. Match three symbols across a row or diagonal.',
    success: 'Round complete.', failure: 'Could not confirm the round. Try again to recover it.',
    pokedexTitle: 'Kanto Pokédex', unknownSpecies: 'Unknown species', backToCatalog: 'Back to card',
    progressLabel: (count, total) => `Kanto: ${count} of ${total} registered species`,
    variantProgress: ({ normal, shiny }) => `Normal: ${normal} · Shiny: ${shiny} (optional)`,
    completedKanto: 'Kanto complete! You registered all 151 species.',
    pokedexNote: 'Register a species to reveal its name and colors.',
    lastCaptures: 'Last round captures',
    beforeRound: 'No rounds yet.', noCaptures: 'No captures this round.',
    normal: 'Normal', shiny: 'Shiny', registered: 'Registered', missing: 'Missing',
    numberFilter: 'Name or number', variantFilter: 'Variant', allVariants: 'All',
    registrationFilter: 'Registration', allRegistrations: 'All',
    filterCount: (count) => `${count} ${count === 1 ? 'card' : 'cards'} shown.`, noFilterMatches: 'No species match these filters.',
    captureTier: (rarity) => `Capture rarity: ${rarity}.`,
    shinyPath: 'Shiny variants can be captured or evolved from a compatible shiny Pokémon.',
    normalPath: (cost) => `You can capture this species or redeem the normal variant for ${cost} Pokémon ${cost === 1 ? 'voucher' : 'vouchers'}.`,
    evolveFrom: (names) => `You have a compatible Pokémon: ${names}. Check the evolution panel for compatible stones.`,
    viewRedemption: 'View redemption',
    vouchersTitle: 'Vouchers', vouchersNote: 'Each type of voucher is equally likely to drop.',
    voucherRoundTitle: 'Last round', voucherInventoryTitle: 'Your wallet', voucherBefore: 'No rounds yet.', voucherNone: 'No vouchers this round.', voucherUnknown: 'Voucher details unavailable for this round.',
    voucherEffects: { pokemon: 'Redeem a Kanto species.', stone: 'Choose an evolution stone.', spins: 'Spins credited when drawn.', type: 'Saved for future use.', shiny_charm: 'Saved for future use.' },
    visitStones: 'Exchange a voucher for a stone →',
    voucherNames: { pokemon: 'Pokémon voucher', stone: 'Stone voucher', spins: 'Spin voucher', type: 'Type voucher', shiny_charm: 'Shiny charm' }, voucherSpins: (value) => `+${value} spins`, voucherValueUnknown: 'value unavailable',
    redeemTitle: 'Redeem a Pokémon', redeemNote: 'Choose a species to register its normal variant. The cost depends on its rarity.', redeemSpecies: 'Kanto Pokémon', redeemPlaceholder: 'Choose a species', redeemButton: 'Redeem vouchers',
    namesLoading: 'Checking PokéAPI…', namesUnavailable: 'Showing names from the local Kanto catalog.', retryNames: 'Retry name update',
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
    account: 'Player', signInTitle: 'Your account', emailLabel: 'Email', passwordLabel: 'Password', loginButton: 'Sign in', logoutButton: 'Sign out',
    authSignedOut: 'Sign in to continue playing.', authFailed: 'Could not sign in and load your progress. Check your details and try again.',
    authUnavailable: 'The account service took too long to respond. Please try again shortly.',
    accessRestricted: 'Game access is unavailable for this account.',
    showSignup: 'Create test account', showLogin: 'Back to sign in', signupButton: 'Create account',
    passwordRecovery: 'Forgot password',
    signupNote: 'Use a fictional name, an @example.test address, and a password unique to this test.',
    recoveryTestNote: 'Use a fictional name, a private test inbox that can receive email, and a password unique to this test.',
    signupName: 'Fictional name', signupPassword: 'Test password (8 characters or more)',
    signupEmailRequired: 'For this test, use a fictional address ending in @example.test.',
    signupNameRequired: 'Enter a fictional name.',
    signupFailed: 'Could not confirm registration. If you already created the account, go back to sign in.',
    signupTimeout: 'Registration took too long and may have completed. Wait a moment, then try signing in with the same details.',
    signupNeedsEntry: 'The account is not signed in yet. Go back to sign in.',
    authWorking: 'Confirming with the account service…',
    recoverPending: 'A round is awaiting confirmation. Recover it before starting another.', recoverButton: 'Recover pending round',
    earned: (lines, duplicates) => [lines && `+${lines} spins from lines`, duplicates && `+${duplicates} from duplicate catches`].filter(Boolean).join(' · '),
    earnedUnavailable: 'Total spin details are unavailable for this round.',
    symbols: { pokeball: 'Poké Ball', spin: 'Spin', voucher: 'Voucher' },
    lines: { top: 'Top', middle: 'Middle', bottom: 'Bottom', diagonal_down: 'Descending diagonal', diagonal_up: 'Ascending diagonal' },
  },
};
Object.assign(messages.pt, capturePresentationMessages.pt);
Object.assign(messages.en, capturePresentationMessages.en);
messages.pt.rateLimited = 'Muitas ações em pouco tempo. Aguarde um minuto e recupere a ação pendente.';
messages.en.rateLimited = 'Too many actions in a short time. Wait a minute and recover the pending action.';
Object.assign(messages.pt, {
  operation_expired: 'O resultado da ação expirou. Confira o progresso atualizado antes de iniciar outra ação.',
  operation_clock: 'Confira a data e a hora do dispositivo antes de iniciar outra ação.',
  dailyLimit: 'O jogo atingiu seu limite diário. Tente novamente após a meia-noite UTC.',
});
Object.assign(messages.en, {
  operation_expired: 'The action result expired. Check your updated progress before starting another action.',
  operation_clock: 'Check your device time and date before starting another action.',
  dailyLimit: 'The game has reached its daily limit. Try again after midnight UTC.',
});
if (neonProof) {
  Object.assign(messages.pt, {
    failure: 'Não foi possível confirmar a rodada. Entre na mesma conta e tente novamente para recuperar uma operação pendente.',
    captureStatus: { new: 'Nova captura', duplicate: 'Repetida' } });
  Object.assign(messages.en, {
    failure: 'Could not confirm the round. Sign in to the same account and retry to recover a pending operation.',
    captureStatus: { new: 'New capture', duplicate: 'Duplicate' } });
}
if (publicSignup) {
  Object.assign(messages.pt, {
    showSignup: 'Criar conta',
    signupNote: 'Use um e-mail que você possa acessar para recuperar sua conta.',
    signupName: 'Nome de jogador',
    signupPassword: 'Senha (8 caracteres ou mais)',
    signupNameRequired: 'Informe um nome de jogador.',
  });
  Object.assign(messages.en, {
    showSignup: 'Create account',
    signupNote: 'Use an email address you can access to recover your account.',
    signupName: 'Player name',
    signupPassword: 'Password (8 characters or more)',
    signupNameRequired: 'Enter a player name.',
  });
}
const reelView = createArcadeReels(document.querySelector('#grid'));
const arcadeSound = createArcadeSound();
const soundToggle = document.querySelector('#sound-toggle');
let wins = [];
let language = previewParams.get('lang') === 'en' ? 'en' : 'pt';
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
const screenNav = document.querySelector('.arcade-nav');
const screenLinks = [...screenNav.querySelectorAll('[data-screen-link]')];
function inventoryReady() {
  return !neonProof || (!!proofUser && balance !== null);
}
function activeScreen() {
  if (!inventoryReady()) return 'machine';
  return screenLinks.find((link) => link.hash === window.location.hash)?.dataset.screenLink ?? 'machine';
}
const stoneUI = setupStoneUI({
  getState: () => ({ visible: activeScreen() === 'stones', authenticated: neonProof, enabled: !!pendingDb && (!neonProof || (!!proofUser && (!proofPendingRoundId || !!pendingLocalAction))), language, ownedVariants,
    vouchers: demoVouchers, stones: demoStones, recipes: evolutionRecipes, pending,
    pendingAction: pendingLocalAction, actionMessage: stoneActionMessage, actionMessageText: messages[language][stoneActionMessage] }),
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

function speciesName(id) {
  const data = detailsStore.get(id);
  return data?.names[language] || data?.names.en || kantoNames[id - 1];
}

function speciesLabel(id) {
  return `#${String(id).padStart(3, '0')} ${speciesName(id)}`;
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
    redeemSpecies.append(new Option(speciesLabel(id), id));
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
        if (['operation_expired', 'operation_clock'].includes(result.status)) {
          if (operation.action === 'pokemon') redeemStatus = result.status;
          else stoneActionMessage = result.status;
        } else if (operation.action === 'pokemon') {
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
      } else if (['rate_limited', 'daily_limit'].includes(error?.message)) {
        const message = error.message === 'daily_limit' ? 'dailyLimit' : 'rateLimited';
        if (action === 'pokemon' || pendingLocalAction?.action === 'redeem-pokemon') redeemStatus = message;
        else stoneActionMessage = message;
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
    const name = names?.[language] || names?.en || redeemNames.get(selected) || kantoNames[selected - 1];
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
  const variant = document.querySelector('#collection-variant').value;
  const visible = filterKantoCatalog(catalog, document.querySelector('#collection-number').value,
    variant, document.querySelector('#collection-registration').value, speciesName);
  renderDexCards(document.querySelector('#collection'), catalog, visible, selectedSpeciesId, variant, speciesName, text);
  document.querySelector('#filter-count').textContent = text.filterCount(visible.length);
  return visible;
}

function renderPokemonDetails(text, visible) {
  const detail = document.querySelector('#pokemon-detail');
  const record = visible.find(entry => entry.speciesId === selectedSpeciesId && (entry.normal || entry.shiny));
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
  const sprite = document.querySelector('#pokemon-sprite');
  sprite.alt = `${selectedShiny ? text.shiny : text.spriteAlt} · ${speciesName(record.speciesId)}`;
  if (selectedOwned) setDexSprite(sprite, record.speciesId, selectedShiny);
  sprite.hidden = !selectedOwned || spriteFailed;
  document.querySelector('#sprite-status').textContent = selectedOwned && spriteFailed ? text.missingSprite : '';
  const content = document.querySelector('#detail-content');
  content.hidden = detailStatus !== 'ready';
  document.querySelector('#detail-status').textContent = detailStatus === 'loading' ? text.loadingDetails
    : detailStatus === 'error' ? text.failedDetails : '';
  document.querySelector('#retry-detail').hidden = detailStatus !== 'error';
  if (!pokemonData) return;

  const types = pokemonData.types.map(({ key }) => language === 'pt' ? (portugueseTypes[key] || key) : key);
  document.querySelector('#pokemon-types').textContent = `${text.typeLabel}: ${types.join(', ') || text.unknownType}`;
  const description = selectDescription(pokemonData.descriptions, language);
  document.querySelector('#pokemon-description').textContent = description?.text || text.noDescription;
  document.querySelector('#description-source').textContent = description
    ? text.descriptionSource(description.version || text.unknownVersion) : '';
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
  document.querySelectorAll('[data-text]').forEach((element) => { element.textContent = text[element.dataset.text]; });
  const button = document.querySelector('#language');
  button.textContent = language === 'pt' ? 'EN' : 'PT';
  button.lang = language === 'pt' ? 'en' : 'pt-BR';
  button.setAttribute('aria-label', language === 'pt' ? 'EN — Switch to English' : 'PT — Mudar para português');
  reelView.render(grid, wins, spinning, text);
  soundToggle.hidden = !arcadeSound.available;
  soundToggle.setAttribute('aria-pressed', String(arcadeSound.enabled));
  soundToggle.querySelector('.sound-label').textContent = language === 'pt' ? 'Som' : 'Sound';
  const soundStates = language === 'pt' ? ['desligado', 'ligado'] : ['off', 'on'];
  soundToggle.querySelector('.sound-state').textContent = soundStates[Number(arcadeSound.enabled)];
  document.querySelector('.round-readout').hidden = spinning || !wins.length;
  const rewards = rewardTypesForLines(wins);
  renderList('#rewards', rewards.map(({ line, type }) => {
    const entry = lastCaptures?.find(capture => capture.line === line);
    if (entry) return formatCaptureResult(entry, text, speciesLabel(entry.capture.speciesId), { authenticated: neonProof });
    const voucher = Array.isArray(lastVouchers) && lastVouchers.find(item => item.line === line);
    const prize = voucher ? text.voucherNames[voucher.type] : text.rewardTypes[type];
    return `${text.lines[line]} — ${prize}`;
  }));
  const ready = inventoryReady();
  const screen = activeScreen();
  document.querySelector('#about-project').href = language === 'en' ? '/case/en/' : '/case/';
  screenNav.setAttribute('aria-label', text.navLabel);
  for (const link of screenLinks) {
    const target = link.dataset.screenLink;
    if (target === screen) {
      link.setAttribute('aria-current', 'page');
      document.title = `PokéSlot — ${link.textContent.trim()}`;
    }
    else link.removeAttribute('aria-current');
    if (target !== 'machine' && !ready) {
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
    } else {
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
    }
  }
  document.querySelector('[data-screen="machine"]').hidden = screen !== 'machine';
  document.querySelector('#kanto-pokedex').hidden = screen !== 'pokedex';
  document.querySelector('#demo-vouchers').hidden = screen !== 'vouchers';
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
  const visible = screen === 'pokedex' ? renderCollection(text, buildKantoCatalog(ownedVariants)) : [];
  document.querySelector('#empty-collection').textContent = screen === 'pokedex' && !visible.length ? text.noFilterMatches : '';
  renderPokemonDetails(text, visible);
  if (ready) {
    if (screen === 'vouchers') {
      const wallet = new Map(demoVouchers.map(({ type, amount }) => [type, amount]));
      const types = DEMO_VOUCHER_TYPES.filter(type => ['pokemon', 'stone', 'spins'].includes(type) || wallet.has(type));
      document.querySelector('#voucher-inventory').replaceChildren(...types.map(type => inventoryCard(
        'coupon coupon-' + type, text.voucherNames[type], type === 'spins' ? '+' + DEMO_SPIN_VOUCHER_VALUE : '× ' + (wallet.get(type) ?? 0), text.voucherEffects[type]
      )));
    }
    renderList('#voucher-results', Array.isArray(lastVouchers) ? lastVouchers.map(({ line, type, spinsAwarded }) =>
      `${text.lines[line]} — ${text.voucherNames[type]}${type === 'spins' ? ` · ${Number.isSafeInteger(spinsAwarded) && spinsAwarded >= 0 ? text.voucherSpins(spinsAwarded) : text.voucherValueUnknown}` : ''}`) : []);
    document.querySelector('#voucher-results-empty').textContent = lastVouchers === null ? text.voucherBefore
      : lastVouchers === 'unknown' ? text.voucherUnknown : lastVouchers.length ? '' : text.voucherNone;
    renderRedemption(text);
  }
  stoneUI.render();
  const spin = document.querySelector('#spin');
  spin.disabled = pending || (neonProof && (!proofUser || (!!pendingLocalAction && !proofPendingRoundId)));
  spin.textContent = spinning ? text.spinning : neonProof && proofPendingRoundId ? text.recoverButton : text.spinButton;
  const roundMessage = status === 'success' && !wins.length ? text.noRewards : text[status];
  document.querySelector('#status').textContent = spinning ? text.reelsSpinning : roundMessage ?? '';
  document.querySelector('#demo-balance').textContent = balance === null ? '—' : String(balance);
  document.querySelector('#demo-balance').setAttribute('aria-label', balance === null ? text.credits : text.balance(balance));
  document.querySelector('#next-refill').textContent = nextRefill === null ? '' : text.nextRefill(formatNextRefill(nextRefill, language));
  document.querySelector('#refresh-balance').disabled = pending || (neonProof && !proofUser);
  document.querySelector('#proof-logout').disabled = pending;
  document.querySelector('#proof-rewards').textContent = spinning || !lastProofReward ? ''
    : lastProofReward.available ? text.earned(lastProofReward.lines, lastProofReward.duplicates) : text.earnedUnavailable;
  if (neonProof) {
    const busy = authSubmitting || signingOut;
    document.querySelector('#account-label').textContent = proofUser ? text.account : text.signInTitle;
    document.querySelector('#open-password-recovery').href = `./redefinir-senha.html?lang=${language}`;
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
  arcadeSound.stop();
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
  wins = [];
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
  for (const id of ['voucher-results-empty', 'redeem-choice', 'redeem-status',
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
  document.querySelector('#open-proof-signup').hidden = false;
  if (recoveryTest || publicSignup) {
    if (recoveryTest) document.querySelector('#proof-signup-note').dataset.text = 'recoveryTestNote';
    document.querySelector('#proof-signup [name=email]').removeAttribute('placeholder');
  }
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
    if (!user) return;
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
    pending = false;
  } catch (error) {
    if (version === proofGeneration) {
      const unavailable = ['session_timeout', 'session_unavailable', 'request_timeout', 'request_failed'].includes(error?.message);
      resetProofSession(error?.message === 'access_restricted' ? 'accessRestricted' : unavailable ? 'authUnavailable' : 'authFailed');
    }
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
        if (['operation_expired', 'operation_clock'].includes(result.status)) { status = result.status; return; }
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
      else if (error?.message === 'rate_limited') status = 'rateLimited';
      else if (error?.message === 'daily_limit') status = 'dailyLimit';
      else status = 'failure';
    }
  } finally {
    await finishSpin(current);
  }
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
  if (registering && (!name || (!publicSignup && !recoveryTest && !email.toLowerCase().endsWith('@example.test')))) {
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
    let timer;
    try {
      await Promise.race([
        recoverProofSession(result.data.user.id),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('recovery_timeout')), 30000); }),
      ]);
    } finally { clearTimeout(timer); }
  } catch (error) {
    if (error?.message === 'recovery_timeout') resetProofSession('authUnavailable');
    else if (error?.message === 'request_timeout') authStatus = registering ? 'signupTimeout' : 'authUnavailable';
    else authStatus = registering ? 'signupFailed' : 'authFailed';
  }
  finally {
    authSubmitting = false;
    render();
    if (proofUser && (document.activeElement === document.body || form.contains(document.activeElement))) {
      document.querySelector('#proof-user').focus();
    }
  }
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
  finally {
    signingOut = false;
    render();
    if (!proofUser && document.activeElement === document.body) {
      document.querySelector('#proof-login [name=email]').focus();
    }
  }
});
proofSessions?.addEventListener('message', ({ data }) => {
  if (data === 'session-changed') recoverProofSession();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) arcadeSound.stop();
  if (neonProof && proofClient && document.visibilityState === 'visible') recoverProofSession();
});
window.addEventListener('pageshow', (event) => {
  if (neonProof && event.persisted) recoverProofSession();
});

screenNav.addEventListener('click', (event) => {
  const link = event.target.closest('[data-screen-link]');
  if (link?.getAttribute('aria-disabled') === 'true') event.preventDefault();
});
window.addEventListener('hashchange', () => {
  if (activeScreen() !== 'machine') arcadeSound.stop();
  render();
  const section = document.querySelector('[data-screen]:not([hidden])');
  document.getElementById(section.getAttribute('aria-labelledby'))?.focus();
});

soundToggle.addEventListener('click', () => { arcadeSound.toggle(); render(); });
window.addEventListener('pagehide', () => arcadeSound.stop());
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
  if (!button || button.disabled || !inventoryReady()) return;
  selectedSpeciesId = Number(button.dataset.speciesId);
  const variant = document.querySelector('#collection-variant').value;
  selectedShiny = ownedVariants.some(({ speciesId, isShiny }) => speciesId === selectedSpeciesId && isShiny) &&
    (variant === 'shiny' || !normalVariantOwned(ownedVariants, selectedSpeciesId));
  pokemonData = null;
  loadPokemon();
  document.querySelector('#selected-pokemon').focus();
});
document.querySelector('#back-to-card').addEventListener('click', () => {
  const entry = document.querySelector(`#collection [data-species-id="${selectedSpeciesId}"]`);
  selectedSpeciesId = null;
  detailsRequest++;
  pokemonData = null;
  render();
  entry?.focus();
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
  window.history.pushState(null, '', screenLinks.find((link) => link.dataset.screenLink === 'vouchers').hash);
  redeemSpecies.value = String(selectedSpeciesId);
  redeemStatus = '';
  render();
  redeemSpecies.focus();
});
document.querySelector('#pokemon-sprite').addEventListener('error', () => {
  spriteFailed = true;
  render();
});
async function finishSpin(current = () => true) {
  if (!current()) return;
  try {
    if (status === 'success') await reelView.stop(grid);
  } finally {
    if (current()) {
      pending = false;
      spinning = false;
      render();
      if (status === 'success') arcadeSound.finish(wins.length > 0);
      else arcadeSound.stop();
    }
  }
}

async function spinLocal() {
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
    await finishSpin();
  }
}
document.querySelector('#spin').addEventListener('click', async (event) => {
  if (pending) return;
  const button = event.currentTarget;
  const hadFocus = document.activeElement === button;
  const version = proofGeneration;
  arcadeSound.start();
  try { await (neonProof ? spinNeonProof() : spinLocal()); }
  finally {
    if (hadFocus && version === proofGeneration && !button.disabled &&
        activeScreen() === 'machine' && document.activeElement === document.body) {
      button.focus({ preventScroll: true });
    }
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
  pending = false;
  render();
}).catch(() => { status = 'failure'; render(); });
