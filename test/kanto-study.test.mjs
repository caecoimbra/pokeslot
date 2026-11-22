import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDY_TIERS, STUDY_EVOLUTIONS } from '../scripts/data/kanto-estudo.mjs';
import { planKnownEvolution } from '../src/server/evolution.mjs';

test('dados provisórios cobrem as 151 espécies uma vez', () => {
  assert.deepEqual(STUDY_TIERS.map((tier) => tier.speciesIds.length), [50, 61, 34, 6]);
  const ids = STUDY_TIERS.flatMap((tier) => tier.speciesIds).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: 151 }, (_, index) => index + 1));
});

test('evoluções propostas são únicas e incluem os ramos clássicos de Eevee', () => {
  const pairs = STUDY_EVOLUTIONS.map(({ sourceId, targetId }) => `${sourceId}:${targetId}`);
  assert.equal(pairs.length, 72);
  assert.equal(new Set(pairs).size, 72);
  assert.deepEqual(STUDY_EVOLUTIONS.filter(({ sourceId }) => sourceId === 133)
    .map(({ targetId, stone }) => [targetId, stone]).sort((a, b) => a[0] - b[0]), [
    [134, 'water'], [135, 'thunder'], [136, 'fire'],
  ]);
});

test('as 16 compatibilidades clássicas coincidem com o catálogo existente', () => {
  const officialPairs = [[25,26],[30,31],[33,34],[35,36],[37,38],[39,40],[44,45],[58,59],
    [61,62],[70,71],[90,91],[102,103],[120,121],[133,134],[133,135],[133,136]];
  for (const [sourceId, targetId] of officialPairs) {
    const edge = STUDY_EVOLUTIONS.find((item) => item.sourceId === sourceId && item.targetId === targetId);
    assert.ok(edge);
    const source = { speciesId: sourceId, isShiny: false };
    assert.equal(planKnownEvolution({ source, targetId, selectedStone: edge.stone,
      sourceAvailable: true, stoneCount: 1, ownedVariants: [source] }).status, 'ready');
  }
});
