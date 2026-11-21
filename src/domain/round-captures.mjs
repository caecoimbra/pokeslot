import { evaluateCaptures } from './capture.mjs';

// As capturas devem ser escolhidas pelo servidor, na ordem das linhas.
// Esta função apenas relaciona e classifica resultados; não persiste a rodada.
export function evaluateRoundCaptures(rewardTypes, captures, ownedVariants) {
  if (!Array.isArray(rewardTypes) || !Array.isArray(captures)) {
    throw new TypeError('Expected lists of rewards and captures');
  }
  const captureLines = rewardTypes.filter((reward) => reward?.type === 'pokemon');
  if (captureLines.length !== captures.length) {
    throw new RangeError('Each Pokémon reward requires one capture');
  }
  const outcomes = evaluateCaptures(captures, ownedVariants);
  return captureLines.map(({ line }, index) => ({
    line,
    capture: { ...captures[index] },
    ...outcomes[index],
  }));
}
