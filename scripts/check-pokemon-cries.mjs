import assert from 'node:assert/strict';

// Os resultados, a PokéAPI e o áudio são simulados no navegador.
export async function checkPokemonCries(browser, origin) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      window.playedCries = [];
      HTMLMediaElement.prototype.play = function () {
        window.playedCries.push(this.src);
        setTimeout(() => this.dispatchEvent(new Event('ended')), 10);
        return Promise.resolve();
      };
    });
    await page.route('**/api/demo-state', (route) => route.fulfill({ json: {
      balance: 20, cycleStartedAtMs: Date.now(), ownedVariants: [{ speciesId: 25, isShiny: false }],
      vouchers: [], stones: [],
    } }));
    await page.route('**/api/demo-round', (route) => route.fulfill({ json: {
      status: 'ok',
      grid: [['pokeball', 'pokeball', 'pokeball'], ['spin', 'voucher', 'spin'], ['voucher', 'spin', 'voucher']],
      winningLines: [{ line: 'top', symbol: 'pokeball' }],
      captures: [{ line: 'top', status: 'new', capture: { speciesId: 25, rarity: 'common', isShiny: false } }],
    } }));
    await page.route('https://pokeapi.co/**', (route) => {
      if (route.request().url() === 'https://pokeapi.co/api/v2/pokemon/25/') return route.fulfill({ json: {
        id: 25, cries: { latest: 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg' },
      } });
      return route.abort();
    });
    await page.goto(origin + '/');
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    await page.locator('#spin').click();
    await page.getByRole('dialog', { name: 'Nova captura!' }).waitFor();
    await page.waitForFunction(() => window.playedCries.length === 1);
    assert.match((await page.evaluate(() => window.playedCries))[0], /\/25\.ogg$/);
    await page.locator('#capture-dialog-close').click();
    await page.locator('[data-screen-link=pokedex]').click();
    await page.locator('#collection [data-species-id="25"]').click();
    await page.waitForFunction(() => window.playedCries.length === 2);
    await page.locator('#back-to-card').click();
    await page.locator('[data-screen-link=machine]').click();
    await page.locator('#sound-toggle').click();
    await page.locator('[data-screen-link=pokedex]').click();
    await page.locator('#collection [data-species-id="25"]').click();
    await page.waitForTimeout(100);
    assert.equal((await page.evaluate(() => window.playedCries)).length, 2);
    console.log('Cry na captura e Pokédex, cache e opção de silenciar verificados.');
  } finally { await context.close(); }
}
