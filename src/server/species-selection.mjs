import { randomInt } from 'node:crypto';
import { selectSpecies } from '../domain/species-selection.mjs';

// O catálogo e os pesos devem ser selecionados pelo backend, nunca pelo cliente.
export function selectSpeciesSecure(tiers) {
  return selectSpecies(tiers, randomInt);
}
