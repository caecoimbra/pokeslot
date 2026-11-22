import { findWinningLines } from '../domain/paylines.mjs';
import { rewardTypesForLines } from '../domain/rewards.mjs';
import { getKantoCollectionProgress } from '../domain/collection-progress.mjs';

export function validateProofState(state) {
  if (!Number.isSafeInteger(state?.balance) || state.balance < 0 || !Array.isArray(state.ownedVariants)) throw new Error('invalid_state');
  getKantoCollectionProgress(state.ownedVariants);
  return state;
}
export function validateProofRound(result) {
  if (result?.status === 'no_balance' && typeof result.replayed === 'boolean') return result;
  if (result?.status !== 'ok' || typeof result.replayed !== 'boolean') throw new Error('invalid_round');
  const wins = findWinningLines(result.grid);
  if (JSON.stringify(wins) !== JSON.stringify(result.winningLines)) throw new Error('invalid_round');
  const captureLines = rewardTypesForLines(wins).filter((reward) => reward.type === 'pokemon');
  if (!Array.isArray(result.captures) || result.captures.length !== captureLines.length) throw new Error('invalid_captures');
  result.captures.forEach((entry, index) => {
    const capture = entry?.capture;
    if (entry.line !== captureLines[index].line || !['new', 'duplicate'].includes(entry.status) ||
      !Number.isInteger(capture?.speciesId) || capture.speciesId < 1 || capture.speciesId > 151 ||
      typeof capture.isShiny !== 'boolean' || !['common', 'uncommon', 'rare', 'legendary'].includes(capture.rarity)) throw new Error('invalid_capture');
  });
  return result;
}
