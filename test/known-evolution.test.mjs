import test from 'node:test';
import assert from 'node:assert/strict';
import { planKnownEvolution } from '../src/server/evolution.mjs';

const eevee = Object.freeze({ speciesId: 133, isShiny: false });
const base = { source: eevee, sourceAvailable: true, stoneCount: 1, ownedVariants: [eevee] };

test('reconhece as compatibilidades clássicas de pedra em Kanto', () => {
  const cases = [
    [25, 26, 'thunder'], [30, 31, 'moon'], [33, 34, 'moon'], [35, 36, 'moon'],
    [37, 38, 'fire'], [39, 40, 'moon'], [44, 45, 'leaf'], [58, 59, 'fire'],
    [61, 62, 'water'], [70, 71, 'leaf'], [90, 91, 'water'], [102, 103, 'leaf'],
    [120, 121, 'water'], [133, 134, 'water'], [133, 135, 'thunder'], [133, 136, 'fire'],
  ];
  for (const [sourceId, targetId, stone] of cases) {
    const source = { speciesId: sourceId, isShiny: false };
    const input = { source, targetId, selectedStone: stone, sourceAvailable: true, stoneCount: 1, ownedVariants: [source] };
    assert.equal(planKnownEvolution(input).status, 'ready');
    assert.equal(planKnownEvolution({ ...input, selectedStone: 'unrelated' }).status, 'incompatible');
  }
});

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
