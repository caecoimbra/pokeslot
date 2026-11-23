import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validInventoryAction } from '../src/server/inventory-request.mjs';

test('aceita somente escolhas válidas, sem preços ou identidade enviados como regra', () => {
  assert.equal(validInventoryAction('pokemon', { speciesId: 25 }), true);
  assert.equal(validInventoryAction('pokemon', { speciesId: 25, cost: 0 }), false);
  assert.equal(validInventoryAction('stone', { stone: 'thunder' }), true);
  assert.equal(validInventoryAction('stone', { stone: 'dragon' }), false);
  assert.equal(validInventoryAction('evolve', { source: { speciesId: 25, isShiny: true }, targetId: 26, stone: 'thunder' }), true);
  assert.equal(validInventoryAction('evolve', { source: { speciesId: 25, isShiny: 'true' }, targetId: 26, stone: 'thunder' }), false);
  assert.equal(validInventoryAction('pokemon', { speciesId: 152 }), false);
  assert.equal(validInventoryAction('other', {}), false);
});
