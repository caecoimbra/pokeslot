import { REFILL_INTERVAL_MS } from '../domain/replenishment.mjs';

// O marco vem do servidor após aplicar os períodos completos.
export function nextRefillAt(cycleStartedAtMs) {
  if (!Number.isSafeInteger(cycleStartedAtMs)) throw new TypeError('invalid cycle');
  const next = cycleStartedAtMs + REFILL_INTERVAL_MS;
  if (!Number.isSafeInteger(next) || !Number.isFinite(new Date(next).getTime())) throw new RangeError('invalid next refill');
  return next;
}

export function formatNextRefill(timestamp, language) {
  return new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(timestamp);
}
