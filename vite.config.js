import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { openLocalGameStore } from './src/server/local-game-store.mjs';

// Endpoint apenas do servidor de desenvolvimento. Não é uma API de produção.
function demoRoundPlugin() {
  return {
    name: 'local-demo-round',
    configureServer(server) {
      const store = openLocalGameStore('.pokeslot-demo.sqlite');
      server.httpServer?.once('close', () => store.close());
      server.middlewares.use((request, response, next) => {
        const postPaths = ['/api/demo-round', '/api/demo-redeem', '/api/demo-stone', '/api/demo-evolve'];
        if (!postPaths.includes(request.url) && request.url !== '/api/demo-state') return next();
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (request.url === '/api/demo-state' && request.method === 'GET') {
          try { return response.end(JSON.stringify(store.read('local-demo'))); }
          catch { response.statusCode = 503; return response.end('{}'); }
        }
        if (!postPaths.includes(request.url) || request.method !== 'POST') {
          response.statusCode = 405;
          return response.end();
        }
        const expectedOrigin = `http://${request.headers.host}`;
        if (request.headers.origin !== expectedOrigin || !request.headers['content-type']?.startsWith('application/json')) {
          response.statusCode = 403;
          return response.end('{}');
        }
        let body = '';
        request.on('data', (chunk) => { body += chunk; if (body.length > 1024) request.destroy(); });
        request.on('end', () => {
          let input;
          try { input = JSON.parse(body); } catch { response.statusCode = 400; return response.end('{}'); }
          try {
            let result;
            if (request.url === '/api/demo-redeem') result = store.redeemPokemon('local-demo', input?.operationId, input?.speciesId);
            else if (request.url === '/api/demo-stone') result = store.redeemStone('local-demo', input?.operationId, input?.stone);
            else if (request.url === '/api/demo-evolve') result = store.evolve('local-demo', input?.operationId, input?.source, input?.targetId, input?.stone);
            else result = store.spin('local-demo', input?.operationId);
            return response.end(JSON.stringify(result));
          }
          catch (error) { response.statusCode = error instanceof TypeError ? 400 : 503; return response.end('{}'); }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const homologation = mode === 'homologacao';
  if (homologation) {
    const env = loadEnv(mode, process.cwd(), 'VITE_NEON_PROOF_');
    for (const key of ['VITE_NEON_PROOF_DATABASE_URL', 'VITE_NEON_PROOF_FUNCTION_URL']) {
      const value = env[key] && new URL(env[key]);
      if (!value || value.protocol !== 'https:' || !value.hostname.endsWith('.neon.tech') ||
          value.username || value.password || value.search || value.hash) {
        throw new Error(`Configure um endpoint HTTPS público da Neon em ${key}.`);
      }
    }
  }
  const page = (name) => fileURLToPath(new URL(name, import.meta.url));
  return {
    plugins: [demoRoundPlugin(), ...(homologation ? [{
      name: 'homologation-root',
      async writeBundle({ dir }) {
        await copyFile(join(dir, 'previa-maquina.html'), join(dir, 'index.html'));
      },
    }] : [])],
    build: {
      outDir: homologation ? 'dist/homologacao' : 'dist',
      // A política de segurança da hospedagem permite imagens servidas pelo próprio site.
      ...(homologation ? { assetsInlineLimit: 0 } : {}),
      rollupOptions: {
        input: {
          preview: page('./previa-maquina.html'),
          passwordRecovery: page('./redefinir-senha.html'),
          ...(homologation ? {} : { main: page('./index.html'), gameProof: page('./prova-jogo.html') }),
        },
      },
    },
  };
});
