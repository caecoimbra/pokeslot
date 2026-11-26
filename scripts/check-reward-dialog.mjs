import assert from 'node:assert/strict';

// Controlled browser fixtures: no real accounts, balances or prizes are changed.
export async function checkRewardDialog(browser, origin, axe) {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': '*' };
  let voucherType = 'stone';
  let balance = 20;
  try {
    await page.route('**/neondb/auth/**', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const json = route.request().url().includes('/token') ? { token: 'fixture-token' }
        : { user: { id: 'rewards-A', name: 'Reward fixture' }, session: { token: 'session-A' } };
      return route.fulfill({ headers, json });
    });
    await page.route('**/state', route => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: {
        balance, cycleAt: new Date().toISOString(), ownedVariants: [], vouchers: [], stones: [],
      } }));
    await page.route('**/spin', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      balance = 31;
      return route.fulfill({ headers, json: { status: 'ok', replayed: false,
        grid: [['pokeball', 'pokeball', 'pokeball'], ['spin', 'spin', 'spin'], ['voucher', 'voucher', 'voucher']],
        winningLines: [{ line: 'top', symbol: 'pokeball' }, { line: 'middle', symbol: 'spin' }, { line: 'bottom', symbol: 'voucher' }],
        captures: [{ line: 'top', status: 'duplicate', compensationSpins: 8,
          capture: { speciesId: 25, isShiny: true, rarity: 'rare' } }],
        lineSpins: 4, duplicateSpins: 8, voucherSpins: voucherType === 'spins' ? 2 : 0,
        vouchers: [{ line: 'bottom', type: voucherType, ...(voucherType === 'spins' ? { spinsAwarded: 2 } : {}) }],
      } });
    });
    await page.route('https://pokeapi.co/**', route => route.abort());
    await page.goto(origin + '/?backend=neon');
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    await page.locator('#spin').click();
    const dialog = page.locator('#capture-dialog');
    await page.getByRole('dialog', { name: 'Captura repetida!' }).waitFor();
    assert.match(await dialog.innerText(), /já está na sua Pokédex[\s\S]*\+8 giros creditados/);
    assert.equal(await dialog.getAttribute('data-reward'), 'shiny');
    await page.locator('#capture-dialog-close').click();
    assert.match(await dialog.innerText(), /Giros extras![\s\S]*\+4 giros creditados/);
    await page.locator('#capture-dialog-close').click();
    assert.match(await dialog.innerText(), /Vale pedra/);
    await page.evaluate(axe);
    assert.equal(await page.evaluate(async () => (await window.axe.run(document.querySelector('#capture-dialog'))).violations.length), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    voucherType = 'spins';
    await page.locator('#language').click();
    await page.locator('#spin').click();
    await page.getByRole('dialog', { name: 'Duplicate catch!' }).waitFor();
    await page.locator('#capture-dialog-close').click();
    await page.locator('#capture-dialog-close').click();
    assert.match(await dialog.innerText(), /Spin voucher[\s\S]*\+2 spins credited/);
    await page.locator('#capture-dialog-close').click();
    assert.equal(await dialog.isVisible(), false);
    console.log('Prêmios autenticados simulados: shiny repetido, giros, vales, PT/EN e acessibilidade verificados.');
  } finally { await context.close(); }
}
