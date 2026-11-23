import { DatabaseSync } from 'node:sqlite';
import { createInitialProgress, applyReplenishment } from '../domain/replenishment.mjs';
import { evaluateRoundCaptures } from '../domain/round-captures.mjs';
import { createEvaluatedReelRound } from './reel-round.mjs';
import { createDemoCaptures } from './demo-capture.mjs';
import { createDemoVouchers } from './demo-vouchers.mjs';
import { DEMO_SPIN_VOUCHER_VALUE } from '../domain/demo-vouchers.mjs';
import { demoRedemptionDetails, normalVariantOwned } from '../domain/demo-redemption.mjs';
import { DEMO_STONES, planKnownEvolution } from './evolution.mjs';

// Exclusivo para testes locais: playerId precisa vir de identidade autenticada
// no backend real. O relógio e os sorteios não vêm de requisições do navegador.
export function openLocalGameStore(path, { now = Date.now, makeRound = createEvaluatedReelRound, makeCaptures = createDemoCaptures, makeVouchers = createDemoVouchers } = {}) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance >= 0), cycle_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS variants (player_id TEXT NOT NULL REFERENCES players(id), species_id INTEGER NOT NULL, shiny INTEGER NOT NULL, PRIMARY KEY(player_id, species_id, shiny));
    CREATE TABLE IF NOT EXISTS rounds (player_id TEXT NOT NULL REFERENCES players(id), operation_id TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player_id, operation_id));
    CREATE TABLE IF NOT EXISTS vouchers (player_id TEXT NOT NULL REFERENCES players(id), type TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), PRIMARY KEY(player_id, type));
    CREATE TABLE IF NOT EXISTS voucher_redemptions (player_id TEXT NOT NULL REFERENCES players(id), operation_id TEXT NOT NULL, species_id INTEGER NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player_id, operation_id));
    CREATE TABLE IF NOT EXISTS stones (player_id TEXT NOT NULL REFERENCES players(id), type TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), PRIMARY KEY(player_id, type));
    CREATE TABLE IF NOT EXISTS stone_redemptions (player_id TEXT NOT NULL REFERENCES players(id), operation_id TEXT NOT NULL, stone TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player_id, operation_id));
    CREATE TABLE IF NOT EXISTS evolutions (player_id TEXT NOT NULL REFERENCES players(id), operation_id TEXT NOT NULL, source_id INTEGER NOT NULL, source_shiny INTEGER NOT NULL, target_id INTEGER NOT NULL, stone TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player_id, operation_id));`);
  const player = db.prepare('SELECT balance, cycle_ms FROM players WHERE id = ?');
  const variants = db.prepare('SELECT species_id, shiny FROM variants WHERE player_id = ? ORDER BY species_id, shiny');
  const savedRound = db.prepare('SELECT result FROM rounds WHERE player_id = ? AND operation_id = ?');
  const writePlayer = db.prepare('UPDATE players SET balance = ?, cycle_ms = ? WHERE id = ?');
  const addVariant = db.prepare('INSERT OR IGNORE INTO variants VALUES (?, ?, ?)');
  const addRound = db.prepare('INSERT INTO rounds VALUES (?, ?, ?)');
  const vouchers = db.prepare('SELECT type, amount FROM vouchers WHERE player_id = ? ORDER BY type');
  const addVoucher = db.prepare('INSERT INTO vouchers VALUES (?, ?, 1) ON CONFLICT(player_id, type) DO UPDATE SET amount = amount + 1');
  const savedRedemption = db.prepare('SELECT species_id, result FROM voucher_redemptions WHERE player_id = ? AND operation_id = ?');
  const addRedemption = db.prepare('INSERT INTO voucher_redemptions VALUES (?, ?, ?, ?)');
  const consumeVouchers = db.prepare('UPDATE vouchers SET amount = amount - ? WHERE player_id = ? AND type = ?');
  const deleteVouchers = db.prepare('DELETE FROM vouchers WHERE player_id = ? AND type = ?');
  const stones = db.prepare('SELECT type, amount FROM stones WHERE player_id = ? ORDER BY type');
  const addStone = db.prepare('INSERT INTO stones VALUES (?, ?, 1) ON CONFLICT(player_id, type) DO UPDATE SET amount = amount + 1');
  const consumeStone = db.prepare('UPDATE stones SET amount = amount - 1 WHERE player_id = ? AND type = ?');
  const deleteStone = db.prepare('DELETE FROM stones WHERE player_id = ? AND type = ?');
  const savedStoneRedemption = db.prepare('SELECT stone, result FROM stone_redemptions WHERE player_id = ? AND operation_id = ?');
  const addStoneRedemption = db.prepare('INSERT INTO stone_redemptions VALUES (?, ?, ?, ?)');
  const savedEvolution = db.prepare('SELECT source_id, source_shiny, target_id, stone, result FROM evolutions WHERE player_id = ? AND operation_id = ?');
  const addEvolution = db.prepare('INSERT INTO evolutions VALUES (?, ?, ?, ?, ?, ?, ?)');

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function checkPlayer(id) {
    if (typeof id !== 'string' || id.length < 1 || id.length > 200) throw new TypeError('Invalid player');
  }
  function checkOperation(operationId) {
    if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) throw new TypeError('Invalid operation ID');
  }
  function checkStone(stone) {
    if (!DEMO_STONES.includes(stone)) throw new TypeError('Invalid stone');
  }
  function spendVoucher(id, type, amount, cost) {
    if (amount === cost) deleteVouchers.run(id, type);
    else consumeVouchers.run(cost, id, type);
  }
  function snapshot(id) {
    const p = player.get(id);
    return { balance: p.balance, cycleStartedAtMs: p.cycle_ms,
      ownedVariants: variants.all(id).map((v) => ({ speciesId: v.species_id, isShiny: !!v.shiny })),
      vouchers: vouchers.all(id).map(({ type, amount }) => ({ type, amount })),
      stones: stones.all(id).map(({ type, amount }) => ({ type, amount })) };
  }
  function refresh(id) {
    const clock = now();
    const initial = createInitialProgress(clock);
    db.prepare('INSERT OR IGNORE INTO players VALUES (?, ?, ?)').run(id, initial.balance, initial.cycleStartedAtMs);
    const state = player.get(id);
    const replenished = applyReplenishment({ balance: state.balance, cycleStartedAtMs: state.cycle_ms, nowMs: clock });
    writePlayer.run(replenished.balance, replenished.cycleStartedAtMs, id);
    return snapshot(id);
  }
  return {
    read(id) { checkPlayer(id); return transaction(() => refresh(id)); },
    spin(id, operationId) {
      checkPlayer(id);
      checkOperation(operationId);
      return transaction(() => {
        // Verifica primeiro o resultado anterior, sem criar outra rodada ou débito.
        const previous = savedRound.get(id, operationId);
        if (previous) return { ...JSON.parse(previous.result), replayed: true };
        const state = refresh(id);
        if (state.balance === 0) {
          const result = { status: 'no_balance', balance: 0 };
          addRound.run(id, operationId, JSON.stringify(result));
          return { ...result, replayed: false };
        }
        const round = makeRound();
        const captures = makeCaptures(round.rewardTypes);
        const outcomes = evaluateRoundCaptures(round.rewardTypes, captures, state.ownedVariants);
        const voucherOutcomes = makeVouchers(round.rewardTypes).map((voucher) => voucher.type === 'spins'
          ? { ...voucher, spinsAwarded: DEMO_SPIN_VOUCHER_VALUE } : voucher);
        let voucherSpins = 0;
        for (const voucher of voucherOutcomes) {
          if (voucher.type === 'spins') voucherSpins += voucher.spinsAwarded;
          else addVoucher.run(id, voucher.type);
        }
        for (const { capture, status } of outcomes) if (status === 'new') addVariant.run(id, capture.speciesId, Number(capture.isShiny));
        writePlayer.run(state.balance - 1 + voucherSpins, state.cycleStartedAtMs, id);
        const result = { status: 'ok', balance: state.balance - 1 + voucherSpins, grid: round.grid, winningLines: round.winningLines, captures: outcomes, vouchers: voucherOutcomes, voucherSpins };
        addRound.run(id, operationId, JSON.stringify(result));
        return { ...result, replayed: false };
      });
    },
    redeemPokemon(id, operationId, speciesId) {
      checkPlayer(id);
      checkOperation(operationId);
      const details = demoRedemptionDetails(speciesId);
      return transaction(() => {
        const previous = savedRedemption.get(id, operationId);
        if (previous) {
          if (previous.species_id !== speciesId) throw new TypeError('Operation ID used for another species');
          return { ...JSON.parse(previous.result), replayed: true };
        }
        const state = refresh(id);
        const amount = state.vouchers.find((entry) => entry.type === 'pokemon')?.amount ?? 0;
        let status;
        if (normalVariantOwned(state.ownedVariants, speciesId)) status = 'already_owned';
        else if (amount < details.cost) status = 'insufficient_vouchers';
        else {
          spendVoucher(id, 'pokemon', amount, details.cost);
          if (addVariant.run(id, speciesId, 0).changes !== 1) throw new Error('Variant insert failed');
          status = 'ok';
        }
        const result = { status, ...details };
        addRedemption.run(id, operationId, speciesId, JSON.stringify(result));
        return { ...result, replayed: false };
      });
    },
    redeemStone(id, operationId, stone) {
      checkPlayer(id);
      checkOperation(operationId);
      checkStone(stone);
      return transaction(() => {
        const previous = savedStoneRedemption.get(id, operationId);
        if (previous) {
          if (previous.stone !== stone) throw new TypeError('Operation ID used for another stone');
          return { ...JSON.parse(previous.result), replayed: true };
        }
        const state = refresh(id);
        const amount = state.vouchers.find((entry) => entry.type === 'stone')?.amount ?? 0;
        const status = amount ? 'ok' : 'insufficient_vouchers';
        if (amount) {
          spendVoucher(id, 'stone', amount, 1);
          addStone.run(id, stone);
        }
        const result = { status, stone };
        addStoneRedemption.run(id, operationId, stone, JSON.stringify(result));
        return { ...result, replayed: false };
      });
    },
    evolve(id, operationId, source, targetId, stone) {
      checkPlayer(id);
      checkOperation(operationId);
      checkStone(stone);
      if (!source || !Number.isInteger(source.speciesId) || source.speciesId < 1 || source.speciesId > 151 ||
          typeof source.isShiny !== 'boolean' || !Number.isInteger(targetId) || targetId < 1 || targetId > 151) throw new TypeError('Invalid evolution');
      return transaction(() => {
        const previous = savedEvolution.get(id, operationId);
        if (previous) {
          if (previous.source_id !== source.speciesId || !!previous.source_shiny !== source.isShiny ||
              previous.target_id !== targetId || previous.stone !== stone) throw new TypeError('Operation ID used for another evolution');
          return { ...JSON.parse(previous.result), replayed: true };
        }
        const state = refresh(id);
        const stoneCount = state.stones.find((entry) => entry.type === stone)?.amount ?? 0;
        const sourceAvailable = state.ownedVariants.some((entry) => entry.speciesId === source.speciesId && entry.isShiny === source.isShiny);
        const plan = planKnownEvolution({ source, targetId, selectedStone: stone, sourceAvailable, stoneCount, ownedVariants: state.ownedVariants });
        const status = plan.status === 'ready' ? 'ok' : plan.status;
        if (status === 'ok') {
          if (stoneCount === 1) deleteStone.run(id, stone);
          else consumeStone.run(id, stone);
          if (addVariant.run(id, plan.target.speciesId, Number(plan.target.isShiny)).changes !== 1) throw new Error('Variant insert failed');
        }
        const result = { status, source: { speciesId: source.speciesId, isShiny: source.isShiny }, targetId, stone };
        addEvolution.run(id, operationId, source.speciesId, Number(source.isShiny), targetId, stone, JSON.stringify(result));
        return { ...result, replayed: false };
      });
    },
    close() { db.close(); },
  };
}
