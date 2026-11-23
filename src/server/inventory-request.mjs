const stones = new Set(['thunder', 'moon', 'fire', 'leaf', 'water']);
const species = (value) => Number.isInteger(value) && value >= 1 && value <= 151;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

// Os parâmetros expressam apenas escolhas; preços e receitas pertencem ao servidor.
export function validInventoryAction(action, args) {
  if (action === 'pokemon') return exactKeys(args, ['speciesId']) && species(args.speciesId);
  if (action === 'stone') return exactKeys(args, ['stone']) && stones.has(args.stone);
  if (action === 'evolve') return exactKeys(args, ['source', 'targetId', 'stone'])
    && exactKeys(args.source, ['speciesId', 'isShiny']) && species(args.source.speciesId)
    && typeof args.source.isShiny === 'boolean' && species(args.targetId) && stones.has(args.stone);
  return false;
}
