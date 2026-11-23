import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [demoRoundPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        preview: fileURLToPath(new URL('./previa-maquina.html', import.meta.url)),
        gameProof: fileURLToPath(new URL('./prova-jogo.html', import.meta.url)),
      },
    },
  },
});
