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
  const ids = [1, 151];
  const captures = createDemoCaptures(rewardTypesForLines(wins), (min, max) => {
    assert.equal(min, 1);
    assert.equal(max, 152);
    return ids.shift();
  });
  assert.deepEqual(captures, [
    { speciesId: 1, isShiny: false, rarity: 'common' },
    { speciesId: 151, isShiny: false, rarity: 'legendary' },
  ]);
  assert.notStrictEqual(captures[0], captures[1]);
});

test('recusa uma espécie fora de Kanto', () => {
  assert.throws(() => createDemoCaptures([{ type: 'pokemon' }], () => 152), RangeError);
});
