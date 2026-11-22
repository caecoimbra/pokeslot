import test from 'node:test';
import assert from 'node:assert/strict';
import { getKantoCollectionProgress } from '../src/domain/collection-progress.mjs';

test('conta espécies normais e shiny separadamente, sem repetir variantes', () => {
  const entries = [
    { speciesId: 25, isShiny: false }, { speciesId: 25, isShiny: true },
    { speciesId: 25, isShiny: false }, { speciesId: 151, isShiny: true },
  ];
  assert.deepEqual(getKantoCollectionProgress(entries), { normal: 1, shiny: 2, total: 151 });
});

test('conta de zero a 151 espécies normais', () => {
  assert.deepEqual(getKantoCollectionProgress([]), { normal: 0, shiny: 0, total: 151 });
  const entries = Array.from({ length: 151 }, (_, i) => ({ speciesId: i + 1, isShiny: false }));
  assert.deepEqual(getKantoCollectionProgress(entries), { normal: 151, shiny: 0, total: 151 });
});

test('rejeita espécies ou variantes inválidas', () => {
  for (const entry of [null, { speciesId: 0, isShiny: false }, { speciesId: 152, isShiny: false }, { speciesId: 1 }]) {
    assert.throws(() => getKantoCollectionProgress([entry]), TypeError);
  }
  assert.throws(() => getKantoCollectionProgress(null), TypeError);
});
