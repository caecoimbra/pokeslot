import test from 'node:test';
import assert from 'node:assert/strict';
import { createPokemonCries } from '../src/preview/pokemon-cries.mjs';

class FakeAudio extends EventTarget {
  static instances = [];
  constructor(url) {
    super();
    this.url = url;
    this.paused = false;
    FakeAudio.instances.push(this);
  }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() {}
  load() {}
}
const urlFor = (id) => `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
const responseFor = (id) => ({ ok: true, json: async () => ({ id, cries: { latest: urlFor(id) } }) });
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test('carrega o cry da PokéAPI e reproduz capturas sequencialmente', async () => {
  FakeAudio.instances = [];
  const requests = [];
  const cries = createPokemonCries({
    isEnabled: () => true, AudioClass: FakeAudio,
    fetchImpl: async (url) => {
      requests.push(url);
      return responseFor(Number(url.match(/pokemon\/(\d+)\/$/)[1]));
    },
  });
  const playing = cries.play([25, 131]);
  await nextTurn();
  assert.equal(FakeAudio.instances.length, 1);
  assert.equal(FakeAudio.instances[0].url, urlFor(25));
  FakeAudio.instances[0].dispatchEvent(new Event('ended'));
  await nextTurn();
  assert.equal(FakeAudio.instances.length, 2);
  assert.equal(FakeAudio.instances[1].url, urlFor(131));
  FakeAudio.instances[1].dispatchEvent(new Event('ended'));
  await playing;
  assert.equal(requests.length, 2);
  const again = cries.play([25]);
  await nextTurn();
  FakeAudio.instances[2].dispatchEvent(new Event('ended'));
  await again;
  assert.equal(requests.length, 2, 'o endereço já consultado é reutilizado');
});

test('parar interrompe o áudio e a sequência, e som desligado não faz pedidos', async () => {
  FakeAudio.instances = [];
  let enabled = true;
  let calls = 0;
  const cries = createPokemonCries({
    isEnabled: () => enabled, AudioClass: FakeAudio,
    fetchImpl: async () => { calls++; return responseFor(25); },
  });
  const playing = cries.play([25, 131]);
  await nextTurn();
  cries.stop();
  await playing;
  assert.equal(FakeAudio.instances[0].paused, true);
  enabled = false;
  await cries.play([25]);
  assert.equal(calls, 1);
});

test('ignora dados ausentes, URL externa inesperada e falhas da API', async () => {
  FakeAudio.instances = [];
  for (const result of [
    { ok: false },
    { ok: true, json: async () => ({ id: 25, cries: { latest: 'https://evil.example/25.ogg' } }) },
    { ok: true, json: async () => ({ id: 25, cries: { latest: null } }) },
  ]) {
    const cries = createPokemonCries({ isEnabled: () => true, AudioClass: FakeAudio, fetchImpl: async () => result });
    await cries.play([25]);
  }
  assert.equal(FakeAudio.instances.length, 0);
});
