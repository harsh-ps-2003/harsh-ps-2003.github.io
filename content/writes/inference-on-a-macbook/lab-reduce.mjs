// How one threadgroup of the add + RMSNorm kernel sums a row's squares: each thread over its channels, then
// simd_sum inside each SIMD group, then once more over the SIMD groups' partial sums.
import {html, svg, fmt, controls, choice, button, canvas, reducedMotion} from './lab-core.mjs';

const WIDTHS = [[768, 'Laya multilingual, 768'], [2048, 'd1-3B, 2,048'], [4096, 'Clef-Flash, 4,096']];
const LANES = 32, STAGES = 10;
const leftOf = w => (w < 500 ? 18 : 64);
const cellOf = w => Math.min(22, (w - leftOf(w) - 24) / (LANES + 1.6)); // the shared slots take 1.6 cells
const threads = width => Math.min(256, Math.max(32, 2 ** Math.ceil(Math.log2(width)))); // as kernels/norm.py

export async function mount(section) {
  const state = {width: 2048, stage: 0};
  const bar = controls(section);
  choice(bar, 'row width', WIDTHS, state.width, v => { state.width = v; state.stage = 0; update(); });
  const bar2 = controls(section);
  const back = button(bar2, '← step', () => { state.stage = Math.max(0, state.stage - 1); update(); });
  const next = button(bar2, 'step →', () => { state.stage = Math.min(STAGES - 1, state.stage + 1); update(); });
  button(bar2, 'play', () => play());

  const fig = canvas(section, w => 44 + 8 * cellOf(w), draw,
    'Eight SIMD groups of 32 threads summing one row: how much of the row each thread has added up after each step.');
  const readout = html(section, 'p', 'lab-readout');

  // numbers of the row each lane has summed after a stage (per lane; lane 0 at the end for the last stages)
  function covered(stage, lane, group, width) {
    const t = threads(width), groups = t / LANES, each = width / t;
    if (stage === 0) return 0;
    if (stage === 1) return each;
    if (stage <= 6) return each * 2 ** (stage - 1);
    if (stage <= 7) return each * LANES;
    if (stage === 8) return group === 0 ? width : each * LANES;
    return width;
  }

  function draw(root, w) {
    const t = threads(state.width), groups = t / LANES, cell = cellOf(w), left = leftOf(w), top = 38;
    svg(root, 'text', {x: 0, y: 12, class: 'dim small'}, `${t} threads = ${groups} SIMD groups × 32 lanes`);
    for (let gi = 0; gi < groups; gi++) {
      const y = top + gi * cell;
      svg(root, 'text', {x: 0, y: y + cell * 0.75, class: 'dim', style: `font-size: ${Math.min(11, cell)}px`},
        w < 500 ? `${gi + 1}` : `group ${gi + 1}`);
      for (let lane = 0; lane < LANES; lane++) {
        const c = covered(state.stage, lane, gi, state.width) / state.width;
        svg(root, 'rect', {x: left + lane * cell, y, width: cell - 2, height: cell - 2, rx: 2,
          style: `fill: var(--l-accent); fill-opacity: ${c === 0 ? 0 : 0.12 + 0.88 * Math.sqrt(c)}; stroke: var(--l-faint)`});
      }
    }
    // the exchange partners of the current simd_sum round, drawn on the first group
    if (state.stage >= 2 && state.stage <= 6) {
      const d = 32 >> (state.stage - 1);
      for (let lane = 0; lane < LANES; lane++) {
        const p = lane ^ d;
        if (p < lane) continue;
        const x1 = left + lane * cell + cell / 2 - 1, x2 = left + p * cell + cell / 2 - 1, h = Math.min(cell * 1.6, 6 + d * 1.2);
        svg(root, 'path', {d: `M${x1},${top - 1} C${x1},${top - h} ${x2},${top - h} ${x2},${top - 1}`, fill: 'none',
          style: 'stroke: var(--l-ink)', 'stroke-width': 1});
      }
    }
    // threadgroup memory: one slot per SIMD group
    if (state.stage >= 7) {
      const x = left + LANES * cell + 8;
      svg(root, 'text', {x, y: 12, class: 'dim small'}, 'shared');
      for (let gi = 0; gi < groups; gi++) {
        const full = state.stage >= 8 && gi === 0;
        svg(root, 'rect', {x, y: top + gi * cell, width: cell * 1.6, height: cell - 2, rx: 2,
          style: `fill: var(--l-accent); fill-opacity: ${full ? 1 : 0.45}; stroke: var(--l-faint)`});
      }
    }
  }

  const words = () => {
    const t = threads(state.width), groups = t / LANES, each = state.width / t;
    return [
      `One row of ${fmt(state.width)} numbers, one threadgroup of ${t} threads. Step through how it finds the sum of their squares.`,
      `Each thread walks the row ${t} channels apart: it adds the residual to each of its <b>${each}</b> channels and sums their squares in fp32. All ${t} threads do this at once.`,
      `<code>simd_sum</code> adds up a value across the 32 lanes of a SIMD group, in registers, with no shared memory and no barrier. You can picture it as five rounds of swapping with a partner and adding. Round 1: partners 16 lanes apart.`,
      'Round 2: partners 8 apart. Each lane now holds 4 threads\' worth.',
      'Round 3: 4 apart.',
      'Round 4: 2 apart.',
      `Round 5: neighbours. Every lane of each SIMD group now holds that group's sum of ${fmt(each * LANES)} squares.`,
      `The first lane of each SIMD group writes its sum into threadgroup memory: ${groups} numbers. One barrier, so every write lands before anyone reads.`,
      `The first SIMD group reads the ${groups} partial sums and runs <code>simd_sum</code> once more: the whole row's sum of squares, from ${fmt(state.width)} numbers.`,
      'A second barrier, then every thread reads the total, takes one reciprocal square root and writes its channels twice: the new residual, and the normalised row. One kernel, where MLX runs an add and then a norm.',
    ];
  };

  let timer = 0;
  function play() {
    clearInterval(timer);
    if (reducedMotion.matches) { state.stage = STAGES - 1; update(); return; }
    state.stage = 0; update();
    timer = setInterval(() => {
      if (state.stage >= STAGES - 1) { clearInterval(timer); return; }
      state.stage++; update();
    }, 1100);
  }

  function update() {
    fig.redraw();
    back.disabled = state.stage === 0;
    next.disabled = state.stage === STAGES - 1;
    readout.innerHTML = `<b>${state.stage + 1} / ${STAGES}.</b> ${words()[state.stage]}`;
  }
  update();
}
