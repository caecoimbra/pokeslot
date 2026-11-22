// Apenas IDs fictícios e IDs de operação; nunca armazene tokens ou senhas aqui.
export function openPendingOperations(indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pokeslot-proof-operations', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'userId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('pending operation database blocked'));
  });
}

export function readPendingOperation(db, userId) {
  if (!userId) return Promise.reject(new Error('user id required'));
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readonly');
    const request = tx.objectStore('pending').get(userId);
    tx.oncomplete = () => resolve(request.result ?? null);
    tx.onabort = () => reject(tx.error || new Error('pending operation read aborted'));
    tx.onerror = () => {};
  });
}
// Transações de escrita no mesmo object store são serializadas entre abas.
export function claimPendingOperation(db, userId, makeId = () => crypto.randomUUID()) {
  if (!userId) return Promise.reject(new Error('user id required'));
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    const store = tx.objectStore('pending');
    let operation;
    let failure;
    const get = store.get(userId);
    get.onsuccess = () => {
      try {
        operation = get.result || { userId, operationId: makeId() };
        if (!get.result) store.add(operation);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(operation);
    tx.onabort = () => reject(failure || tx.error || new Error('pending operation aborted'));
    tx.onerror = () => {}; // A falha é informada por onabort.
  });
}

// Uma resposta antiga não pode apagar uma operação nova da mesma conta.
export function clearPendingOperation(db, userId, operationId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    const store = tx.objectStore('pending');
    let cleared = false;
    const get = store.get(userId);
    get.onsuccess = () => {
      if (get.result?.operationId === operationId) {
        store.delete(userId);
        cleared = true;
      }
    };
    tx.oncomplete = () => resolve(cleared);
    tx.onabort = () => reject(tx.error || new Error('pending operation aborted'));
    tx.onerror = () => {};
  });
}
