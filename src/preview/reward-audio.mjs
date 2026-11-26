// Plays only the reward currently visible, and invalidates delayed cries on navigation.
export function createRewardAudio({ arcadeSound, pokemonCries }) {
  let generation = 0;

  function stop() {
    generation++;
    arcadeSound.stop();
    pokemonCries.stop();
  }

  async function play(item) {
    stop();
    const current = generation;
    try {
      if (item.kind === 'voucher') await arcadeSound.cue('voucher');
      else if (item.kind === 'spins') await arcadeSound.cue('spins');
      else if (item.kind === 'capture') {
        if (item.shiny) await arcadeSound.cue('shiny');
        else if (item.status === 'duplicate') await arcadeSound.cue('duplicate');
        if (current === generation) await pokemonCries.play([item.pokemonId]);
      }
    } catch {
      // Audio is optional: a failure must never interrupt the reward flow.
    }
  }

  return { play, stop };
}
