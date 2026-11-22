function isVariant(value) {
  return value !== null && typeof value === 'object' &&
    Number.isSafeInteger(value.speciesId) && value.speciesId > 0 &&
    typeof value.isShiny === 'boolean';
}

// A compatibilidade, disponibilidade e estoque devem vir do backend confiável.
// Retorna um plano; não altera o inventário nem grava a Pokédex.
export function planEvolution({ source, sourceAvailable, recipe, selectedStone, stoneCount, ownedVariants }) {
  if (!isVariant(source) || typeof sourceAvailable !== 'boolean' ||
      !recipe || !Number.isSafeInteger(recipe.sourceId) || recipe.sourceId <= 0 ||
      !Number.isSafeInteger(recipe.targetId) || recipe.targetId <= 0 ||
      recipe.sourceId === recipe.targetId || typeof recipe.stone !== 'string' || !recipe.stone ||
      typeof selectedStone !== 'string' || !selectedStone ||
      !Number.isSafeInteger(stoneCount) || stoneCount < 0 || !Array.isArray(ownedVariants)) {
    throw new TypeError('Invalid evolution data');
  }
  for (const variant of ownedVariants) {
    if (!isVariant(variant)) throw new TypeError('Invalid owned variant');
  }
  if (recipe.sourceId !== source.speciesId || recipe.stone !== selectedStone) {
    return { status: 'incompatible' };
  }
  if (!sourceAvailable || !ownedVariants.some((entry) =>
    entry.speciesId === source.speciesId && entry.isShiny === source.isShiny
  )) return { status: 'source_unavailable' };

  const target = { speciesId: recipe.targetId, isShiny: source.isShiny };
  if (ownedVariants.some((entry) => entry.speciesId === target.speciesId && entry.isShiny === target.isShiny)) {
    return { status: 'already_registered' };
  }
  if (stoneCount === 0) return { status: 'missing_stone' };
  return { status: 'ready', target, stoneToConsume: selectedStone };
}
