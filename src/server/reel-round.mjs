import { randomInt } from 'node:crypto';
import { createReelRound } from '../domain/reels.mjs';

// Uso exclusivo no servidor: o navegador não escolhe a aleatoriedade da rodada.
// O Node sorteia um inteiro de 0 até o limite informado, sem incluí-lo.
export function createSecureReelRound() {
  return createReelRound(randomInt);
}
