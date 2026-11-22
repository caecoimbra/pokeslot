import test from 'node:test';
import assert from 'node:assert/strict';
import { planKnownEvolution } from '../src/server/evolution.mjs';

const eevee = Object.freeze({ speciesId: 133, isShiny: false });
const base = { source: eevee, sourceAvailable: true, stoneCount: 1, ownedVariants: [eevee] };

test('associa cada evolução de Eevee à sua pedra de Kanto', () => {
  for (const [targetId, selectedStone] of [[134, 'water'], [135, 'thunder'], [136, 'fire']]) {
    assert.deepEqual(planKnownEvolution({ ...base, targetId, selectedStone }), {
      status: 'ready', target: { speciesId: targetId, isShiny: false }, stoneToConsume: selectedStone,
    });
  }
});

test('recusa pedra incorreta, destino desconhecido e origem diferente', () => {
  assert.deepEqual(planKnownEvolution({ ...base, targetId: 134, selectedStone: 'fire' }), { status: 'incompatible' });
  assert.deepEqual(planKnownEvolution({ ...base, targetId: 150, selectedStone: 'water' }), { status: 'incompatible' });
  assert.deepEqual(planKnownEvolution({ ...base, source: { speciesId: 4, isShiny: false }, targetId: 134, selectedStone: 'water' }), { status: 'incompatible' });
  assert.deepEqual(planKnownEvolution({ ...base, targetId: 150, selectedStone: 'water',
    recipe: { sourceId: 133, targetId: 150, stone: 'water' } }), { status: 'incompatible' });
});

test('mantém shiny e bloqueia a mesma variante de destino', () => {
  const shiny = { speciesId: 133, isShiny: true };
  const input = { ...base, source: shiny, ownedVariants: [shiny], targetId: 135, selectedStone: 'thunder' };
  assert.deepEqual(planKnownEvolution(input), {
    status: 'ready', target: { speciesId: 135, isShiny: true }, stoneToConsume: 'thunder',
  });
  assert.deepEqual(planKnownEvolution({ ...input, ownedVariants: [shiny, { speciesId: 135, isShiny: true }] }), {
    status: 'already_registered',
  });
});

test('não planeja evolução sem pedra em estoque', () => {
  assert.deepEqual(planKnownEvolution({ ...base, targetId: 136, selectedStone: 'fire', stoneCount: 0 }), {
    status: 'missing_stone',
  });
});
