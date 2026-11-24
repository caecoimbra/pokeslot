// Teste administrativo controlado, somente no branch isolado. Não registra a conexão.
// As identidades são sintéticas; este roteiro não substitui testes autenticados pela rede.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { KANTO_STONES, kantoEvolutionOptions } from '../src/server/evolution.mjs';

const command = 'pnpm dlx neon@8.11.0 connection-string br-dry-block-be4mfcuo --project-id rapid-math-17905990 --profile pokeslot-proof';
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Não foi possível obter a conexão do branch isolado.');
const connectionString = cli.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('postgres'));
if (!connectionString) throw new Error('Conexão de teste indisponível.');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });
const a = `inventory-test-${randomUUID()}`;
const b = `inventory-test-${randomUUID()}`;
const c = `inventory-test-${randomUUID()}`;
const d = `inventory-test-${randomUUID()}`;
const state = async (user) => (await pool.query('SELECT pokeslot_proof.get_state($1) AS result', [user])).rows[0].result;
const inventory = async (user) => (await pool.query('SELECT pokeslot_proof.inventory_state($1) AS result', [user])).rows[0].result;
const act = async (user, id, action, args) => (await pool.query(
  'SELECT pokeslot_proof.inventory_action($1, $2::uuid, $3, $4::jsonb) AS result',
  [user, id, action, JSON.stringify(args)],
)).rows[0].result;
const spin = async (user, id, round) => (await pool.query(
  'SELECT pokeslot_proof.spin($1, $2::uuid, $3::jsonb) AS result', [user, id, JSON.stringify(round)],
)).rows[0].result;
const amount = (entries, type) => entries.find((entry) => entry.type === type)?.amount ?? 0;
const has = (stateValue, speciesId, isShiny) => stateValue.ownedVariants.some((v) => v.speciesId === speciesId && v.isShiny === isShiny);

try {
  const { rows: stones } = await pool.query('SELECT type FROM pokeslot_proof.stone_types');
  const { rows: recipes } = await pool.query(`
    SELECT source_id AS "sourceId", target_id AS "targetId", stone
    FROM pokeslot_proof.evolution_recipes ORDER BY source_id, target_id
  `);
  assert.deepEqual(stones.map(({ type }) => type).sort(), [...KANTO_STONES].sort());
  assert.deepEqual(recipes, kantoEvolutionOptions().sort((a, b) => a.sourceId - b.sourceId || a.targetId - b.targetId));

  const { rows: grants } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_class AS c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS grant_entry
      WHERE c.oid IN ('pokeslot_proof.stone_types'::regclass, 'pokeslot_proof.evolution_recipes'::regclass)
        AND grant_entry.grantee = 0
    ) AS public_access,
    EXISTS (
      SELECT 1 FROM unnest(ARRAY['authenticated', 'anonymous']::name[]) AS roles(role_name)
      CROSS JOIN unnest(ARRAY['pokeslot_proof.stone_types'::regclass, 'pokeslot_proof.evolution_recipes'::regclass]) AS tables(table_id)
      WHERE has_table_privilege(role_name, table_id, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    ) AS api_access
  `);
  assert.deepEqual(grants, [{ public_access: false, api_access: false }]);
  console.log(`Catálogo validado no PostgreSQL: ${recipes.length} receitas e ${stones.length} pedras sem acesso direto pelos papéis da API.`);

  await Promise.all([state(a), state(b), state(c), state(d)]);
  assert.deepEqual(await inventory(b), { vouchers: [], stones: [] });
  // Estoque e variante são fornecidos diretamente para tornar o teste determinístico.
  await pool.query("INSERT INTO pokeslot_proof.vouchers (user_id, type, amount) VALUES ($1, 'stone', 1), ($1, 'pokemon', 4)", [a]);
  await pool.query('INSERT INTO pokeslot_proof.variants (user_id, species_id, shiny) VALUES ($1, 25, true)', [a]);

  const pokemonId = randomUUID();
  const pokemon = await act(a, pokemonId, 'pokemon', { speciesId: 25 });
  assert.equal(pokemon.status, 'ok');
  assert.equal(pokemon.replayed, false);
  assert.equal((await act(a, pokemonId, 'pokemon', { speciesId: 25 })).replayed, true);
  await assert.rejects(act(a, pokemonId, 'pokemon', { speciesId: 26 }));
  const afterPokemon = await state(a);
  assert.equal(has(afterPokemon, 25, true), true);
  assert.equal(has(afterPokemon, 25, false), true);
  assert.equal(has(await state(b), 25, false), false);

  const stoneId = randomUUID();
  const [first, second] = await Promise.all([
    act(a, stoneId, 'stone', { stone: 'thunder' }),
    act(a, stoneId, 'stone', { stone: 'thunder' }),
  ]);
  assert.deepEqual([first.replayed, second.replayed].sort(), [false, true]);
  assert.equal(first.status, 'ok');
  assert.equal(second.status, 'ok');
  assert.equal(amount((await inventory(a)).stones, 'thunder'), 1);
  assert.equal(amount((await inventory(a)).vouchers, 'stone'), 0);
  await assert.rejects(act(a, stoneId, 'stone', { stone: 'fire' }));
  await assert.rejects(act(a, stoneId, 'pokemon', { speciesId: 1 }));

  const evolutionId = randomUUID();
  const evolve = { source: { speciesId: 25, isShiny: true }, targetId: 26, stone: 'thunder' };
  const [e1, e2] = await Promise.all([
    act(a, evolutionId, 'evolve', evolve), act(a, evolutionId, 'evolve', evolve),
  ]);
  assert.deepEqual([e1.replayed, e2.replayed].sort(), [false, true]);
  assert.equal(e1.status, 'ok');
  assert.equal(e2.status, 'ok');
  const afterEvolution = await state(a);
  assert.equal(has(afterEvolution, 25, true), true);
  assert.equal(has(afterEvolution, 26, true), true);
  assert.equal(amount((await inventory(a)).stones, 'thunder'), 0);
  assert.equal((await act(a, randomUUID(), 'evolve', evolve)).status, 'already_registered');

  await pool.query("INSERT INTO pokeslot_proof.vouchers (user_id, type, amount) VALUES ($1, 'stone', 1)", [a]);
  const race = await Promise.all([
    act(a, randomUUID(), 'stone', { stone: 'water' }),
    act(a, randomUUID(), 'stone', { stone: 'fire' }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), ['insufficient_vouchers', 'ok']);
  assert.equal(amount((await inventory(a)).stones, 'water') + amount((await inventory(a)).stones, 'fire'), 1);
  assert.deepEqual(await inventory(b), { vouchers: [], stones: [] });

  await pool.query("INSERT INTO pokeslot_proof.stones (user_id, type, amount) VALUES ($1, 'fire', 1)", [c]);
  await pool.query('INSERT INTO pokeslot_proof.variants (user_id, species_id, shiny) VALUES ($1, 37, false), ($1, 58, false)', [c]);
  const evolutionRace = await Promise.all([
    act(c, randomUUID(), 'evolve', { source: { speciesId: 37, isShiny: false }, targetId: 38, stone: 'fire' }),
    act(c, randomUUID(), 'evolve', { source: { speciesId: 58, isShiny: false }, targetId: 59, stone: 'fire' }),
  ]);
  assert.deepEqual(evolutionRace.map((r) => r.status).sort(), ['missing_stone', 'ok']);
  assert.equal(amount((await inventory(c)).stones, 'fire'), 0);
  const cState = await state(c);
  assert.equal(Number(has(cState, 38, false)) + Number(has(cState, 59, false)), 1);

  // Uma transação revertida não pode deixar o vale debitado ou a pedra criada.
  await pool.query("INSERT INTO pokeslot_proof.vouchers (user_id, type, amount) VALUES ($1, 'stone', 1)", [a]);
  const beforeRollback = await inventory(a);
  const rollbackId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT pokeslot_proof.inventory_action($1, $2::uuid, $3, $4::jsonb) AS result',
      [a, rollbackId, 'stone', JSON.stringify({ stone: 'moon' })]);
    assert.equal(result.rows[0].result.status, 'ok');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  assert.deepEqual(await inventory(a), beforeRollback);
  assert.equal((await act(a, rollbackId, 'stone', { stone: 'moon' })).replayed, false);

  // Resultados de rodada controlados são fornecidos pelo servidor, não pelo navegador.
  const round = { grid: [], captures: [], winningLines: [
    { line: 'top', symbol: 'voucher' }, { line: 'middle', symbol: 'voucher' }, { line: 'bottom', symbol: 'voucher' },
  ], vouchers: [
    { line: 'top', type: 'stone' }, { line: 'middle', type: 'pokemon' }, { line: 'bottom', type: 'spins' },
  ] };
  const roundId = randomUUID();
  const firstRound = await spin(d, roundId, round);
  assert.equal(firstRound.status, 'ok');
  assert.equal(firstRound.voucherSpins, 2);
  assert.equal(firstRound.balance, 21);
  assert.equal((await spin(d, roundId, round)).replayed, true);
  assert.equal(amount((await inventory(d)).vouchers, 'stone'), 1);
  assert.equal(amount((await inventory(d)).vouchers, 'pokemon'), 1);
  assert.equal((await state(d)).balance, 21);
  await assert.rejects(act(d, roundId, 'stone', { stone: 'fire' }));
  const exchangeId = randomUUID();
  assert.equal((await act(d, exchangeId, 'stone', { stone: 'fire' })).status, 'ok');
  await assert.rejects(spin(d, exchangeId, round));

  const beforeInvalid = await state(d);
  const beforeInvalidInventory = await inventory(d);
  const badRound = { grid: [], winningLines: [{ line: 'top', symbol: 'voucher' }],
    captures: [{ line: 'top', capture: { speciesId: 10, isShiny: false, rarity: 'common' } }],
    vouchers: [{ line: 'top', type: 'invalid' }] };
  await assert.rejects(spin(d, randomUUID(), badRound));
  assert.deepEqual(await state(d), beforeInvalid);
  assert.deepEqual(await inventory(d), beforeInvalidInventory);
  console.log('PostgreSQL isolado: resgate, variantes, isolamento, repetição, concorrência e rollback passaram.');
} catch (error) {
  console.error(`Verificação falhou: ${error.code || error.name || 'erro'}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
