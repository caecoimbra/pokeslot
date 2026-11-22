import { randomInt } from 'node:crypto';
import { DEMO_VOUCHER_TYPES } from '../domain/demo-vouchers.mjs';

// Catálogo e probabilidades são hipóteses exclusivas da prévia local.
export function createDemoVouchers(rewards, draw = randomInt) {
  return rewards.filter(({ type }) => type === 'voucher').map(({ line }) => {
    const index = draw(DEMO_VOUCHER_TYPES.length);
    if (!Number.isInteger(index) || index < 0 || index >= DEMO_VOUCHER_TYPES.length) throw new RangeError('Invalid voucher draw');
    return { line, type: DEMO_VOUCHER_TYPES[index] };
  });
}
