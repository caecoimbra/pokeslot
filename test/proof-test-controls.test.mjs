import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupProofTestControls } from '../src/preview/proof-test-controls.mjs';

test('controle de inventário descarta só uma resposta e não interfere na rodada', async () => {
  const oldDocument = globalThis.document;
  const controls = new Map(['test-discard', 'test-discard-inventory', 'test-pause', 'test-status', 'test-switch', 'test-resume']
    .map((id) => [id, { checked: false, textContent: '', addEventListener() {} }]));
  const section = { setAttribute() {}, querySelector: (key) => controls.get(key.slice(1)) };
  globalThis.document = { createElement: () => section, querySelector: () => ({ after() {} }) };
  try {
    const afterRound = setupProofTestControls({ signOut: async () => {} });
    controls.get('test-discard-inventory').checked = true;
    await afterRound();
    await assert.rejects(afterRound.afterInventory(), /simulated_lost_response/);
    assert.equal(controls.get('test-discard-inventory').checked, false);
    await afterRound.afterInventory();
    assert.match(controls.get('test-status').textContent, /inventário/);
  } finally { globalThis.document = oldDocument; }
});
