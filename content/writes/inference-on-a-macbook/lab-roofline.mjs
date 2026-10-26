// The roofline and each model's floor: pick a chip, a model and a prompt length.
import {html, svg, fmt, pctMore, controls, choice, slider, button, canvas, logScale} from './lab-core.mjs';

// Peak matmul TFLOPS and bandwidth (GB/s). Only the M5 Pro's peak is measured; the others are estimates.
const CHIPS = {
  m3: {name: 'M3 Pro', peak: 7, bw: 150, measured: false},
  m4: {name: 'M4 Pro', peak: 9, bw: 273, measured: false},
  m5: {name: 'M5 Pro', peak: 33, bw: 307, measured: true},
};
const STEPS = 220, LO = 8, HI = 16384;
const tokensAt = i => Math.round(LO * (HI / LO) ** (i / (STEPS - 1)));
const indexOf = t => Math.round(Math.log(t / LO) / Math.log(HI / LO) * (STEPS - 1));

export async function mount(section, {data}) {
  // [name, GFLOPs per token, tokens of its 1,000-word request, measured ms on the M5 Pro]
  const models = (await data).floor.map(([name, gflops, tokens, ms]) =>
    ({name, gflops, tokens, ms, floorMs: gflops * tokens / 33}));
  const state = {chip: 'm5', model: 0, tokens: models[0].tokens};

  const bar = controls(section);
  choice(bar, 'chip', Object.entries(CHIPS).map(([k, c]) => [k, c.name]), state.chip, v => { state.chip = v; update(); });
  const modelBar = controls(section);
  choice(modelBar, 'model', models.map((m, i) => [i, m.name]), state.model, v => {
    state.model = v; state.tokens = models[v].tokens; exact(); update();
  });
  const bar2 = controls(section);
  const tokens = slider(bar2, 'prompt', STEPS, indexOf(state.tokens), i => `${fmt(tokensAt(i))} tokens`,
    i => { state.tokens = tokensAt(i); update(); });
  const exact = () => { tokens.set(indexOf(state.tokens)); tokens.text(`${fmt(state.tokens)} tokens`); };
  exact();
  button(bar2, 'its measured 1,000-word request', () => { state.tokens = models[state.model].tokens; exact(); update(); });

  const fig = canvas(section, w => Math.min(300, Math.max(220, w * 0.5)), draw,
    'Roofline: attainable TFLOPS against FLOPs per byte for three Apple chips, with the selected prompt marked.');
  const readout = html(section, 'p', 'lab-readout');
  html(section, 'p', 'lab-note', 'Full-precision (16-bit) weights. A matmul over M tokens does about M FLOPs per byte of weights it reads. '
    + 'M3 Pro and M4 Pro peaks are estimates from cores and clocks; only the M5 Pro is measured here.');

  function draw(root, w, h) {
    const left = 46, right = w - 12, top = 22, bottom = h - 34;
    const x = logScale(1, HI, left, right), y = logScale(0.1, 50, bottom, top);
    for (const v of [1, 10, 100, 1000, 10000]) {
      svg(root, 'line', {x1: x(v), x2: x(v), y1: top, y2: bottom, class: 'grid'});
      svg(root, 'text', {x: x(v), y: bottom + 14, 'text-anchor': 'middle', class: 'dim small'}, fmt(v));
    }
    for (const v of [0.1, 1, 10]) {
      svg(root, 'line', {x1: left, x2: right, y1: y(v), y2: y(v), class: 'grid'});
      svg(root, 'text', {x: left - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'dim small'}, String(v));
    }
    svg(root, 'text', {x: (left + right) / 2, y: h - 4, 'text-anchor': 'middle', class: 'dim small'},
      'FLOPs per byte of weights read  (≈ prompt tokens), log');
    svg(root, 'text', {x: 4, y: 11, class: 'dim small'}, 'TFLOPS, log');
    for (const [key, c] of Object.entries(CHIPS)) {
      const ridge = c.peak / (c.bw / 1000);
      const pts = [[1, c.bw / 1000], [ridge, c.peak], [HI, c.peak]].map(([a, b]) => `${x(a)},${y(b)}`).join(' ');
      const on = key === state.chip;
      svg(root, 'polyline', {points: pts, fill: 'none', style: `stroke: ${on ? 'var(--l-accent)' : 'var(--l-light)'}`,
        'stroke-width': on ? 2.5 : 1.2, 'stroke-dasharray': c.measured ? '' : '5 3'});
      svg(root, 'text', {x: right, y: y(c.peak) + (key === 'm3' ? 13 : -5), 'text-anchor': 'end', class: on ? '' : 'dim small'},
        `${c.name} ${c.peak} TFLOPS${c.measured ? '' : ' (est.)'}`);
    }
    const c = CHIPS[state.chip], ai = state.tokens, at = Math.min(c.peak, c.bw / 1000 * ai);
    svg(root, 'line', {x1: x(ai), x2: x(ai), y1: y(at), y2: bottom, style: 'stroke: var(--l-accent)', 'stroke-dasharray': '2 3'});
    svg(root, 'circle', {cx: x(ai), cy: y(at), r: 5.5, style: 'fill: var(--l-accent)'});
  }

  function update() {
    fig.redraw();
    const c = CHIPS[state.chip], m = models[state.model], t = state.tokens;
    const tflops = m.gflops * t / 1000, gb = m.gflops; // 2 FLOPs per weight per token; 2 bytes per weight
    const compute = tflops / c.peak * 1000, memory = gb / c.bw * 1000, floor = Math.max(compute, memory);
    const bound = compute >= memory ? 'arithmetic' : 'reading the weights';
    let text = `<b>${m.name}</b>, ${fmt(t)} tokens: ${fmt(tflops, 1)} TFLOPs of matmuls and ${fmt(gb, 1)} GB of weights. `
      + `On the ${c.name} the arithmetic takes at least ${fmtMs(compute)} and reading the weights once at least ${fmtMs(memory)}, `
      + `so the floor is <b>${fmtMs(floor)}</b>, set by ${bound}.`;
    if (state.chip === 'm5') {
      const r = m.ms / m.floorMs;
      text += ` Its measured 1,000-word request (${fmt(m.tokens)} tokens) took <b>${fmtMs(m.ms)}</b>, `
        + `${pctMore(r, 1)} above its floor of ${fmtMs(m.floorMs)}.`;
    } else {
      text += ' No M3 or M4 has been measured yet: this is the arithmetic only.';
    }
    readout.innerHTML = text;
  }
  update();
}

const fmtMs = ms => ms >= 1000 ? `${fmt(ms / 1000, 2)} s` : ms >= 10 ? `${fmt(ms)} ms` : `${fmt(ms, 1)} ms`;
