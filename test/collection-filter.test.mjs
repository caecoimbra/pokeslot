import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCollection } from '../src/preview/collection-filter.mjs';
import { getKantoCollectionProgress } from '../src/domain/collection-progress.mjs';

const collection = [
  { speciesId: 25, isShiny: false },
  { speciesId: 25, isShiny: true },
  { speciesId: 125, isShiny: false },
];

test('filtra as duas variantes de uma espécie pelo número exato', () => {
  assert.deepEqual(filterCollection(collection, '#025', 'all'), collection.slice(0, 2));
  assert.deepEqual(filterCollection(collection, '25', 'normal'), [collection[0]]);
  assert.deepEqual(filterCollection(collection, '25', 'shiny'), [collection[1]]);
  assert.deepEqual(filterCollection(collection, '12', 'all'), []);
});

test('filtro vazio mostra variantes selecionadas e texto inválido não mostra resultados', () => {
  assert.deepEqual(filterCollection(collection, '', 'all'), collection);
  assert.deepEqual(filterCollection(collection, '', 'shiny'), [collection[1]]);
  assert.deepEqual(filterCollection(collection, 'pikachu', 'all'), []);
  assert.deepEqual(filterCollection([], '25', 'all'), []);
});

test('filtrar não altera a coleção nem o progresso total', () => {
  const copy = structuredClone(collection);
  const before = getKantoCollectionProgress(collection);
  filterCollection(collection, '25', 'shiny');
  assert.deepEqual(collection, copy);
  assert.deepEqual(getKantoCollectionProgress(collection), before);
  assert.equal(before.species, 2);
  assert.equal(before.shiny, 1);
});
