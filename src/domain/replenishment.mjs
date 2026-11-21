export const REFILL_AMOUNT = 10;
export const INITIAL_BALANCE = 20;
export const REFILL_INTERVAL_MS = 24 * 60 * 60 * 1000;

// O início do ciclo deve ser definido pelo backend com um relógio confiável.
export function createInitialProgress(nowMs) {
  if (!Number.isSafeInteger(nowMs)) {
    throw new TypeError("timestamp must be safe integer milliseconds");
  }
  return { balance: INITIAL_BALANCE, cycleStartedAtMs: nowMs };
}

/**
 * Applies every complete refill period since the stored cycle anchor.
 * `nowMs` is supplied by trusted backend code or a test clock; it must not
 * come from a player-controlled browser request.
 */
export function applyReplenishment({
  balance,
  cycleStartedAtMs,
  nowMs,
  amount = REFILL_AMOUNT,
  intervalMs = REFILL_INTERVAL_MS,
}) {
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new TypeError("balance must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new TypeError("amount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new TypeError("intervalMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(cycleStartedAtMs) || !Number.isSafeInteger(nowMs)) {
    throw new TypeError("timestamps must be safe integer milliseconds");
  }
  if (nowMs < cycleStartedAtMs) {
    throw new RangeError("nowMs cannot be earlier than the cycle anchor");
  }

  const periodsDue = Math.floor((nowMs - cycleStartedAtMs) / intervalMs);
  const advancedAnchorMs = cycleStartedAtMs + periodsDue * intervalMs;

  return {
    balance: balance + periodsDue * amount,
    cycleStartedAtMs: advancedAnchorMs,
    periodsGranted: periodsDue,
    nextRefillInMs: intervalMs - (nowMs - advancedAnchorMs),
  };
}
