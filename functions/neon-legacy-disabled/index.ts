import { Hono } from 'hono';

// Resposta permanente da função antiga no branch de prova. O jogo usa pokeslotgame.
const app = new Hono();
app.all('*', (c) => c.json({ error: 'legacy_proof_closed' }, 410));
export default app;
