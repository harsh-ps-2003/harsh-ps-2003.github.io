// One pass for a state and its questions: which query-key pairs attention computes, with one masked call or split.
import {html, svg, fmt, controls, choice, slider, canvas} from './lab-core.mjs';

export async function mount(section) {
  const state = {s: 2000, q: 5, n: 60, split: false};
  const bar = controls(section);
  choice(bar, '', [[false, 'one masked call'], [true, 'causal call + masked questions']], state.split,
    v => { state.split = v; update(); });
  const bar2 = controls(section);
  slider(bar2, 'state', 40, 19, i => `${fmt((i + 1) * 100)} tokens`, i => { state.s = (i + 1) * 100; update(); });
  const bar3 = controls(section);
  slider(bar3, 'questions', 8, 4, i => String(i + 1), i => { state.q = i + 1; update(); });
  slider(bar3, 'each', 11, 4, i => `${20 + i * 10} tokens`, i => { state.n = 20 + i * 10; update(); });

  const fig = canvas(section, w => Math.min(w, 340) + 30, draw,
    'Attention grid: queries down, keys across; the pairs attention computes, and the ones that count.');
  const readout = html(section, 'p', 'lab-readout');
  const key = html(section, 'div', 'lab-key');
  key.innerHTML = '<span><i style="background: var(--l-accent)"></i>pairs that count</span>'
    + '<span><i style="background: var(--l-faint)"></i>computed, then masked to zero</span>';

  function draw(root, w) {
    const side = Math.min(w, 340), ox = (w - side) / 2, oy = 6;
    const {s, q, n, split} = state, L = s + q * n, k = side / L;
    const X = v => ox + v * k, Y = v => oy + v * k;
    svg(root, 'rect', {x: ox, y: oy, width: side, height: side, style: 'fill: none; stroke: var(--l-faint)'});
    // computed and wasted: everything with one call; with the split, the question rows only
    if (!split) svg(root, 'rect', {x: X(0), y: Y(0), width: side, height: side, style: 'fill: var(--l-faint)'});
    else svg(root, 'rect', {x: X(0), y: Y(s), width: side, height: q * n * k, style: 'fill: var(--l-faint)'});
    // the state attends causally
    svg(root, 'polygon', {points: `${X(0)},${Y(0)} ${X(1)},${Y(0)} ${X(s)},${Y(s)} ${X(0)},${Y(s)}`, style: 'fill: var(--l-accent)'});
    for (let i = 0; i < q; i++) {
      const r = s + i * n;
      svg(root, 'rect', {x: X(0), y: Y(r), width: s * k, height: n * k, style: 'fill: var(--l-accent)'});
      svg(root, 'polygon', {points: `${X(r)},${Y(r)} ${X(r + 1)},${Y(r)} ${X(r + n)},${Y(r + n)} ${X(r)},${Y(r + n)}`,
        style: 'fill: var(--l-accent)'});
    }
    svg(root, 'line', {x1: X(s), x2: X(s), y1: Y(0), y2: Y(L), style: 'stroke: var(--l-bg)', 'stroke-width': 1});
    svg(root, 'line', {x1: X(0), x2: X(L), y1: Y(s), y2: Y(s), style: 'stroke: var(--l-bg)', 'stroke-width': 1});
    svg(root, 'text', {x: ox, y: oy + side + 16, class: 'dim small'}, 'keys →');
    svg(root, 'text', {x: ox + side, y: oy + side + 16, 'text-anchor': 'end', class: 'dim small'},
      `state ${fmt(s)} · ${q} question${q > 1 ? 's' : ''} of ${n}`);
  }

  function update() {
    fig.redraw();
    const {s, q, n} = state, L = s + q * n;
    const useful = s * (s + 1) / 2 + q * (n * s + n * (n + 1) / 2);
    const one = L * L, split = s * (s + 1) / 2 + q * n * L;
    const m = v => `${fmt(v / 1e6, 2)} million`;
    readout.innerHTML = `${fmt(L)} tokens in one pass. Pairs that count: <b>${m(useful)}</b> per head. `
      + `One masked call computes <b>${m(one)}</b> (${fmt((1 - useful / one) * 100)}% thrown away); `
      + `split, <b>${m(split)}</b> (${fmt((1 - useful / split) * 100)}%). Either way the answers are the same bits: `
      + `the skipped pairs only ever contributed zeros.`;
  }
  update();
}
