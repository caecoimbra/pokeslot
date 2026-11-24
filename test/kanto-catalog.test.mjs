import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKantoCatalog, filterKantoCatalog } from '../src/preview/kanto-catalog.mjs';

const collection = [
  { speciesId: 1, isShiny: false },
  { speciesId: 25, isShiny: true },
  { speciesId: 151, isShiny: false },
  { speciesId: 151, isShiny: true },
];

test('exibe as 151 espécies em ordem com o estado de cada variante', () => {
  const catalog = buildKantoCatalog(collection);
  assert.deepEqual(catalog.map(({ speciesId }) => speciesId), Array.from({ length: 151 }, (_, i) => i + 1));
  assert.deepEqual(catalog[0], { speciesId: 1, normal: true, shiny: false });
  assert.deepEqual(catalog[24], { speciesId: 25, normal: false, shiny: true });
  assert.deepEqual(catalog[150], { speciesId: 151, normal: true, shiny: true });
  assert.deepEqual(catalog[1], { speciesId: 2, normal: false, shiny: false });
  assert.throws(() => buildKantoCatalog([{ speciesId: 152, isShiny: false }]), TypeError);
});

test('busca números exatos e nomes sem diferenciar acentos nem maiúsculas', () => {
  const catalog = buildKantoCatalog(collection);
  const labelFor = (id) => ({ 25: '#025 Pikachu', 29: '#029 Nidorán♀' })[id];
  assert.deepEqual(filterKantoCatalog(catalog, ' #025 ', 'all', 'all', labelFor), [catalog[24]]);
  assert.deepEqual(filterKantoCatalog(catalog, 'PÍKA', 'all', 'all', labelFor), [catalog[24]]);
  assert.deepEqual(filterKantoCatalog(catalog, 'nidoran', 'all', 'missing', labelFor), []);
  assert.deepEqual(filterKantoCatalog(catalog, '029', 'all', 'missing', labelFor), [catalog[28]]);
  assert.deepEqual(filterKantoCatalog(catalog, 'pika', 'normal', 'missing', labelFor), [catalog[24]]);
  for (const query of ['0', '152', '#', '#Pikachu']) assert.deepEqual(filterKantoCatalog(catalog, query, 'all', 'all', labelFor), []);
});

test('filtra posse por variante mantendo a independência entre contas', () => {
  const first = buildKantoCatalog(collection);
  const second = buildKantoCatalog([]);
  const ids = (variant, registration) => filterKantoCatalog(first, '', variant, registration).map((entry) => entry.speciesId);
  assert.deepEqual(ids('all', 'owned'), [1, 25, 151]);
  assert.deepEqual(ids('normal', 'owned'), [1, 151]);
  assert.deepEqual(ids('shiny', 'owned'), [25, 151]);
  assert.equal(ids('normal', 'missing').includes(25), true);
  assert.equal(ids('all', 'missing').includes(25), false);
  assert.deepEqual(filterKantoCatalog(second, '', 'all', 'owned'), []);
  assert.equal(filterKantoCatalog(second, '', 'shiny', 'missing').length, 151);
  assert.equal(first[24].shiny, true);
  assert.equal(second[24].shiny, false);
});
