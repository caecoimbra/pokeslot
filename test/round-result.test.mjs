import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingSymbol } from '../src/domain/round-result.mjs';
import { createReelRound } from '../src/domain/reels.mjs';

test('identifica cada uma das três combinações de símbolos iguais', () => {
  assert.equal(matchingSymbol(['pokeball', 'pokeball', 'pokeball']), 'pokeball');
  assert.equal(matchingSymbol(['spin', 'spin', 'spin']), 'spin');
  assert.equal(matchingSymbol(['voucher', 'voucher', 'voucher']), 'voucher');
});

test('não identifica três iguais nas 24 combinações mistas possíveis', () => {
  const symbols = ['pokeball', 'spin', 'voucher'];
  let checked = 0;
  for (const first of symbols) {
    for (const second of symbols) {
      for (const third of symbols) {
        if (first === second && second === third) continue;
        assert.equal(matchingSymbol([first, second, third]), null);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 24);
});

test('recusa valores que não são listas com três posições', () => {
  for (const value of [null, undefined, 'spin', {}, [], ['spin'], ['spin', 'spin', 'spin', 'spin']]) {
    assert.throws(() => matchingSymbol(value), TypeError);
  }
});

test('recusa símbolos desconhecidos, ausentes ou com tipo inválido', () => {
  for (const value of [['spin', 'spin', 'unknown'], ['spin', 'spin', null], ['spin', 'spin', 1], Array(3)]) {
    assert.throws(() => matchingSymbol(value), RangeError);
  }
});

test('aceita os símbolos das posições escolhidas em uma rodada controlada', () => {
  const round = createReelRound((limit) => limit - 1);
  assert.equal(matchingSymbol(round.map((reel) => reel.symbol)), 'voucher');
});
