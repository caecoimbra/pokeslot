import './arcade-reels.css';
import { PAYLINES } from '../domain/paylines.mjs';

const symbols = ['pokeball', 'spin', 'voucher'];
const svgNamespace = 'http://www.w3.org/2000/svg';
const loopMs = 135;

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
  windows.style.setProperty('--speed', `${loopMs}ms`);
  const tracks = symbols.map(() => {
    const window = part('reel-window');
    const track = part('reel-track');
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
    const remaining = Math.max(0, loopMs - (performance.now() - started));
    if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    if (version !== generation || reducedMotion.matches) return;
    const progress = tracks.map(track => track.getAnimations()[0]?.effect.getComputedTiming().progress ?? 0);
    frame.classList.add('is-stopping');
    stops = tracks.map((track, c) => {
      // Keep the current phase; each later reel coasts one extra lap before braking.
      const laps = 2 + c;
      const strip = grid.map(row => row[c]);
      for (let i = 0; i < laps; i++) strip.push(...patterns[c]);
      track.replaceChildren(...strip.map(makeTile));
      const brakingLaps = 2 - progress[c];
      const coastMs = c * loopMs;
      // Constant deceleration covers half the distance of cruising for the same time.
      const duration = coastMs + 2 * brakingLaps * loopMs;
      const position = lapsLeft => `translateY(${-100 * lapsLeft / (1 + laps)}%)`;
      const frames = [];
      if (c) frames.push({ transform: position(c + brakingLaps), offset: 0 });
      frames.push({ transform: position(brakingLaps), offset: coastMs / duration,
        easing: 'cubic-bezier(.333333,.666667,.666667,1)' }, { transform: 'translateY(0)' });
      return track.animate(frames, { duration, fill: 'forwards' });
    });
    const runningStops = stops;
    const skipMotion = () => runningStops.forEach(animation => animation.finish());
    reducedMotion.addEventListener('change', skipMotion, { once: true });
    try { await Promise.allSettled(runningStops.map(animation => animation.finished)); }
    finally { reducedMotion.removeEventListener('change', skipMotion); }
  }
  return { render, stop };
}
