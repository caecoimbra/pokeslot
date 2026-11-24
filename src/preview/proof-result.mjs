import { findWinningLines } from '../domain/paylines.mjs';
import { rewardTypesForLines } from '../domain/rewards.mjs';
import { getKantoCollectionProgress } from '../domain/collection-progress.mjs';
import { DEMO_VOUCHER_TYPES } from '../domain/demo-vouchers.mjs';
import { DEMO_STONES } from '../server/evolution.mjs';

function validateInventory(entries, types) {
  if (!Array.isArray(entries)) throw new Error('invalid_inventory');
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || !types.includes(entry.type) || seen.has(entry.type) ||
        !Number.isSafeInteger(entry.amount) || entry.amount <= 0) throw new Error('invalid_inventory');
    seen.add(entry.type);
  }
}

export function validateProofState(state) {
  if (!Number.isSafeInteger(state?.balance) || state.balance < 0 || !Array.isArray(state.ownedVariants)) throw new Error('invalid_state');
  getKantoCollectionProgress(state.ownedVariants);
  // Respostas antigas podem não incluir inventários; campos presentes devem ser válidos.
  if (state.vouchers !== undefined) validateInventory(state.vouchers, DEMO_VOUCHER_TYPES.filter((type) => type !== 'spins'));
  if (state.stones !== undefined) validateInventory(state.stones, DEMO_STONES);
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
  // Rodadas registradas antes dos vales não têm esses campos e permanecem recuperáveis.
  if (result.vouchers !== undefined) {
    const lines = rewardTypesForLines(wins).filter(({ type }) => type === 'voucher').map(({ line }) => line);
    if (!Array.isArray(result.vouchers) || result.vouchers.length !== lines.length ||
        !Number.isSafeInteger(result.voucherSpins) || result.voucherSpins < 0) throw new Error('invalid_vouchers');
    let totalSpins = 0;
    const seen = new Set();
    for (const entry of result.vouchers) {
      if (!entry || !lines.includes(entry.line) || seen.has(entry.line) || !DEMO_VOUCHER_TYPES.includes(entry.type)) throw new Error('invalid_vouchers');
      seen.add(entry.line);
      if (entry.type === 'spins') {
        if (!Number.isSafeInteger(entry.spinsAwarded) || entry.spinsAwarded <= 0) throw new Error('invalid_vouchers');
        totalSpins += entry.spinsAwarded;
      }
    }
    if (totalSpins !== result.voucherSpins) throw new Error('invalid_vouchers');
  }
  return result;
}
