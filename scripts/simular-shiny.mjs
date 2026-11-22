import { STUDY_TIERS } from './data/kanto-estudo.mjs';

// Comparação hipotética e reproduzível; não define as regras finais do jogo.
const PLAYERS = 3000;
const DAYS = 90;
const DAILY_ROUNDS = 25; // Ritmo simulado, nunca um limite do jogo.
const SEED = 246813579;
const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const WEIGHTS = [70, 22, 7, 1]; // Candidata, ainda não aprovada como regra final.
const DUPLICATE_REWARDS = [1, 1, 2, 3];

function createRandom(player) {
  let state = (SEED ^ Math.imul(player + 1, 0x9e3779b9)) >>> 0;
  return (max) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * max);
  };
}

function simulate(player, shinyChancePerTenThousand) {
  const draw = createRandom(player);
  const normal = new Set();
  const shiny = new Set();
  let balance = 20, firstDay = null, shinyCount = 0, shinyDuplicates = 0, rounds = 0, cappedDays = 0;
  let seenBy30 = false;
  function reel() {
    const counts = [10, 6, 4];
    return Array.from({ length: 3 }, (_, index) => {
      const ticket = draw(20 - index);
      const symbol = ticket < counts[0] ? 0 : ticket < counts[0] + counts[1] ? 1 : 2;
      counts[symbol]--;
      return symbol;
    });
  }
  for (let day = 1; day <= DAYS; day++) {
    if (day > 1) balance += 10;
    let daily = 0;
    while (balance > 0 && daily < DAILY_ROUNDS) {
      balance--; daily++; rounds++;
      const reels = [reel(), reel(), reel()];
      for (const [a, b, c] of LINES) {
        const symbol = reels[0][a];
        if (symbol !== reels[1][b] || symbol !== reels[2][c]) continue;
        if (symbol === 1) { balance += 2; continue; }
        if (symbol === 2) { if (draw(5) === 0) balance += 2; continue; }
        const ticket = draw(100);
        let tier = 0, threshold = WEIGHTS[0];
        while (ticket >= threshold) threshold += WEIGHTS[++tier];
        const pool = STUDY_TIERS[tier].speciesIds;
        const species = pool[draw(pool.length)];
        const isShiny = draw(10000) < shinyChancePerTenThousand;
        const collection = isShiny ? shiny : normal;
        if (isShiny) {
          shinyCount++;
          firstDay ??= day;
          if (day <= 30) seenBy30 = true;
        }
        if (collection.has(species)) {
          balance += DUPLICATE_REWARDS[tier] * (isShiny ? 2 : 1);
          if (isShiny) shinyDuplicates++;
        } else collection.add(species);
      }
    }
    if (daily === DAILY_ROUNDS && balance > 0) cappedDays++;
  }
  return { firstDay, seenBy30, shinyCount, shinyDuplicates, rounds, cappedDays };
}

for (const chance of [10, 50, 100]) {
  const results = Array.from({ length: PLAYERS }, (_, index) => simulate(index, chance));
  const firstDays = results.map((result) => result.firstDay).filter((day) => day !== null).sort((a, b) => a - b);
  const avg = (key) => +(results.reduce((sum, result) => sum + result[key], 0) / PLAYERS).toFixed(2);
  console.log(JSON.stringify({ chancePercent: chance / 100, players: PLAYERS,
    withoutShiny30Pct: +(100 * results.filter((r) => !r.seenBy30).length / PLAYERS).toFixed(1),
    withoutShiny90Pct: +(100 * (PLAYERS - firstDays.length) / PLAYERS).toFixed(1),
    medianFirstDay: firstDays.length >= PLAYERS / 2 ? firstDays[Math.ceil(PLAYERS / 2) - 1] : null,
    avgShinies: avg('shinyCount'), avgShinyDuplicates: avg('shinyDuplicates'), avgRounds: avg('rounds'),
    playersWithCappedDays: results.filter((r) => r.cappedDays > 0).length }));
}
