// O catálogo descreve a espécie; as capturas pertencem ao jogador no backend.
// A ausência de texto em um idioma permanece explícita para a interface decidir.
const LANGUAGES = ['en', 'pt'];

function languageGroup(value) {
  const code = typeof value === 'string' ? value.toLowerCase() : '';
  if (code === 'en') return 'en';
  if (code === 'pt' || code === 'pt-br') return 'pt';
  return null;
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

// Recebe os recursos completos de espécie e da variedade padrão da PokéAPI.
// Não traduz, escolhe versão de jogo, determina raridade ou concede captura.
export function preparePokedexData({ species, pokemon }) {
  if (!Number.isSafeInteger(species?.id) || species.id < 1 ||
      typeof species.name !== 'string' || species.name.length === 0 ||
      !Number.isSafeInteger(pokemon?.id) || pokemon.id < 1 ||
      pokemon.species?.name !== species.name) {
    throw new TypeError('Pokémon and species data must refer to the same species');
  }

  const names = { en: null, pt: null };
  for (const item of Array.isArray(species.names) ? species.names : []) {
    const group = languageGroup(item?.language?.name);
    const text = cleanText(item?.name);
    if (group && text && names[group] === null) names[group] = text;
  }

  const descriptions = Object.fromEntries(LANGUAGES.map((language) => [language, []]));
  for (const item of Array.isArray(species.flavor_text_entries) ? species.flavor_text_entries : []) {
    const group = languageGroup(item?.language?.name);
    const text = cleanText(item?.flavor_text);
    const version = typeof item?.version?.name === 'string' ? item.version.name : null;
    if (group && text) descriptions[group].push({ text, language: item.language.name, version });
  }

  const types = (Array.isArray(pokemon.types) ? pokemon.types : [])
    .filter((item) => Number.isSafeInteger(item?.slot) && item.slot > 0 && typeof item.type?.name === 'string' && item.type.name.length > 0)
    .map((item) => ({ slot: item.slot, key: item.type.name }))
    .sort((first, second) => first.slot - second.slot);

  return {
    speciesId: species.id,
    pokemonId: pokemon.id,
    canonicalName: species.name,
    names,
    types,
    sprites: {
      normal: httpsUrl(pokemon.sprites?.front_default),
      shiny: httpsUrl(pokemon.sprites?.front_shiny),
    },
    descriptions,
  };
}
