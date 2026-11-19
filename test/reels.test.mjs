import test from 'node:test';
import assert from 'node:assert/strict';
import { createReelRound, REEL } from '../src/domain/reels.mjs';
import { createSecureReelRound } from '../src/server/reel-round.mjs';

function assertValidReel({ reel, position, symbol }) {
  assert.equal(reel.length, 20);
  assert.deepEqual(
    Object.fromEntries(['pokeball', 'spin', 'voucher'].map((value) => [
      value, reel.filter((item) => item === value).length,
    ])),
    { pokeball: 10, spin: 6, voucher: 4 },
  );
  assert.ok(Number.isInteger(position) && position >= 0 && position < 20);
  assert.equal(symbol, reel[position]);
}

test('cria três rolos independentes, preservando os símbolos e seus resultados', () => {
  const round = createReelRound(() => 0);
  assert.equal(round.length, 3);
  round.forEach(assertValidReel);
  assert.notStrictEqual(round[0].reel, round[1].reel);
  assert.notStrictEqual(round[1].reel, round[2].reel);
  assert.notStrictEqual(round[0].reel, REEL);
  assert.notDeepEqual(round[0].reel, REEL);
  assert.equal(round[0].reel[19], 'pokeball');
});

test('sorteia cada rolo com limites de Fisher–Yates e posição final de 0 a 19', () => {
  const limits = [];
  const round = createReelRound((limit) => {
    limits.push(limit);
    return limit - 1;
  });
  const oneReelLimits = [...Array.from({ length: 19 }, (_, index) => 20 - index), 20];
  assert.deepEqual(limits, [...oneReelLimits, ...oneReelLimits, ...oneReelLimits]);
  for (const result of round) {
    assertValidReel(result);
    assert.deepEqual(result.reel, REEL);
    assert.equal(result.position, 19);
    assert.equal(result.symbol, 'voucher');
  }
});

test('cada rolo recebe seus próprios sorteios de posições', () => {
  let calls = 0;
  const round = createReelRound((limit) => {
    calls += 1;
    if (calls % 20 === 0) return calls / 20 - 1;
    return limit - 1;
  });
  assert.deepEqual(round.map((result) => result.position), [0, 1, 2]);
  round.forEach(assertValidReel);
});

test('recusa ausência de fonte e números inválidos', () => {
  assert.throws(() => createReelRound(), TypeError);
  for (const invalid of [-1, 20, 0.5, NaN, '1', undefined]) {
    assert.throws(() => createReelRound(() => invalid), RangeError);
  }
});

test('a fonte do servidor produz uma rodada com o formato esperado', () => {
  const round = createSecureReelRound();
  assert.equal(round.length, 3);
  round.forEach(assertValidReel);
});
