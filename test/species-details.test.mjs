import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeciesDetailsStore } from '../src/preview/species-details.mjs';

test('compartilha a consulta e guarda os dados por espécie', async () => {
  const calls = [];
  const store = createSpeciesDetailsStore(async (id) => {
    calls.push(id);
    return { names: { en: `Pokémon ${id}` } };
  });
  const [first, second] = await Promise.all([store.load(1), store.load(1)]);
  assert.strictEqual(first, second);
  assert.strictEqual(store.get(1), first);
  await store.load(2);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(store.get(2).names.en, 'Pokémon 2');
});

test('permite tentar novamente depois de uma falha', async () => {
  let attempts = 0;
  const store = createSpeciesDetailsStore(async () => {
    if (++attempts === 1) throw new Error('indisponível');
    return { names: { en: 'Pikachu' } };
  });
  await assert.rejects(store.load(25));
  assert.equal(store.get(25), null);
  assert.equal((await store.load(25)).names.en, 'Pikachu');
});
