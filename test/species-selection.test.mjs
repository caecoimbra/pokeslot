import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSpecies } from '../src/domain/species-selection.mjs';
import { selectSpeciesSecure } from '../src/server/species-selection.mjs';

// Pesos e espécies fictícios para testar intervalos, não regras do jogo.
const tiers = [
  { rarity: 'common', weight: 2, speciesIds: [1, 2] },
  { rarity: 'rare', weight: 1, speciesIds: [3, 4] },
];
function source(values, limits) {
  return (limit) => { limits.push(limit); return values.shift(); };
}

test('seleciona tier por peso e espécie pelo índice, incluindo os limites', () => {
  for (const [ticket, index, expected] of [
    [0, 0, { speciesId: 1, rarity: 'common' }],
    [1, 1, { speciesId: 2, rarity: 'common' }],
    [2, 0, { speciesId: 3, rarity: 'rare' }],
    [2, 1, { speciesId: 4, rarity: 'rare' }],
  ]) {
    const limits = [];
    assert.deepEqual(selectSpecies(tiers, source([ticket, index], limits)), expected);
    assert.deepEqual(limits, [3, 2]);
  }
});

test('um tier de peso zero não é sorteado', () => {
  const config = [{ rarity: 'legendary', weight: 0, speciesIds: [] }, ...tiers];
  assert.deepEqual(selectSpecies(config, () => 0), { speciesId: 1, rarity: 'common' });
});

test('rejeita configuração inválida ou espécies duplicadas', () => {
  const configs = [
    [], [{ rarity: 'shiny', weight: 1, speciesIds: [1] }],
    [{ rarity: 'common', weight: 0, speciesIds: [1] }],
    [{ rarity: 'common', weight: 1, speciesIds: [] }],
    [{ rarity: 'common', weight: 1, speciesIds: [1] }, { rarity: 'rare', weight: 1, speciesIds: [1] }],
    [{ rarity: 'common', weight: 2 ** 48, speciesIds: [1] }],
  ];
  for (const config of configs) assert.throws(() => selectSpecies(config, () => 0));
});

test('rejeita resultados aleatórios fora dos limites nos dois sorteios', () => {
  for (const values of [[3], [-1], [0, 2], [0, NaN]]) {
    assert.throws(() => selectSpecies(tiers, source(values, [])), RangeError);
  }
});

test('não altera a configuração recebida', () => {
  const config = Object.freeze(tiers.map((tier) => Object.freeze({ ...tier, speciesIds: Object.freeze([...tier.speciesIds]) })));
  assert.deepEqual(selectSpecies(config, () => 0), { speciesId: 1, rarity: 'common' });
  assert.deepEqual(config, tiers);
});

test('a fonte do servidor retorna uma espécie pertencente ao tier selecionado', () => {
  const result = selectSpeciesSecure(tiers);
  assert.ok(tiers.some((tier) => tier.rarity === result.rarity && tier.speciesIds.includes(result.speciesId)));
});
