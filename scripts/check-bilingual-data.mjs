import assert from 'node:assert/strict';

// Sem rede PokéAPI: o catálogo estático continua útil nos dois idiomas.
export async function checkBilingualData(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route('**/api/demo-state', (route) => route.fulfill({ json: {
      balance: 20, cycleStartedAtMs: Date.now(), ownedVariants: [{ speciesId: 25, isShiny: false }],
      vouchers: [], stones: [],
    } }));
    await page.route('https://pokeapi.co/**', (route) => route.abort());
    await page.goto(origin + '/#pokedex');
    await page.locator('#collection [data-species-id="25"]').click();
    await page.locator('#detail-content').waitFor();
    assert.match(await page.locator('#pokemon-description').textContent(), /bolsas elétricas/);
    assert.match(await page.locator('#description-source').textContent(), /tradução PT-BR do projeto/);
    await page.locator('#language').click();
    assert.match(await page.locator('#pokemon-description').textContent(), /electric sacs/);
    assert.match(await page.locator('#description-source').textContent(), /PokéAPI description/);
    assert.doesNotMatch(await page.locator('#description-source').textContent(), /translation/);
    assert.match(await page.locator('#selected-pokemon').textContent(), /Pikachu/);
    await page.locator('#language').click();
    assert.match(await page.locator('#pokemon-description').textContent(), /bolsas elétricas/);
    console.log('Descrições PT/EN, proveniência e fallback com a PokéAPI indisponível verificados.');
  } finally { await context.close(); }
}
