import { randomInt } from 'node:crypto';
import { DEMO_VOUCHER_TYPES } from '../domain/demo-vouchers.mjs';

const KANTO_VOUCHER_TYPES = ['pokemon', 'stone', 'spins'];

function drawVouchers(rewards, types, draw) {
  return rewards.filter(({ type }) => type === 'voucher').map(({ line }) => {
    const index = draw(types.length);
    if (!Number.isInteger(index) || index < 0 || index >= types.length) throw new RangeError('Invalid voucher draw');
    return { line, type: types[index] };
  });
}

// A prévia local mantém o cenário de estudo com cinco opções.
export function createDemoVouchers(rewards, draw = randomInt) {
  return drawVouchers(rewards, DEMO_VOUCHER_TYPES, draw);
}

// A máquina autenticada sorteia um dos três vales do plano da 1.0 por linha.
export function createKantoVouchers(rewards, draw = randomInt) {
  return drawVouchers(rewards, KANTO_VOUCHER_TYPES, draw);
}
