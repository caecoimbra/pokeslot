import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoCaptures } from '../src/server/demo-capture.mjs';
import { findWinningLines } from '../src/domain/paylines.mjs';
import { rewardTypesForLines } from '../src/domain/rewards.mjs';

test('não produz capturas quando nenhuma linha concede Pokémon', () => {
  assert.deepEqual(createDemoCaptures([]), []);
  assert.deepEqual(createDemoCaptures([{ line: 'top', type: 'extra_spins' }]), []);
});

test('produz uma captura controlada para cada linha de Pokébolas', () => {
  const grid = [
    ['pokeball', 'pokeball', 'pokeball'],
    ['spin', 'pokeball', 'voucher'],
    ['voucher', 'spin', 'pokeball'],
  ];
  const wins = findWinningLines(grid);
  assert.deepEqual(wins.map(({ line }) => line), ['top', 'diagonal_down']);
  const captures = createDemoCaptures(rewardTypesForLines(wins));
  assert.deepEqual(captures, [
    { speciesId: 25, isShiny: false, rarity: 'common' },
    { speciesId: 25, isShiny: false, rarity: 'common' },
  ]);
  assert.notStrictEqual(captures[0], captures[1]);
});
