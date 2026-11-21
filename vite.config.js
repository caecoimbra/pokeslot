import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { createEvaluatedReelRound } from './src/server/reel-round.mjs';

// Endpoint apenas do servidor de desenvolvimento. Não é uma API de produção.
function demoRoundPlugin() {
  return {
    name: 'local-demo-round',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/api/demo-round') return next();
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Allow', 'POST');
          return response.end();
        }
        const { grid, winningLines } = createEvaluatedReelRound();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ grid, winningLines }));
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
      },
    },
  },
});
