import { randomInt } from 'node:crypto';
import { createReelRound } from '../domain/reels.mjs';
import { findWinningLines, visibleGridFromReels } from '../domain/paylines.mjs';

// Uso exclusivo no servidor: o navegador não escolhe a aleatoriedade da rodada.
// O Node sorteia um inteiro de 0 até o limite informado, sem incluí-lo.
export function createSecureReelRound() {
  return createReelRound(randomInt);
}

// Monta e avalia a grade. A execução de uma rodada com saldo e recompensas
// ainda precisará de autenticação, persistência e proteção contra repetição.
export function createEvaluatedReelRound() {
  const reels = createSecureReelRound();
  const grid = visibleGridFromReels(reels);
  const winningLines = findWinningLines(grid);

  return { reels, grid, winningLines };
}
