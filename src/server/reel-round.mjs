import { randomInt } from 'node:crypto';
import { createReelRound } from '../domain/reels.mjs';
import { findWinningLines, visibleGridFromReels } from '../domain/paylines.mjs';
import { rewardTypesForLines } from '../domain/rewards.mjs';
import { evaluateRoundCaptures } from '../domain/round-captures.mjs';

// Uso exclusivo no servidor: o navegador não escolhe a aleatoriedade da rodada.
// O Node sorteia um inteiro de 0 até o limite informado, sem incluí-lo.
export function createSecureReelRound() {
  return createReelRound(randomInt);
}

// A Function envia a grade avaliada para a transação que registra a rodada.
export function createEvaluatedReelRound() {
  return evaluateReelRound(createSecureReelRound());
}

function evaluateReelRound(reels) {
  const grid = visibleGridFromReels(reels);
  const winningLines = findWinningLines(grid);
  const rewardTypes = rewardTypesForLines(winningLines);

  return { reels, grid, winningLines, rewardTypes };
}

// Composição ainda experimental: o seletor e os rolos devem vir do servidor.
// Não autentica, debita saldo nem grava recompensas ou capturas.
export function evaluateReelRoundCaptures(reels, selectCapture, ownedVariants) {
  if (typeof selectCapture !== 'function') throw new TypeError('A capture selector is required');
  const round = evaluateReelRound(reels);
  const captures = round.rewardTypes
    .filter(({ type }) => type === 'pokemon')
    .map(({ line }) => selectCapture(line));
  return { ...round, captures: evaluateRoundCaptures(round.rewardTypes, captures, ownedVariants) };
}
