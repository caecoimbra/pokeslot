import test from 'node:test';
import assert from 'node:assert/strict';
import { findWinningLines } from '../src/domain/paylines.mjs';
import { rewardTypesForLines } from '../src/domain/rewards.mjs';

test('sem linhas vencedoras não há tipos de recompensa', () => {
  assert.deepEqual(rewardTypesForLines([]), []);
});

test('cada símbolo vencedor indica o tipo correspondente', () => {
  const wins = [
    { line: 'top', symbol: 'pokeball' },
    { line: 'middle', symbol: 'spin' },
    { line: 'bottom', symbol: 'voucher' },
  ];
  assert.deepEqual(rewardTypesForLines(wins), [
    { line: 'top', type: 'pokemon' },
    { line: 'middle', type: 'extra_spins' },
    { line: 'bottom', type: 'voucher' },
  ]);
});

test('linhas simultâneas sobrepostas geram indicações separadas', () => {
  const grid = [
    ['spin', 'spin', 'spin'],
    ['pokeball', 'spin', 'voucher'],
    ['voucher', 'pokeball', 'spin'],
  ];
  assert.deepEqual(rewardTypesForLines(findWinningLines(grid)), [
    { line: 'top', type: 'extra_spins' },
    { line: 'diagonal_down', type: 'extra_spins' },
  ]);
});

test('símbolos diferentes na mesma rodada mantêm suas recompensas', () => {
  const grid = [
    ['spin', 'spin', 'spin'],
    ['pokeball', 'voucher', 'spin'],
    ['pokeball', 'pokeball', 'pokeball'],
  ];
  assert.deepEqual(rewardTypesForLines(findWinningLines(grid)), [
    { line: 'top', type: 'extra_spins' },
    { line: 'bottom', type: 'pokemon' },
  ]);
});

test('rejeita uma lista inválida ou um símbolo desconhecido', () => {
  assert.throws(() => rewardTypesForLines(null), TypeError);
  assert.throws(() => rewardTypesForLines([{ line: 'top', symbol: 'other' }]), RangeError);
});
