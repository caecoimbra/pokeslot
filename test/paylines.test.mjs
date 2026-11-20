import test from 'node:test';
import assert from 'node:assert/strict';
import { REEL } from '../src/domain/reels.mjs';
import { findWinningLines, visibleGridFromReels } from '../src/domain/paylines.mjs';
import { createEvaluatedReelRound } from '../src/server/reel-round.mjs';

const P = 'pokeball';
const S = 'spin';
const V = 'voucher';

const singleLineCases = [
  { line: 'top', grid: [[P, P, P], [S, V, S], [V, S, V]] },
  { line: 'middle', grid: [[S, V, S], [P, P, P], [V, S, V]] },
  { line: 'bottom', grid: [[S, V, S], [V, S, V], [P, P, P]] },
  { line: 'diagonal_down', grid: [[P, S, V], [S, P, S], [S, V, P]] },
  { line: 'diagonal_up', grid: [[V, S, P], [S, P, S], [P, V, S]] },
];

for (const { line, grid } of singleLineCases) {
  test(`identifica apenas a linha ${line}`, () => {
    assert.deepEqual(findWinningLines(grid), [{ line, symbol: P }]);
  });
}

test('retorna lista vazia para uma grade sem linhas vencedoras', () => {
  assert.deepEqual(findWinningLines([[P, S, V], [S, P, V], [V, V, S]]), []);
});

test('identifica simultaneamente uma horizontal e uma diagonal sobrepostas', () => {
  const grid = [[S, S, S], [P, S, V], [V, P, S]];
  assert.deepEqual(findWinningLines(grid), [
    { line: 'top', symbol: S },
    { line: 'diagonal_down', symbol: S },
  ]);
});

test('mantém vitórias simultâneas de símbolos diferentes em linhas separadas', () => {
  const grid = [[S, S, S], [P, V, S], [P, P, P]];
  assert.deepEqual(findWinningLines(grid), [
    { line: 'top', symbol: S },
    { line: 'bottom', symbol: P },
  ]);
});

test('identifica as cinco vitórias quando todas as posições são Pokébolas', () => {
  const grid = [[P, P, P], [P, P, P], [P, P, P]];
  assert.deepEqual(findWinningLines(grid), [
    { line: 'top', symbol: P },
    { line: 'middle', symbol: P },
    { line: 'bottom', symbol: P },
    { line: 'diagonal_down', symbol: P },
    { line: 'diagonal_up', symbol: P },
  ]);
});

test('monta a grade com a parada central e vizinhos circulares em 0 e 19', () => {
  const round = [0, 19, 10].map((position) => ({ reel: [...REEL], position }));
  assert.deepEqual(visibleGridFromReels(round), [
    [V, V, P],
    [P, V, S],
    [P, P, S],
  ]);
});

test('recusa quantidades inválidas de rolos e posições fora dos limites', () => {
  assert.throws(() => visibleGridFromReels([]), TypeError);
  assert.throws(() => visibleGridFromReels(Array(3)), RangeError);
  for (const position of [-1, 20, 0.5, NaN]) {
    const round = [0, 1, position].map((value) => ({ reel: [...REEL], position: value }));
    assert.throws(() => visibleGridFromReels(round), RangeError);
  }
  const badReel = [{ reel: REEL.slice(1), position: 0 }, ...[0, 0].map((position) => ({ reel: [...REEL], position }))];
  assert.throws(() => visibleGridFromReels(badReel), RangeError);
});

test('recusa grade malformada ou com símbolo inválido', () => {
  for (const grid of [null, [], Array(3), [[P, P, P], [S, S], [V, V, V]]]) {
    assert.throws(() => findWinningLines(grid), TypeError);
  }
  assert.throws(() => findWinningLines([[P, P, P], [S, 'desconhecido', S], [V, V, V]]), RangeError);
});

test('o resultado gerado no servidor preserva a grade e as linhas encontradas', () => {
  const result = createEvaluatedReelRound();
  assert.equal(result.reels.length, 3);
  assert.deepEqual(result.grid, visibleGridFromReels(result.reels));
  assert.deepEqual(result.winningLines, findWinningLines(result.grid));
  assert.deepEqual(result.grid[1], result.reels.map((reel) => reel.symbol));
});
