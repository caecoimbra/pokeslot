import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePokedexData } from '../src/pokeapi/pokedex-data.mjs';

function fixture() {
  return {
    species: {
      id: 1,
      name: 'bulbasaur',
      names: [
        { name: ' Bulbasaur ', language: { name: 'en' } },
        { name: ' Bulbassauro ', language: { name: 'pt-BR' } },
        { name: 'Bulbizarre', language: { name: 'fr' } },
      ],
      flavor_text_entries: [
        { flavor_text: 'A seed\nis\fhere. ', language: { name: 'en' }, version: { name: 'red' } },
        { flavor_text: 'Outra\nversão. ', language: { name: 'pt-br' }, version: { name: 'blue' } },
        { flavor_text: 'Second  entry.', language: { name: 'en' }, version: { name: 'yellow' } },
      ],
    },
    pokemon: {
      id: 10_001,
      species: { name: 'bulbasaur' },
      types: [{ slot: 2, type: { name: 'poison' } }, { slot: 1, type: { name: 'grass' } }],
      sprites: {
        front_default: 'https://example.test/normal.png',
        front_shiny: 'https://example.test/shiny.png',
      },
    },
  };
}

test('separa nomes e descrições por idioma, limpa espaços e preserva a versão', () => {
  const result = preparePokedexData(fixture());
  assert.deepEqual(result.names, { en: 'Bulbasaur', pt: 'Bulbassauro' });
  assert.deepEqual(result.descriptions, {
    en: [
      { text: 'A seed is here.', language: 'en', version: 'red' },
      { text: 'Second entry.', language: 'en', version: 'yellow' },
    ],
    pt: [{ text: 'Outra versão.', language: 'pt-br', version: 'blue' }],
  });
  assert.equal(result.speciesId, 1);
  assert.equal(result.pokemonId, 10_001);
  assert.equal(result.canonicalName, 'bulbasaur');
});

test('mantém português ausente explícito em vez de copiar o inglês', () => {
  const input = fixture();
  input.species.names = [{ name: 'Bulbasaur', language: { name: 'en' } }];
  input.species.flavor_text_entries = [input.species.flavor_text_entries[0]];
  const result = preparePokedexData(input);
  assert.equal(result.names.pt, null);
  assert.deepEqual(result.descriptions.pt, []);
  assert.equal(result.names.en, 'Bulbasaur');
  assert.equal(result.descriptions.en.length, 1);
});

test('preserva a ausência de nomes, descrições, tipos e imagens', () => {
  const input = { species: { id: 1, name: 'bulbasaur' }, pokemon: { id: 1, species: { name: 'bulbasaur' } } };
  const result = preparePokedexData(input);
  assert.deepEqual(result.names, { en: null, pt: null });
  assert.deepEqual(result.descriptions, { en: [], pt: [] });
  assert.deepEqual(result.types, []);
  assert.deepEqual(result.sprites, { normal: null, shiny: null });
});

test('ordena tipos pelo slot e mantém os identificadores originais', () => {
  const result = preparePokedexData(fixture());
  assert.deepEqual(result.types, [{ slot: 1, key: 'grass' }, { slot: 2, key: 'poison' }]);
});

test('mantém somente endereços HTTPS válidos e sem credenciais', () => {
  const input = fixture();
  assert.deepEqual(preparePokedexData(input).sprites, {
    normal: 'https://example.test/normal.png', shiny: 'https://example.test/shiny.png',
  });
  for (const invalid of [null, '', 'not a url', 'http://example.test/a.png', 'https://user:secret@example.test/a.png']) {
    input.pokemon.sprites.front_default = invalid;
    input.pokemon.sprites.front_shiny = invalid;
    assert.deepEqual(preparePokedexData(input).sprites, { normal: null, shiny: null });
  }
});

test('recusa espécie e Pokémon incompatíveis ou identificadores inválidos', () => {
  const input = fixture();
  input.pokemon.species.name = 'ivysaur';
  assert.throws(() => preparePokedexData(input), TypeError);
  input.pokemon.species.name = 'bulbasaur';
  for (const id of [0, -1, 1.5, '1', null]) {
    input.species.id = id;
    assert.throws(() => preparePokedexData(input), TypeError);
  }
});

test('não modifica os recursos de entrada ao organizar os dados', () => {
  const input = fixture();
  const original = structuredClone(input);
  preparePokedexData(input);
  assert.deepEqual(input, original);
});
