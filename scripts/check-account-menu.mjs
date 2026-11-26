import assert from 'node:assert/strict';

// No real accounts or network calls are used by this browser check.
export async function checkAccountMenu(browser, origin, axe) {
  const context = await browser.newContext({ viewport: { width: 320, height: 760 } });
  const page = await context.newPage();
  const headers = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
  };
  let authenticated = false;
  try {
    await page.route('**/neondb/auth/**', (route) => {
      const url = route.request().url();
      if (url.includes('/get-session')) return route.fulfill({ headers, json: authenticated
        ? { user: { id: 'A', name: 'Jogador A' }, session: { token: 'session-A' } } : null });
      if (url.includes('/token')) return route.fulfill({ headers, json: { token: 'fixture-token' } });
      return route.fulfill({ status: 404, headers, json: {} });
    });
    await page.route('**/state', (route) => route.fulfill({ headers, json: {
      balance: 20, cycleAt: new Date().toISOString(), ownedVariants: [], vouchers: [], stones: [],
    } }));
    await page.goto(origin + '/?backend=neon');
    const menu = page.locator('#proof-auth');
    const summary = page.locator('#account-label');
    await summary.waitFor();
    await page.waitForFunction(() => document.querySelector('#proof-auth-status').textContent !== 'Verificando sua sessão…');
    await summary.press('Enter');
    await page.locator('#proof-login').waitFor({ state: 'visible' });
    const loginPassword = page.locator('#login-password');
    await loginPassword.fill('senha-ficticia');
    await page.getByRole('button', { name: 'Mostrar Senha', exact: true }).click();
    assert.equal(await loginPassword.getAttribute('type'), 'text');
    assert.equal(await loginPassword.inputValue(), 'senha-ficticia');
    await page.getByRole('button', { name: 'Ocultar Senha', exact: true }).click();
    assert.equal(await loginPassword.getAttribute('type'), 'password');
    await page.locator('#open-proof-signup').click();
    await page.locator('#proof-signup').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#proof-signup [name=name]').evaluate(element => element === document.activeElement), true);
    await page.getByRole('button', { name: 'Mostrar Senha de teste (8 caracteres ou mais)', exact: true }).click();
    assert.equal(await page.locator('#signup-password').getAttribute('type'), 'text');
    await page.evaluate(axe);
    const issues = await page.evaluate(async () => (await window.axe.run({
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })).violations.map(({ id }) => id));
    assert.deepEqual(issues, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(element => element.open), false);
    assert.equal(await summary.evaluate(element => element === document.activeElement), true);
    await page.locator('#language').click();
    await summary.click();
    assert.match(await page.locator('#proof-signup').innerText(), /Create account/);
    await page.locator('#open-proof-login').click();
    assert.equal(await page.locator('#proof-login').isVisible(), true);
    authenticated = true;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#account-label').textContent === 'Jogador A');
    await summary.click();
    assert.equal(await page.locator('#proof-logout').isVisible(), true);
    assert.equal(await page.locator('#proof-login').isVisible(), false);
    await page.locator('#machine-title').click();
    assert.equal(await menu.evaluate(element => element.open), false);
    console.log('Menu de conta, cadastro, teclado, idioma e layout móvel verificados.');
  } finally { await context.close(); }
}
