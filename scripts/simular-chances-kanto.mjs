// Estudo hipotético reproduzível: não representa as regras finais do PokéSlot.
// Não modela evoluções, resgates, uso de vales de tipo, pedras ou amuleto shiny.
const PLAYERS = 1000;
const MAX_DAYS = 730;
// Limite diário é apenas hipótese de comportamento; saldo remanescente se acumula.
const MAX_ROUNDS_PER_DAY = process.argv[2] === undefined ? 500 : Number(process.argv[2]);
if (!Number.isSafeInteger(MAX_ROUNDS_PER_DAY) || MAX_ROUNDS_PER_DAY < 1) {
  throw new RangeError('O limite diário deve ser um inteiro positivo');
}
const SEED = 123456789;
const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const TIERS = [[0, 50], [50, 61], [111, 34], [145, 6]];
const DUPLICATE_REWARDS = [1, 1, 2, 3];
const SCENARIOS = [
  { label: '70/23/6/1', weights: [70, 23, 6, 1] },
  { label: '60/25/12/3', weights: [60, 25, 12, 3] },
  { label: '50/30/15/5', weights: [50, 30, 15, 5] },
];

// Gerador exclusivamente para reproduzir o estudo; não usar no jogo.
function createRandom(player) {
  let state = (SEED ^ Math.imul(player + 1, 0x9e3779b9)) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function simulatePlayer(weights, player) {
  const random = createRandom(player);
  const draw = (limit) => Math.floor(random() * limit);
  const normal = new Uint8Array(151);
  const shiny = new Uint8Array(151);
  const thresholds = [weights[0], weights[0] + weights[1], weights[0] + weights[1] + weights[2]];
  let ownedNormal = 0;
  let balance = 20;
  let cappedDays = 0;
  let totalRounds = 0;

  function reel() {
    const remaining = [10, 6, 4];
    return Array.from({ length: 3 }, (_, index) => {
      const value = draw(20 - index);
      const symbol = value < remaining[0] ? 0 : value < remaining[0] + remaining[1] ? 1 : 2;
      remaining[symbol] -= 1;
      return symbol;
    });
  }

  for (let day = 1; day <= MAX_DAYS; day += 1) {
    if (day > 1) balance += 10;
    let rounds = 0;
    while (balance > 0 && rounds < MAX_ROUNDS_PER_DAY && ownedNormal < 151) {
      balance -= 1;
      rounds += 1;
      totalRounds += 1;
      const [first, second, third] = [reel(), reel(), reel()];
      for (const [a, b, c] of LINES) {
        const symbol = first[a];
        if (symbol !== second[b] || symbol !== third[c]) continue;
        if (symbol === 1) { balance += 2; continue; }
        if (symbol === 2) {
          if (draw(5) === 0) balance += 2;
          continue;
        }
        const probability = draw(100);
        const tier = probability < thresholds[0] ? 0 : probability < thresholds[1] ? 1 : probability < thresholds[2] ? 2 : 3;
        const [start, count] = TIERS[tier];
        const id = start + draw(count);
        const isShiny = draw(100) === 0;
        const collection = isShiny ? shiny : normal;
        if (collection[id]) balance += DUPLICATE_REWARDS[tier] * (isShiny ? 2 : 1);
        else {
          collection[id] = 1;
          if (!isShiny) ownedNormal += 1;
        }
      }
    }
    if (ownedNormal === 151) return { days: day, totalRounds, cappedDays, completed: true };
    if (balance > 0 && rounds === MAX_ROUNDS_PER_DAY) cappedDays += 1;
  }
  return { days: MAX_DAYS, totalRounds, cappedDays, completed: false };
}

for (const { label, weights } of SCENARIOS) {
  const results = Array.from({ length: PLAYERS }, (_, index) => simulatePlayer(weights, index));
  const completed = results.filter((item) => item.completed).sort((a, b) => a.days - b.days);
  // Quantis só são apresentados quando já observados para toda a população simulada.
  const median = completed.length >= PLAYERS * 0.5 ? completed[PLAYERS / 2 - 1].days : null;
  const p90 = completed.length >= PLAYERS * 0.9 ? completed[PLAYERS * 0.9 - 1].days : null;
  const roundCounts = completed.map((item) => item.totalRounds).sort((a, b) => a - b);
  console.log(JSON.stringify({
    label, players: PLAYERS, maxDays: MAX_DAYS, maxRoundsPerDay: MAX_ROUNDS_PER_DAY,
    completed: completed.length, medianDays: median, p90Days: p90,
    playersWithCappedDays: results.filter((item) => item.cappedDays > 0).length,
    // Rodadas dos incompletos não têm o mesmo limite: só resumimos se todos concluírem.
    medianRounds: completed.length === PLAYERS ? roundCounts[PLAYERS / 2 - 1] : null,
    p90Rounds: completed.length === PLAYERS ? roundCounts[PLAYERS * 0.9 - 1] : null,
    meanCappedDays: Number((results.reduce((sum, item) => sum + item.cappedDays, 0) / PLAYERS).toFixed(2)),
    incomplete: PLAYERS - completed.length,
  }));
}
