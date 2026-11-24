import { findWinningLines } from '../src/domain/paylines.mjs';
import { REEL } from '../src/domain/reels.mjs';
import { demoRedemptionDetails } from '../src/domain/demo-redemption.mjs';
import { DEMO_SPIN_VOUCHER_VALUE } from '../src/domain/demo-vouchers.mjs';
import { knownEvolutionOptions } from '../src/server/evolution.mjs';
import { STUDY_TIERS, STUDY_EVOLUTIONS } from './data/kanto-estudo.mjs';

// Execute com node scripts/simular-progressao-v1.mjs.
// As alternativas servem para comparar efeitos. Todas mantêm saldo acumulável.
const PLAYERS = 1500;
const MAX_DAYS = 365;
const SEED = 123456789;
const INITIAL_SPINS = 20;
const DAILY_SPINS = 10;
const SPECIES_COUNT = 151;
const symbols = ['pokeball', 'spin', 'voucher'];
const tierBySpecies = new Map(STUDY_TIERS.flatMap(({ speciesIds }, tier) => speciesIds.map((id) => [id, tier])));
const redemptionPriority = [...tierBySpecies.keys()].sort(bestTargetFirst);
const base = {
  weights: [70, 22, 7, 1],
  shiny: 0.005,
  spinsPerLine: 2,
  duplicate: [1, 1, 2, 3],
  shinyDuplicateMultiplier: 2,
  spinVoucherValue: DEMO_SPIN_VOUCHER_VALUE,
  voucherShare: [1 / 3, 1 / 3, 1 / 3],
  recipes: knownEvolutionOptions(),
  roundsPerDay: 25,
};
const scenarios = [
  ['cinco-vales-prova', { voucherShare: [0.2, 0.2, 0.2] }],
  ['tres-vales-iguais', {}],
  ['50-pokemon-30-pedra-20-giros', { voucherShare: [0.5, 0.3, 0.2] }],
  ['30-pokemon-50-pedra-20-giros', { voucherShare: [0.3, 0.5, 0.2] }],
  ['sem-evolucao', { recipes: [] }],
  ['72-receitas-em-estudo', { recipes: STUDY_EVOLUTIONS }],
  ['72-receitas-50-pokemon-30-pedra-20-giros', { recipes: STUDY_EVOLUTIONS, voucherShare: [0.5, 0.3, 0.2] }],
  ['72-receitas-30-pokemon-50-pedra-20-giros', { recipes: STUDY_EVOLUTIONS, voucherShare: [0.3, 0.5, 0.2] }],
  ['raridade-70-23-6-1', { weights: [70, 23, 6, 1] }],
  ['raridade-65-25-9-1', { weights: [65, 25, 9, 1] }],
  ['shiny-1-porcento', { shiny: 0.01 }],
  ['repetido-shiny-sem-dobrar', { shinyDuplicateMultiplier: 1 }],
  ['repetidos-1-1-1-2', { duplicate: [1, 1, 1, 2] }],
  ['linha-de-giro-paga-1', { spinsPerLine: 1 }],
  ['vale-de-giros-paga-1', { spinVoucherValue: 1 }],
  ['ritmo-de-15-rodadas', { roundsPerDay: 15 }],
  ['72-receitas-e-15-rodadas', { recipes: STUDY_EVOLUTIONS, roundsPerDay: 15 }],
  ['72-receitas-sem-dragonite', { recipes: STUDY_EVOLUTIONS.filter(({ targetId }) => targetId !== 149) }],
];

function bestTargetFirst(a, b) {
  return tierBySpecies.get(b) - tierBySpecies.get(a) || a - b;
}

// Três posições visíveis de um rolo embaralhado são uma amostra ordenada sem
// reposição. Enumere essas amostras para preservar a correlação entre as linhas.
function roundDistribution() {
  const counts = Object.fromEntries(symbols.map((symbol) => [symbol, REEL.filter((item) => item === symbol).length]));
  const columns = symbols.flatMap((top) => symbols.flatMap((center) => symbols.map((bottom) => {
    const remaining = { ...counts };
    const weight = remaining[top]-- * remaining[center]-- * remaining[bottom]--;
    return { top, center, bottom, weight };
  })));
  const frequencies = new Map();
  for (const left of columns) {
    for (const center of columns) {
      for (const right of columns) {
        const grid = ['top', 'center', 'bottom'].map((row) => [left[row], center[row], right[row]]);
        const wins = findWinningLines(grid);
        const counts = symbols.map((symbol) => wins.filter((win) => win.symbol === symbol).length);
        const key = counts.join(',');
        const weight = left.weight * center.weight * right.weight;
        const outcome = frequencies.get(key) ?? { counts, weight: 0 };
        outcome.weight += weight;
        frequencies.set(key, outcome);
      }
    }
  }
  const total = (REEL.length * (REEL.length - 1) * (REEL.length - 2)) ** 3;
  let cumulative = 0;
  const distribution = [...frequencies.values()].sort((a, b) => b.weight - a.weight).map(({ counts, weight }) => {
    cumulative += weight;
    return { counts, probability: weight / total, boundary: cumulative / total };
  });
  if (cumulative !== total) throw new Error('Distribuição de rodadas incompleta');
  return distribution;
}

const rounds = roundDistribution();
const [meanCaptureLines, meanSpinLines, meanVoucherLines] = symbols.map((_, index) => rounds.reduce(
  (total, outcome) => total + outcome.probability * outcome.counts[index], 0,
));

function createRandom(player) {
  let state = (SEED ^ Math.imul(player + 1, 0x9e3779b9)) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function simulatePlayer(player, config) {
  const random = createRandom(player);
  const normal = new Uint8Array(SPECIES_COUNT + 1);
  const shiny = new Uint8Array(SPECIES_COUNT + 1);
  const milestones = { half: null, finalStretch: null, completed: null, firstShiny: null };
  const sourceCounts = { capture: 0, evolution: 0, redemption: 0 };
  const spinRewards = { paylines: 0, duplicates: 0, vouchers: 0 };
  const phases = [0, 1, 2].map(() => ({ days: 0, rounds: 0, newSpecies: 0 }));
  let species = 0;
  let balance = INITIAL_SPINS;
  let pokemonVouchers = 0;
  let stoneVouchers = 0;
  let totalRounds = 0;
  let firstDayRounds = 0;
  let shinyCaptures = 0;
  let cappedDays = 0;
  let redemptionCursor = 0;

  const knows = (id) => normal[id] || shiny[id];
  function register(id, isShiny, source) {
    if (!knows(id)) {
      species += 1;
      sourceCounts[source] += 1;
    }
    (isShiny ? shiny : normal)[id] = 1;
  }

  for (let day = 1; day <= MAX_DAYS && species < SPECIES_COUNT; day += 1) {
    if (day > 1) balance += DAILY_SPINS;
    const startingSpecies = species;
    const phase = phases[species < 75 ? 0 : species < 145 ? 1 : 2];
    let played = 0;
    while (balance > 0 && played < config.roundsPerDay && species < SPECIES_COUNT) {
      const ticket = random();
      const [captures, spinLines, voucherLines] = rounds.find(({ boundary }) => ticket < boundary).counts;
      played += 1;
      balance -= 1;
      const spinLineCredit = spinLines * config.spinsPerLine;
      balance += spinLineCredit;
      spinRewards.paylines += spinLineCredit;
      for (let count = 0; count < captures; count += 1) {
        const ticket = random() * 100;
        let tier = 0;
        let boundary = config.weights[0];
        while (ticket >= boundary) boundary += config.weights[++tier];
        const pool = STUDY_TIERS[tier].speciesIds;
        const id = pool[Math.floor(random() * pool.length)];
        const isShiny = random() < config.shiny;
        if (isShiny) {
          shinyCaptures += 1;
          milestones.firstShiny ??= day;
        }
        if ((isShiny ? shiny : normal)[id]) {
          const credit = config.duplicate[tier] * (isShiny ? config.shinyDuplicateMultiplier : 1);
          balance += credit;
          spinRewards.duplicates += credit;
        } else {
          register(id, isShiny, 'capture');
        }
      }
      const [pokemonShare, stoneShare, spinShare] = config.voucherShare;
      for (let count = 0; count < voucherLines; count += 1) {
        const ticket = random();
        if (ticket < pokemonShare) pokemonVouchers += 1;
        else if (ticket < pokemonShare + stoneShare) stoneVouchers += 1;
        else if (ticket < pokemonShare + stoneShare + spinShare) {
          balance += config.spinVoucherValue;
          spinRewards.vouchers += config.spinVoucherValue;
        }
      }

      // Política simulada: guardar para a espécie inédita mais rara. A variante
      // normal de uma shiny possuída é resgatável, mas não avança a meta de Kanto.
      while (pokemonVouchers > 0 && redemptionCursor < redemptionPriority.length) {
        const id = redemptionPriority[redemptionCursor];
        if (!knows(id)) {
          const { cost } = demoRedemptionDetails(id);
          if (pokemonVouchers < cost) break;
          pokemonVouchers -= cost;
          register(id, false, 'redemption');
        }
        redemptionCursor += 1;
      }
      // Guardar o vale pedra até existir uma opção útil e escolher a pedra
      // compatível. A origem fica registrada e o destino herda sua variante.
      while (stoneVouchers > 0) {
        const recipe = config.recipes.find(({ sourceId, targetId }) => knows(sourceId) && !knows(targetId));
        if (!recipe) break;
        stoneVouchers -= 1;
        register(recipe.targetId, !normal[recipe.sourceId], 'evolution');
      }
    }
    totalRounds += played;
    if (day === 1) firstDayRounds = played;
    phase.days += 1;
    phase.rounds += played;
    phase.newSpecies += species - startingSpecies;
    if (played === config.roundsPerDay && balance > 0) cappedDays += 1;
    if (species >= 75) milestones.half ??= day;
    if (species >= 145) milestones.finalStretch ??= day;
    if (species === SPECIES_COUNT) milestones.completed = day;
  }
  return { milestones, sourceCounts, spinRewards, phases, totalRounds, firstDayRounds, cappedDays, shinyCaptures };
}

function quantile(values, percentile) {
  const rank = Math.ceil(values.length * percentile) - 1;
  return values.map((day) => day ?? Infinity).sort((a, b) => a - b)[rank];
}

for (const [name, changes] of scenarios) {
  const config = { ...base, ...changes };
  config.recipes = [...config.recipes].sort((a, b) => bestTargetFirst(a.targetId, b.targetId) || a.sourceId - b.sourceId);
  const players = Array.from({ length: PLAYERS }, (_, index) => simulatePlayer(index, config));
  const sum = (read) => players.reduce((total, player) => total + read(player), 0);
  const rounded = (value) => Number(value.toFixed(2));
  const medal = (key, percentile = 0.5) => quantile(players.map(({ milestones }) => milestones[key]), percentile);
  const percentageBy = (key, day) => rounded(100 * sum(({ milestones }) => Number((milestones[key] ?? Infinity) <= day)) / PLAYERS);
  const totalRounds = sum((player) => player.totalRounds);
  // Retorno médio de giros no cenário extremo em que toda captura é repetida.
  const maxMeanRefund = meanSpinLines * config.spinsPerLine
    + meanCaptureLines * config.weights.reduce((total, weight, tier) => total + weight * config.duplicate[tier] / 100, 0)
      * (1 + config.shiny * (config.shinyDuplicateMultiplier - 1))
    + meanVoucherLines * config.voucherShare[2] * config.spinVoucherValue;
  const phaseRates = (index) => {
    const days = sum(({ phases }) => phases[index].days);
    return {
      roundsPerDay: rounded(sum(({ phases }) => phases[index].rounds) / days),
      newSpeciesPerDay: rounded(sum(({ phases }) => phases[index].newSpecies) / days),
    };
  };
  console.log(JSON.stringify({
    scenario: name, players: PLAYERS, horizonDays: MAX_DAYS, seed: SEED, initialSpins: INITIAL_SPINS, dailySpins: DAILY_SPINS,
    parameters: { ...config, recipes: config.recipes.length },
    medianDays: { at75: medal('half'), at145: medal('finalStretch'), at151: medal('completed') },
    p90DaysTo151: medal('completed', 0.9),
    percentageCompleteBy90Days: percentageBy('completed', 90),
    percentageCompleteBy180Days: percentageBy('completed', 180),
    medianDayOfFirstShiny: medal('firstShiny'),
    meanShinyCapturesUntilStop: rounded(sum((player) => player.shinyCaptures) / PLAYERS),
    meanSpeciesViaEvolution: rounded(sum(({ sourceCounts }) => sourceCounts.evolution) / PLAYERS),
    meanSpeciesViaRedemption: rounded(sum(({ sourceCounts }) => sourceCounts.redemption) / PLAYERS),
    firstDayRounds: { median: quantile(players.map((player) => player.firstDayRounds), 0.5), p90: quantile(players.map((player) => player.firstDayRounds), 0.9) },
    maxMeanRefundPer100Rounds: rounded(100 * maxMeanRefund),
    spinRewardsPer100Rounds: Object.fromEntries(['paylines', 'duplicates', 'vouchers'].map((source) =>
      [source, rounded(100 * sum(({ spinRewards }) => spinRewards[source]) / totalRounds)])),
    cappedDaysPercentage: rounded(100 * sum((player) => player.cappedDays) / sum(({ phases }) => phases.reduce((days, phase) => days + phase.days, 0))),
    phases: { before75: phaseRates(0), from75To144: phaseRates(1), from145To150: phaseRates(2) },
  }));
}
