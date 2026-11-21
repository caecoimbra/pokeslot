import { findWinningLines } from '../domain/paylines.mjs';

// Grade fixa para explicar as linhas; não representa um giro ou prêmio real.
const grid = [
  ['pokeball', 'pokeball', 'pokeball'],
  ['spin', 'pokeball', 'voucher'],
  ['voucher', 'spin', 'pokeball'],
];
const messages = {
  pt: {
    eyebrow: 'Prévia de desenvolvimento', title: 'Uma primeira olhada na máquina',
    intro: 'Esta grade é um exemplo fixo para visualizar as linhas vencedoras.',
    machineLabel: 'MÁQUINA DE TESTE', machineTitle: 'Linhas em destaque',
    results: 'LINHAS VENCEDORAS', caption: 'Os símbolos destacados fazem parte de uma ou mais linhas vencedoras.',
    footnote: 'Prévia ilustrativa: não usa saldo, não sorteia Pokémon e não concede prêmios.',
    symbols: { pokeball: 'Pokébola', spin: 'Giro', voucher: 'Vale' },
    lines: { top: 'Superior', middle: 'Central', bottom: 'Inferior', diagonal_down: 'Diagonal descendente', diagonal_up: 'Diagonal ascendente' },
  },
  en: {
    eyebrow: 'Development preview', title: 'A first look at the machine',
    intro: 'This fixed grid illustrates the winning lines.',
    machineLabel: 'TEST MACHINE', machineTitle: 'Highlighted lines',
    results: 'WINNING LINES', caption: 'Highlighted symbols belong to one or more winning lines.',
    footnote: 'Illustrative preview: no balance, Pokémon draws or rewards are used.',
    symbols: { pokeball: 'Poké Ball', spin: 'Spin', voucher: 'Voucher' },
    lines: { top: 'Top', middle: 'Middle', bottom: 'Bottom', diagonal_down: 'Descending diagonal', diagonal_up: 'Ascending diagonal' },
  },
};
const icons = { pokeball: '●', spin: '↻', voucher: '★' };
const positions = {
  top: [0, 1, 2], middle: [3, 4, 5], bottom: [6, 7, 8],
  diagonal_down: [0, 4, 8], diagonal_up: [6, 4, 2],
};
const wins = findWinningLines(grid);
let language = 'pt';

function render() {
  const text = messages[language];
  document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';
  document.title = language === 'pt' ? 'PokéSlot — prévia da máquina' : 'PokéSlot — machine preview';
  document.querySelectorAll('[data-text]').forEach((element) => { element.textContent = text[element.dataset.text]; });
  const button = document.querySelector('#language');
  button.textContent = language === 'pt' ? 'EN' : 'PT';
  button.setAttribute('aria-label', language === 'pt' ? 'Switch to English' : 'Mudar para português');
  const highlighted = new Set(wins.flatMap(({ line }) => positions[line]));
  const cells = grid.flat().map((symbol, index) => {
    const cell = document.createElement('div');
    cell.className = `cell ${symbol}${highlighted.has(index) ? ' winning' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'symbol';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[symbol];
    const label = document.createElement('span');
    label.textContent = text.symbols[symbol];
    cell.append(icon, label);
    return cell;
  });
  document.querySelector('#grid').replaceChildren(...cells);
  document.querySelector('#grid').setAttribute('aria-label', text.machineTitle);
  document.querySelector('#lines').textContent = wins.map(({ line }) => text.lines[line]).join(' · ');
}

document.querySelector('#language').addEventListener('click', () => {
  language = language === 'pt' ? 'en' : 'pt';
  render();
});
render();
