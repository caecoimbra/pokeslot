import { STUDY_TIERS } from '../../scripts/data/kanto-estudo.mjs';

// Os tiers são provisórios; o preço 1/2/3/4 expressa a regra discutida.
const COST_BY_RARITY = Object.freeze({ common: 1, uncommon: 2, rare: 3, legendary: 4 });

export function demoRedemptionDetails(speciesId) {
  if (!Number.isSafeInteger(speciesId) || speciesId < 1 || speciesId > 151) throw new TypeError('Invalid species');
  const rarity = STUDY_TIERS.find((tier) => tier.speciesIds.includes(speciesId))?.rarity;
  if (!Object.hasOwn(COST_BY_RARITY, rarity)) throw new TypeError('Unknown species tier');
  return { speciesId, rarity, cost: COST_BY_RARITY[rarity] };
}

// Uma shiny já registrada não impede resgatar a variante normal.
export function normalVariantOwned(variants, speciesId) {
  return variants.some((entry) => entry.speciesId === speciesId && entry.isShiny === false);
}
