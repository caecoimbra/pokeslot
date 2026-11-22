// Compartilha pedidos simultâneos e permite repetir consultas que falharam.
export function createSpeciesDetailsStore(load) {
  const entries = new Map();
  return {
    get(id) { return entries.get(id)?.data ?? null; },
    load(id) {
      if (entries.has(id)) return entries.get(id).promise;
      const entry = {};
      entry.promise = Promise.resolve().then(() => load(id)).then((data) => {
        entry.data = data;
        return data;
      }).catch((error) => {
        if (entries.get(id) === entry) entries.delete(id);
        throw error;
      });
      entries.set(id, entry);
      return entry.promise;
    },
  };
}
