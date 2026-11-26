import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sources from '../src/pokeapi/kanto-description-sources.json' with { type: 'json' };
import portuguese from '../src/pokeapi/kanto-descriptions-pt.json' with { type: 'json' };
import { selectDescription } from '../src/preview/description.mjs';

test('as 151 espécies têm descrição em ambos os idiomas e proveniência por ID', () => {
  assert.equal(sources.entries.length, 151);
  assert.equal(Object.keys(portuguese).length, 151);
  for (let id = 1; id <= 151; id++) {
    const source = sources.entries[id - 1];
    assert.equal(source.id, id);
    assert.equal(source.sourceUrl, `https://pokeapi.co/api/v2/pokemon-species/${id}/`);
    assert.ok(source.name.length > 0);
    for (const language of ['pt', 'en']) {
      const entry = selectDescription(null, language, id);
      assert.ok(entry.text.length > 20, `${id}: ${language}`);
      assert.equal(entry.translated, language === 'pt');
      assert.equal(entry.version, source.version);
    }
  }
});

test('atualizar a fonte inglesa exige rever as traduções', () => {
  const digest = createHash('sha256').update(JSON.stringify(sources.entries.map(({ id, en, version }) =>
    ({ id, en, version })))).digest('hex');
  assert.equal(digest, '1182b200196299d022e00e2cec4f6364505d691b27606e18bca5d0006e514fe8');
});

test('prefere tradução nativa futura, mantém idiomas separados e restringe o catálogo a Kanto', () => {
  const native = { text: 'Texto nativo.', language: 'pt-br', version: 'firered' };
  assert.equal(selectDescription({ pt: [native] }, 'pt', 25), native);
  assert.equal(selectDescription({ en: [{ text: 'English' }] }, 'pt', 25).text, portuguese[25]);
  assert.equal(selectDescription(null, 'en', 25).text, sources.entries[24].en);
  assert.equal(selectDescription(null, 'pt', 152), null);
  assert.equal(selectDescription(null, 'fr', 25), null);
});
