// Busca exata pelo número evita depender dos nomes carregados pela PokéAPI.
export function filterCollection(variants, number, variant) {
  const query = number.trim().replace(/^#/, '');
  if (query && !/^\d+$/.test(query)) return [];
  const speciesId = query ? Number(query) : null;
  return variants.filter((entry) =>
    (speciesId === null || entry.speciesId === speciesId) &&
    (variant === 'all' || (variant === 'shiny' && entry.isShiny) || (variant === 'normal' && !entry.isShiny))
  );
}
