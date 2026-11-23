import { planEvolution } from '../domain/evolution.mjs';

// Compatibilidades de pedra da Geração I entre espécies de Kanto.
// As adaptações próprias para outras evoluções permanecem em revisão.
const STONE_EVOLUTIONS = Object.freeze([
  Object.freeze({ sourceId: 25, targetId: 26, stone: 'thunder' }),
  Object.freeze({ sourceId: 30, targetId: 31, stone: 'moon' }),
  Object.freeze({ sourceId: 33, targetId: 34, stone: 'moon' }),
  Object.freeze({ sourceId: 35, targetId: 36, stone: 'moon' }),
  Object.freeze({ sourceId: 37, targetId: 38, stone: 'fire' }),
  Object.freeze({ sourceId: 39, targetId: 40, stone: 'moon' }),
  Object.freeze({ sourceId: 44, targetId: 45, stone: 'leaf' }),
  Object.freeze({ sourceId: 58, targetId: 59, stone: 'fire' }),
  Object.freeze({ sourceId: 61, targetId: 62, stone: 'water' }),
  Object.freeze({ sourceId: 70, targetId: 71, stone: 'leaf' }),
  Object.freeze({ sourceId: 90, targetId: 91, stone: 'water' }),
  Object.freeze({ sourceId: 102, targetId: 103, stone: 'leaf' }),
  Object.freeze({ sourceId: 120, targetId: 121, stone: 'water' }),
  Object.freeze({ sourceId: 133, targetId: 134, stone: 'water' }),
  Object.freeze({ sourceId: 133, targetId: 135, stone: 'thunder' }),
  Object.freeze({ sourceId: 133, targetId: 136, stone: 'fire' }),
]);

// Cópias para apresentação; o backend valida com a lista interna.
export function knownEvolutionOptions() {
  return STONE_EVOLUTIONS.map((entry) => ({ ...entry }));
}

// Pedras das 16 receitas clássicas nesta demonstração, não catálogo definitivo.
export const DEMO_STONES = Object.freeze(['thunder', 'moon', 'fire', 'leaf', 'water']);

// A receita é escolhida aqui, nunca recebida do navegador. O futuro endpoint
// precisa obter coleção, disponibilidade e estoque a partir do backend autenticado.
export function planKnownEvolution({ source, targetId, selectedStone, sourceAvailable, stoneCount, ownedVariants }) {
  const recipe = STONE_EVOLUTIONS.find((entry) =>
    entry.sourceId === source?.speciesId && entry.targetId === targetId
  );
  if (!recipe) return { status: 'incompatible' };
  return planEvolution({ source, sourceAvailable, recipe, selectedStone, stoneCount, ownedVariants });
}
