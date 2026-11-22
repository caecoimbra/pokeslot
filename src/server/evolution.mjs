import { planEvolution } from '../domain/evolution.mjs';

// Catálogo inicial, restrito aos três ramos de Eevee disponíveis em Kanto.
// A tabela completa de compatibilidades ainda está em revisão.
const EEVEE_EVOLUTIONS = Object.freeze([
  Object.freeze({ sourceId: 133, targetId: 134, stone: 'water' }),
  Object.freeze({ sourceId: 133, targetId: 135, stone: 'thunder' }),
  Object.freeze({ sourceId: 133, targetId: 136, stone: 'fire' }),
]);

// A receita é escolhida aqui, nunca recebida do navegador. O futuro endpoint
// precisa obter coleção, disponibilidade e estoque a partir do backend autenticado.
export function planKnownEvolution({ source, targetId, selectedStone, sourceAvailable, stoneCount, ownedVariants }) {
  const recipe = EEVEE_EVOLUTIONS.find((entry) =>
    entry.sourceId === source?.speciesId && entry.targetId === targetId
  );
  if (!recipe) return { status: 'incompatible' };
  return planEvolution({ source, sourceAvailable, recipe, selectedStone, stoneCount, ownedVariants });
}
