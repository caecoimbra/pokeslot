import { readPendingOperation, clearPendingOperation } from './pending-operations.mjs';
import { validInventoryAction } from '../server/inventory-request.mjs';
import { createOperationId } from './operation-id.mjs';

const keyFor = (userId) => `inventory-proof:${userId}`;
const gameKeyFor = (userId) => `game-proof:${userId}`;

// A leitura de ambas as chaves acontece na mesma transação de escrita.
// Uma operação existente tem prioridade para que pendências antigas sejam recuperáveis.
function claimAcrossActions(db, key, otherKey, create) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    const store = tx.objectStore('pending');
    const request = store.get(key);
    let operation;
    let failure;
    request.onsuccess = () => {
      if (request.result) { operation = request.result; return; }
      const other = store.get(otherKey);
      other.onsuccess = () => {
        try {
          if (other.result) throw new Error('other_operation_pending');
          operation = create();
          store.add(operation);
        } catch (error) { failure = error; tx.abort(); }
      };
    };
    tx.oncomplete = () => resolve(operation);
    tx.onabort = () => reject(failure || tx.error || new Error('operation aborted'));
    tx.onerror = () => {};
  });
}

// A chave separada por conta mantém escolha e identificador juntos entre abas e recargas.
export function claimProofInventoryOperation(db, userId, action, args, makeId = createOperationId) {
  if (typeof userId !== 'string' || !userId || !validInventoryAction(action, args)) {
    return Promise.reject(new TypeError('invalid inventory operation'));
  }
  const userKey = keyFor(userId);
  return claimAcrossActions(db, userKey, gameKeyFor(userId), () => ({
    userId: userKey, operationId: makeId(), action, args: structuredClone(args),
  }));
}

export function claimProofGameOperation(db, userId, makeId = createOperationId) {
  if (typeof userId !== 'string' || !userId) return Promise.reject(new TypeError('user id required'));
  const userKey = gameKeyFor(userId);
  return claimAcrossActions(db, userKey, keyFor(userId), () => ({ userId: userKey, operationId: makeId() }));
}

export const readProofInventoryOperation = (db, userId) => {
  if (typeof userId !== 'string' || !userId) return Promise.reject(new TypeError('user id required'));
  return readPendingOperation(db, keyFor(userId));
};

export const clearProofInventoryOperation = (db, userId, operationId) => {
  if (typeof userId !== 'string' || !userId) return Promise.reject(new TypeError('user id required'));
  return clearPendingOperation(db, keyFor(userId), operationId);
};

function sameAction(a, b) {
  if (!a || !b || a.action !== b.action || !validInventoryAction(a.action, a.args) || !validInventoryAction(b.action, b.args)) return false;
  if (a.action === 'pokemon') return a.args.speciesId === b.args.speciesId;
  if (a.action === 'stone') return a.args.stone === b.args.stone;
  return a.args.stone === b.args.stone && a.args.targetId === b.args.targetId
    && a.args.source.speciesId === b.args.source.speciesId && a.args.source.isShiny === b.args.source.isShiny;
}

function validResult(operation, result) {
  if (!result || typeof result.replayed !== 'boolean') return false;
  if (operation.action === 'pokemon') return ['ok', 'already_owned', 'insufficient_vouchers'].includes(result.status)
    && result.speciesId === operation.args.speciesId && ['common', 'uncommon', 'rare', 'legendary'].includes(result.rarity)
    && Number.isInteger(result.cost) && result.cost >= 1 && result.cost <= 4;
  if (operation.action === 'stone') return ['ok', 'insufficient_vouchers'].includes(result.status) && result.stone === operation.args.stone;
  return ['ok', 'incompatible', 'source_unavailable', 'already_registered', 'missing_stone'].includes(result.status)
    && sameAction(operation, { action: 'evolve', args: { source: result.source, targetId: result.targetId, stone: result.stone } });
}

// A pendência só é removida após apresentar o resultado à sessão que iniciou a ação.
export async function completeProofInventoryOperation({ ensureSession, claim, send, readState, present, clear }, requested = null) {
  await ensureSession();
  const operation = await claim();
  if (!operation || !validInventoryAction(operation.action, operation.args)) throw new Error('invalid_pending');
  if (requested && !sameAction(operation, requested)) throw new Error('different_pending');
  await ensureSession();
  let result;
  try { result = await send(operation); }
  catch (error) {
    if (!['operation_expired', 'operation_clock'].includes(error?.message)) throw error;
    result = { status: error.message };
  }
  if (!['operation_expired', 'operation_clock'].includes(result?.status) && !validResult(operation, result)) throw new Error('invalid_result');
  const state = await readState();
  await ensureSession();
  present(result, state, operation);
  await clear(operation);
  return result;
}
