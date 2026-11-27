import assert from 'node:assert/strict';

// Deterministic local fixtures; no real accounts or spins are used.
export async function checkRewardTiming(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  try {
    await page.route('**/api/demo-state', route => route.fulfill({ json: {
      balance: 20, cycleStartedAtMs: Date.now(), ownedVariants: [], vouchers: [], stones: [],
    } }));
    await page.route('**/api/demo-round', route => route.fulfill({ json: {
      status: 'ok', grid: [['pokeball', 'pokeball', 'pokeball'], ['spin', 'voucher', 'spin'], ['voucher', 'spin', 'voucher']],
      winningLines: [{ line: 'top', symbol: 'pokeball' }],
      captures: [{ line: 'top', status: 'new', capture: { speciesId: 25, rarity: 'common', isShiny: false } }],
    } }));
    await page.route('https://pokeapi.co/**', route => route.abort());
    await page.goto(origin + '/');
    const spin = page.locator('#spin');
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    await spin.click();
    await page.waitForFunction(() => document.querySelector('.reel-paylines .lane-won'));
    const started = Date.now();
    assert.equal(await page.locator('#capture-dialog').isVisible(), false, 'Winning line is visible before the reward');
    assert.equal(await spin.isDisabled(), true, 'A second spin cannot start while the reward is pending');
    await page.locator('#capture-dialog').waitFor({ state: 'visible' });
    assert.ok(Date.now() - started >= 300, 'Winning line remains visible before the modal');
    assert.equal(await page.locator('#capture-dialog').evaluate(el => getComputedStyle(el).animationName), 'reward-emerge');
    assert.notEqual(await page.locator('#capture-dialog').evaluate(el => el.style.getPropertyValue('--reward-origin-y')), '');
    await page.locator('#capture-dialog-close').click();
    await spin.click();
    await page.waitForFunction(() => document.querySelector('.reel-paylines .lane-won'));
    await page.locator('[data-screen-link=pokedex]').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#capture-dialog').isVisible(), false, 'Changing screens suppresses the delayed reward');
    console.log('Linha vencedora, espera, transição e troca de tela verificadas.');
  } finally { await context.close(); }
}
