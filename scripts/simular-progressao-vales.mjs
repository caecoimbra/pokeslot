import { STUDY_TIERS, STUDY_EVOLUTIONS } from './data/kanto-estudo.mjs';

// Estudo hipotético: os dados e as estratégias abaixo não definem o jogo.
// Execução: node scripts/simular-progressao-vales.mjs
const PLAYERS = 1000;
const MAX_DAYS = 730;
const ROUNDS_PER_DAY = 25; // Ritmo de teste, NÃO limite do jogo.
const SEED = 123456789;
const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const WEIGHTS = [70, 23, 6, 1]; // Hipótese: comum, incomum, raro, lendário.
const DUPLICATE_REWARDS = [1, 1, 2, 3];
const LABELS = ['capture_only', 'voucher', 'voucher_and_evolution'];
const tierBySpecies = new Map();

if (STUDY_TIERS.length !== 4 || STUDY_EVOLUTIONS.length !== 72) throw new Error('Invalid study data size');
const expectedTiers = [['common', 50], ['uncommon', 61], ['rare', 34], ['legendary', 6]];
for (const [tier, group] of STUDY_TIERS.entries()) {
  if (group.rarity !== expectedTiers[tier][0] || group.speciesIds.length !== expectedTiers[tier][1]) {
    throw new Error('Invalid study tier');
  }
  for (const id of group.speciesIds) {
    if (!Number.isInteger(id) || id < 1 || id > 151 || tierBySpecies.has(id)) throw new Error('Invalid study species');
    tierBySpecies.set(id, tier);
  }
}
if (tierBySpecies.size !== 151) throw new Error('Incomplete study species');
const edges = new Set();
for (const edge of STUDY_EVOLUTIONS) {
  const key = `${edge.sourceId}:${edge.targetId}`;
  if (!tierBySpecies.has(edge.sourceId) || !tierBySpecies.has(edge.targetId) ||
      edge.sourceId === edge.targetId || typeof edge.stone !== 'string' || !edge.stone || edges.has(key)) {
    throw new Error('Invalid study evolution');
  }
  edges.add(key);
}

// Gerador reproduzível usado somente no estudo, não no sorteio do jogo.
function createRandom(player) {
  let state = (SEED ^ Math.imul(player + 1, 0x9e3779b9)) >>> 0;
  return (max) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * max);
  };
}

function simulatePlayer(mode, player) {
  const draw = createRandom(player);
  const normal = new Set();
  const shiny = new Set();
  const stones = new Map();
  let balance = 20;
  let pokemonVouchers = 0;
  let totalRounds = 0;
  let cappedDays = 0;
  let gainedVouchers = 0;
  let usedVouchers = 0;
  let gainedStones = 0;
  let usedStones = 0;
  const completedVia = { capture: 0, voucher: 0, evolution: 0 };

  function knows(id) { return normal.has(id) || shiny.has(id); }
  function register(id, isShiny, method) {
    const newSpecies = !knows(id);
    (isShiny ? shiny : normal).add(id);
    if (newSpecies) completedVia[method] += 1;
  }
  function countSpecies() { return completedVia.capture + completedVia.voucher + completedVia.evolution; }

  function reel() {
    const counts = [10, 6, 4];
    return Array.from({ length: 3 }, (_, index) => {
      const x = draw(20 - index);
      const symbol = x < counts[0] ? 0 : x < counts[0] + counts[1] ? 1 : 2;
      counts[symbol] -= 1;
      return symbol;
    });
  }

  // Estratégia hipotética: guardar até poder escolher um Pokémon ainda ausente
  // do tier mais alto; desempate por ID. Uma shiny já conta como espécie obtida.
  function redeemVouchers() {
    for (let tier = STUDY_TIERS.length - 1; tier >= 0; tier -= 1) {
      const missing = STUDY_TIERS[tier].speciesIds.find((id) => !knows(id));
      if (missing === undefined) continue;
      const cost = tier + 1;
      if (pokemonVouchers < cost) return;
      pokemonVouchers -= cost;
      usedVouchers += cost;
      register(missing, false, 'voucher');
      return redeemVouchers();
    }
  }

  // Hipótese de teste: qualquer origem registrada é reutilizável; só Eevee
  // tem essa regra explicitamente acordada para o jogo. Não simula exemplares.
  function eligibleEvolutions() {
    const candidates = [];
    for (const edge of STUDY_EVOLUTIONS) {
      if (knows(edge.targetId)) continue; // Estratégia prioriza novas espécies.
      for (const isShiny of [false, true]) {
        const collection = isShiny ? shiny : normal;
        if (collection.has(edge.sourceId) && !collection.has(edge.targetId)) candidates.push({ ...edge, isShiny });
      }
    }
    return candidates.sort((a, b) => tierBySpecies.get(b.targetId) - tierBySpecies.get(a.targetId) ||
      a.targetId - b.targetId || a.sourceId - b.sourceId || Number(a.isShiny) - Number(b.isShiny));
  }

  // Ao receber o vale pedra, o jogador simulado escolhe a pedra para a evolução
  // elegível mais prioritária; sem candidata, escolhe água arbitrariamente.
  function chooseStone() { return eligibleEvolutions()[0]?.stone ?? 'water'; }
  function useStones() {
    while (true) {
      const next = eligibleEvolutions().find(({ stone }) => (stones.get(stone) ?? 0) > 0);
      if (!next) break;
      stones.set(next.stone, stones.get(next.stone) - 1);
      usedStones += 1;
      register(next.targetId, next.isShiny, 'evolution');
    }
  }

  for (let day = 1; day <= MAX_DAYS; day += 1) {
    if (day > 1) balance += 10;
    let rounds = 0;
    while (balance > 0 && rounds < ROUNDS_PER_DAY && countSpecies() < 151) {
      balance -= 1;
      rounds += 1;
      totalRounds += 1;
      const [first, second, third] = [reel(), reel(), reel()];
      for (const [a, b, c] of LINES) {
        const symbol = first[a];
        if (symbol !== second[b] || symbol !== third[c]) continue;
        if (symbol === 1) { balance += 2; continue; }
        if (symbol === 2) {
          const prize = draw(5); // Cinco categorias iguais: hipótese de teste.
          if (prize === 0) balance += 2; // Vale de giros provisório.
          if (prize === 1 && mode !== 'capture_only') { pokemonVouchers += 1; gainedVouchers += 1; }
          if (prize === 2 && mode === 'voucher_and_evolution') {
            const stone = chooseStone();
            stones.set(stone, (stones.get(stone) ?? 0) + 1);
            gainedStones += 1;
          }
          continue; // Vale de tipo e amuleto shiny ainda não são modelados.
        }
        const ticket = draw(100);
        let tier = 0;
        let boundary = WEIGHTS[0];
        while (ticket >= boundary) { tier += 1; boundary += WEIGHTS[tier]; }
        const pool = STUDY_TIERS[tier].speciesIds;
        const id = pool[draw(pool.length)];
        const isShiny = draw(100) === 0; // 1% ilustrativo; duplicata shiny 2×.
        const collection = isShiny ? shiny : normal;
        if (collection.has(id)) balance += DUPLICATE_REWARDS[tier] * (isShiny ? 2 : 1);
        else register(id, isShiny, 'capture');
      }
      // A sessão de teste usa itens assim que possível, depois da rodada inteira.
      if (mode !== 'capture_only') redeemVouchers();
      if (mode === 'voucher_and_evolution') useStones();
    }
    if (countSpecies() === 151) return { completed: true, day, totalRounds, cappedDays, completedVia, gainedVouchers, usedVouchers, gainedStones, usedStones };
    if (balance > 0 && rounds === ROUNDS_PER_DAY) cappedDays += 1;
  }
  return { completed: false, day: MAX_DAYS, totalRounds, cappedDays, completedVia, gainedVouchers, usedVouchers, gainedStones, usedStones };
}

for (const mode of LABELS) {
  const results = Array.from({ length: PLAYERS }, (_, player) => simulatePlayer(mode, player));
  const completed = results.filter((result) => result.completed).sort((a, b) => a.day - b.day);
  const mean = (select) => Number((results.reduce((sum, value) => sum + select(value), 0) / PLAYERS).toFixed(2));
  console.log(JSON.stringify({
    mode, players: PLAYERS, maxDays: MAX_DAYS, roundsPerDay: ROUNDS_PER_DAY,
    completed: completed.length, censored: PLAYERS - completed.length,
    medianDays: completed.length >= PLAYERS / 2 ? completed[PLAYERS / 2 - 1].day : null,
    p90Days: completed.length >= PLAYERS * 0.9 ? completed[PLAYERS * 0.9 - 1].day : null,
    meanSpeciesViaCapture: mean((result) => result.completedVia.capture),
    meanSpeciesViaVoucher: mean((result) => result.completedVia.voucher),
    meanSpeciesViaEvolution: mean((result) => result.completedVia.evolution),
    meanVouchersGained: mean((result) => result.gainedVouchers),
    meanVouchersSpent: mean((result) => result.usedVouchers),
    meanStonesGained: mean((result) => result.gainedStones),
    meanStonesSpent: mean((result) => result.usedStones),
    playersWithCappedDays: results.filter((result) => result.cappedDays > 0).length,
  }));
}
