import assert from 'node:assert/strict';

// All accounts, balances, and API responses in this browser test are fictitious.
export async function checkZeroBalance(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let balance = 0;
  let roundRequests = 0;
  const localState = () => ({ balance, cycleStartedAtMs: Date.now(), ownedVariants: [], vouchers: [], stones: [] });
  const headers = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
  };
  try {
    await page.route('**/api/demo-state', route => route.fulfill({ json: localState() }));
    await page.route('**/api/demo-round', route => {
      roundRequests++;
      return route.fulfill({ json: { status: 'no_balance' } });
    });
    await page.goto(origin + '/');
    await page.locator('#empty-balance').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#spin').isDisabled(), true);
    assert.match(await page.locator('#empty-balance').textContent(), /atualize o saldo/);
    assert.equal(roundRequests, 0);
    await page.locator('#language').click();
    assert.match(await page.locator('#empty-balance').textContent(), /refresh your balance/);
    balance = 2;
    await page.locator('#refresh-balance').click();
    await page.waitForFunction(() => document.querySelector('#demo-balance').textContent === '2');
    assert.equal(await page.locator('#spin').isEnabled(), true);
    assert.equal(await page.locator('#empty-balance').isHidden(), true);

    // An interrupted local round can still be recovered after reloading at zero.
    balance = 0;
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('pokeslot-proof-operations', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').put({ userId: 'local-demo', operationId: 'local-pending-id' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => reject(tx.error);
      };
    }));
    await page.reload();
    const spin = page.locator('#spin');
    await spin.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    assert.match(await spin.textContent(), /Recuperar rodada pendente/);
    const localResponse = page.waitForResponse(response => response.url().endsWith('/api/demo-round')
      && response.request().method() === 'POST');
    await spin.click();
    await localResponse;
    await page.waitForFunction(() => document.querySelector('#spin').disabled
      && document.querySelector('#spin').textContent === 'Girar');
    assert.equal(roundRequests, 1);
    assert.equal(await page.locator('#empty-balance').isVisible(), true);

    const user = { id: 'A', name: 'Jogador A' };
    const session = { token: 'session-A' };
    let recoveredId;
    await page.route('**/neondb/auth/**', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const url = route.request().url();
      if (url.includes('/get-session')) return route.fulfill({ headers, json: { user, session } });
      if (url.includes('/token')) return route.fulfill({ headers, json: { token: 'fixture-token' } });
      return route.fulfill({ status: 404, headers, json: {} });
    });
    await page.route('**/state', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      return route.fulfill({ headers, json: { balance: 0, cycleAt: new Date().toISOString(),
        ownedVariants: [], vouchers: [], stones: [] } });
    });
    await page.route('**/spin', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      recoveredId = route.request().postDataJSON().operationId;
      return route.fulfill({ headers, json: { status: 'no_balance', replayed: true } });
    });
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('pokeslot-proof-operations', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').put({ userId: 'game-proof:A', operationId: 'neon-pending-id' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => reject(tx.error);
      };
    }));
    await page.goto(origin + '/?backend=neon');
    await page.getByText('Jogador A', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('#spin').disabled);
    assert.match(await spin.textContent(), /Recuperar rodada pendente/);
    const recoveryResponse = page.waitForResponse(response => response.url().endsWith('/spin')
      && response.request().method() === 'POST');
    await spin.click();
    await recoveryResponse;
    await page.waitForFunction(() => document.querySelector('#spin').disabled
      && document.querySelector('#spin').textContent === 'Girar');
    assert.equal(recoveredId, 'neon-pending-id');
    assert.equal(await page.locator('#empty-balance').isVisible(), true);
    assert.equal((await page.locator('#status').textContent()).trim(), '');
    await page.locator('#language').click();
    assert.match(await page.locator('#empty-balance').textContent(), /refresh your balance/);
    console.log('Saldo zero, reposição, tradução e recuperação de rodadas locais e autenticadas verificados.');
  } finally {
    await context.close();
  }
}
