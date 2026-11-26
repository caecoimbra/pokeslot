import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardAudio } from '../src/preview/reward-audio.mjs';
import { createArcadeSound } from '../src/preview/arcade-sound.mjs';

function setup() {
  const calls = [];
  const arcadeSound = { stop: () => calls.push('stop-synth'), cue: async (name) => calls.push(name) };
  const pokemonCries = { stop: () => calls.push('stop-cry'), play: async ([id]) => calls.push(`cry:${id}`) };
  return { calls, arcadeSound, pokemonCries, audio: createRewardAudio({ arcadeSound, pokemonCries }) };
}

test('cada prêmio recebe seu som e capturas incluem o cry, inclusive shiny e repetidas', async () => {
  const { audio, calls } = setup();
  for (const item of [
    { kind: 'voucher' }, { kind: 'spins' },
    { kind: 'capture', pokemonId: 25, shiny: false, status: 'new' },
    { kind: 'capture', pokemonId: 131, shiny: true, status: 'new' },
    { kind: 'capture', pokemonId: 25, shiny: false, status: 'duplicate' },
  ]) await audio.play(item);
  assert.deepEqual(calls.filter((call) => !call.startsWith('stop-')),
    ['voucher', 'spins', 'cry:25', 'shiny', 'cry:131', 'duplicate', 'cry:25']);
});

test('interromper ou trocar de prêmio impede o cry de uma captura anterior', async () => {
  const { audio, calls, arcadeSound } = setup();
  let finishCue;
  arcadeSound.cue = (name) => { calls.push(name); return new Promise((resolve) => { finishCue = resolve; }); };
  const playing = audio.play({ kind: 'capture', pokemonId: 25, shiny: true });
  audio.stop();
  finishCue();
  await playing;
  assert.ok(!calls.includes('cry:25'));
});

test('falhas de áudio não bloqueiam a apresentação dos prêmios', async () => {
  const { audio, arcadeSound } = setup();
  arcadeSound.cue = () => { throw new Error('device unavailable'); };
  await assert.doesNotReject(audio.play({ kind: 'voucher' }));
});

test('sons sintetizados são canceláveis e respeitam a preferência de silêncio', async () => {
  const oscillators = [];
  class AudioContext {
    state = 'running'; currentTime = 0; destination = {};
    createOscillator() {
      const oscillator = { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} };
      oscillators.push(oscillator);
      return oscillator;
    }
    createGain() { return { gain: { cancelScheduledValues() {}, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const sound = createArcadeSound({ AudioContext, localStorage: { getItem: () => null, setItem() {} } });
  sound.start();
  const cue = sound.cue('shiny');
  assert.equal(oscillators.length, 2);
  sound.stop();
  await cue;
  sound.toggle();
  await sound.cue('voucher');
  assert.equal(oscillators.length, 2);
});

test('sinal brilhante termina antes do cry e cada tipo usa uma sequência própria', async () => {
  const phrases = [];
  class AudioContext {
    state = 'running'; currentTime = 0; destination = {};
    createOscillator() {
      const notes = [];
      const oscillator = { frequency: { setValueAtTime: (value) => notes.push(value) }, connect() {}, disconnect() {}, start() {}, stop() {} };
      phrases.push({ notes, oscillator });
      return oscillator;
    }
    createGain() { return { gain: { cancelScheduledValues() {}, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const sound = createArcadeSound({ AudioContext, localStorage: { getItem: () => null, setItem() {} } });
  for (const kind of ['voucher', 'spins', 'shiny', 'duplicate']) {
    const playing = sound.cue(kind);
    phrases.at(-1).oscillator.onended();
    await playing;
  }
  assert.deepEqual(phrases.map((phrase) => phrase.notes.length), [2, 7, 7, 3]);
  assert.notDeepEqual(phrases[1].notes, phrases[2].notes);
});
