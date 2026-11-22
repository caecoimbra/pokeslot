// A espécie e a raridade são valores fixos apenas para a demonstração local;
// não representam um sorteio ou uma classificação aprovada do jogo.
export function createDemoCaptures(rewardTypes) {
  return rewardTypes
    .filter(({ type }) => type === 'pokemon')
    .map(() => ({ speciesId: 25, isShiny: false, rarity: 'common' }));
}
