import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudyCaptures } from '../src/server/study-capture.mjs';

function source(values, limits) {
  return (limit) => { limits.push(limit); return values.shift(); };
}
test('usa pesos propostos e um sorteio de shiny separado para cada captura', () => {
  const limits = [];
  const results = createStudyCaptures([{ type: 'pokemon' }, { type: 'voucher' }, { type: 'pokemon' }],
    source([0, 0, 0, 99, 0, 199], limits));
  assert.deepEqual(results, [
    { speciesId: 1, rarity: 'common', isShiny: true },
    { speciesId: 144, rarity: 'legendary', isShiny: false },
  ]);
  assert.deepEqual(limits, [100, 50, 200, 100, 6, 200]);
});
test('verifica os limites dos quatro tiers e dos resultados shiny', () => {
  for (const [ticket, rarity] of [[69, 'common'], [70, 'uncommon'], [91, 'uncommon'], [92, 'rare'], [98, 'rare'], [99, 'legendary']]) {
    assert.equal(createStudyCaptures([{ type: 'pokemon' }], source([ticket, 0, 1], []))[0].rarity, rarity);
  }
  assert.throws(() => createStudyCaptures([{ type: 'pokemon' }], source([0, 0, 200], [])), RangeError);
  assert.deepEqual(createStudyCaptures([{ type: 'voucher' }], () => { throw new Error('não deveria sortear'); }), []);
});
