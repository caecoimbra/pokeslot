import test from 'node:test';
import assert from 'node:assert/strict';
import { capturePresentationMessages, formatCaptureResult } from '../src/preview/capture-result.mjs';

const text = (language) => ({
  ...capturePresentationMessages[language],
  normal: 'Normal', shiny: 'Shiny',
  lines: { top: language === 'pt' ? 'Superior' : 'Top' },
  captureStatus: language === 'pt' ? { new: 'Nova captura', duplicate: 'Repetida' } : { new: 'New capture', duplicate: 'Duplicate' },
});
const entry = { line: 'top', capture: { speciesId: 25, rarity: 'rare', isShiny: true }, status: 'duplicate', compensationSpins: 4 };

test('exibe variante shiny, raridade e compensação da captura em ambos os idiomas', () => {
  assert.equal(formatCaptureResult(entry, text('pt'), '#025 Pikachu', { authenticated: true }),
    'Superior — #025 Pikachu (Shiny · Raro): Repetida · +4 giros de compensação');
  assert.equal(formatCaptureResult(entry, text('en'), '#025 Pikachu', { authenticated: true }),
    'Top — #025 Pikachu (Shiny · Rare): Duplicate · +4 compensation spins');
});

test('captura nova não é apresentada como repetida e singular é respeitado', () => {
  const fresh = { ...entry, status: 'new', compensationSpins: 0 };
  assert.match(formatCaptureResult(fresh, text('pt'), '#025', { authenticated: true }), /Nova captura$/);
  assert.match(formatCaptureResult({ ...entry, compensationSpins: 1 }, text('pt'), '#025', { authenticated: true }), /\+1 giro de compensação$/);
  assert.match(formatCaptureResult({ ...entry, compensationSpins: 1 }, text('en'), '#025', { authenticated: true }), /\+1 compensation spin$/);
});

test('resultados antigos sem valor não inventam recompensa e prévia local não a apresenta', () => {
  const old = { ...entry, compensationSpins: undefined };
  assert.match(formatCaptureResult(old, text('pt'), '#025', { authenticated: true }), /compensação indisponível$/);
  assert.doesNotMatch(formatCaptureResult(entry, text('pt'), '#025', { authenticated: false }), /\+4/);
  assert.match(formatCaptureResult({ ...entry, compensationSpins: -1 }, text('en'), '#025', { authenticated: true }), /compensation unavailable$/);
});
