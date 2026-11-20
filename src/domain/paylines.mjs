import { REEL } from './reels.mjs';
import { matchingSymbol } from './round-result.mjs';

// Cada entrada contém a linha da grade usada em cada um dos três rolos.
const PAYLINES = [
  { line: 'top', rows: [0, 0, 0] },
  { line: 'middle', rows: [1, 1, 1] },
  { line: 'bottom', rows: [2, 2, 2] },
  { line: 'diagonal_down', rows: [0, 1, 2] },
  { line: 'diagonal_up', rows: [2, 1, 0] },
];

// A posição sorteada fica no centro; as vizinhas aparecem acima e abaixo.
// Os rolos são circulares: as posições 19 e 0 são vizinhas.
export function visibleGridFromReels(round) {
  if (!Array.isArray(round) || round.length !== 3) {
    throw new TypeError('Expected exactly three reels');
  }
  const reels = [round[0], round[1], round[2]];
  for (const item of reels) {
    if (!item || !Array.isArray(item.reel) || item.reel.length !== REEL.length ||
        !Number.isInteger(item.position) || item.position < 0 || item.position >= REEL.length) {
      throw new RangeError('Invalid reel or stopping position');
    }
  }

  return [-1, 0, 1].map((offset) => reels.map(({ reel, position }) => {
    const index = (position + offset + REEL.length) % REEL.length;
    return reel[index];
  }));
}

// Cada linha é avaliada separadamente; não calcula valores nem concede prêmios.
export function findWinningLines(grid) {
  if (!Array.isArray(grid) || grid.length !== 3 ||
      ![grid[0], grid[1], grid[2]].every((row) => Array.isArray(row) && row.length === 3)) {
    throw new TypeError('Expected a grid of three rows and three columns');
  }

  const wins = [];
  for (const { line, rows } of PAYLINES) {
    const symbols = rows.map((row, column) => grid[row][column]);
    const symbol = matchingSymbol(symbols);
    if (symbol !== null) wins.push({ line, symbol });
  }
  return wins;
}
