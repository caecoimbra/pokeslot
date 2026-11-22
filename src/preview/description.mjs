// Prefere as versões que inspiraram o projeto, sempre no idioma solicitado.
export function selectDescription(descriptions, language) {
  const entries = descriptions?.[language];
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries.find((entry) => entry.version === 'firered')
    ?? entries.find((entry) => entry.version === 'leafgreen')
    ?? entries[0];
}
