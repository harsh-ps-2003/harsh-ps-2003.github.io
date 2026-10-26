// The legacy builder runs a multi-stage Dockerfile one step at a time, BuildKit
// runs every node whose inputs are ready. Plus the dedupe trick, 3 builds that
// need the same install get it computed once.
import {el, sv, story, onceVisible, pauseOffscreen, segmented, playButton, canvas, ease} from './viz-core.mjs';

// durations are relative units, only used for lengths
const NODES = [
  {id: 'base', label: 'base', short: 'base', d: 2, col: 0, row: 1, deps: []},
  {id: 'fedeps', label: 'frontend deps', short: 'fe deps', d: 4, col: 1, row: 0, deps: ['base']},
  {id: 'febuild', label: 'frontend build', short: 'fe build', d: 3, col: 2, row: 0, deps: ['fedeps']},
  {id: 'be', label: 'backend build', short: 'backend', d: 5, col: 1.5, row: 2, deps: ['base']},
  {id: 'final', label: 'final image', short: 'final', d: 1, col: 3, row: 1, deps: ['febuild', 'be']},
];
function schedule(mode) {
  const at = {};
  if (mode === 'legacy') {
    let t = 0;
    for (const n of NODES) { at[n.id] = [t, t + n.d]; t += n.d; }
  } else {
    for (const n of NODES) {
      const start = Math.max(0, ...n.deps.map(d => at[d][1]));
      at[n.id] = [start, start + n.d];
    }
  }
  return at;
}
const PLAN = {legacy: schedule('legacy'), buildkit: schedule('buildkit')};
const TOTAL = {legacy: 15, buildkit: 10};
// dedupe, 3 services need the same install, the first computes it and the others reuse it
const SERVICES = [
  {name: 'api', install: [0, 4], wait: null, build: [4, 6]},
  {name: 'worker', install: null, wait: [0, 4], build: [4, 7]},
  {name: 'web', install: null, wait: [0, 4], build: [4, 6.5]},
];
const DEDUPE_TOTAL = 7;

const CAPTIONS = {
  legacy: 'The legacy builder walks the Dockerfile one step at a time, <b>even when two steps have nothing to do with each other</b>.',
  buildkit: 'BuildKit reads the Dockerfile as a graph and <b>runs every step whose inputs are ready</b>, so the backend compiles while the frontend installs.',
  dedupe: 'Three builds want the exact same install. <b>BuildKit runs it once</b>, the other two wait and reuse the layer.',
};

export function mount(figure) {
  let mode = 'legacy', t = 0, ran = {legacy: false, buildkit: false};
  const s = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'buildkit'}),
    el('p', {class: 'sd-title', text: 'A Dockerfile is a graph, not a list'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, [['legacy', 'legacy builder'], ['buildkit', 'BuildKit'], ['dedupe', '3 builds at once']], mode,
    v => { s.stop(); s.run(go => play(v, go)); }, 'Builder');

  const holder = el('div', {class: 'bk-holder'});
  figure.append(holder);
  const c = canvas(holder, draw);
  c.svg.setAttribute('aria-label', 'A multi-stage build drawn as a graph with a timeline under it');
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'step lengths are illustrative'}));
  figure.append(caption, foot);
  const playBtn = playButton(foot, s, () => tour());

  const state = (span) => !span ? 'idle' : t >= span[1] ? 'done' : t >= span[0] ? 'run' : 'idle';

  function draw(svg, W) {
    svg.replaceChildren();
    const narrow = W < 480;
    return mode === 'dedupe' ? drawDedupe(svg, W, narrow) : drawGraph(svg, W, narrow);
  }

  function drawGraph(svg, W, narrow) {
    const plan = PLAN[mode];
    const pad = 4, colW = (W - pad * 2) / 4, bw = Math.min(150, colW - (narrow ? 8 : 18)), bh = 32, rowH = narrow ? 40 : 44;
    const pos = n => ({x: pad + n.col * colW + (colW - bw) / 2, y: 6 + n.row * rowH});
    const edges = sv('g', {class: 'bk-edges'});
    svg.append(edges);
    for (const n of NODES) for (const d of n.deps) {
      const a = pos(NODES.find(x => x.id === d)), b = pos(n);
      const x1 = a.x + bw, y1 = a.y + bh / 2, x2 = b.x, y2 = b.y + bh / 2, mx = (x1 + x2) / 2;
      edges.append(sv('path', {d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 3} ${y2}`, class: `bk-edge${state(plan[d]) === 'done' ? ' is-hot' : ''}`}));
    }
    for (const n of NODES) {
      const p = pos(n), st = state(plan[n.id]);
      svg.append(sv('g', {class: `bk-node is-${st}`, transform: `translate(${p.x} ${p.y})`},
        sv('rect', {width: bw, height: bh, rx: 6}),
        sv('text', {x: bw / 2, y: bh / 2 + 4, 'text-anchor': 'middle'}, narrow ? n.short : n.label)));
    }
    // timeline, one row per node, scaled to the legacy total so both modes compare
    const top = 6 + 3 * rowH + 10, labelW = narrow ? 64 : 112, x0 = labelW, x1 = W - 8, rh = 15;
    const sx = v => x0 + (x1 - x0) * v / TOTAL.legacy;
    svg.append(sv('line', {x1: x0, x2: x0, y1: top - 4, y2: top + NODES.length * rh + 2, class: 'bk-axis'}));
    NODES.forEach((n, i) => {
      const [a, b] = plan[n.id], y = top + i * rh;
      svg.append(sv('text', {x: labelW - 8, y: y + 10, 'text-anchor': 'end', class: 'bk-tl-label'}, narrow ? n.short : n.label));
      svg.append(sv('rect', {x: sx(a), y: y + 2, width: sx(b) - sx(a), height: rh - 5, rx: 2, class: 'bk-ghost'}));
      if (t > a) svg.append(sv('rect', {x: sx(a), y: y + 2, width: sx(Math.min(t, b)) - sx(a), height: rh - 5, rx: 2, class: `bk-bar is-${state(plan[n.id])}`}));
    });
    // totals, both modes as thin bars so the difference shows without a number
    const ty = top + NODES.length * rh + 12;
    [['legacy', 'legacy'], ['buildkit', 'BuildKit']].forEach(([m, name], i) => {
      const y = ty + i * 16, cur = m === mode;
      svg.append(sv('text', {x: labelW - 8, y: y + 10, 'text-anchor': 'end', class: `bk-total-label${cur ? ' is-current' : ''}`}, name));
      svg.append(sv('rect', {x: x0, y: y + 3, width: sx(TOTAL[m]) - x0, height: 8, rx: 4, class: 'bk-total-ghost'}));
      const fillTo = cur ? Math.min(t, TOTAL[m]) : ran[m] ? TOTAL[m] : 0;
      if (fillTo > 0) svg.append(sv('rect', {x: x0, y: y + 3, width: sx(fillTo) - x0, height: 8, rx: 4, class: `bk-total${cur ? ' is-current' : ''}`}));
    });
    if (t > 0 && t < TOTAL[mode]) svg.append(sv('line', {x1: sx(t), x2: sx(t), y1: top - 6, y2: ty + 30, class: 'bk-cursor'}));
    return ty + 36;
  }

  function drawDedupe(svg, W, narrow) {
    const labelW = narrow ? 58 : 90, x0 = labelW, x1 = W - 8, rh = 44;
    const sx = v => x0 + (x1 - x0) * v / DEDUPE_TOTAL;
    SERVICES.forEach((sv_, i) => {
      const y = 8 + i * rh;
      svg.append(sv('text', {x: labelW - 10, y: y + 17, 'text-anchor': 'end', class: 'bk-tl-label is-big'}, sv_.name));
      if (sv_.install) {
        const [a, b] = sv_.install, st = state(sv_.install);
        svg.append(sv('rect', {x: sx(a), y, width: sx(b) - sx(a), height: 24, rx: 5, class: 'bk-ghost'}));
        if (t > a) svg.append(sv('rect', {x: sx(a), y, width: sx(Math.min(t, b)) - sx(a), height: 24, rx: 5, class: `bk-bar is-${st}`}));
        svg.append(sv('text', {x: sx(a) + 8, y: y + 16, class: 'bk-in'}, 'pnpm install'));
      } else {
        const [a, b] = sv_.wait;
        svg.append(sv('line', {x1: sx(a) + 2, x2: sx(Math.min(Math.max(t, a), b)), y1: y + 12, y2: y + 12, class: 'bk-wait'}));
        svg.append(sv('text', {x: sx(a) + 8, y: y + 8, class: 'bk-in is-muted'}, t >= b ? 'reused the same layer' : 'waits for the same install'));
        // dashed link to the install that is actually running
        if (t > 0) svg.append(sv('path', {d: `M${sx(2)} ${8 + 24} L${sx(2)} ${y + 6}`, class: 'bk-link'}));
      }
      const [a, b] = sv_.build;
      svg.append(sv('rect', {x: sx(a), y, width: sx(b) - sx(a), height: 24, rx: 5, class: 'bk-ghost'}));
      if (t > a) svg.append(sv('rect', {x: sx(a), y, width: sx(Math.min(t, b)) - sx(a), height: 24, rx: 5, class: `bk-bar is-${state(sv_.build)}`}));
      svg.append(sv('text', {x: sx(a) + 6, y: y + 16, class: 'bk-in'}, 'build'));
    });
    return 8 + SERVICES.length * rh;
  }

  async function play(m, go) {
    mode = m; seg.set(m); t = 0; caption.innerHTML = CAPTIONS[m]; c.redraw();
    const total = m === 'dedupe' ? DEDUPE_TOTAL : TOTAL[m];
    await go.wait(250);
    await go.tween(total * 300, k => { t = k * total; c.redraw(); }, ease.linear);
    if (m !== 'dedupe') ran[m] = true;
    c.redraw();
  }

  async function tour() {
    await s.run(async go => {
      await play('legacy', go); await go.wait(1800);
      await play('buildkit', go); await go.wait(2600);
      await play('dedupe', go);
    });
  }

  pauseOffscreen(figure, s);
  caption.innerHTML = CAPTIONS.legacy;
  onceVisible(figure, () => { playBtn.markPlayed(); tour(); });
}
