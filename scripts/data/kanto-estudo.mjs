// Dados provisórios exclusivos para simulação; não são o catálogo final do jogo.
// Tiers: proposta das 151 espécies fornecida por Caetano e mantida para estudo.
// Pedras: 16 compatibilidades clássicas e 56 adaptações discutidas, ainda em revisão.
// IDs: https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species.csv
// Tipos: https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_types.csv
// Evoluções: https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_evolution.csv

export const STUDY_TIERS = [
  { rarity: 'common', speciesIds: [1, 4, 7, 10, 13, 16, 19, 21, 23, 25, 27, 29, 32, 35, 37, 39, 41, 43, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 74, 77, 79, 81, 84, 86, 88, 90, 92, 96, 98, 100, 102, 104, 109, 111, 116, 118, 120, 129] },
  { rarity: 'uncommon', speciesIds: [2, 5, 8, 11, 12, 14, 15, 17, 18, 20, 22, 24, 26, 28, 30, 33, 36, 40, 42, 44, 47, 49, 51, 53, 55, 57, 61, 64, 67, 70, 73, 75, 78, 80, 82, 83, 85, 87, 89, 91, 93, 95, 97, 99, 101, 103, 105, 106, 107, 108, 110, 112, 114, 117, 119, 122, 124, 132, 133, 138, 140] },
  { rarity: 'rare', speciesIds: [3, 6, 9, 31, 34, 38, 45, 59, 62, 65, 68, 71, 76, 94, 113, 115, 121, 123, 125, 126, 127, 128, 130, 131, 134, 135, 136, 137, 139, 141, 142, 143, 147, 148] },
  { rarity: 'legendary', speciesIds: [144, 145, 146, 149, 150, 151] },
];

// Cada registro identifica origem, destino e pedra. A interpretação e o uso
// dessas compatibilidades devem ser decididos no modelo de simulação, não aqui.
export const STUDY_EVOLUTIONS = [
  { sourceId: 1, targetId: 2, stone: 'leaf' }, { sourceId: 2, targetId: 3, stone: 'leaf' },
  { sourceId: 43, targetId: 44, stone: 'leaf' }, { sourceId: 69, targetId: 70, stone: 'leaf' },
  { sourceId: 44, targetId: 45, stone: 'leaf' }, { sourceId: 70, targetId: 71, stone: 'leaf' },
  { sourceId: 102, targetId: 103, stone: 'leaf' },
  { sourceId: 4, targetId: 5, stone: 'fire' }, { sourceId: 5, targetId: 6, stone: 'fire' },
  { sourceId: 77, targetId: 78, stone: 'fire' }, { sourceId: 37, targetId: 38, stone: 'fire' },
  { sourceId: 58, targetId: 59, stone: 'fire' }, { sourceId: 133, targetId: 136, stone: 'fire' },
  { sourceId: 7, targetId: 8, stone: 'water' }, { sourceId: 8, targetId: 9, stone: 'water' },
  { sourceId: 54, targetId: 55, stone: 'water' }, { sourceId: 60, targetId: 61, stone: 'water' },
  { sourceId: 72, targetId: 73, stone: 'water' }, { sourceId: 79, targetId: 80, stone: 'water' },
  { sourceId: 86, targetId: 87, stone: 'water' }, { sourceId: 98, targetId: 99, stone: 'water' },
  { sourceId: 116, targetId: 117, stone: 'water' }, { sourceId: 118, targetId: 119, stone: 'water' },
  { sourceId: 129, targetId: 130, stone: 'water' }, { sourceId: 61, targetId: 62, stone: 'water' },
  { sourceId: 90, targetId: 91, stone: 'water' }, { sourceId: 120, targetId: 121, stone: 'water' },
  { sourceId: 133, targetId: 134, stone: 'water' },
  { sourceId: 10, targetId: 11, stone: 'bug' }, { sourceId: 11, targetId: 12, stone: 'bug' },
  { sourceId: 13, targetId: 14, stone: 'bug' }, { sourceId: 14, targetId: 15, stone: 'bug' },
  { sourceId: 46, targetId: 47, stone: 'bug' }, { sourceId: 48, targetId: 49, stone: 'bug' },
  { sourceId: 16, targetId: 17, stone: 'normal' }, { sourceId: 17, targetId: 18, stone: 'normal' },
  { sourceId: 19, targetId: 20, stone: 'normal' }, { sourceId: 21, targetId: 22, stone: 'normal' },
  { sourceId: 52, targetId: 53, stone: 'normal' }, { sourceId: 84, targetId: 85, stone: 'normal' },
  { sourceId: 23, targetId: 24, stone: 'poison' }, { sourceId: 29, targetId: 30, stone: 'poison' },
  { sourceId: 32, targetId: 33, stone: 'poison' }, { sourceId: 41, targetId: 42, stone: 'poison' },
  { sourceId: 88, targetId: 89, stone: 'poison' }, { sourceId: 109, targetId: 110, stone: 'poison' },
  { sourceId: 27, targetId: 28, stone: 'ground' }, { sourceId: 50, targetId: 51, stone: 'ground' },
  { sourceId: 104, targetId: 105, stone: 'ground' }, { sourceId: 111, targetId: 112, stone: 'ground' },
  { sourceId: 56, targetId: 57, stone: 'fighting' }, { sourceId: 66, targetId: 67, stone: 'fighting' },
  { sourceId: 67, targetId: 68, stone: 'fighting' },
  { sourceId: 63, targetId: 64, stone: 'psychic' }, { sourceId: 64, targetId: 65, stone: 'psychic' },
  { sourceId: 96, targetId: 97, stone: 'psychic' },
  { sourceId: 74, targetId: 75, stone: 'rock' }, { sourceId: 75, targetId: 76, stone: 'rock' },
  { sourceId: 138, targetId: 139, stone: 'rock' }, { sourceId: 140, targetId: 141, stone: 'rock' },
  { sourceId: 81, targetId: 82, stone: 'thunder' }, { sourceId: 100, targetId: 101, stone: 'thunder' },
  { sourceId: 25, targetId: 26, stone: 'thunder' }, { sourceId: 133, targetId: 135, stone: 'thunder' },
  { sourceId: 92, targetId: 93, stone: 'ghost' }, { sourceId: 93, targetId: 94, stone: 'ghost' },
  { sourceId: 147, targetId: 148, stone: 'dragon' }, { sourceId: 148, targetId: 149, stone: 'dragon' },
  { sourceId: 30, targetId: 31, stone: 'moon' }, { sourceId: 33, targetId: 34, stone: 'moon' },
  { sourceId: 35, targetId: 36, stone: 'moon' }, { sourceId: 39, targetId: 40, stone: 'moon' },
];
