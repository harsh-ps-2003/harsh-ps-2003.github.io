// One GPU core's matrix unit and the SIMD groups feeding it, walking K a slice at a time: with few SIMD groups the
// unit waits on memory, unless each group prefetches its next slice. Schematic: the lengths are illustrative.
import {html, svg, fmt, controls, choice, button, canvas, reducedMotion} from './lab-core.mjs';

const LOAD = 3, MMA = 2, STEPS = 6;

// Loads overlap freely; the matrix unit runs one multiply at a time, oldest request first.
function simulate(groups, prefetch) {
  const ops = [];
  const g = Array.from({length: groups}, (_, i) => ({id: i, step: 0}));
  for (const s of g) { ops.push({g: s.id, kind: 'load', t0: 0, t1: LOAD}); s.loaded = [LOAD]; }
  let unit = 0;
  for (let done = 0; done < groups * STEPS;) {
    const s = g.filter(s => s.step < STEPS).sort((a, b) => a.loaded[a.step] - b.loaded[b.step] || a.id - b.id)[0];
    const t0 = Math.max(unit, s.loaded[s.step]), t1 = t0 + MMA;
    ops.push({g: s.id, kind: 'mma', t0, t1});
    unit = t1;
    if (s.step + 1 < STEPS) {
      const start = prefetch ? Math.max(t0, s.loaded[s.step]) : t1;
      s.loaded[s.step + 1] = start + LOAD;
      ops.push({g: s.id, kind: 'load', t0: start, t1: start + LOAD});
    }
    s.step++; done++;
  }
  const end = Math.max(...ops.map(o => o.t1));
  const busy = ops.filter(o => o.kind === 'mma').reduce((a, o) => a + o.t1 - o.t0, 0);
  return {ops, end, busy};
}
// One time axis for every setting, so the four runs compare at a glance.
const SCALE = Math.max(...[1, 4].flatMap(n => [false, true].map(p => simulate(n, p).end)));

export async function mount(section) {
  const state = {groups: 1, prefetch: false, t: Infinity};
  const bar = controls(section);
  choice(bar, 'SIMD groups on the core', [[1, '1 (a few rows)'], [4, '4 (many rows)']], state.groups,
    v => { state.groups = v; replay(); });
  choice(bar, 'loop', [[false, "MLX's"], [true, 'prefetching']], state.prefetch, v => { state.prefetch = v; replay(); });
  button(bar, 'replay', () => replay());

  const fig = canvas(section, () => 44 + 26 * (state.groups + 1), draw,
    'Timeline of one GPU core: loads and multiplies of each SIMD group, and how busy the matrix unit is.');
  const readout = html(section, 'p', 'lab-readout');
  const key = html(section, 'div', 'lab-key');
  key.innerHTML = '<span><i style="background: var(--l-faint)"></i>waiting on a load from memory</span>'
    + '<span><i style="background: var(--l-accent)"></i>multiply on the matrix unit</span>';
  html(section, 'p', 'lab-note', 'Schematic: a load here takes 3 units and a multiply 2, to show the shape of the problem, not its measured size.');

  let raf = 0;
  function replay() {
    cancelAnimationFrame(raf);
    const {end} = simulate(state.groups, state.prefetch);
    if (reducedMotion.matches) { state.t = Infinity; fig.redraw(); text(); return; }
    const start = performance.now(), dur = 2600 * end / SCALE;
    const frame = now => {
      state.t = (now - start) / dur * end;
      fig.redraw();
      if (state.t < end) raf = requestAnimationFrame(frame); else { state.t = Infinity; text(); }
    };
    raf = requestAnimationFrame(frame);
    readout.innerHTML = '&nbsp;';
  }

  function draw(root, w) {
    const run = simulate(state.groups, state.prefetch);
    const left = 92, right = w - 8, k = (right - left) / SCALE, row = 26;
    const clip = o => [o.t0, Math.min(o.t1, state.t)];
    for (let i = 0; i < state.groups; i++) {
      svg(root, 'text', {x: 0, y: 18 + i * row, class: 'dim small'}, `SIMD group ${i + 1}`);
    }
    svg(root, 'text', {x: 0, y: 18 + state.groups * row, class: 'small'}, 'matrix unit');
    for (const o of run.ops) {
      const [a, b] = clip(o);
      if (b <= a) continue;
      const y = 6 + o.g * row + (o.kind === 'load' ? 13 : 2);
      svg(root, 'rect', {x: left + a * k, y, width: Math.max(1, (b - a) * k - 1), height: o.kind === 'load' ? 6 : 15, rx: 2,
        style: `fill: ${o.kind === 'load' ? 'var(--l-faint)' : 'var(--l-accent)'}`});
      if (o.kind === 'mma') {
        svg(root, 'rect', {x: left + a * k, y: 6 + state.groups * row + 2, width: Math.max(1, (b - a) * k - 1), height: 15, rx: 2,
          style: 'fill: var(--l-accent)', opacity: 0.35 + 0.65 * ((o.g + 1) / state.groups)});
      }
    }
    const t = Math.min(state.t, run.end);
    svg(root, 'line', {x1: left + t * k, x2: left + t * k, y1: 2, y2: 6 + (state.groups + 1) * row, style: 'stroke: var(--l-ink)', 'stroke-dasharray': '2 3'});
    svg(root, 'text', {x: left, y: 30 + (state.groups + 1) * row, class: 'dim small'}, 'time →');
  }

  function text() {
    const run = simulate(state.groups, state.prefetch);
    const steps = state.groups * STEPS;
    readout.innerHTML = `${steps} slices of K multiplied in <b>${run.end} units</b>; the matrix unit is busy `
      + `<b>${fmt(run.busy / run.end * 100)}%</b> of the time. `
      + (state.groups === 1 && !state.prefetch ? 'Alone on the core, the SIMD group waits for every load before it can multiply.'
        : state.groups === 1 ? 'The next slice loads while the current one is multiplied, so most of the wait disappears: same slices, same order, the same bits.'
        : 'With many SIMD groups the core takes turns: while one waits on memory, another multiplies. That is how a GPU normally hides latency, and why only few-row matmuls need the prefetch.');
  }
  replay();
}
