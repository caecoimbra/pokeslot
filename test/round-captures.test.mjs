import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoundCaptures } from '../src/domain/round-captures.mjs';
import { createReelRound } from '../src/domain/reels.mjs';
import { evaluateReelRoundCaptures } from '../src/server/reel-round.mjs';

test('associa as capturas às linhas e reconhece repetições na mesma rodada', () => {
  const rewards = [
    { line: 'top', type: 'pokemon' },
    { line: 'middle', type: 'extra_spins' },
    { line: 'diagonal_down', type: 'pokemon' },
  ];
  const captures = [
    { speciesId: 25, isShiny: false, rarity: 'rare' },
    { speciesId: 25, isShiny: false, rarity: 'rare' },
  ];
  assert.deepEqual(evaluateRoundCaptures(rewards, captures, []), [
    { line: 'top', capture: captures[0], status: 'new', compensation: null },
    { line: 'diagonal_down', capture: captures[1], status: 'duplicate',
      compensation: { rarity: 'rare', useShinyMultiplier: false } },
  ]);
});

test('uma rodada sem recompensa de Pokémon não exige captura', () => {
  assert.deepEqual(evaluateRoundCaptures([{ line: 'top', type: 'voucher' }], [], []), []);
});

test('recusa quantidades incompatíveis e capturas inválidas', () => {
  const rewards = [{ line: 'top', type: 'pokemon' }];
  assert.throws(() => evaluateRoundCaptures(rewards, [], []), RangeError);
  assert.throws(() => evaluateRoundCaptures([], [{ speciesId: 1 }], []), RangeError);
  assert.throws(() => evaluateRoundCaptures(rewards, [null], []), TypeError);
  assert.throws(() => evaluateRoundCaptures(null, [], []), TypeError);
});

test('compõe a rodada no servidor e avalia cada captura em sequência', () => {
  let calls = 0;
  const reels = createReelRound((limit) => {
    calls += 1;
    return calls % 20 === 0 ? 5 : limit - 1;
  });
  const selectedLines = [];
  const result = evaluateReelRoundCaptures(reels, (line) => {
    selectedLines.push(line);
    return { speciesId: 25, isShiny: false, rarity: 'rare' };
  }, []);
  assert.deepEqual(selectedLines, ['top', 'middle', 'bottom', 'diagonal_down', 'diagonal_up']);
  assert.deepEqual(result.captures.map(({ line }) => line), selectedLines);
  assert.deepEqual(result.captures.map(({ status }) => status), [
    'new', 'duplicate', 'duplicate', 'duplicate', 'duplicate',
  ]);
});

test('uma rodada sem Pokébolas vencedoras não chama o seletor de capturas', () => {
  let calls = 0;
  const reels = createReelRound((limit) => {
    calls += 1;
    return calls % 20 === 0 ? 17 : limit - 1;
  });
  const result = evaluateReelRoundCaptures(reels, () => {
    throw new Error('Não deveria selecionar captura');
  }, []);
  assert.deepEqual(result.captures, []);
  assert.throws(() => evaluateReelRoundCaptures(reels, null, []), TypeError);
});
