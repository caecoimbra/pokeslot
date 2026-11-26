import sources from '../pokeapi/kanto-description-sources.json' with { type: 'json' };
import portuguese from '../pokeapi/kanto-descriptions-pt.json' with { type: 'json' };

const kantoSources = new Map(sources.entries.map((entry) => [entry.id, entry]));

// Prefere texto nativo da API; a tradução local só cobre Kanto e nunca troca o idioma.
export function selectDescription(descriptions, language, speciesId) {
  const entries = descriptions?.[language];
  if (Array.isArray(entries) && entries.length) {
    return entries.find((entry) => entry.version === 'firered')
      ?? entries.find((entry) => entry.version === 'leafgreen')
      ?? entries[0];
  }
  const source = kantoSources.get(speciesId);
  if (!source || !['pt', 'en'].includes(language)) return null;
  return {
    text: language === 'pt' ? portuguese[speciesId] : source.en,
    language: language === 'pt' ? 'pt-BR' : 'en',
    version: source.version,
    sourceUrl: source.sourceUrl,
    translated: language === 'pt',
  };
}
