import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDY_TIERS } from '../scripts/data/kanto-estudo.mjs';
import { knownEvolutionOptions } from '../src/server/evolution.mjs';

test('catálogo de teste PostgreSQL acompanha os tiers e as receitas locais', async () => {
  const sql = await readFile(new URL('../db/neon/isolated_inventory.sql', import.meta.url), 'utf8');
  const tiers = [...sql.matchAll(/v_species = ANY\(ARRAY\[([^\]]+)\]\) THEN v_rarity := '([^']+)'/g)];
  assert.equal(tiers.length, STUDY_TIERS.length);
  for (const tier of STUDY_TIERS) {
    const found = tiers.find((match) => match[2] === tier.rarity);
    assert.ok(found, `Tier ausente: ${tier.rarity}`);
    assert.deepEqual(found[1].split(',').map(Number).sort((a, b) => a - b), [...tier.speciesIds].sort((a, b) => a - b));
  }
  const values = sql.match(/FROM \(VALUES (.*?)\) AS r\(source_id,target_id,stone\)/s);
  assert.ok(values, 'Receitas SQL não encontradas');
  const recipes = [...values[1].matchAll(/\((\d+),(\d+),'([^']+)'\)/g)].map(([, source, target, stone]) => ({ sourceId: Number(source), targetId: Number(target), stone }));
  assert.deepEqual(recipes, knownEvolutionOptions());
});
