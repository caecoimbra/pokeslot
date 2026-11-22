import test from 'node:test';
import assert from 'node:assert/strict';
import { planEvolution } from '../src/domain/evolution.mjs';

const normal = { speciesId: 4, isShiny: false };
const shiny = { speciesId: 4, isShiny: true };
const recipe = { sourceId: 4, targetId: 5, stone: 'fire' };
const attempt = (overrides = {}) => ({
  source: normal, sourceAvailable: true, recipe, selectedStone: 'fire',
  stoneCount: 1, ownedVariants: [normal], ...overrides,
});

test('planeja uma evolução normal sem alterar a origem ou o estoque recebido', () => {
  const input = attempt({ ownedVariants: Object.freeze([Object.freeze(normal)]) });
  assert.deepEqual(planEvolution(input), {
    status: 'ready', target: { speciesId: 5, isShiny: false }, stoneToConsume: 'fire',
  });
  assert.equal(input.stoneCount, 1);
  assert.deepEqual(input.ownedVariants, [normal]);
});

test('preserva shiny e permite destino shiny ainda não registrado', () => {
  const ownedVariants = [shiny, { speciesId: 5, isShiny: false }];
  assert.deepEqual(planEvolution(attempt({ source: shiny, ownedVariants })), {
    status: 'ready', target: { speciesId: 5, isShiny: true }, stoneToConsume: 'fire',
  });
});

test('bloqueia variante de destino já registrada sem custo ou compensação', () => {
  const ownedVariants = [shiny, { speciesId: 5, isShiny: true }];
  assert.deepEqual(planEvolution(attempt({ source: shiny, ownedVariants })), { status: 'already_registered' });
});

test('verifica compatibilidade, posse da origem, disponibilidade e pedra', () => {
  assert.deepEqual(planEvolution(attempt({ selectedStone: 'water' })), { status: 'incompatible' });
  assert.deepEqual(planEvolution(attempt({ recipe: { ...recipe, sourceId: 7 } })), { status: 'incompatible' });
  assert.deepEqual(planEvolution(attempt({ ownedVariants: [] })), { status: 'source_unavailable' });
  assert.deepEqual(planEvolution(attempt({ sourceAvailable: false })), { status: 'source_unavailable' });
  assert.deepEqual(planEvolution(attempt({ stoneCount: 0 })), { status: 'missing_stone' });
});

test('um Eevee disponível pode ter duas ramificações compatíveis em planos separados', () => {
  const eevee = { speciesId: 133, isShiny: false };
  const base = { source: eevee, sourceAvailable: true, stoneCount: 1, ownedVariants: [eevee] };
  const water = planEvolution({ ...base, recipe: { sourceId: 133, targetId: 134, stone: 'water' }, selectedStone: 'water' });
  const fire = planEvolution({ ...base, recipe: { sourceId: 133, targetId: 136, stone: 'fire' }, selectedStone: 'fire' });
  assert.equal(water.target.speciesId, 134);
  assert.equal(fire.target.speciesId, 136);
});

test('rejeita entrada e coleções malformadas', () => {
  assert.throws(() => planEvolution(attempt({ stoneCount: -1 })), TypeError);
  assert.throws(() => planEvolution(attempt({ recipe: { ...recipe, targetId: 4 } })), TypeError);
  assert.throws(() => planEvolution(attempt({ ownedVariants: Array(1) })), TypeError);
});
