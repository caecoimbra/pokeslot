// Atualização editorial explícita; nunca executada durante o acesso de jogadores.
import { writeFile } from 'node:fs/promises';
import { selectDescription } from '../src/preview/description.mjs';

const entries = [];
let nativePortugueseDescriptions = 0;
for (let id = 1; id <= 151; id++) {
  const sourceUrl = `https://pokeapi.co/api/v2/pokemon-species/${id}/`;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`PokéAPI ${id}: HTTP ${response.status}`);
  const species = await response.json();
  if (species.id !== id) throw new Error(`Unexpected species: ${id}`);
  nativePortugueseDescriptions += species.flavor_text_entries.filter(entry =>
    ['pt', 'pt-br'].includes(entry.language.name)).length;
  const english = species.flavor_text_entries.filter(entry => entry.language.name === 'en')
    .map(entry => ({ text: entry.flavor_text.replace(/\s+/g, ' ').trim(), version: entry.version.name }));
  const description = selectDescription({ en: english }, 'en');
  if (!description) throw new Error(`English description missing: ${id}`);
  entries.push({ id, name: species.names.find(entry => entry.language.name === 'en')?.name ?? species.name,
    en: description.text, version: description.version, sourceUrl });
}
await writeFile(new URL('../src/pokeapi/kanto-description-sources.json', import.meta.url),
  JSON.stringify({ fetchedAt: new Date().toISOString(), nativePortugueseDescriptions, entries }, null, 2) + '\n');
console.log(`Saved ${entries.length} English descriptions. Review Portuguese translations before publishing updates.`);
console.log(`Native Portuguese descriptions returned: ${nativePortugueseDescriptions}`);
