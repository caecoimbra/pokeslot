// Falhas não bloqueiam a escolha por número e podem ser tentadas novamente.
export function createRedemptionNamesLoader({ fetchNames, applyNames, onChange, expectedIds }) {
  let state = 'idle';
  return {
    get state() { return state; },
    async load() {
      if (state === 'loading') return;
      state = 'loading';
      onChange();
      try {
        const entries = await fetchNames();
        const ids = new Set(entries.map(({ id }) => id));
        if (entries.length !== expectedIds.length || ids.size !== expectedIds.length || expectedIds.some((id) => !ids.has(id))) throw new Error('Incomplete species list');
        applyNames(entries);
        state = 'ready';
      } catch { state = 'error'; }
      finally { onChange(); }
    },
  };
}
