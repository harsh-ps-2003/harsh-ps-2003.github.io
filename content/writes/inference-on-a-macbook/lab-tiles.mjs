// A matmul's tiles over a prompt's rows, the last partial block, and the measured speed of MLX's tile against the
// tuner's best on d1-3B's four matrices.
import {html, svg, fmt, pctMore, controls, choice, slider, canvas, logScale} from './lab-core.mjs';

const TILES = [[32, 64], [64, 128], [128, 128]];
const STEPS = 300, LO = 8, HI = 4096;
const rowsAt = i => Math.round(LO * (HI / LO) ** (i / (STEPS - 1)));
const PEAK = 33, BW = 0.307;

export async function mount(section, {data}) {
  const shapes = (await data).matmul;
  const state = {shape: 0, rows: 2103, tile: 1, fix: false};
  const bar = controls(section);
  choice(bar, 'matrix', shapes.map((s, i) => [i, `${s.name} ${fmt(s.n)}×${fmt(s.k)}`]), state.shape,
    v => { state.shape = v; update(); });
  const bar2 = controls(section);
  choice(bar2, 'tile', TILES.map(([m, n], i) => [i, `${m}×${n}${i === 1 ? " (MLX's)" : ''}`]), state.tile,
    v => { state.tile = v; update(); });
  choice(bar2, 'last block', [[false, 'partial'], [true, 'moved back']], state.fix, v => { state.fix = v; update(); });
  const bar3 = controls(section);
  const index = Math.round(Math.log(state.rows / LO) / Math.log(HI / LO) * (STEPS - 1));
  const rows = slider(bar3, 'prompt rows', STEPS, index, i => fmt(rowsAt(i)), i => { state.rows = rowsAt(i); update(); });
  rows.text(fmt(state.rows));
  for (const r of [96, 320, 2048, 2103]) {
    const b = html(bar3, 'button', 'lab-btn', fmt(r));
    b.type = 'button';
    b.addEventListener('click', () => {
      state.rows = r;
      rows.set(Math.round(Math.log(r / LO) / Math.log(HI / LO) * (STEPS - 1)));
      rows.text(fmt(r));
      update();
    });
  }

  const fig = canvas(section, w => (w >= 560 ? 250 : 470), draw,
    "A prompt's rows cut into row blocks, and the measured TFLOPS of MLX's matmul and the best tile against rows.");
  const readout = html(section, 'p', 'lab-readout');
  const key = html(section, 'div', 'lab-key');
  key.innerHTML = '<span><i style="background: var(--l-light)"></i>MLX\'s matmul</span>'
    + '<span><i style="background: var(--l-accent)"></i>best tile the tuner found</span>'
    + '<span><i style="background: var(--l-faint)"></i>roofline: 33 TFLOPS, 307 GB/s</span>';
  html(section, 'p', 'lab-note', "Measured on the M5 Pro, fp16, each matmul timed in a dependent chain like the model's, "
    + 'at the row counts the tuner measures. The row blocks are a drawing; the speeds are measurements.');

  function draw(root, w, h) {
    const wide = w >= 560;
    const blocksBox = wide ? {x: 0, y: 8, w: Math.min(190, w * 0.3), h: h - 30} : {x: 0, y: 8, w, h: 190};
    const chartBox = wide ? {x: blocksBox.w + 40, y: 8, w: w - blocksBox.w - 40, h: h - 30}
      : {x: 0, y: 244, w, h: h - 264};
    drawBlocks(root, blocksBox);
    drawChart(root, chartBox);
  }

  function drawBlocks(root, b) {
    const [bm] = TILES[state.tile], m = state.rows, count = Math.ceil(m / bm), part = m % bm;
    const stripX = b.x + 34, stripW = Math.min(90, b.w - 40), k = b.h / m;
    svg(root, 'text', {x: b.x, y: b.y + 4, class: 'dim small'}, `${fmt(m)} rows`);
    for (let i = 0; i < count; i++) {
      const last = i === count - 1 && part > 0;
      let r0 = i * bm, r1 = Math.min(m, r0 + bm);
      if (last && state.fix && count > 1) { r0 = m - bm; r1 = m; }
      const fill = last ? (state.fix ? 'var(--l-light)' : 'var(--l-accent)') : 'var(--l-light)';
      svg(root, 'rect', {x: stripX, y: b.y + 12 + r0 * k, width: stripW, height: Math.max(0.8, (r1 - r0) * k - (count < 60 ? 1 : 0)),
        style: `fill: ${fill}; opacity: ${last && state.fix ? 0.75 : 1}`});
      if (last && state.fix && count > 1) {
        svg(root, 'rect', {x: stripX, y: b.y + 12 + r0 * k, width: stripW, height: (bm - part) * k,
          style: 'fill: var(--l-accent); opacity: .45'});
      }
    }
    const label = part === 0 ? `${count} whole blocks of ${bm}`
      : state.fix && count > 1 ? `last block moved back: ${bm - part} rows done twice`
      : `last block: ${part} of ${bm} rows`;
    svg(root, 'text', {x: b.x, y: b.y + b.h + 24, class: part && !state.fix ? '' : 'dim small'}, label);
  }

  function drawChart(root, c) {
    const s = shapes[state.shape], left = c.x + 30, right = c.x + c.w - 4, top = c.y + 6, bottom = c.y + c.h;
    const x = logScale(LO, HI, left, right), y = v => bottom - v / 35 * (bottom - top);
    for (const t of [0, 10, 20, 30]) {
      svg(root, 'line', {x1: left, x2: right, y1: y(t), y2: y(t), class: 'grid'});
      svg(root, 'text', {x: left - 5, y: y(t) + 3.5, 'text-anchor': 'end', class: 'dim small'}, String(t));
    }
    for (const r of [8, 64, 512, 4096]) {
      svg(root, 'text', {x: x(r), y: bottom + 14, 'text-anchor': r === 8 ? 'start' : r === 4096 ? 'end' : 'middle', class: 'dim small'}, fmt(r));
    }
    svg(root, 'text', {x: left, y: top - 0, class: 'dim small'}, 'TFLOPS');
    const roof = [];
    for (let e = 0; e <= 90; e++) { const r = LO * (HI / LO) ** (e / 90); roof.push(`${x(r)},${y(Math.min(PEAK, BW * r))}`); }
    svg(root, 'polyline', {points: roof.join(' '), fill: 'none', style: 'stroke: var(--l-faint)', 'stroke-dasharray': '4 3'});
    const tf = (r, ms) => 2 * r * s.n * s.k / ms / 1e9;
    for (const [col, j, width] of [['var(--l-light)', 1, 2], ['var(--l-accent)', 2, 2.2]]) {
      svg(root, 'polyline', {points: s.points.map(p => `${x(p[0])},${y(tf(p[0], p[j]))}`).join(' '), fill: 'none',
        style: `stroke: ${col}`, 'stroke-width': width});
    }
    const r = Math.min(HI, Math.max(LO, state.rows));
    svg(root, 'line', {x1: x(r), x2: x(r), y1: top, y2: bottom, style: 'stroke: var(--l-ink)', 'stroke-dasharray': '2 3'});
  }

  function update() {
    fig.redraw();
    const s = shapes[state.shape], [bm, bn] = TILES[state.tile], m = state.rows;
    const groups = Math.ceil(m / bm) * Math.ceil(s.n / bn);
    const near = s.points.reduce((a, p) => Math.abs(Math.log(p[0] / m)) < Math.abs(Math.log(a[0] / m)) ? p : a);
    const tf = ms => 2 * near[0] * s.n * s.k / ms / 1e9;
    const mlx = tf(near[1]), best = tf(near[2]);
    const lead = best > mlx * 1.005 ? `the best tile ${fmt(best, 1)}, <b>${pctMore(best, mlx)} faster</b>`
      : best < mlx * 0.995 ? `no tile beat it (the best tried: ${fmt(best, 1)}), so MLX's runs` : `the best tile the same`;
    const regime = near[0] <= 64 ? 'Few rows: every kernel streams the weights at about the bandwidth line, and MLX\'s thin kernel is already right.'
      : near[0] <= 512 ? 'The middle, where short decision requests live: MLX\'s regular tile reads the weights at half the bandwidth or less, and thinner or prefetching tiles do better.'
      : 'Many rows: compute-bound, and MLX\'s tile is close to the best, except on the down projection with its long K.';
    let text = `${fmt(m)} rows × ${fmt(s.n)} columns in ${bm}×${bn} tiles: <b>${fmt(groups)} threadgroups</b> for 20 GPU cores. `
      + `Measured at ${fmt(near[0])} rows: MLX ${fmt(mlx, 1)} TFLOPS, ${lead}. ${regime}`;
    const part = m % bm;
    if (part && !state.fix) text += ` The last block has ${part} rows, and before the fix it ran a slower loop with bounds checks at every step of K.`;
    readout.innerHTML = text;
  }
  update();
}
