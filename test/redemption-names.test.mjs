import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedemptionNamesLoader } from '../src/preview/redemption-names.mjs';

test('mantém a lista existente após falha e recupera nomes em nova tentativa', async () => {
  let calls = 0;
  let applied = null;
  const seen = [];
  const loader = createRedemptionNamesLoader({ expectedIds: [1, 2], onChange: () => seen.push(loader.state),
    fetchNames: async () => { if (++calls === 1) throw new Error('offline'); return [{ id: 1, name: 'one' }, { id: 2, name: 'two' }]; },
    applyNames: (entries) => { applied = entries; } });
  await loader.load();
  assert.equal(loader.state, 'error');
  assert.equal(applied, null);
  await loader.load();
  assert.equal(loader.state, 'ready');
  assert.equal(applied.length, 2);
  assert.deepEqual(seen, ['loading', 'error', 'loading', 'ready']);
});

test('não aplica nomes incompletos ou duplicados', async () => {
  let applied = false;
  const loader = createRedemptionNamesLoader({ expectedIds: [1, 2], fetchNames: async () => [{ id: 1 }, { id: 1 }],
    applyNames: () => { applied = true; }, onChange: () => {} });
  await loader.load();
  assert.equal(loader.state, 'error');
  assert.equal(applied, false);
});
