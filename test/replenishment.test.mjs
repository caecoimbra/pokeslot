import test from "node:test";
import assert from "node:assert/strict";
import {
  applyReplenishment,
  REFILL_AMOUNT,
  REFILL_INTERVAL_MS,
} from "../src/domain/replenishment.mjs";

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

test("does not refill at 23:59:59", () => {
  const result = applyReplenishment({
    balance: REFILL_AMOUNT,
    cycleStartedAtMs: T0,
    nowMs: T0 + REFILL_INTERVAL_MS - 1_000,
  });

  assert.equal(result.balance, 10);
  assert.equal(result.periodsGranted, 0);
  assert.equal(result.cycleStartedAtMs, T0);
  assert.equal(result.nextRefillInMs, 1_000);
});

test("refills once exactly at 24 hours", () => {
  const result = applyReplenishment({
    balance: 10,
    cycleStartedAtMs: T0,
    nowMs: T0 + REFILL_INTERVAL_MS,
  });

  assert.equal(result.balance, 20);
  assert.equal(result.periodsGranted, 1);
  assert.equal(result.cycleStartedAtMs, T0 + REFILL_INTERVAL_MS);
  assert.equal(result.nextRefillInMs, REFILL_INTERVAL_MS);
});

test("at 53 hours, grants two refills and preserves five hours of progress", () => {
  const nowMs = T0 + 53 * 60 * 60 * 1_000;
  const result = applyReplenishment({
    balance: 10,
    cycleStartedAtMs: T0,
    nowMs,
  });

  assert.equal(result.balance, 30);
  assert.equal(result.periodsGranted, 2);
  assert.equal(result.cycleStartedAtMs, T0 + 48 * 60 * 60 * 1_000);
  assert.equal(result.nextRefillInMs, 19 * 60 * 60 * 1_000);
});

test("a second call at the same instant does not grant the same period again", () => {
  const nowMs = T0 + REFILL_INTERVAL_MS;
  const first = applyReplenishment({
    balance: 10,
    cycleStartedAtMs: T0,
    nowMs,
  });
  const second = applyReplenishment({
    balance: first.balance,
    cycleStartedAtMs: first.cycleStartedAtMs,
    nowMs,
  });

  assert.equal(first.balance, 20);
  assert.equal(second.balance, 20);
  assert.equal(second.periodsGranted, 0);
});

test("rejects a time before the stored cycle anchor", () => {
  assert.throws(
    () => applyReplenishment({
      balance: 10,
      cycleStartedAtMs: T0,
      nowMs: T0 - 1,
    }),
    RangeError,
  );
});
