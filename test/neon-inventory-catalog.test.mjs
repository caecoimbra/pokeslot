import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDY_TIERS } from '../scripts/data/kanto-estudo.mjs';

test('catálogo de teste PostgreSQL acompanha os tiers provisórios', async () => {
  const sql = await readFile(new URL('../db/neon/isolated_inventory.sql', import.meta.url), 'utf8');
  const tiers = [...sql.matchAll(/v_species = ANY\(ARRAY\[([^\]]+)\]\) THEN v_rarity := '([^']+)'/g)];
  assert.equal(tiers.length, STUDY_TIERS.length);
  for (const tier of STUDY_TIERS) {
    const found = tiers.find((match) => match[2] === tier.rarity);
    assert.ok(found, `Tier ausente: ${tier.rarity}`);
    assert.deepEqual(found[1].split(',').map(Number).sort((a, b) => a - b), [...tier.speciesIds].sort((a, b) => a - b));
  }
});
