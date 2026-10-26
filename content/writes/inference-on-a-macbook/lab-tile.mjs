// What a tile is: the output of x @ w.T cut into tiles, one per threadgroup, each walking K a slice at a time.
// The matrix is d1-3B's 2,048 × 2,048 output projection.
import {html, svg, fmt, controls, choice, button, canvas, fitText, reducedMotion} from './lab-core.mjs';

const N = 2048, K = 2048, BK = 32, CORES = 20;
const TILES = [[32, 32], [64, 64], [64, 128], [128, 128]];

export async function mount(section) {
  const state = {tile: 2, rows: 128, k: K};
  const bar = controls(section);
  choice(bar, 'tile', TILES.map(([m, n], i) => [i, `${m}×${n}${i === 2 ? " (MLX's)" : ''}`]), state.tile, v => { state.tile = v; update(); });
  const bar2 = controls(section);
  choice(bar2, 'prompt rows', [[32, '32'], [128, '128'], [1103, '1,103']], state.rows, v => { state.rows = v; update(); });
  button(bar2, 'walk K', () => walk());

  const fig = canvas(section, w => {
    const s = scale(w);
    return Math.round(K * s + 18 + Math.max(16, state.rows * s) + 40);
  }, draw, 'The input rows, the weights and the output of a matmul, with one output tile and the slices of input it reads.');
  const readout = html(section, 'p', 'lab-readout');
  const key = html(section, 'div', 'lab-key');
  key.innerHTML = '<span><i style="background: var(--l-accent)"></i>one threadgroup\'s tile, and what it reads</span>'
    + '<span><i style="background: var(--l-light)"></i>the other tiles</span>';

  function scale(w) { return Math.min(0.12, (w - 80) / (K + N)); }

  function draw(root, w) {
    const s = scale(w), [bm, bn] = TILES[state.tile], m = state.rows;
    const xw = K * s, cw = N * s, left = Math.max(30, (w - (xw + 14 + cw)) / 2);
    const top = 18, wy = top, cy = top + K * s + 18, mh = Math.max(16, m * s);
    const cx = left + xw + 14;
    // weights (shown as K × N) on top, input rows (M × K) bottom left, output (M × N) bottom right
    svg(root, 'rect', {x: cx, y: wy, width: cw, height: K * s, style: 'fill: var(--l-panel); stroke: var(--l-faint)'});
    fitText(root, cx + cw, wy - 5, cw + xw, `weights: ${fmt(N)} columns, K = ${fmt(K)}`, {size: 10, min: 8, anchor: 'end', cls: 'dim'});
    svg(root, 'rect', {x: left, y: cy, width: xw, height: mh, style: 'fill: var(--l-panel); stroke: var(--l-faint)'});
    svg(root, 'text', {x: left, y: cy + mh + 14, class: 'dim small'}, `input: ${fmt(m)} rows`);
    // output tiles, numbered in rounds of 20 cores
    const tr = Math.ceil(m / bm), tc = N / bn, k = state.k / K;
    for (let i = 0; i < tr; i++) {
      for (let j = 0; j < tc; j++) {
        const y0 = cy + i * bm * s, h = Math.min(bm, m - i * bm) * s * (m * s < 16 ? 16 / (m * s) : 1);
        const first = i === 0 && j === 0;
        svg(root, 'rect', {x: cx + j * bn * s, y: y0, width: bn * s - (tc < 80 ? 0.6 : 0), height: Math.max(1, h - 0.6),
          style: `fill: ${first ? 'var(--l-accent)' : 'var(--l-light)'}; opacity: ${first ? 0.25 + 0.75 * k : 0.45}`});
      }
    }
    svg(root, 'text', {x: cx + cw, y: cy + mh + 14, 'text-anchor': 'end', class: 'dim small'}, `output: ${fmt(tr * tc)} tiles`);
    // the bands the first tile reads, and the current slice of K
    const bandH = Math.min(bm, m) * s * (m * s < 16 ? 16 / (m * s) : 1);
    svg(root, 'rect', {x: left, y: cy, width: xw, height: bandH, style: 'fill: var(--l-accent); opacity: .22'});
    svg(root, 'rect', {x: cx, y: wy, width: bn * s, height: K * s, style: 'fill: var(--l-accent); opacity: .22'});
    if (state.k < K) {
      svg(root, 'rect', {x: left + state.k * s, y: cy, width: Math.max(2, BK * s), height: bandH, style: 'fill: var(--l-accent)'});
      svg(root, 'rect', {x: cx, y: wy + state.k * s, width: bn * s, height: Math.max(2, BK * s), style: 'fill: var(--l-accent)'});
    }
  }

  let raf = 0;
  function walk() {
    cancelAnimationFrame(raf);
    if (reducedMotion.matches) { state.k = K; update(); return; }
    const start = performance.now(), dur = 3000;
    const frame = now => {
      const t = Math.min(1, (now - start) / dur);
      state.k = t < 1 ? Math.floor(t * K / BK) * BK : K;
      fig.redraw();
      if (t < 1) raf = requestAnimationFrame(frame); else update();
    };
    raf = requestAnimationFrame(frame);
  }

  function update() {
    fig.redraw();
    const [bm, bn] = TILES[state.tile], m = state.rows;
    const tiles = Math.ceil(m / bm) * (N / bn), rounds = Math.ceil(tiles / CORES), last = tiles - CORES * (rounds - 1);
    const groups = (bm / 32) * (bn / 32), reuse = bm * bn / (bm + bn), part = m % bm;
    const work = tiles < CORES ? `<b>${tiles} tiles for ${CORES} cores</b>: ${CORES - tiles} cores get no work at all.`
      : last < CORES ? `<b>${fmt(tiles)} tiles for ${CORES} cores</b>: ${rounds} rounds, and the last one leaves ${CORES - last} cores idle.`
      : `<b>${fmt(tiles)} tiles for ${CORES} cores</b>: ${rounds} full rounds.`;
    readout.innerHTML = `${work} Each step of K, a tile loads ${bm} input rows and ${bn} weight rows, 32 numbers each, `
      + `and does ${fmt(bm * bn * 32)} multiply-adds with them: <b>${fmt(reuse, 0)} FLOPs per byte</b> loaded. `
      + `Its ${groups} SIMD group${groups > 1 ? 's' : ''} each keep a 32 × 32 block of fp32 sums, 32 registers per thread. `
      + (part ? `${fmt(m)} rows aren't a multiple of ${bm}: the last row of tiles holds ${part} real rows and checks its bounds on every load.` : '');
  }
  update();
}
