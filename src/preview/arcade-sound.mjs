// Original, short phrases. Frequencies use MIDI note numbers for a small arcade synth.
const roll = [64, 71, 76, 74, 69, 72, 71, 67];
const win = [72, 76, 79, 84];
const miss = [64, 57];
const preference = 'pokeslot.sound';

export function createArcadeSound(env = globalThis) {
  const Audio = env.AudioContext ?? env.webkitAudioContext;
  let enabled = true;
  try { enabled = env.localStorage.getItem(preference) !== 'off'; } catch { /* Optional storage. */ }
  let context;
  let voice;
  let rolling = false;

  function stop() {
    rolling = false;
    if (!voice) return;
    const { oscillator, envelope } = voice;
    voice = null;
    const now = context.currentTime;
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setTargetAtTime(0, now, .005);
    try { oscillator.stop(now + .025); } catch { /* The device may have closed. */ }
  }

  function phrase(notes, beat, repeats, volume) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'triangle';
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    voice = { oscillator, envelope };
    const start = context.currentTime;
    for (let i = 0; i < notes.length * repeats; i++) {
      const time = start + i * beat;
      const frequency = 440 * 2 ** ((notes[i % notes.length] - 69) / 12);
      oscillator.frequency.setValueAtTime(frequency, time);
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(volume, time + .009);
      envelope.gain.linearRampToValueAtTime(0, time + beat * .88);
    }
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      if (voice?.oscillator !== oscillator) return;
      voice = null;
      if (rolling && context.state === 'running') {
        try { phrase(notes, beat, repeats, volume); } catch { stop(); }
      }
    };
    oscillator.start(start);
    oscillator.stop(start + beat * notes.length * repeats);
  }

  return {
    available: Boolean(Audio),
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      if (!enabled) stop();
      try { env.localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch { /* Session only. */ }
    },
    start() {
      stop();
      if (!enabled || !Audio) return;
      try {
        context ??= new Audio();
        if (context.state === 'suspended') context.resume().catch(() => {});
        // Schedule a few bars at a time, including when the server takes longer to reply.
        phrase(roll, .09, 3, .055);
        rolling = true;
      } catch { stop(); }
    },
    finish(won) {
      const announce = rolling && enabled && context?.state === 'running';
      stop();
      if (announce) {
        try { phrase(won ? win : miss, won ? .105 : .135, 1, won ? .075 : .05); }
        catch { stop(); }
      }
    },
    stop,
  };
}
