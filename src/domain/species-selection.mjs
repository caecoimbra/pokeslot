import { RARITIES } from './capture.mjs';

// Pesos e espécies são configurações confiáveis, não dados do navegador.
// Seleciona uma raridade por pesos inteiros e depois uma espécie uniforme no tier.
// Não decide shiny, concede capturas nem define os pesos finais do jogo.
export function selectSpecies(tiers, randomInt) {
  if (!Array.isArray(tiers) || tiers.length === 0 || typeof randomInt !== 'function') {
    throw new TypeError('A tier list and random source are required');
  }
  const rarities = new Set();
  const species = new Set();
  let totalWeight = 0;
  for (const tier of tiers) {
    if (!tier || !RARITIES.includes(tier.rarity) || rarities.has(tier.rarity) ||
        !Number.isSafeInteger(tier.weight) || tier.weight < 0 || !Array.isArray(tier.speciesIds) ||
        (tier.weight > 0 && tier.speciesIds.length === 0)) {
      throw new TypeError('Invalid tier configuration');
    }
    rarities.add(tier.rarity);
    totalWeight += tier.weight;
    for (const id of tier.speciesIds) {
      if (!Number.isSafeInteger(id) || id < 1 || species.has(id)) throw new TypeError('Invalid or duplicate species');
      species.add(id);
    }
  }
  // node:crypto.randomInt aceita intervalos menores que 2^48.
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0 || totalWeight >= 2 ** 48) {
    throw new RangeError('Invalid total weight');
  }
  const draw = (limit) => {
    const value = randomInt(limit);
    if (!Number.isSafeInteger(value) || value < 0 || value >= limit) {
      throw new RangeError('Invalid random result');
    }
    return value;
  };

  let ticket = draw(totalWeight);
  for (const tier of tiers) {
    if (ticket < tier.weight) {
      return { speciesId: tier.speciesIds[draw(tier.speciesIds.length)], rarity: tier.rarity };
    }
    ticket -= tier.weight;
  }
}
