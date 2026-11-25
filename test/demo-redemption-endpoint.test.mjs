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
    config({ mode: 'development' }).plugins[0].configureServer({ httpServer, middlewares: { use(fn) { middleware = fn; } } });
    const call = (body, { origin = 'http://localhost:5173', method = 'POST', contentType = 'application/json', path = '/api/demo-redeem' } = {}) => new Promise((resolve) => {
      const req = new EventEmitter();
      Object.assign(req, { url: path, method, headers: { host: 'localhost:5173', origin, 'content-type': contentType } });
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
    const stone = { operationId: input.operationId, stone: 'water' };
    const stoneOptions = { path: '/api/demo-stone' };
    assert.equal((await call(stone, { ...stoneOptions, origin: 'http://other.example' })).status, 403);
    assert.equal((await call(stone, { ...stoneOptions, contentType: 'text/plain' })).status, 403);
    assert.equal((await call(stone, { ...stoneOptions, method: 'GET' })).status, 405);
    assert.equal((await call({ ...stone, stone: 'bug' }, stoneOptions)).status, 400);
    assert.equal((await call(stone, stoneOptions)).body.status, 'insufficient_vouchers');
    assert.equal((await call(stone, stoneOptions)).body.replayed, true);
    assert.equal((await call({ ...stone, stone: 'fire' }, stoneOptions)).status, 400);
    const evolution = { operationId: input.operationId, source: { speciesId: 133, isShiny: false }, targetId: 134, stone: 'water' };
    const evolutionOptions = { path: '/api/demo-evolve' };
    assert.equal((await call(evolution, { ...evolutionOptions, origin: 'http://other.example' })).status, 403);
    assert.equal((await call({ ...evolution, source: { speciesId: 133, isShiny: 'false' } }, evolutionOptions)).status, 400);
    assert.equal((await call(evolution, evolutionOptions)).body.status, 'source_unavailable');
    assert.equal((await call(evolution, evolutionOptions)).body.replayed, true);
    assert.equal((await call({ ...evolution, targetId: 135 }, evolutionOptions)).status, 400);
  } finally {
    httpServer.emit('close');
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});
