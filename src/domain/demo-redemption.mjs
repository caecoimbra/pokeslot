import { STUDY_TIERS } from '../../scripts/data/kanto-estudo.mjs';

// Custo da variante normal escolhida no resgate de vales Pokémon.
const COST_BY_RARITY = Object.freeze({ common: 1, uncommon: 2, rare: 3, legendary: 4 });
const catalog = new Map(STUDY_TIERS.flatMap(({ speciesIds, rarity }) =>
  speciesIds.map((speciesId) => [speciesId, { speciesId, rarity, cost: COST_BY_RARITY[rarity] }])
));

export const demoRedemptionSpecies = Object.freeze([...catalog.keys()].sort((a, b) => a - b));

export function demoRedemptionDetails(speciesId) {
  const details = catalog.get(speciesId);
  if (!details) throw new TypeError('Invalid species');
  return { ...details };
}

// Uma shiny já registrada não impede resgatar a variante normal.
export function normalVariantOwned(variants, speciesId) {
  return variants.some((entry) => entry.speciesId === speciesId && entry.isShiny === false);
}
