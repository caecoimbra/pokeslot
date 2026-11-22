import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRefillAt, formatNextRefill } from '../src/preview/next-refill.mjs';
import { applyReplenishment, REFILL_INTERVAL_MS } from '../src/domain/replenishment.mjs';

test('apresenta o próximo marco após 53 horas sem reiniciar o ciclo', () => {
  const start = Date.parse('2026-01-01T12:00:00Z');
  const state = applyReplenishment({ balance: 20, cycleStartedAtMs: start, nowMs: start + 53 * 3600000 });
  assert.equal(state.periodsGranted, 2);
  assert.equal(nextRefillAt(state.cycleStartedAtMs), start + 72 * 3600000);
});

test('soma 24 horas exatas e rejeita marcos inválidos', () => {
  const start = Date.parse('2026-03-08T01:30:00Z');
  assert.equal(nextRefillAt(start), start + REFILL_INTERVAL_MS);
  for (const value of [NaN, undefined, '2026-01-01', Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => nextRefillAt(value));
  }
});

test('formata no idioma selecionado e fuso configurado no dispositivo', () => {
  const timestamp = Date.parse('2026-01-03T12:00:00Z');
  for (const [language, locale] of [['pt', 'pt-BR'], ['en', 'en-US']]) {
    const expected = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(timestamp);
    assert.equal(formatNextRefill(timestamp, language), expected);
  }
});
