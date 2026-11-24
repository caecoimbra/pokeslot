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

test('valida estoques sem aceitar tipo, quantidade ou entradas duplicadas', () => {
  const base = { balance: 20, ownedVariants: [] };
  assert.doesNotThrow(() => validateProofState({
    ...base,
    vouchers: [{ type: 'pokemon', amount: 2 }],
    stones: [{ type: 'moon', amount: 1 }, { type: 'dragon', amount: 1 }],
  }));
  assert.throws(() => validateProofState({ ...base, vouchers: [{ type: 'spins', amount: 1 }] }));
  assert.throws(() => validateProofState({ ...base, stones: [{ type: 'moon', amount: 0 }] }));
  assert.throws(() => validateProofState({ ...base, stones: [{ type: 'steel', amount: 1 }] }));
  assert.throws(() => validateProofState({ ...base, stones: [{ type: 'moon', amount: 1 }, { type: 'moon', amount: 2 }] }));
  assert.throws(() => validateProofState({ ...base, vouchers: null }));
});

test('valida prêmios de vale contra a grade e conserva rodadas antigas', () => {
  const base = { status: 'ok', replayed: false,
    grid: [['voucher', 'voucher', 'voucher'], ['spin', 'pokeball', 'spin'], ['pokeball', 'spin', 'pokeball']],
    winningLines: [{ line: 'top', symbol: 'voucher' }], captures: [] };
  assert.doesNotThrow(() => validateProofRound(base));
  assert.doesNotThrow(() => validateProofRound({ ...base, vouchers: [{ line: 'top', type: 'stone' }], voucherSpins: 0 }));
  assert.doesNotThrow(() => validateProofRound({ ...base, vouchers: [{ line: 'top', type: 'spins', spinsAwarded: 2 }], voucherSpins: 2 }));
  assert.throws(() => validateProofRound({ ...base, vouchers: [{ line: 'bottom', type: 'stone' }], voucherSpins: 0 }));
  assert.throws(() => validateProofRound({ ...base, vouchers: [{ line: 'top', type: 'spins', spinsAwarded: 2 }], voucherSpins: 4 }));
  assert.throws(() => validateProofRound({ ...base, vouchers: [{ line: 'top', type: 'unknown' }], voucherSpins: 0 }));
  assert.throws(() => validateProofRound({ ...base, vouchers: [], voucherSpins: 0 }));
});

test('recupera rodadas e estoque dos vales que só existiam na prova de cinco tipos', () => {
  const vouchers = [
    { line: 'top', type: 'type' }, { line: 'bottom', type: 'shiny_charm' },
  ];
  const replay = { status: 'ok', replayed: true,
    grid: [['voucher', 'voucher', 'voucher'], ['spin', 'pokeball', 'spin'], ['voucher', 'voucher', 'voucher']],
    winningLines: [{ line: 'top', symbol: 'voucher' }, { line: 'bottom', symbol: 'voucher' }],
    captures: [], vouchers, voucherSpins: 0 };
  const state = { balance: 19, ownedVariants: [], vouchers: [{ type: 'type', amount: 1 }, { type: 'shiny_charm', amount: 2 }] };
  assert.equal(validateProofRound(replay), replay);
  assert.equal(validateProofState(state), state);
});
