import assert from 'node:assert/strict';

// Tests only use an intercepted local round and a disposable browser context.
export async function checkCaptureDialog(browser, origin) {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const grid = [
    ['pokeball', 'pokeball', 'pokeball'],
    ['pokeball', 'pokeball', 'pokeball'],
    ['spin', 'voucher', 'spin'],
  ];
  const winningLines = [{ line: 'top', symbol: 'pokeball' }, { line: 'middle', symbol: 'pokeball' }];
  let duplicate = false;
  let release;
  let arrived;
  try {
    await page.route('**/api/demo-state', route => route.fulfill({ json: {
      balance: 20, cycleStartedAtMs: Date.now(), ownedVariants: [], vouchers: [], stones: [],
    } }));
    await page.route('**/api/demo-round', async (route) => {
      arrived?.();
      if (!duplicate) await new Promise(resolve => { release = resolve; });
      await route.fulfill({ json: {
        status: 'ok', grid, winningLines,
        captures: [
          { line: 'top', status: duplicate ? 'duplicate' : 'new', capture: { speciesId: 25, rarity: 'common', isShiny: false } },
          { line: 'middle', status: duplicate ? 'duplicate' : 'new', capture: { speciesId: 131, rarity: 'rare', isShiny: false } },
        ],
      } });
    });
    await page.route('https://pokeapi.co/**', route => route.abort());
    await page.goto(origin + '/');
    const spin = page.locator('#spin');
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    const started = new Promise(resolve => { arrived = resolve; });
    await spin.click();
    await started;
    assert.equal(await page.locator('#capture-dialog').isVisible(), false);
    release();
    const dialog = page.getByRole('dialog', { name: 'Nova captura!' });
    await dialog.waitFor();
    assert.deepEqual(await dialog.locator('.capture-card strong').allTextContents(), ['Pikachu']);
    await dialog.getByRole('button', { name: 'Próximo prêmio' }).click();
    assert.deepEqual(await dialog.locator('.capture-card strong').allTextContents(), ['Lapras']);
    assert.equal(await dialog.getByText('Normal · Raro').count(), 1);
    assert.equal(await dialog.locator('img').count(), 1);
    assert.equal(await dialog.locator('.capture-dialog-content').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement === document.querySelector('#spin'));
    assert.equal(await spin.evaluate(el => document.activeElement === el), true);
    duplicate = true;
    await spin.click();
    const duplicateDialog = page.getByRole('dialog', { name: 'Captura repetida!' });
    await duplicateDialog.waitFor();
    assert.match(await duplicateDialog.innerText(), /Compensação não aplicada nesta demonstração/);
    await duplicateDialog.getByRole('button', { name: 'Próximo prêmio' }).click();
    assert.match(await duplicateDialog.innerText(), /Lapras/);
    await duplicateDialog.getByRole('button', { name: 'Continuar' }).click();
    console.log('Apresentação de capturas, múltiplas linhas, duplicatas e movimento reduzido verificadas.');
  } finally {
    release?.();
    await context.close();
  }
}
