import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoVouchers } from '../src/server/demo-vouchers.mjs';
import { DEMO_VOUCHER_TYPES } from '../src/domain/demo-vouchers.mjs';

test('cada um dos cinco resultados possíveis pode ser sorteado por linha de vale', () => {
  for (let index = 0; index < DEMO_VOUCHER_TYPES.length; index++) {
    const selected = createDemoVouchers([{ line: 'top', type: 'voucher' }], (limit) => {
      assert.equal(limit, 5);
      return index;
    });
    assert.deepEqual(selected, [{ line: 'top', type: DEMO_VOUCHER_TYPES[index] }]);
  }
  assert.deepEqual(createDemoVouchers([{ line: 'top', type: 'pokemon' }]), []);
  assert.throws(() => createDemoVouchers([{ line: 'top', type: 'voucher' }], () => 5));
});
