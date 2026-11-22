export const capturePresentationMessages = {
  pt: {
    rarities: { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', legendary: 'Lendário' },
    compensation: (value) => `+${value} ${value === 1 ? 'giro' : 'giros'} de compensação`,
    compensationUnavailable: 'compensação indisponível',
  },
  en: {
    rarities: { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' },
    compensation: (value) => `+${value} compensation ${value === 1 ? 'spin' : 'spins'}`,
    compensationUnavailable: 'compensation unavailable',
  },
};

// A raridade pertence à captura da rodada; a compensação vem do servidor.
export function formatCaptureResult(entry, text, speciesName, { authenticated }) {
  const { capture, status } = entry;
  const variant = capture.isShiny ? text.shiny : text.normal;
  let outcome = text.captureStatus[status];
  if (authenticated && status === 'duplicate') {
    outcome += Number.isSafeInteger(entry.compensationSpins) && entry.compensationSpins >= 0
      ? ` · ${text.compensation(entry.compensationSpins)}` : ` · ${text.compensationUnavailable}`;
  }
  return `${text.lines[entry.line]} — ${speciesName} (${variant} · ${text.rarities[capture.rarity]}): ${outcome}`;
}
