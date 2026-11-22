import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProofRound, validateProofState } from '../src/preview/proof-result.mjs';

const capture = { speciesId: 25, rarity: 'common', isShiny: true };
const valid = { status: 'ok', replayed: false,
  grid: [['pokeball', 'pokeball', 'pokeball'], ['spin', 'voucher', 'spin'], ['voucher', 'spin', 'voucher']],
  winningLines: [{ line: 'top', symbol: 'pokeball' }],
  captures: [{ line: 'top', capture, status: 'new' }] };

test('aceita rodada coerente com captura shiny e valida estado recuperado', () => {
  assert.equal(validateProofRound(valid), valid);
  const state = { balance: 19, ownedVariants: [{ speciesId: 25, isShiny: true }] };
  assert.equal(validateProofState(state), state);
  assert.equal(validateProofRound({ status: 'no_balance', replayed: false }).status, 'no_balance');
});
test('recusa grade, linhas, capturas e estado incoerentes', () => {
  assert.throws(() => validateProofRound({ ...valid, winningLines: [] }));
  assert.throws(() => validateProofRound({ ...valid, captures: [] }));
  assert.throws(() => validateProofRound({ ...valid, captures: [{ ...valid.captures[0], line: 'bottom' }] }));
  assert.throws(() => validateProofState({ balance: -1, ownedVariants: [] }));
  assert.throws(() => validateProofState({ balance: 3, ownedVariants: [{ speciesId: 152, isShiny: false }] }));
});
