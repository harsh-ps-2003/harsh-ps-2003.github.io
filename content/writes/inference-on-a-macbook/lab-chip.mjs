// The M5 Pro as software sees it: which processor each framework reaches, and what is inside one GPU core.
import {html, svg, controls, choice, button, canvas, fitText, reducedMotion} from './lab-core.mjs';

const ROUTES = {
  neki: {fw: 'MLX · neki', api: 'Metal kernels', target: 'gpu',
    text: 'MLX, and neki on top of it, turn each operation into a <b>Metal kernel</b>, a small program the GPU runs as thousands of copies. '
      + 'On the M5 the matrix multiplies inside those kernels run on each GPU core\'s <b>Neural Accelerator</b>, through Metal 4\'s tensor operations; '
      + 'everything else (adds, softmax, norms) runs on the same cores\' ordinary arithmetic units. The weights are read straight from unified memory.'},
  torch: {fw: 'PyTorch (mps)', api: 'Metal Performance Shaders', target: 'gpu',
    text: 'PyTorch\'s Mac backend sends operations to <b>Metal Performance Shaders</b> and MPSGraph, Apple\'s prebuilt GPU kernels. '
      + 'Same GPU, and Apple\'s kernels use the Neural Accelerators too, but you get the kernels Apple wrote, for the shapes Apple expected. '
      + 'This is how most makers\' own code runs on a Mac.'},
  coreml: {fw: 'Core ML', api: 'Core ML compiler', target: 'ane',
    text: 'Core ML is the only door to the <b>Neural Engine</b>, a separate block of 16 cores built for running models at low power. '
      + 'Its compiler decides, operation by operation, whether something runs there, on the GPU or on the CPU; you can ask, but it chooses.'},
  numpy: {fw: 'NumPy', api: 'Accelerate', target: 'cpu',
    text: 'NumPy\'s matrix multiplies go to Apple\'s <b>Accelerate</b> library on the <b>CPU</b>, which has matrix instructions of its own. '
      + 'On these models\' matmuls it manages 0.2 to 0.5 TFLOPS against the GPU\'s 33, so the CPU\'s job here is Python, tokenizing and telling the GPU what to run.'},
};
const PHASES = [
  'A slice of the input rows and of the weights comes in from unified memory, through the shared cache and the GPU\'s caches.',
  'The SIMD groups load it into the core\'s on-chip memory, one pool split between registers, threadgroup memory and cache as the kernel needs.',
  'Each SIMD group hands its piece to the Neural Accelerator: a 32 × 32 block of products, summed over the slice, in one tensor operation.',
  'The products are added into the tile\'s running sums, held in fp32 in the threads\' registers. Then the next slice, until K runs out, and the tile is written to memory once.',
];
const ACCENT = 'var(--l-accent)', FAINT = 'var(--l-faint)', LIGHT = 'var(--l-light)', BG = 'var(--l-bg)', PANEL = 'var(--l-panel)', TINT = 'var(--l-tint)';

export async function mount(section) {
  const state = {view: 'chip', route: 'neki', phase: -1};
  const bar = controls(section);
  choice(bar, 'show', [['chip', 'the chip'], ['core', 'inside one GPU core']], state.view, v => {
    state.view = v; state.phase = -1;
    routeBar.style.display = v === 'chip' ? '' : 'none';
    playBar.style.display = v === 'core' ? '' : 'none';
    update();
  });
  const routeBar = controls(section);
  choice(routeBar, 'a matmul from', Object.entries(ROUTES).map(([k, r]) => [k, r.fw]), state.route, v => { state.route = v; update(); });
  const playBar = controls(section);
  playBar.style.display = 'none';
  button(playBar, 'play one step of a matmul', () => play());

  const fig = canvas(section, w => state.view === 'chip' ? (w >= 620 ? 390 : 500) : (w >= 620 ? 330 : 560), draw,
    'Diagram of the M5 Pro: CPU, GPU with a Neural Accelerator in each core, Neural Engine, shared cache and unified memory, with the software path to each.');
  const readout = html(section, 'p', 'lab-readout');
  html(section, 'p', 'lab-note', 'Apple\'s figures for the M5 Pro in this MacBook: 18 CPU cores (6 super, 12 performance), 20 GPU cores, '
    + '16 Neural Engine cores, 307 GB/s. It is built from two dies fused into one chip; to software it is one chip. Blocks are not to scale.');

  function draw(root, w, h) { (state.view === 'chip' ? drawChip : drawCore)(root, w, h); }

  // ---- the chip -------------------------------------------------------------------------------------------
  function drawChip(root, w, h) {
    const wide = w >= 620, r = ROUTES[state.route];
    const sw = wide ? Math.round(w * 0.3) : 0;
    const chip = wide ? {x: sw + 40, y: 6, w: w - sw - 40, h: h - 56} : {x: 0, y: 74, w, h: h - 124};
    const b = layout(chip, wide);
    if (wide) {
      box(root, 0, chip.y, sw, 30, 'Python: your code', '', true);
      const rowH = 54;
      Object.entries(ROUTES).forEach(([k, route], i) => {
        const on = k === state.route, y = chip.y + 46 + i * (rowH + 10);
        box(root, 0, y, sw, rowH, route.fw, `→ ${route.api}`, on);
        const t = b[route.target], mx = sw + 12 + i * 6;
        const ty = route.target === 'gpu' ? b.gapY + (k === 'neki' ? -3 : 3) : t.y + t.h / 2;
        connector(root, `M${sw},${y + rowH / 2} H${mx} V${ty} H${t.x - 2}`, on);
      });
    } else {
      const steps = ['Python', r.fw, r.api, {gpu: 'GPU', ane: 'Neural Engine', cpu: 'CPU'}[r.target]];
      const bw = (w - 3 * 12) / 4;
      steps.forEach((s, i) => {
        // a label too long for its box goes on two lines
        const words = s.split(' '), cut = Math.ceil(words.length / 2);
        const two = s.length * 0.6 * 10 > bw - 12 && words.length > 1;
        box(root, i * (bw + 12), 6, bw, 50, two ? words.slice(0, cut).join(' ') : s, two ? words.slice(cut).join(' ') : '', true);
        if (i < 3) arrow(root, i * (bw + 12) + bw + 1, 31, (i + 1) * (bw + 12) - 1, 31, true);
      });
    }
    blocks(root, chip, b, r.target);
  }

  function layout(c, wide) {
    const pad = 12, inner = {x: c.x + pad, y: c.y + 30, w: c.w - 2 * pad, h: c.h - 30 - pad - 28};
    const cache = {x: inner.x, y: inner.y + inner.h + 10, w: inner.w, h: 18};
    if (wide) {
      const left = Math.max(150, inner.w * 0.36), gap = 16, half = (inner.h - gap) / 2;
      return {cpu: {x: inner.x, y: inner.y, w: left, h: half}, ane: {x: inner.x, y: inner.y + half + gap, w: left, h: half},
        gpu: {x: inner.x + left + 12, y: inner.y, w: inner.w - left - 12, h: inner.h}, cache, gapY: inner.y + half + gap / 2};
    }
    const top = 104, half = (inner.w - 10) / 2;
    return {cpu: {x: inner.x, y: inner.y, w: half, h: top}, ane: {x: inner.x + half + 10, y: inner.y, w: half, h: top},
      gpu: {x: inner.x, y: inner.y + top + 10, w: inner.w, h: inner.h - top - 10}, cache, gapY: 0};
  }

  function blocks(root, c, b, target) {
    svg(root, 'rect', {x: c.x, y: c.y, width: c.w, height: c.h, rx: 14, style: `fill: ${PANEL}; stroke: ${FAINT}`});
    fitText(root, c.x + 14, c.y + 20, c.w - 28, 'M5 PRO', {weight: 700, fill: ACCENT});
    // CPU: 6 super cores, then 12 performance cores
    region(root, b.cpu, 'CPU', '6 super, 12 performance', target === 'cpu');
    const on = target === 'cpu', s1 = Math.min(16, (b.cpu.w - 20) / 6 - 4), s2 = s1 * 0.72;
    for (let i = 0; i < 18; i++) {
      const big = i < 6, s = big ? s1 : s2, row = big ? 0 : 1 + Math.floor((i - 6) / 6), col = big ? i : (i - 6) % 6;
      svg(root, 'rect', {x: b.cpu.x + 10 + col * (s1 + 4), y: b.cpu.y + 44 + (row ? s1 + 6 + (row - 1) * (s2 + 4) : 0), width: s, height: s, rx: 2,
        style: `fill: ${on ? ACCENT : LIGHT}; opacity: ${on ? 0.85 : 0.6}`});
    }
    // Neural Engine: 16 cores
    region(root, b.ane, 'Neural Engine', '16 cores', target === 'ane');
    const ne = Math.min(14, (b.ane.w - 20) / 8 - 3);
    for (let i = 0; i < 16; i++) {
      svg(root, 'rect', {x: b.ane.x + 10 + (i % 8) * (ne + 3), y: b.ane.y + 44 + Math.floor(i / 8) * (ne + 3), width: ne, height: ne, rx: 2,
        style: `fill: ${target === 'ane' ? ACCENT : LIGHT}; opacity: ${target === 'ane' ? 0.85 : 0.6}`});
    }
    // GPU: 20 cores, each with ALUs and a Neural Accelerator
    const g = b.gpu, gon = target === 'gpu';
    region(root, g, 'GPU', '20 cores, each with a Neural Accelerator', gon);
    const cols = 5, rows = 4, cw = (g.w - 20 - (cols - 1) * 6) / cols, ch = (g.h - 70 - (rows - 1) * 6) / rows;
    for (let i = 0; i < 20; i++) {
      const x = g.x + 10 + (i % cols) * (cw + 6), y = g.y + 44 + Math.floor(i / cols) * (ch + 6);
      svg(root, 'rect', {x, y, width: cw, height: ch, rx: 3, style: `fill: ${BG}; stroke: ${gon ? ACCENT : FAINT}`});
      svg(root, 'rect', {x: x + 3, y: y + 3, width: cw - 6, height: ch * 0.42, rx: 2, style: `fill: ${LIGHT}; opacity: .5`});
      svg(root, 'rect', {x: x + 3, y: y + ch * 0.52, width: cw - 6, height: ch * 0.48 - 3, rx: 2,
        style: `fill: ${ACCENT}; opacity: ${gon ? 0.95 : 0.35}`});
    }
    fitText(root, g.x + 10, g.y + g.h - 9, g.w - 20, 'orange: Neural Accelerator', {size: 10, cls: 'dim'});
    // shared cache, then memory
    svg(root, 'rect', {x: b.cache.x, y: b.cache.y, width: b.cache.w, height: b.cache.h, rx: 3, style: `fill: ${FAINT}`});
    fitText(root, b.cache.x + 8, b.cache.y + 13, b.cache.w - 16, 'shared cache: CPU, GPU and Neural Engine', {size: 10});
    const my = c.y + c.h + 16;
    for (const f of [0.2, 0.5, 0.8]) {
      svg(root, 'line', {x1: c.x + c.w * f, x2: c.x + c.w * f, y1: c.y + c.h, y2: my, style: `stroke: ${LIGHT}`, 'stroke-width': 2});
    }
    svg(root, 'rect', {x: c.x, y: my, width: c.w, height: 30, rx: 6, style: `fill: ${PANEL}; stroke: ${LIGHT}`});
    const half = c.w / 2;
    fitText(root, c.x + 12, my + 19, half - 16, 'unified memory · 48 GB', {weight: 700});
    fitText(root, c.x + c.w - 12, my + 19, half - 16, '307 GB/s to all of it', {anchor: 'end', cls: 'dim'});
  }

  function region(root, b, title, sub, on) {
    svg(root, 'rect', {x: b.x, y: b.y, width: b.w, height: b.h, rx: 8,
      style: `fill: ${on ? TINT : BG}; stroke: ${on ? ACCENT : FAINT}; stroke-width: ${on ? 1.6 : 1}`});
    fitText(root, b.x + 10, b.y + 18, b.w - 20, title, {weight: 700});
    if (sub) fitText(root, b.x + 10, b.y + 33, b.w - 20, sub, {size: 10, min: 8, cls: 'dim'});
  }

  // ---- inside one GPU core --------------------------------------------------------------------------------
  function drawCore(root, w, h) {
    const wide = w >= 620, p = state.phase;
    const core = {x: 0, y: 6, w, h: h - 58};
    svg(root, 'rect', {x: 0, y: core.y, width: w, height: core.h, rx: 14, style: `fill: ${PANEL}; stroke: ${FAINT}`});
    fitText(root, 14, core.y + 20, w - 28, 'ONE GPU CORE (OF 20)', {weight: 700, fill: ACCENT});
    let sg, units, mem;
    const top = core.y + 34;
    if (wide) {
      const colW = (w - 4 * 16) / 3, hh = core.h - 46;
      [sg, units, mem] = [0, 1, 2].map(i => ({x: 16 + i * (colW + 16), y: top, w: colW, h: hh}));
    } else {
      const hh = (core.h - 46 - 24) / 3;
      [sg, units, mem] = [0, 1, 2].map(i => ({x: 12, y: top + i * (hh + 12), w: w - 24, h: hh}));
    }
    // a threadgroup: 4 SIMD groups of 32 threads
    region(root, sg, 'a threadgroup', '4 SIMD groups × 32 threads', false);
    const lane = Math.min(5, (sg.w - 20) / 32 - 1), rowGap = Math.min(20, (sg.h - 74) / 4);
    for (let gi = 0; gi < 4; gi++) {
      for (let t = 0; t < 32; t++) {
        svg(root, 'rect', {x: sg.x + 10 + t * (lane + 1), y: sg.y + 44 + gi * rowGap, width: lane, height: Math.min(10, rowGap - 3), rx: 1,
          style: `fill: ${p === 1 || p === 2 ? ACCENT : LIGHT}; opacity: ${p === 1 || p === 2 ? 0.9 : 0.7}`});
      }
    }
    fitText(root, sg.x + 10, sg.y + sg.h - 10, sg.w - 20, 'each row: 32 threads, one instruction', {size: 10, min: 8, cls: 'dim'});
    // what does the work
    region(root, units, 'what does the work', '', false);
    const uh = (units.h - 40) / 2 - 4;
    unit(root, units.x + 10, units.y + 28, units.w - 20, uh, 'Neural Accelerator', 'matrix multiply-accumulate', p === 2);
    unit(root, units.x + 10, units.y + 34 + uh, units.w - 20, uh, 'ALUs', 'adds, exp, softmax, norms', false);
    // on-chip memory
    region(root, mem, 'on-chip memory', '', false);
    const mh = (mem.h - 40) / 3 - 4;
    unit(root, mem.x + 10, mem.y + 28, mem.w - 20, mh, 'registers', p === 3 ? 'the tile\'s fp32 sums' : 'each thread\'s own', p === 3);
    unit(root, mem.x + 10, mem.y + 32 + mh, mem.w - 20, mh, 'threadgroup memory', 'up to 32 KB, shared', p === 1);
    unit(root, mem.x + 10, mem.y + 36 + 2 * mh, mem.w - 20, mh, 'cache', 'one pool, split as needed', p === 1);
    // beyond the core
    const by = core.y + core.h + 14, labels = ['GPU caches', 'shared cache', 'unified memory'];
    const bw = (w - 2 * 18) / 3;
    labels.forEach((t, i) => {
      const lit = p === 0;
      svg(root, 'rect', {x: i * (bw + 18), y: by, width: bw, height: 30, rx: 5,
        style: `fill: ${lit ? TINT : PANEL}; stroke: ${lit ? ACCENT : FAINT}`});
      fitText(root, i * (bw + 18) + bw / 2, by + 19, bw - 12, t, {size: 10, anchor: 'middle'});
      if (i < 2) arrow(root, (i + 1) * (bw + 18) - 2, by + 15, i * (bw + 18) + bw + 2, by + 15, lit);
    });
  }

  function unit(root, x, y, w, h, title, sub, on) {
    svg(root, 'rect', {x, y, width: w, height: h, rx: 5, style: `fill: ${on ? ACCENT : BG}; stroke: ${on ? ACCENT : FAINT}`});
    const ty = y + Math.min(h / 2 + 4, 18);
    fitText(root, x + 10, ty, w - 20, title, {weight: 700, fill: on ? BG : ''});
    if (h > 34) fitText(root, x + 10, ty + 15, w - 20, sub, {size: 10, min: 8, cls: on ? '' : 'dim', fill: on ? BG : ''});
  }

  // ---- shared drawing -------------------------------------------------------------------------------------
  function box(root, x, y, w, h, label, sub, on) {
    svg(root, 'rect', {x, y, width: w, height: h, rx: 6, style: `fill: ${on ? TINT : BG}; stroke: ${on ? ACCENT : FAINT}`});
    const cy = sub ? y + h / 2 - 3 : y + h / 2 + 4;
    fitText(root, x + w / 2, cy, w - 12, label, {size: 11, min: 8.5, anchor: 'middle', weight: on ? 700 : 400, cls: on ? '' : 'dim'});
    if (sub) fitText(root, x + w / 2, cy + 15, w - 12, sub, {size: 10, min: 8, anchor: 'middle', cls: 'dim'});
  }

  function arrow(root, x1, y1, x2, y2, on) {
    svg(root, 'line', {x1, y1, x2, y2, style: `stroke: ${on ? ACCENT : LIGHT}`, 'stroke-width': on ? 1.8 : 1.2});
    const a = Math.atan2(y2 - y1, x2 - x1), s = 5;
    svg(root, 'path', {d: `M${x2},${y2} L${x2 - s * Math.cos(a - 0.5)},${y2 - s * Math.sin(a - 0.5)} L${x2 - s * Math.cos(a + 0.5)},${y2 - s * Math.sin(a + 0.5)} Z`,
      style: `fill: ${on ? ACCENT : LIGHT}`});
  }

  function connector(root, d, on) {
    svg(root, 'path', {d, fill: 'none', style: `stroke: ${on ? ACCENT : FAINT}`, 'stroke-width': on ? 2 : 1.2, 'stroke-dasharray': on ? '' : '3 3'});
  }

  let timer = 0;
  function play() {
    clearTimeout(timer);
    if (reducedMotion.matches) { state.phase = 3; update(); return; }
    const step = i => { state.phase = i; update(); if (i < 3) timer = setTimeout(() => step(i + 1), 1700); };
    step(0);
  }

  function update() {
    fig.redraw();
    if (state.view === 'chip') readout.innerHTML = ROUTES[state.route].text;
    else readout.innerHTML = state.phase < 0
      ? 'A kernel runs as a grid of threadgroups. Each threadgroup lives on one core: up to 1,024 threads in SIMD groups of 32 that run '
        + 'one instruction together, sharing up to 32 KB of threadgroup memory. Press play to follow one step of a matrix multiply.'
      : `<b>${state.phase + 1} / 4.</b> ${PHASES[state.phase]}`;
  }
  update();
}
