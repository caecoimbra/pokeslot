import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRewardPresentations } from '../src/preview/reward-presentation.mjs';

const captures = [{ line: 'top', status: 'duplicate', compensationSpins: 4,
  capture: { speciesId: 25, rarity: 'rare', isShiny: true } }];
const wins = [{ line: 'top', symbol: 'pokeball' }, { line: 'middle', symbol: 'spin' },
  { line: 'bottom', symbol: 'voucher' }, { line: 'diagonal_down', symbol: 'spin' }];

test('preserva prêmio de cada linha, variantes e total agregado dos giros', () => {
  const items = buildRewardPresentations({ wins, captures, vouchers: [{ line: 'bottom', type: 'spins', spinsAwarded: 2 }], lineSpins: 4, authenticated: true });
  assert.deepEqual(items.map((item) => item.kind), ['capture', 'spins', 'voucher']);
  assert.deepEqual([items[0].pokemonId, items[0].shiny, items[0].compensationSpins], [25, true, 4]);
  assert.deepEqual(items[1].lines, ['middle', 'diagonal_down']);
  assert.equal(items[1].amount, 4);
  assert.equal(items[2].spinsAwarded, 2);
});

test('não inventa valores para resultados antigos nem para a demonstração local', () => {
  for (const authenticated of [true, false]) {
    const items = buildRewardPresentations({ wins, captures, vouchers: 'unknown', lineSpins: undefined, authenticated });
    assert.equal(items[1].amount, null);
    assert.equal(items[2].type, undefined);
  }
  const local = buildRewardPresentations({ wins, captures, vouchers: [], lineSpins: 4, authenticated: false });
  assert.equal(local[1].amount, null);
  assert.equal(local[0].authenticated, false);
});
