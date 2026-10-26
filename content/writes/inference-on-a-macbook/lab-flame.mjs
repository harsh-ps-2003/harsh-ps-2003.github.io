// Flame graphs of two measured requests: click a frame to zoom into it, hover or tap for its numbers.
import {html, svg, fmt, controls, choice, canvas} from './lab-core.mjs';

const MODELS = [['clef', 'Clef-Flash 9B (8-bit)'], ['laya', 'Laya multilingual']];
const ROW = 22;
const kind = label => /\d+x\d+/.test(label) ? 'matmul' : label === 'attention' ? 'attn' : 'other';

export async function mount(section, {data}) {
  const flame = (await data).flame;
  const state = {model: 'clef', zoom: null};
  const bar = controls(section);
  choice(bar, 'request', MODELS, state.model, v => { state.model = v; state.zoom = null; fig.redraw(); summary(); });
  const reset = html(bar, 'button', 'lab-btn', 'reset zoom');
  reset.type = 'button';
  reset.addEventListener('click', () => { state.zoom = null; fig.redraw(); });

  const frames = () => flame[state.model].map(([depth, x, w, label, ms, pct]) => ({depth, x, w, label, ms, pct}));
  const depthOf = () => Math.max(...frames().map(f => f.depth)) + 1;
  const fig = canvas(section, () => depthOf() * ROW + 8, draw,
    'Flame graph of one request: each frame is as wide as its share of the time; matrix multiplies in orange.');
  const readout = html(section, 'p', 'lab-readout');
  const key = html(section, 'div', 'lab-key');
  key.innerHTML = '<span><i class="k-matmul" style="background: var(--l-accent)"></i>matrix multiply</span>'
    + '<span><i style="background: var(--l-ink)"></i>attention itself</span>'
    + '<span><i style="background: var(--l-light)"></i>everything else</span>';
  html(section, 'p', 'lab-note', 'neki profile on the M5 Pro: the request runs one operation at a time and waits for the GPU after each, '
    + 'subtracting that wait. 1,000-word state, one question.');

  function draw(root, w) {
    const all = frames(), depth = depthOf();
    const z = state.zoom ?? {x: 0, w: 700, depth: -1};
    const sx = v => (v - z.x) / z.w * w;
    for (const f of all) {
      const inside = f.x + f.w > z.x + 1e-6 && f.x < z.x + z.w - 1e-6;
      if (!inside) continue;
      const ancestor = f.depth < z.depth;
      const x0 = ancestor ? 0 : Math.max(0, sx(f.x)), x1 = ancestor ? w : Math.min(w, sx(f.x + f.w));
      if (x1 - x0 < 0.5) continue;
      const leaf = !all.some(g => g.depth === f.depth + 1 && g.x >= f.x - 1e-6 && g.x < f.x + f.w - 1e-6);
      const k = leaf ? kind(f.label) : 'frame';
      const g = svg(root, 'g', {class: 'flame-frame', tabindex: 0, role: 'button',
        'aria-label': `${f.label}: ${fmt(f.ms, 2)} ms, ${fmt(f.pct, 1)}% of the request`});
      const y = (depth - 1 - f.depth) * ROW + 4;
      svg(g, 'rect', {x: x0, y, width: Math.max(1, x1 - x0 - 1), height: ROW - 2, rx: 2, class: `fill-${k}`});
      const room = Math.floor((x1 - x0 - 8) / 6.4);
      if (room >= 3) {
        const text = `${f.label} ${fmt(f.ms, f.ms < 10 ? 2 : 1)} ms`;
        svg(g, 'text', {x: x0 + 4, y: y + 14.5, class: k === 'attn' ? 'text-on-ink' : ''},
          text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text);
      }
      const show = () => { readout.innerHTML = describe(f); };
      g.addEventListener('mouseenter', show);
      g.addEventListener('focus', show);
      g.addEventListener('click', () => { state.zoom = f.depth === 0 ? null : f; fig.redraw(); show(); });
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new Event('click')); } });
    }
  }

  function describe(f) {
    const total = frames()[0].ms;
    return `<b>${f.label}</b>: ${fmt(f.ms, 2)} ms, ${fmt(f.pct, 1)}% of the ${fmt(total, 1)} ms request.`;
  }

  function summary() {
    const all = frames();
    const share = test => all.filter(f => test(f.label)).reduce((s, f) => s + f.pct, 0);
    const mm = share(l => kind(l) === 'matmul'), at = share(l => l === 'attention'), norm = share(l => l === 'add + norm');
    readout.innerHTML = `Matrix multiplies are <b>${fmt(mm, 1)}%</b> of this request, attention itself <b>${fmt(at, 1)}%</b>, `
      + `the add-and-norm between blocks ${fmt(norm, 1)}%. Click a frame to zoom in.`;
  }
  fig.redraw();
  summary();
}
