import assert from 'node:assert/strict';

export async function checkDexCardLabels(browser, origin, axeSource) {
  const page = await browser.newPage();
  try {
    const ownedVariants = [
      { speciesId: 126, isShiny: false }, { speciesId: 25, isShiny: true },
      { speciesId: 151, isShiny: false }, { speciesId: 151, isShiny: true },
    ];
    await page.route('**/api/demo-state', route => route.fulfill({ json: {
      balance: 20, cycleStartedAtMs: Date.now(), stones: [], vouchers: [], ownedVariants,
    } }));
    await page.goto(origin + '/previa-maquina.html#pokedex');
    const catalog = page.locator('#collection');
    for (const language of ['pt', 'en']) {
      if (language === 'en') await page.locator('#language').click();
      for (const name of ['#126 Magmar Normal', '#025 Pikachu Shiny', '#151 Mew Normal · Shiny']) {
        await catalog.getByRole('button', { name, exact: true }).waitFor({ timeout: 5000 });
      }
      const unknown = language === 'pt' ? 'Espécie desconhecida' : 'Unknown species';
      assert.equal(await catalog.getByRole('button', { name: '#001, ' + unknown, exact: true }).isDisabled(), true);
      await page.evaluate(axeSource);
      const violations = await page.evaluate(async () => (await window.axe.run('#collection', {
        runOnly: ['label-content-name-mismatch'],
      })).violations.map(rule => ({ rule: rule.id, cards: rule.nodes.map(node => node.target) })));
      assert.deepEqual(violations, [], 'Nomes acessíveis dos cartões em ' + language);
    }
  } finally {
    await page.close();
  }
}
