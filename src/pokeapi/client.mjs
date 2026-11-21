const API_BASE = 'https://pokeapi.co/api/v2';
const LAST_KANTO_SPECIES_ID = 151;

function getDefaultPokemonId(species, speciesId) {
  if (species?.id !== speciesId || !Array.isArray(species.varieties)) {
    throw new Error('PokéAPI returned invalid species data');
  }
  const variety = species.varieties.find((item) => item?.is_default);
  // Usa apenas o ID presente na URL; o destino continua fixo na PokéAPI.
  const match = typeof variety?.pokemon?.url === 'string'
    ? /^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)\/?$/.exec(variety.pokemon.url)
    : null;
  const pokemonId = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(pokemonId) || pokemonId < 1) {
    throw new Error('PokéAPI did not provide a valid default variety');
  }
  return pokemonId;
}

// A PokéAPI usa uma URL para a espécie e outra para sua variedade padrão.
// Crie uma instância por contexto de uso; o cache vive apenas em memória.
export function createPokeApiClient(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is required');
  const cache = new Map();

  async function getJson(url, validate) {
    if (!cache.has(url)) {
      const request = Promise.resolve()
        .then(() => fetchImpl(url, { headers: { Accept: 'application/json' } }))
        .then((response) => {
          if (!response.ok) throw new Error(`PokéAPI request failed: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          validate(data);
          return data;
        });
      cache.set(url, request);
      // Uma falha não fica guardada: uma próxima tentativa poderá recuperar.
      request.catch(() => { if (cache.get(url) === request) cache.delete(url); });
    }
    return cache.get(url);
  }

  async function getKantoPokemon(speciesId) {
    if (!Number.isSafeInteger(speciesId) || speciesId < 1 || speciesId > LAST_KANTO_SPECIES_ID) {
      throw new RangeError('Kanto species ID must be between 1 and 151');
    }

    const species = await getJson(`${API_BASE}/pokemon-species/${speciesId}/`,
      (data) => getDefaultPokemonId(data, speciesId));
    const pokemonId = getDefaultPokemonId(species, speciesId);

    const pokemon = await getJson(`${API_BASE}/pokemon/${pokemonId}/`, (data) => {
      if (data?.id !== pokemonId) throw new Error('PokéAPI returned invalid Pokémon data');
    });
    return { species, pokemon };
  }

  return { getKantoPokemon };
}
