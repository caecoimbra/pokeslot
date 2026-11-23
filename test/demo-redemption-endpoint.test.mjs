import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import config from '../vite.config.js';

// O servidor de desenvolvimento é executado contra um banco temporário neste teste.
test('endpoint local valida origem, dados e repetição de resgate', async () => {
  const original = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'pokeslot-redeem-http-'));
  const httpServer = new EventEmitter();
  let middleware;
  try {
    process.chdir(dir);
    config.plugins[0].configureServer({ httpServer, middlewares: { use(fn) { middleware = fn; } } });
    const call = (body, { origin = 'http://localhost:5173', method = 'POST', contentType = 'application/json' } = {}) => new Promise((resolve) => {
      const req = new EventEmitter();
      Object.assign(req, { url: '/api/demo-redeem', method, headers: { host: 'localhost:5173', origin, 'content-type': contentType } });
      const res = { statusCode: 200, setHeader() {}, end(value) { resolve({ status: this.statusCode, body: value ? JSON.parse(value) : null }); } };
      middleware(req, res, () => { throw new Error('Unexpected next'); });
      if (method === 'POST' && origin === 'http://localhost:5173' && contentType === 'application/json') {
        req.emit('data', JSON.stringify(body));
        req.emit('end');
      }
    });
    const input = { operationId: '00000000-0000-4000-8000-000000000001', speciesId: 1 };
    assert.equal((await call(input, { origin: 'http://other.example' })).status, 403);
    assert.equal((await call(input, { contentType: 'text/plain' })).status, 403);
    assert.equal((await call(input, { method: 'GET' })).status, 405);
    assert.equal((await call({ ...input, speciesId: 152 })).status, 400);
    const first = await call(input);
    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'insufficient_vouchers');
    assert.equal(first.body.replayed, false);
    assert.equal((await call(input)).body.replayed, true);
    assert.equal((await call({ ...input, speciesId: 4 })).status, 400);
  } finally {
    httpServer.emit('close');
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});
