// Prova local com Playwright e axe-core instalados fora do projeto.
// Use um servidor de desenvolvimento com banco demonstrativo descartável.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { checkArcadeFeedback } from './check-arcade-feedback.mjs';
import { checkDexCardLabels } from './check-dex-card-labels.mjs';
import { checkSessionLoading } from './check-session-loading.mjs';
import { checkZeroBalance } from './check-zero-balance.mjs';
import { checkCaptureDialog } from './check-capture-dialog.mjs';
import { checkRewardDialog } from './check-reward-dialog.mjs';
import { checkPokedexFilters } from './check-pokedex-filters.mjs';
import { checkPokemonCries } from './check-pokemon-cries.mjs';
import { checkAccountMenu } from './check-account-menu.mjs';

const [moduleBase, edgePath, origin, screenshotPath] = process.argv.slice(2);
const require = createRequire(moduleBase);
const { chromium } = require('playwright');
const { source: axe } = require('axe-core');
const browser = await chromium.launch({ executablePath: edgePath });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const scan = async (screen) => {
    await page.evaluate(axe);
    const findings = await page.evaluate(async () => (await window.axe.run({
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })));
    if (findings.length) console.log(screen, JSON.stringify(findings));
    return findings.length;
  };
  await page.goto(origin + '/previa-maquina.html');
  const spin = page.getByRole('button', { name: 'Girar', exact: true });
  await page.waitForFunction(() => !document.querySelector('#spin').disabled);
  const roundResponse = page.waitForResponse((response) => response.url().endsWith('/api/demo-round'));
  await spin.focus();
  await page.keyboard.press('Enter');
  const round = await roundResponse;
  assert.equal(round.status(), 200);
  assert.equal((await round.json()).status, 'ok');
  const expectedStatus = /Rodada (concluída|sem prêmio)\./;
  await page.getByRole('status').filter({ hasText: expectedStatus }).waitFor();
  const captureDialog = page.locator('#capture-dialog');
  while (await captureDialog.isVisible()) await page.locator('#capture-dialog-close').click();
  const tree = await page.locator('[data-screen="machine"]').ariaSnapshot();
  assert.match(tree, /Girar/);
  assert.match(tree, expectedStatus);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  let violations = await scan('Máquina');
  if (screenshotPath) await page.locator('.topbar').screenshot({ path: screenshotPath });
  const dex = page.getByRole('link', { name: 'Pokédex', exact: true });
  await dex.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement.id === 'pokedex-title');
  violations += await scan('Pokédex');

  // Simula a resposta de redefinição para testar a interface sem usar uma conta.
  await page.route('**/auth/reset-password', (route) => route.fulfill({ json: { status: true } }));
  await page.goto(origin + '/redefinir-senha.html?token=teste-local');
  const password = page.locator('#reset-password [name=password]');
  const confirmation = page.locator('#reset-password [name=confirmation]');
  await password.fill('ficticia-123');
  await confirmation.fill('diferente-123');
  await page.getByRole('button', { name: 'Mostrar Nova senha (8 caracteres ou mais)', exact: true }).click();
  assert.equal(await password.getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Mostrar Repita a nova senha', exact: true }).click();
  assert.equal(await confirmation.getAttribute('type'), 'text');
  const save = page.getByRole('button', { name: 'Salvar nova senha' });
  await save.click();
  assert.equal(await confirmation.getAttribute('aria-invalid'), 'true');
  assert.equal(await confirmation.getAttribute('aria-describedby'), 'recovery-status');
  assert.equal(await confirmation.evaluate((field) => field === document.activeElement), true);
  await confirmation.fill('ficticia-123');
  await save.click();
  const feedback = page.locator('#recovery-status');
  await page.waitForFunction(() => document.activeElement.id === 'recovery-status');
  assert.match(await feedback.textContent(), /Senha alterada/);
  assert.equal(new URL(page.url()).searchParams.has('token'), false);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#return-to-machine').evaluate((link) => link === document.activeElement), true);
  violations += await scan('Recuperação');
  assert.equal(violations, 0, 'Violações nas verificações automatizadas');
  await checkArcadeFeedback(browser, origin);
  await checkDexCardLabels(browser, origin, axe);
  await checkSessionLoading(browser, origin);
  await checkZeroBalance(browser, origin);
  await checkCaptureDialog(browser, origin);
  await checkRewardDialog(browser, origin, axe);
  await checkPokedexFilters(browser, origin, axe);
  await checkPokemonCries(browser, origin);
  await checkAccountMenu(browser, origin, axe);
  console.log('Rodada local no Edge, teclado, foco, árvore de acessibilidade e axe passaram.');
} finally { await browser.close(); }
