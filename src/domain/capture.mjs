// Identificadores internos das raridades; os nomes exibidos serão traduzidos.
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'legendary']);

function isValidVariant(value) {
  return value !== null && typeof value === 'object'
    && Number.isSafeInteger(value.speciesId) && value.speciesId > 0
    && typeof value.isShiny === 'boolean';
}

function validateOwnedVariants(ownedVariants) {
  if (!Array.isArray(ownedVariants)) {
    throw new TypeError('Expected a list of owned variants');
  }
  for (const owned of ownedVariants) {
    if (!isValidVariant(owned)) throw new TypeError('Invalid owned variant');
  }
}

// ownedVariants deve refletir a coleção confiável do jogador. Esta função não
// grava capturas, sorteia Pokémon ou define valores de compensação.
export function evaluateCapture(capture, ownedVariants) {
  if (!isValidVariant(capture) || !RARITIES.includes(capture.rarity)) {
    throw new TypeError('Invalid captured Pokémon');
  }
  validateOwnedVariants(ownedVariants);

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

// Avalia capturas na ordem da rodada, considerando as novas variantes anteriores.
// Os dados recebidos devem vir do servidor; o resultado não é persistido aqui.
export function evaluateCaptures(captures, ownedVariants) {
  if (!Array.isArray(captures)) throw new TypeError('Expected a list of captures');
  validateOwnedVariants(ownedVariants);

  const collection = [...ownedVariants];
  const results = [];
  for (const capture of captures) {
    const result = evaluateCapture(capture, collection);
    results.push(result);
    if (result.status === 'new') {
      collection.push({ speciesId: capture.speciesId, isShiny: capture.isShiny });
    }
  }
  return results;
}
