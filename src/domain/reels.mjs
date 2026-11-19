// Modelo de símbolos: a ordem de cada cópia é embaralhada em cada rodada.
export const REEL = Object.freeze([
  ...Array(10).fill('pokeball'),
  ...Array(6).fill('spin'),
  ...Array(4).fill('voucher'),
]);

// A fonte deve retornar um inteiro entre 0 e o limite exclusivo informado.
function drawIndex(randomInt, exclusiveLimit) {
  const index = randomInt(exclusiveLimit);
  if (!Number.isInteger(index) || index < 0 || index >= exclusiveLimit) {
    throw new RangeError('Random source returned an invalid position');
  }
  return index;
}

// Fisher–Yates troca posições sem adicionar nem remover símbolos.
function shuffleReel(randomInt) {
  const reel = [...REEL];
  for (let last = reel.length - 1; last > 0; last -= 1) {
    const selected = drawIndex(randomInt, last + 1);
    [reel[last], reel[selected]] = [reel[selected], reel[last]];
  }
  return reel;
}

// A fonte aleatória deverá ser fornecida pelo backend; isto ainda não é uma
// rodada autorizada, nem altera saldo, concede prêmios ou persiste resultados.
export function createReelRound(randomInt) {
  if (typeof randomInt !== 'function') {
    throw new TypeError('A backend random integer source is required');
  }

  return Array.from({ length: 3 }, () => {
    const reel = shuffleReel(randomInt);
    const position = drawIndex(randomInt, reel.length);
    return { reel, position, symbol: reel[position] };
  });
}
