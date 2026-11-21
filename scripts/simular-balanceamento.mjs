// Cenários de estudo, não configurações aprovadas para o jogo.
const SESSIONS = 2000;
const MAX_ROUNDS = 1000;
const SEED = 123456789;
const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const TIERS = [[0, 90], [90, 40], [130, 15], [145, 6]];
const TABLES = [
  ['A', { spin: 1, duplicate: [1, 1, 1, 1] }],
  ['B', { spin: 1, duplicate: [1, 2, 3, 4] }],
  ['C', { spin: 2, duplicate: [1, 1, 2, 3] }],
];

// Gerador reproduzível para estudo, sem uso na aleatoriedade do jogo.
function createRandom() {
  let state = SEED;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function simulateSession(initialBalance, ownedCount, table, random) {
  const draw = (limit) => Math.floor(random() * limit);
  const ids = Array.from({ length: 151 }, (_, index) => index);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const other = draw(index + 1);
    [ids[index], ids[other]] = [ids[other], ids[index]];
  }
  const normal = new Set(ids.slice(0, ownedCount));
  const shiny = new Set();
  let balance = initialBalance;
  let rounds = 0;

  function reel() {
    const counts = [10, 6, 4];
    return Array.from({ length: 3 }, (_, index) => {
      const value = draw(20 - index);
      const symbol = value < counts[0] ? 0 : value < counts[0] + counts[1] ? 1 : 2;
      counts[symbol] -= 1;
      return symbol;
    });
  }

  while (balance > 0 && rounds < MAX_ROUNDS) {
    balance -= 1;
    rounds += 1;
    const [first, second, third] = [reel(), reel(), reel()];
    for (const [a, b, c] of LINES) {
      const symbol = first[a];
      if (symbol !== second[b] || symbol !== third[c]) continue;
      if (symbol === 1) { balance += table.spin; continue; }
      if (symbol !== 0) continue; // Vales ainda não têm efeito definido.
      const probability = random();
      const tier = probability < 0.70 ? 0 : probability < 0.93 ? 1 : probability < 0.99 ? 2 : 3;
      const [start, count] = TIERS[tier];
      const id = start + draw(count);
      const isShiny = random() < 0.01;
      const collection = isShiny ? shiny : normal;
      if (collection.has(id)) balance += table.duplicate[tier] * (isShiny ? 2 : 1);
      else collection.add(id);
    }
  }
  return { rounds, truncated: balance > 0 };
}

for (const initial of [20, 10]) {
  for (const owned of [0, 75, 145]) {
    for (const [name, table] of TABLES) {
      const random = createRandom();
      const results = Array.from({ length: SESSIONS }, () => simulateSession(initial, owned, table, random));
      results.sort((a, b) => a.rounds - b.rounds);
      console.log(JSON.stringify({
        initial, owned, table: name,
        median: results[999].rounds,
        p90: results[1799].rounds,
        truncated: results.filter((result) => result.truncated).length,
      }));
    }
  }
}
