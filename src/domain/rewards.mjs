// Cada linha vencedora representa uma recompensa. Os valores e a seleção de
// Pokémon serão definidos em outra etapa, antes de alterar o progresso real.
const REWARD_BY_SYMBOL = Object.freeze({
  pokeball: 'pokemon',
  spin: 'extra_spins',
  voucher: 'voucher',
});

export function rewardTypesForLines(winningLines) {
  if (!Array.isArray(winningLines)) {
    throw new TypeError('Expected a list of winning lines');
  }

  return winningLines.map(({ line, symbol }) => {
    if (typeof line !== 'string' || !Object.hasOwn(REWARD_BY_SYMBOL, symbol)) {
      throw new RangeError('Invalid winning line');
    }
    return { line, type: REWARD_BY_SYMBOL[symbol] };
  });
}
