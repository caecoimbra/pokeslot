// Estudo local reproduzível: nenhum parâmetro hipotético define a regra do jogo.
const SESSIONS = 2000;
const MAX_ROUNDS = 1000;
const SEED = 123456789;
const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const TIERS = [[0, 90], [90, 40], [130, 15], [145, 6]];
const DUPLICATE_REWARDS = [1, 1, 2, 3];

// PRNG para comparação reproduzível, não para sorteios reais do jogo.
function createRandom(session) {
  let state = (SEED ^ Math.imul(session + 1, 0x9e3779b9)) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function simulateSession(initialBalance, ownedCount, voucherValue, session) {
  const random = createRandom(session);
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
  let spinVouchers = 0;

  function drawReel() {
    const remaining = [10, 6, 4];
    return Array.from({ length: 3 }, (_, index) => {
      const value = draw(20 - index);
      const symbol = value < remaining[0] ? 0 : value < remaining[0] + remaining[1] ? 1 : 2;
      remaining[symbol] -= 1;
      return symbol;
    });
  }

  while (balance > 0 && rounds < MAX_ROUNDS) {
    balance -= 1;
    rounds += 1;
    const [first, second, third] = [drawReel(), drawReel(), drawReel()];
    for (const [a, b, c] of LINES) {
      const symbol = first[a];
      if (symbol !== second[b] || symbol !== third[c]) continue;
      if (symbol === 1) { balance += 2; continue; }
      if (symbol === 2) {
        // Cinco prêmios equiprováveis; só o vale de giros é aplicado aqui.
        if (draw(5) === 0) { spinVouchers += 1; balance += voucherValue; }
        continue;
      }
      const probability = random();
      const tier = probability < 0.70 ? 0 : probability < 0.93 ? 1 : probability < 0.99 ? 2 : 3;
      const [start, count] = TIERS[tier];
      const id = start + draw(count);
      const isShiny = random() < 0.01;
      const collection = isShiny ? shiny : normal;
      if (collection.has(id)) balance += DUPLICATE_REWARDS[tier] * (isShiny ? 2 : 1);
      else collection.add(id);
    }
  }
  return { rounds, spinVouchers, truncated: balance > 0 };
}

const stages = [
  { stage: 'inicio', initialBalance: 20, owned: 0 },
  { stage: 'meio', initialBalance: 10, owned: 75 },
  { stage: 'fim', initialBalance: 10, owned: 145 },
];
for (const { stage, initialBalance, owned } of stages) {
  for (const voucherValue of [0, 2, 5, 10]) {
    // Cada sessão usa a mesma semente em todos os valores até as trajetórias divergirem.
    const sessions = Array.from({ length: SESSIONS }, (_, session) =>
      simulateSession(initialBalance, owned, voucherValue, session));
    const lengths = sessions.map(({ rounds }) => rounds).sort((a, b) => a - b);
    const capped = sessions.filter(({ truncated }) => truncated).length;
    const averageVouchers = sessions.reduce((sum, item) => sum + item.spinVouchers, 0) / SESSIONS;
    console.log(JSON.stringify({
      stage, initialBalance, owned, voucherValue,
      median: lengths[999], p90: lengths[1799], capped,
      averageSpinVouchers: Number(averageVouchers.toFixed(3)),
    }));
  }
}
