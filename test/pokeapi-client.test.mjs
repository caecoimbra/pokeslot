import test from 'node:test';
import assert from 'node:assert/strict';
import { createPokeApiClient } from '../src/pokeapi/client.mjs';

const base = 'https://pokeapi.co/api/v2';
const speciesUrl = (id) => `${base}/pokemon-species/${id}/`;
const pokemonUrl = (id) => `${base}/pokemon/${id}/`;
const speciesData = (id, pokemonId = id) => ({
  id,
  varieties: [
    { is_default: false, pokemon: { url: pokemonUrl(999) } },
    { is_default: true, pokemon: { url: pokemonUrl(pokemonId) } },
  ],
});
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test('busca a espécie e sua variedade padrão, que pode ter outro ID', async () => {
  const calls = [];
  const species = speciesData(1, 42);
  const pokemon = { id: 42, name: 'fixture' };
  const client = createPokeApiClient(async (url, options) => {
    calls.push({ url, options });
    if (url === speciesUrl(1)) return response(species);
    if (url === pokemonUrl(42)) return response(pokemon);
    throw new Error('Unexpected URL');
  });
  assert.deepEqual(await client.getKantoPokemon(1), { species, pokemon });
  assert.deepEqual(calls, [
    { url: speciesUrl(1), options: { headers: { Accept: 'application/json' } } },
    { url: pokemonUrl(42), options: { headers: { Accept: 'application/json' } } },
  ]);
});

test('aceita os limites 1 e 151, rejeitando IDs inválidos sem acessar rede', async () => {
  const calls = [];
  const client = createPokeApiClient(async (url) => {
    calls.push(url);
    const match = /\/(pokemon-species|pokemon)\/(\d+)\/$/.exec(url);
    const id = Number(match[2]);
    return response(match[1] === 'pokemon-species' ? speciesData(id) : { id });
  });
  for (const id of [0, -1, 152, 1.5, NaN, Infinity, '1', null, undefined]) {
    await assert.rejects(client.getKantoPokemon(id), RangeError);
  }
  assert.deepEqual(calls, []);
  assert.equal((await client.getKantoPokemon(1)).species.id, 1);
  assert.equal((await client.getKantoPokemon(151)).species.id, 151);
  assert.equal(calls.length, 4);
});

test('reutiliza o cache para chamadas simultâneas e posteriores', async () => {
  const calls = [];
  const client = createPokeApiClient(async (url) => {
    calls.push(url);
    await Promise.resolve();
    return response(url === speciesUrl(1) ? speciesData(1) : { id: 1 });
  });
  const [first, second] = await Promise.all([client.getKantoPokemon(1), client.getKantoPokemon(1)]);
  const third = await client.getKantoPokemon(1);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.deepEqual(calls, [speciesUrl(1), pokemonUrl(1)]);
});

test('uma falha HTTP ou de rede não impede uma tentativa posterior', async () => {
  for (const failure of ['http', 'network', 'json']) {
    let attempts = 0;
    const client = createPokeApiClient(async (url) => {
      if (url === pokemonUrl(1)) return response({ id: 1 });
      attempts += 1;
      if (attempts === 1) {
        if (failure === 'http') return response({}, 503);
        if (failure === 'network') throw new Error('network failed');
        return { ok: true, status: 200, json: async () => { throw new SyntaxError('invalid json'); } };
      }
      return response(speciesData(1));
    });
    await assert.rejects(client.getKantoPokemon(1));
    assert.equal((await client.getKantoPokemon(1)).pokemon.id, 1);
    assert.equal(attempts, 2);
  }
});

test('dados malformados da espécie não ficam no cache', async () => {
  for (const badSpecies of [null, {}, { id: 1, varieties: null }, { id: 2, varieties: [] }, { id: 1, varieties: [] }]) {
    let attempts = 0;
    const client = createPokeApiClient(async (url) => {
      if (url === pokemonUrl(1)) return response({ id: 1 });
      attempts += 1;
      return response(attempts === 1 ? badSpecies : speciesData(1));
    });
    await assert.rejects(client.getKantoPokemon(1));
    assert.equal((await client.getKantoPokemon(1)).species.id, 1);
    assert.equal(attempts, 2);
  }
});

test('recusa URLs inesperadas sem consultar outros destinos', async () => {
  for (const url of [
    'https://example.test/api/v2/pokemon/1/',
    'http://pokeapi.co/api/v2/pokemon/1/',
    'https://pokeapi.co/api/v2/pokemon/1/?x=1',
    'https://pokeapi.co/api/v2/pokemon/bulbasaur/',
    'https://pokeapi.co/api/v2/pokemon/0/',
  ]) {
    const calls = [];
    const client = createPokeApiClient(async (requestedUrl) => {
      calls.push(requestedUrl);
      return response({ id: 1, varieties: [{ is_default: true, pokemon: { url } }] });
    });
    await assert.rejects(client.getKantoPokemon(1), /valid default variety/);
    assert.deepEqual(calls, [speciesUrl(1)]);
  }
});

test('um Pokémon malformado é solicitado novamente sem repetir a espécie válida', async () => {
  const calls = [];
  let pokemonAttempts = 0;
  const client = createPokeApiClient(async (url) => {
    calls.push(url);
    if (url === speciesUrl(1)) return response(speciesData(1));
    pokemonAttempts += 1;
    return response({ id: pokemonAttempts === 1 ? 2 : 1 });
  });
  await assert.rejects(client.getKantoPokemon(1), /invalid Pokémon data/);
  assert.equal((await client.getKantoPokemon(1)).pokemon.id, 1);
  assert.deepEqual(calls, [speciesUrl(1), pokemonUrl(1), pokemonUrl(1)]);
});

test('recusa uma fonte de requisição que não seja função', () => {
  assert.throws(() => createPokeApiClient(null), TypeError);
});

test('lista nomes de Kanto em uma consulta, sem usar entradas fora do catálogo', async () => {
  const entry = (id, name, speciesId = id) => ({
    entry_number: id,
    pokemon_species: { name, url: speciesUrl(speciesId) },
  });
  const calls = [];
  const client = createPokeApiClient(async (url) => {
    calls.push(url);
    return response({ id: 2, pokemon_entries: [
      entry(25, 'pikachu'), entry(151, 'mew'), entry(152, 'chikorita'), entry(5, 'bulbasaur', 1), null,
    ] });
  });
  const expected = [{ id: 25, name: 'pikachu' }, { id: 151, name: 'mew' }];
  assert.deepEqual(await client.listKantoSpecies(), expected);
  assert.deepEqual(await client.listKantoSpecies(), expected);
  assert.deepEqual(calls, [`${base}/pokedex/2/`]);
});
