import assert from 'node:assert/strict';

// Use with a Vite development server and browser fixtures. No real accounts or
// remote API calls are needed. Control each response to observe intermediate UI.
export async function checkSessionLoading(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const headers = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
  };
  const userA = { user: { id: 'A', name: 'Jogador A' }, session: { token: 'session-A' } };
  const userB = { user: { id: 'B', name: 'Jogador B' }, session: { token: 'session-B' } };
  let session = userA;
  let mode = 'normal';
  let sessionStarted;
  let releaseSession;
  let stateStarted;
  let releaseState;
  try {
    await page.route('**/neondb/auth/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const url = route.request().url();
      if (url.includes('/get-session')) {
        const current = session;
        if (mode === 'hold-session') {
          mode = 'normal';
          sessionStarted();
          await new Promise(resolve => { releaseSession = resolve; });
        }
        if (mode === 'fail-session') return route.fulfill({ status: 503, headers, json: {} });
        return route.fulfill({ headers, json: current });
      }
      if (url.includes('/token')) return route.fulfill({ headers, json: { token: 'fixture-token' } });
      return route.fulfill({ status: 404, headers, json: {} });
    });
    await page.route('**/state', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const { expectedUserId } = route.request().postDataJSON();
      if (mode === 'hold-state' && expectedUserId === 'A') {
        mode = 'normal';
        stateStarted();
        await new Promise(resolve => { releaseState = resolve; });
      }
      return route.fulfill({ headers, json: {
        balance: expectedUserId === 'A' ? 20 : 19,
        cycleAt: new Date().toISOString(), ownedVariants: [], vouchers: [], stones: [],
      } });
    });

    const loadingStarted = new Promise(resolve => { sessionStarted = resolve; });
    mode = 'hold-session';
    await page.goto(origin + '/?backend=neon');
    await loadingStarted;
    assert.equal(await page.locator('#proof-login').isVisible(), false, 'Não exibir login durante restauração inicial');
    assert.equal(await page.locator('#proof-signup').isVisible(), false);
    releaseSession();
    await page.getByText('Jogador A', { exact: true }).waitFor();
    assert.equal(await page.locator('#demo-balance').textContent(), '20');

    // On reload, no credentials are needed when the session still exists.
    const reloadStarted = new Promise(resolve => { sessionStarted = resolve; });
    mode = 'hold-session';
    await page.reload();
    await reloadStarted;
    assert.equal(await page.locator('#proof-login').isVisible(), false, 'Não exibir login durante recarga');
    releaseSession();
    await page.getByText('Jogador A', { exact: true }).waitFor();

    // Back navigation should restore a session rather than present a login form.
    await page.goto(origin + '/case/');
    await page.goBack();
    await page.getByText('Jogador A', { exact: true }).waitFor();
    assert.equal(await page.locator('#demo-balance').textContent(), '20');

    // A delayed result for A must never replace the newer account B.
    const delayedState = new Promise(resolve => { stateStarted = resolve; });
    mode = 'hold-state';
    await page.evaluate(() => new BroadcastChannel('pokeslot-proof-session').postMessage('session-changed'));
    await delayedState;
    session = userB;
    await page.evaluate(() => new BroadcastChannel('pokeslot-proof-session').postMessage('session-changed'));
    await page.getByText('Jogador B', { exact: true }).waitFor();
    assert.equal(await page.locator('#demo-balance').textContent(), '19');
    releaseState();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#proof-user').textContent(), 'Jogador B');
    assert.equal(await page.locator('#demo-balance').textContent(), '19');

    session = null;
    await page.reload();
    await page.locator('#proof-login').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#proof-user').textContent(), '');

    mode = 'fail-session';
    await page.reload();
    await page.locator('#proof-login').waitFor({ state: 'visible' });
    assert.notEqual((await page.locator('#proof-auth-status').textContent()).trim(), '');
    console.log('Restauração, recarga, troca de conta, sessão ausente e falha de Auth verificadas.');
  } finally {
    releaseSession?.();
    releaseState?.();
    await context.close();
  }
}
