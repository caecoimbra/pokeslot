import { randomInt } from 'node:crypto';
import { STUDY_TIERS } from '../../scripts/data/kanto-estudo.mjs';

// Sorteio uniforme apenas para a prévia; não representa as chances finais.
export function createDemoCaptures(rewardTypes, draw = randomInt) {
  return rewardTypes
    .filter(({ type }) => type === 'pokemon')
    .map(() => {
      const speciesId = draw(1, 152);
      const tier = STUDY_TIERS.find(({ speciesIds }) => speciesIds.includes(speciesId));
      if (!tier) throw new RangeError('Invalid demo species');
      return { speciesId, isShiny: false, rarity: tier.rarity };
    });
}
