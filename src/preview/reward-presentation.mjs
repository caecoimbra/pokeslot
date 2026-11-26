import { rewardTypesForLines } from '../domain/rewards.mjs';

// A linha de giros informa apenas o total da rodada; não o dividimos por linha.
export function buildRewardPresentations({ wins, captures, vouchers, lineSpins, authenticated }) {
  const rewards = rewardTypesForLines(wins);
  const result = [];
  let spinsShown = false;
  for (const reward of rewards) {
    if (reward.type === 'pokemon') {
      const entry = captures.find((item) => item.line === reward.line);
      if (entry) result.push({ kind: 'capture', ...entry, pokemonId: entry.capture.speciesId, shiny: entry.capture.isShiny, authenticated });
    } else if (reward.type === 'voucher') {
      const entry = Array.isArray(vouchers) ? vouchers.find((item) => item.line === reward.line) : null;
      result.push({ kind: 'voucher', line: reward.line, ...entry });
    } else if (!spinsShown) {
      spinsShown = true;
      result.push({ kind: 'spins', lines: rewards.filter((item) => item.type === 'extra_spins').map((item) => item.line),
        amount: authenticated && Number.isSafeInteger(lineSpins) && lineSpins >= 0 ? lineSpins : null, authenticated });
    }
  }
  return result;
}
