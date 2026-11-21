import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCapture } from '../src/domain/capture.mjs';

const capture = (speciesId, isShiny, rarity = 'common') => ({ speciesId, isShiny, rarity });

test('uma espécie ainda não possuída gera uma nova captura', () => {
  assert.deepEqual(evaluateCapture(capture(1, false), []), { status: 'new', compensation: null });
  assert.deepEqual(evaluateCapture(capture(2, true), [{ speciesId: 1, isShiny: true }]), {
    status: 'new', compensation: null,
  });
});

test('normal e shiny da mesma espécie são variantes distintas', () => {
  assert.deepEqual(evaluateCapture(capture(1, true), [{ speciesId: 1, isShiny: false }]), {
    status: 'new', compensation: null,
  });
  assert.deepEqual(evaluateCapture(capture(1, false), [{ speciesId: 1, isShiny: true }]), {
    status: 'new', compensation: null,
  });
});

test('repetição usa a raridade da captura e sinaliza multiplicador só para shiny', () => {
  for (const rarity of ['common', 'uncommon', 'rare', 'legendary']) {
    for (const isShiny of [false, true]) {
      const owned = [{ speciesId: 25, isShiny }];
      assert.deepEqual(evaluateCapture(capture(25, isShiny, rarity), owned), {
        status: 'duplicate', compensation: { rarity, useShinyMultiplier: isShiny },
      });
    }
  }
});

test('a comparação considera a espécie e a variante mesmo em coleção com várias entradas', () => {
  const owned = [
    { speciesId: 1, isShiny: false },
    { speciesId: 2, isShiny: true },
    { speciesId: 1, isShiny: true },
  ];
  assert.equal(evaluateCapture(capture(1, true, 'rare'), owned).status, 'duplicate');
  assert.equal(evaluateCapture(capture(2, false, 'rare'), owned).status, 'new');
  assert.equal(evaluateCapture(capture(3, true, 'rare'), owned).status, 'new');
});

test('recusa capturas com espécie, variante ou raridade inválidas', () => {
  const invalid = [
    null, undefined, {}, capture(0, false), capture(-1, false), capture(1.5, false),
    capture(Number.MAX_SAFE_INTEGER + 1, false), capture('1', false), capture(1, 'true'),
    capture(1, null), capture(1, false, 'shiny'), capture(1, false, 'unknown'),
  ];
  for (const value of invalid) assert.throws(() => evaluateCapture(value, []), TypeError);
});

test('recusa coleção inválida ou variantes incompletas na coleção', () => {
  for (const value of [null, undefined, {}, 'collection']) {
    assert.throws(() => evaluateCapture(capture(1, false), value), TypeError);
  }
  for (const value of [[null], [{}], [{ speciesId: 0, isShiny: false }], [{ speciesId: 1 }], Array(1)]) {
    assert.throws(() => evaluateCapture(capture(1, false), value), TypeError);
  }
});

test('não altera a captura nem a coleção fornecidas', () => {
  const input = Object.freeze(capture(1, true, 'uncommon'));
  const owned = Object.freeze([Object.freeze({ speciesId: 1, isShiny: true })]);
  assert.equal(evaluateCapture(input, owned).status, 'duplicate');
  assert.deepEqual(owned, [{ speciesId: 1, isShiny: true }]);
  assert.deepEqual(input, capture(1, true, 'uncommon'));
});
