// Identificadores internos das raridades; os nomes exibidos serão traduzidos.
const RARITIES = ['common', 'uncommon', 'rare', 'legendary'];

function isValidVariant(value) {
  return value !== null && typeof value === 'object'
    && Number.isSafeInteger(value.speciesId) && value.speciesId > 0
    && typeof value.isShiny === 'boolean';
}

// ownedVariants deve refletir a coleção confiável do jogador. Esta função não
// grava capturas, sorteia Pokémon ou define valores de compensação.
export function evaluateCapture(capture, ownedVariants) {
  if (!isValidVariant(capture) || !RARITIES.includes(capture.rarity)) {
    throw new TypeError('Invalid captured Pokémon');
  }
  if (!Array.isArray(ownedVariants)) {
    throw new TypeError('Expected a list of owned variants');
  }
  for (const owned of ownedVariants) {
    if (!isValidVariant(owned)) throw new TypeError('Invalid owned variant');
  }

  const alreadyOwned = ownedVariants.some((owned) =>
    owned.speciesId === capture.speciesId && owned.isShiny === capture.isShiny
  );

  if (!alreadyOwned) {
    return { status: 'new', compensation: null };
  }

  return {
    status: 'duplicate',
    compensation: {
      rarity: capture.rarity,
      useShinyMultiplier: capture.isShiny,
    },
  };
}
