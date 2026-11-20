import { REEL } from './reels.mjs';

// Identifica três símbolos iguais sem decidir o prêmio da rodada.
export function matchingSymbol(symbols) {
  if (!Array.isArray(symbols) || symbols.length !== 3) {
    throw new TypeError('Expected exactly three reel symbols');
  }
  const [first, second, third] = symbols;
  if (![first, second, third].every((symbol) => REEL.includes(symbol))) {
    throw new RangeError('Unknown reel symbol');
  }

  return first === second && first === third ? first : null;
}
