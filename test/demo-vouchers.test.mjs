import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoVouchers, createKantoVouchers } from '../src/server/demo-vouchers.mjs';
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

test('a máquina autenticada sorteia um dos três vales equiprováveis por linha', () => {
  const rewards = [
    { line: 'top', type: 'voucher' }, { line: 'middle', type: 'extra_spins' },
    { line: 'bottom', type: 'voucher' }, { line: 'diagonal_up', type: 'voucher' },
  ];
  let index = 0;
  const selected = createKantoVouchers(rewards, (limit) => {
    assert.equal(limit, 3);
    return index++;
  });
  assert.deepEqual(selected, [
    { line: 'top', type: 'pokemon' }, { line: 'bottom', type: 'stone' }, { line: 'diagonal_up', type: 'spins' },
  ]);
  assert.throws(() => createKantoVouchers(rewards, () => 3), RangeError);
});
