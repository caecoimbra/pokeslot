import { randomInt } from 'node:crypto';
import { selectSpecies } from '../domain/species-selection.mjs';
import { STUDY_TIERS } from '../../scripts/data/kanto-estudo.mjs';

// Pesos e catálogo são candidatos de estudo, não as regras finais do jogo.
const weights = [70, 22, 7, 1];
const tiers = STUDY_TIERS.map((tier, index) => ({ ...tier, weight: weights[index] }));

// O sorteio de shiny é independente da raridade: um resultado em 200.
export function createStudyCaptures(rewardTypes, draw = randomInt) {
  if (!Array.isArray(rewardTypes) || typeof draw !== 'function') throw new TypeError('Invalid capture inputs');
  return rewardTypes.filter((reward) => reward?.type === 'pokemon').map(() => {
    const selection = selectSpecies(tiers, draw);
    const shinyRoll = draw(200);
    if (!Number.isInteger(shinyRoll) || shinyRoll < 0 || shinyRoll >= 200) throw new RangeError('Invalid shiny roll');
    return { ...selection, isShiny: shinyRoll === 0 };
  });
}
