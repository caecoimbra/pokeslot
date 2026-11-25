// Verificações sem credenciais. Use apenas URLs do ambiente a publicar.
import assert from 'node:assert/strict';

function httpsOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, value, 'Informe a origem HTTPS sem caminho.');
  return url.origin;
}

const [site, api] = process.argv.slice(2).map(httpsOrigin);
assert.ok(site && api, 'Uso: node scripts/verify-public-security.mjs <origem do site> <origem da API>');
async function request(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'manual', ...options, signal: AbortSignal.timeout(15000),
  });
  if (options.redirect !== 'follow') {
    assert.ok(response.status < 300 || response.status >= 400,
      `${options.method ?? 'GET'} ${new URL(url).pathname} retornou HTTP ${response.status} inesperado`);
  }
  return response;
}

for (const path of ['/', '/previa-maquina.html', '/redefinir-senha.html']) {
  const response = await request(site + path, { redirect: 'follow' });
  assert.equal(new URL(response.url).origin, site);
  if (path === '/') assert.equal(new URL(response.url).pathname, '/', 'A máquina deve abrir na raiz.');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const policy = response.headers.get('content-security-policy') || '';
  assert.match(policy, /(?:^|;)\s*frame-ancestors 'none'(?:;|$)/);
  assert.match(policy, /(?:^|;)\s*script-src 'self'(?:;|$)/);
  if (path === '/redefinir-senha.html') assert.match(response.headers.get('cache-control') || '', /\bno-store\b/);
  console.log(`Hospedagem ${path}: HTTPS e cabeçalhos conferidos.`);
}

const path = api + '/state';
for (const origin of [site, 'https://untrusted.example.test']) {
  const response = await request(path, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type,x-session-token',
  } });
  assert.equal(response.headers.get('access-control-allow-origin'), origin === site ? site : null);
  assert.equal(response.status, 204);
}
const anonymous = await request(path, { method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(anonymous.status, 401);
assert.match(anonymous.headers.get('cache-control') || '', /\bno-store\b/);
console.log('HTTPS, CSP, cabeçalhos, CORS e recusa de chamada anônima passaram.');
