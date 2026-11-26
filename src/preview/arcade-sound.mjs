// Original, short phrases. Frequencies use MIDI note numbers for a small arcade synth.
const roll = [64, 71, 76, 74, 69, 72, 71, 67];
const win = [72, 76, 79, 84];
const miss = [64, 57];
// Short original cues; they do not depend on downloaded audio or third-party assets.
const cues = {
  voucher: { notes: [88, 95], beat: .12, volume: .065 },
  spins: { notes: [60, 64, 67, 72, 76, 79, 84], beat: .065, volume: .06 },
  shiny: { notes: [79, 86, 91, 88, 95, 100, 103], beat: .09, volume: .065 },
  duplicate: { notes: [76, 72, 79], beat: .1, volume: .055 },
};
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
    const { oscillator, envelope, resolve } = voice;
    voice = null;
    try {
      const now = context.currentTime;
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setTargetAtTime(0, now, .005);
      oscillator.stop(now + .025);
    } catch { /* The device may have closed. */ }
    finally { resolve?.(); }
  }

  function phrase(notes, beat, repeats, volume, resolve) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'triangle';
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    voice = { oscillator, envelope, resolve };
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
      resolve?.();
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
    cue(kind) {
      stop();
      const cue = cues[kind];
      if (!cue || !enabled || !Audio) return Promise.resolve();
      try {
        context ??= new Audio();
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch { return Promise.resolve(); }
      // A browser can refuse autoplay; the visual reward must still work.
      if (context.state !== 'running') return Promise.resolve();
      return new Promise((resolve) => {
        try { phrase(cue.notes, cue.beat, 1, cue.volume, resolve); }
        catch { stop(); resolve(); }
      });
    },
    stop,
  };
}
