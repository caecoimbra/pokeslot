// Busca o endereço informado pela PokéAPI sob demanda e toca uma captura por vez.
export function createPokemonCries({ isEnabled, fetchImpl = fetch, AudioClass = globalThis.Audio }) {
  const urls = new Map();
  let generation = 0;
  let controller;
  let audio;
  let finishAudio;

  function stop() {
    generation++;
    controller?.abort();
    controller = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = null;
    }
    finishAudio?.();
    finishAudio = null;
  }

  async function cryUrl(id, signal) {
    if (urls.has(id)) return urls.get(id);
    const response = await fetchImpl(`https://pokeapi.co/api/v2/pokemon/${id}/`, { signal });
    if (!response.ok) throw new Error('PokéAPI unavailable');
    const pokemon = await response.json();
    if (pokemon?.id !== id) throw new Error('Invalid Pokémon');
    const value = pokemon.cries?.latest;
    if (typeof value !== 'string') return null;
    const url = new URL(value);
    if (url.origin !== 'https://raw.githubusercontent.com' ||
        url.pathname !== `/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg` ||
        url.username || url.password || url.search || url.hash) return null;
    urls.set(id, url.href);
    return url.href;
  }

  async function play(ids) {
    stop();
    if (!isEnabled() || typeof AudioClass !== 'function') return;
    const version = generation;
    for (const id of ids) {
      if (version !== generation || !isEnabled()) return;
      if (!Number.isInteger(id) || id < 1 || id > 151) continue;
      controller = new AbortController();
      const currentController = controller;
      const timeout = setTimeout(() => currentController.abort(), 10000);
      let url;
      try { url = await cryUrl(id, currentController.signal); }
      catch { continue; }
      finally {
        clearTimeout(timeout);
        if (controller === currentController) controller = null;
      }
      if (!url || version !== generation || !isEnabled()) continue;
      await new Promise((resolve) => {
        const sound = new AudioClass(url);
        audio = sound;
        let timer;
        const finish = () => {
          clearTimeout(timer);
          sound.removeEventListener('ended', finish);
          sound.removeEventListener('error', finish);
          sound.pause();
          sound.removeAttribute('src');
          sound.load();
          if (audio === sound) audio = null;
          if (finishAudio === finish) finishAudio = null;
          resolve();
        };
        finishAudio = finish;
        sound.addEventListener('ended', finish, { once: true });
        sound.addEventListener('error', finish, { once: true });
        timer = setTimeout(finish, 15000);
        try { Promise.resolve(sound.play()).catch(finish); } catch { finish(); }
      });
    }
  }
  return { play, stop };
}
