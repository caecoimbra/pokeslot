// Enumeração didática das grades de 3×3; não define os prêmios finais do jogo.
const symbols = [10, 6, 4]; // Pokébola, giro e vale em cada rolo.
const lines = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const itemTypes = 5; // Hipótese: cinco prêmios equiprováveis por linha de vales.
const denominator = 20 * 19 * 18;
const reels = [];

for (let top = 0; top < symbols.length; top += 1) {
  for (let middle = 0; middle < symbols.length; middle += 1) {
    for (let bottom = 0; bottom < symbols.length; bottom += 1) {
      const remaining = [...symbols];
      const weight = remaining[top]-- * remaining[middle]-- * remaining[bottom]--;
      reels.push({ visible: [top, middle, bottom], probability: weight / denominator });
    }
  }
}

let meanVoucherLines = 0;
let chanceAnyVoucherLine = 0;
let chanceSpecificItem = 0;
for (const first of reels) {
  for (const second of reels) {
    for (const third of reels) {
      const probability = first.probability * second.probability * third.probability;
      const wins = lines.filter(([a, b, c]) =>
        first.visible[a] === 2 && second.visible[b] === 2 && third.visible[c] === 2
      ).length;
      meanVoucherLines += probability * wins;
      if (wins > 0) chanceAnyVoucherLine += probability;
      // Hipótese: cada linha vencedora sorteia o item de forma independente.
      chanceSpecificItem += probability * (1 - (1 - 1 / itemTypes) ** wins);
    }
  }
}

console.log(JSON.stringify({
  itemTypes,
  meanVoucherLinesPerRound: meanVoucherLines,
  chanceAnyVoucherLinePerRound: chanceAnyVoucherLine,
  meanSpecificItemPerRound: meanVoucherLines / itemTypes,
  chanceSpecificItemPerRound: chanceSpecificItem,
}, null, 2));
