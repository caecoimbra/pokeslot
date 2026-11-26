import assert from 'node:assert/strict';

// Disposable sessions and intercepted responses; never creates a real account or round.
export async function checkGuestIntro(browser, origin, screenshots = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const headers = {
    'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': '*',
  };
  let session = null;
  let roundCalls = 0;
  let stateCalls = 0;
  try {
    await page.route('**/neondb/auth/**', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const url = route.request().url();
      if (url.includes('/get-session')) return route.fulfill({ headers, json: session });
      if (url.includes('/token')) return route.fulfill({ headers, json: { token: 'fixture-token' } });
      return route.fulfill({ status: 404, headers, json: {} });
    });
    await page.route('**/spin', route => { roundCalls++; return route.abort(); });
    await page.route('**/state', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      stateCalls++;
      return route.fulfill({ headers, json: {
        balance: 20, cycleAt: new Date().toISOString(), ownedVariants: [], vouchers: [], stones: [],
      } });
    });
    await page.route('https://pokeapi.co/**', route => route.abort());
    await page.goto(origin + '/?backend=neon');
    const spin = page.locator('#spin');
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    assert.equal(await page.locator('#demo-balance').textContent(), '—');
    await spin.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Professor Coimbra' });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Bem-vindo ao PokéSlot/);
    assert.equal(await page.locator('#demo-balance').textContent(), '—');
    assert.equal(roundCalls, 0);
    assert.equal(stateCalls, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).animationName), 'none');
    if (screenshots.axe) {
      await page.evaluate(screenshots.axe);
      const violations = await page.evaluate(async () => (await window.axe.run({
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })));
      assert.deepEqual(violations, [], 'Acessibilidade da introdução');
    }
    if (screenshots.mobile) {
      await dialog.locator('img').waitFor({ state: 'visible' });
      await page.screenshot({ path: screenshots.mobile });
    }
    if (screenshots.desktop) {
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.screenshot({ path: screenshots.desktop });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    assert.match(await dialog.innerText(), /Antes de jogar/);
    await dialog.getByRole('button', { name: 'Abrir Sua conta' }).click();
    await page.locator('#proof-signup').waitFor({ state: 'visible' });
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.locator('#proof-auth').evaluate(el => el.open), true);

    // Escape closes the TV and safely returns focus to the decorative spin control.
    await page.locator('#account-label').click();
    await spin.click();
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement === document.querySelector('#spin'));
    assert.equal(await spin.isDisabled(), false);

    // Typewriter text can be completed at once; image failures keep a usable introduction.
    await page.route('**/professor-coimbra.png', route => route.abort());
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    await page.locator('#language').click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await spin.click();
    await dialog.waitFor();
    await dialog.locator('.guest-portrait-fallback').waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('img').isVisible(), false);
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    assert.match(await dialog.locator('.guest-dialogue-visual').textContent(), /Welcome to PokéSlot!/);
    await dialog.getByRole('button', { name: 'Go to sign up' }).click();
    await page.locator('#proof-signup').waitFor({ state: 'visible' });
    await page.locator('#account-label').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // A real session becoming available cancels the introduction and loads only its data.
    await spin.click();
    session = { user: { id: 'guest-fixture', name: 'Jogador fictício' }, session: { token: 'session-fixture' } };
    await page.evaluate(() => new BroadcastChannel('pokeslot-proof-session').postMessage('session-changed'));
    await page.locator('#account-label').getByText('Jogador fictício', { exact: true }).waitFor();
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.locator('#demo-balance').textContent(), '20');
    assert.equal(roundCalls, 0);
    console.log('Introdução de convidado: teclado, cadastro, idiomas, digitação, imagem indisponível e cancelamento por identidade verificados.');
  } finally { await context.close(); }
}
