const KANTO_SPECIES_COUNT = 151;

// Cada espécie normal conta uma vez; shiny é uma variante opcional separada.
export function getKantoCollectionProgress(variants) {
  if (!Array.isArray(variants)) throw new TypeError('Expected a list of variants');
  const normal = new Set();
  const shiny = new Set();
  for (const variant of variants) {
    if (!Number.isInteger(variant?.speciesId) || variant.speciesId < 1 ||
        variant.speciesId > KANTO_SPECIES_COUNT || typeof variant.isShiny !== 'boolean') {
      throw new TypeError('Invalid Kanto variant');
    }
    (variant.isShiny ? shiny : normal).add(variant.speciesId);
  }
  return { normal: normal.size, shiny: shiny.size, total: KANTO_SPECIES_COUNT };
}
