import assert from 'node:assert/strict';

// Os resultados, a PokéAPI e o áudio são simulados no navegador.
export async function checkPokemonCries(browser, origin) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      window.playedCries = [];
      window.stoppedCries = 0;
      HTMLMediaElement.prototype.pause = function () {
        if (this.getAttribute('src')) window.stoppedCries++;
      };
      HTMLMediaElement.prototype.play = function () {
        window.playedCries.push(this.src);
        if (!window.holdCries) setTimeout(() => this.dispatchEvent(new Event('ended')), 10);
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
    const dexSound = page.locator('#pokedex-sound-toggle');
    assert.equal(await dexSound.getAttribute('aria-pressed'), 'false');
    await dexSound.click();
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
    await page.locator('#back-to-card').click();
    await page.evaluate(() => { window.holdCries = true; });
    await page.locator('#collection [data-species-id="25"]').click();
    await page.waitForFunction(() => window.playedCries.length === 3);
    const stoppedBefore = await page.evaluate(() => window.stoppedCries);
    await dexSound.focus();
    await page.keyboard.press('Enter');
    assert.ok(await page.evaluate(() => window.stoppedCries) > stoppedBefore, 'Mute interrupts the current cry');
    await page.reload();
    await dexSound.waitFor({ state: 'visible' });
    assert.equal(await dexSound.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
    await page.locator('#collection [data-species-id="25"]').click();
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => window.playedCries), [], 'Pokédex mute survives reload');
    await page.locator('#language').click();
    assert.match(await dexSound.textContent(), /Sound off/);
    console.log('Cry na captura/Pokédex, silêncio imediato, controles sincronizados, teclado, idioma e preferência após recarga verificados.');
  } finally { await context.close(); }
}
