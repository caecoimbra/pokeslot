import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDescription } from '../src/preview/description.mjs';

test('prefere FireRed, depois LeafGreen, sem alterar a lista', () => {
  const red = { text: 'Red', version: 'firered' };
  const green = { text: 'Green', version: 'leafgreen' };
  const entries = [green, { text: 'Outro', version: 'blue' }, red];
  assert.equal(selectDescription({ en: entries }, 'en'), red);
  assert.equal(selectDescription({ en: entries.slice(0, 2) }, 'en'), green);
  assert.equal(entries[0], green);
});

test('usa a primeira descrição no idioma solicitado ou informa ausência', () => {
  const english = { text: 'Example', version: 'blue' };
  assert.equal(selectDescription({ en: [english] }, 'en'), english);
  assert.equal(selectDescription({ en: [english], pt: [] }, 'pt'), null);
  assert.equal(selectDescription(null, 'pt'), null);
});
