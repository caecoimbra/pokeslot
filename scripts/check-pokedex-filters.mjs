import assert from 'node:assert/strict';

// A local fixture verifies combinations without exposing real collections.
export async function checkPokedexFilters(browser, origin, axe) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.route('**/api/demo-state', (route) => route.fulfill({ json: {
      balance: 20, cycleStartedAtMs: Date.now(), vouchers: [], stones: [],
      ownedVariants: [
        { speciesId: 1, isShiny: false }, { speciesId: 25, isShiny: true },
        { speciesId: 151, isShiny: false }, { speciesId: 151, isShiny: true },
      ],
    } }));
    await page.route('https://pokeapi.co/**', (route) => route.abort());
    await page.goto(origin + '/#pokedex');
    await page.locator('#collection [data-species-id="25"]').waitFor();
    const visibleIds = () => page.locator('#collection li:visible button').evaluateAll(
      (buttons) => buttons.map((button) => Number(button.dataset.speciesId)),
    );
    await page.getByRole('button', { name: 'Capturados', exact: true }).click();
    assert.deepEqual(await visibleIds(), [1, 25, 151]);
    await page.getByRole('button', { name: 'Comum', exact: true }).click();
    assert.deepEqual(await visibleIds(), [1, 25]);
    assert.equal(await page.getByRole('button', { name: 'Comum', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.locator('#collection-variant').selectOption('shiny');
    assert.deepEqual(await visibleIds(), [25]);
    await page.locator('#collection-number').fill('pika');
    assert.deepEqual(await visibleIds(), [25]);
    await page.getByRole('button', { name: 'Lendário', exact: true }).click();
    assert.deepEqual(await visibleIds(), []);
    await page.locator('#collection-number').fill('');
    assert.deepEqual(await visibleIds(), [151]);
    await page.locator('#language').click();
    assert.equal(await page.getByRole('button', { name: 'Legendary', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Caught', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(axe);
    const findings = await page.evaluate(async () => (await window.axe.run({
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })).violations.map(({ id }) => id));
    assert.deepEqual(findings, []);
    console.log('Filtros de raridade e captura, variantes e acessibilidade verificados.');
  } finally { await context.close(); }
}
