import './arcade-reels.css';
import { PAYLINES } from '../domain/paylines.mjs';

const symbols = ['pokeball', 'spin', 'voucher'];
const svgNamespace = 'http://www.w3.org/2000/svg';

function part(className) {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function makeTile(symbol) {
  const tile = part('reel-tile');
  const icon = part('reel-icon icon-' + symbol);
  icon.append(part('icon-center'));
  tile.append(icon);
  return tile;
}

export function createArcadeReels(frame) {
  const windows = part('reel-windows');
  const tracks = symbols.map((_, index) => {
    const window = part('reel-window');
    const track = part('reel-track');
    window.style.setProperty('--speed', (350 + index * 36) + 'ms');
    window.append(track);
    windows.append(window);
    return track;
  });
  const overlay = document.createElementNS(svgNamespace, 'svg');
  overlay.setAttribute('viewBox', '0 0 300 300');
  overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.setAttribute('class', 'reel-paylines');
  windows.append(overlay);
  const rails = [part('reel-rail rail-left'), part('reel-rail rail-right')];
  const guides = PAYLINES.map(({ line: key, rows }) => {
    const arrow = { diagonal_down: '↘', diagonal_up: '↗' }[key] ?? '▸';
    const line = document.createElementNS(svgNamespace, 'polyline');
    const y = rows.map(row => row * 100 + 50);
    line.setAttribute('points', `0,${y[0]} 50,${y[0]} 150,${y[1]} 250,${y[2]} 300,${y[2]}`);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    overlay.append(line);
    const arrows = rails.map((rail, side) => {
      const marker = part('lane-arrow');
      marker.textContent = arrow;
      marker.dataset.lane = key;
      marker.style.top = (y[side * 2] / 3) + '%';
      rail.append(marker);
      return marker;
    });
    return { key, line, arrows };
  });
  frame.replaceChildren(rails[0], windows, rails[1]);
  frame.setAttribute('role', 'img');
  frame.classList.add('arcade-reels');
  for (const child of frame.children) child.setAttribute('aria-hidden', 'true');
  const patterns = tracks.map((_, column) => symbols.map((_, i) => symbols[(column + i) % 3]));
  let rolling = false;
  let started = 0;
  let generation = 0;
  let displayed;
  let stops = [];

  function render(grid, wins, spinning, text) {
    if (spinning !== rolling) {
      generation++;
      stops.forEach(animation => animation.cancel());
      stops = [];
      rolling = spinning;
      displayed = null;
      frame.classList.remove('is-stopping');
      frame.classList.toggle('is-spinning', spinning);
      if (spinning) {
        started = performance.now();
        tracks.forEach((track, c) => track.replaceChildren(...patterns[c].concat(patterns[c]).map(makeTile)));
      }
    }
    if (!spinning && displayed !== grid) {
      tracks.forEach((track, c) => track.replaceChildren(...grid.map(row => makeTile(row[c]))));
      displayed = grid;
    }
    for (const { key, line, arrows } of guides) {
      const winning = !spinning && wins.some(win => win.line === key);
      line.classList.toggle('lane-won', winning);
      for (const marker of arrows) {
        marker.classList.toggle('lane-won', winning);
        marker.title = text.lines[key];
      }
    }
    const rows = spinning ? '' : grid.map(row => row.map(symbol => text.symbols[symbol]).join(', ')).join('; ');
    frame.setAttribute('aria-label', spinning ? text.reelsSpinning : text.machineTitle + '. ' + rows);
    frame.setAttribute('aria-busy', String(spinning));
  }

  async function stop(grid) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    if (!rolling || reducedMotion.matches || !frame.getClientRects().length ||
        !tracks[0].getAnimations || !tracks[0].animate) return;
    const version = generation;
    const remaining = Math.max(0, 480 - (performance.now() - started));
    if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    if (version !== generation || reducedMotion.matches) return;
    const progress = tracks.map(track => track.getAnimations()[0]?.effect.getComputedTiming().progress ?? 0);
    frame.classList.add('is-stopping');
    stops = tracks.map((track, c) => {
      // Prepend the confirmed result and continue from the same phase on the moving strip.
      const strip = grid.map(row => row[c]).concat(patterns[c], patterns[c]);
      track.replaceChildren(...strip.map(makeTile));
      const offset = -(2 - progress[c]) * 100 / 3;
      return track.animate([{ transform: `translateY(${offset}%)` }, { transform: 'translateY(0)' }],
        { duration: 420 + c * 140, easing: 'cubic-bezier(.15,.55,.29,1)', fill: 'forwards' });
    });
    await Promise.allSettled(stops.map(animation => animation.finished));
  }
  return { render, stop };
}
