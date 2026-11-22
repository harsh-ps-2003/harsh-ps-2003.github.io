// Where does the random surfer end up? PageRank as probability flowing round a tiny web,
// p(t+1) = αTp(t) + (1 − α)v, played once until it settles.
import {transition, rankStep, pagerankStationary} from './math.mjs';
import {C, html, svg, setAttrs, setText, setHTML, button, stage, arrowMarker, slider, transport, pct, sym, clamp} from './lab-core.mjs';

// A links to B and C, B links to C, C links back to A, D links to C
const LINKS = [[1, 2], [2], [0], [2]];
const ALPHAS = [0, .85, 1];
const NAMES = 'ABCD', N = 4, STEPS = 30;
const W = 360, H = 300, POS = [[70, 82], [232, 82], [232, 228], [70, 228]], HUB = [322, 155];
const bez = (a, m, b, s) => [(1 - s) ** 2 * a[0] + 2 * s * (1 - s) * m[0] + s * s * b[0],
  (1 - s) ** 2 * a[1] + 2 * s * (1 - s) * m[1] + s * s * b[1]];
const l1 = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
// colours and sizes on text go in style, so they always win over the stage defaults
const ts = (fill, size, weight) => `fill:${fill};${size ? `font-size:${size}px;` : ''}${weight ? `font-weight:${weight};` : ''}`;

export function mount(section) {
  const stepper = slider(section, {label: 'Step', min: 0, max: STEPS, value: 0});
  stepper.wrap.hidden = true; stepper.wrap.style.display = "none";
  const playHolder = html(section, 'div');

  // ---- the graph and the bars ----
  const main = html(section, 'div', 'lab-grid-2 pr-main');
  const plot = stage(main, W, H, 'Four web pages with their links, and probability flowing along them');
  const side = html(main, 'div', 'pr-side');
  const bars = [...NAMES].map(name => {
    const r = html(side, 'div', 'pr-bar-row');
    html(r, 'span', 'pr-bar-name', name);
    const track = html(r, 'div', 'pr-track');
    const fill = html(track, 'div', 'pr-fill');
    const tick = html(track, 'div', 'pr-tick');
    const value = html(r, 'span', 'pr-bar-value', '');
    return {fill, tick, value};
  });
  const caption = html(side, 'p', 'pr-caption');
  caption.setAttribute('aria-live', 'polite');

  // ---- graph stage drawing ----
  const defs = svg(plot, 'defs');
  const grad = svg(defs, 'radialGradient', {id: 'pr-glow'});
  svg(grad, 'stop', {offset: 0, 'stop-color': C.x, 'stop-opacity': .55});
  svg(grad, 'stop', {offset: 1, 'stop-color': C.x, 'stop-opacity': 0});
  const arrowHead = arrowMarker(plot, 'pr-arrow', C.dim);
  const hubLayer = svg(plot, 'g'), linkLayer = svg(plot, 'g'), glowLayer = svg(plot, 'g'),
    packetLayer = svg(plot, 'g'), nodeLayer = svg(plot, 'g');
  const hub = svg(hubLayer, 'circle', {cx: HUB[0], cy: HUB[1], r: 14, fill: 'none', stroke: C.purple, 'stroke-dasharray': '3 3'});
  const hubLabel = svg(hubLayer, 'text', {x: HUB[0], y: HUB[1] + 32, 'text-anchor': 'middle', style: ts(C.purple, 11)}, 'jump');
  const nodes = POS.map(([cx, cy], i) => {
    const away = Math.hypot(HUB[0] - cx, HUB[1] - cy), d = [(HUB[0] - cx) / away, (HUB[1] - cy) / away];
    const a = [cx + d[0] * 24, cy + d[1] * 24], b = [HUB[0] - d[0] * 16, HUB[1] - d[1] * 16];
    const hubLine = svg(hubLayer, 'line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.purple, 'stroke-dasharray': '2 4'});
    const glow = svg(glowLayer, 'circle', {cx, cy, fill: 'url(#pr-glow)'});
    const core = svg(nodeLayer, 'circle', {cx, cy, r: 20, fill: C.bg, stroke: C.x});
    svg(nodeLayer, 'text', {x: cx, y: cy + 5, 'text-anchor': 'middle', style: ts(C.ink, 15, 700)}, NAMES[i]);
    const label = svg(nodeLayer, 'text', {x: cx, y: i < 2 ? cy - 31 : cy + 41, 'text-anchor': 'middle', style: ts(C.ink, 12)});
    const jumpIn = svg(packetLayer, 'circle', {fill: C.purple, opacity: 0});
    const jumpOut = svg(packetLayer, 'circle', {fill: C.purple, opacity: 0});
    return {glow, core, label, hubLine, jumpIn, jumpOut, a, b};
  });
  const startTag = svg(nodeLayer, 'text', {x: POS[0][0] - 30, y: POS[0][1] + 5, 'text-anchor': 'end', style: ts(C.x, 11)}, 'start');

  const T = transition(LINKS);
  const flows = [];
  LINKS.forEach((dests, from) => dests.forEach(to => {
    const a = POS[from], b = POS[to], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const start = [a[0] + d[0] * 25, a[1] + d[1] * 25], end = [b[0] - d[0] * 29, b[1] - d[1] * 29];
    const bow = LINKS[to].includes(from) ? 30 : 18;
    const mid = [(a[0] + b[0]) / 2 - d[1] * bow, (a[1] + b[1]) / 2 + d[0] * bow];
    const path = svg(linkLayer, 'path', {d: `M${start} Q${mid} ${end}`, fill: 'none', stroke: C.dim, 'marker-end': arrowHead});
    const dots = [0, 1, 2].map(() => svg(packetLayer, 'circle', {fill: C.x, opacity: 0}));
    flows.push({from, to, start, mid, end, path, dots});
  }));

  // ---- state ----
  let alpha = .85, history, changes, pstar;
  function recompute() {
    history = [[1, 0, 0, 0]];
    for (let i = 0; i <= STEPS; i++) history.push(rankStep(history[i], T, alpha));
    changes = history.map((p, i) => i === 0 ? 0 : l1(p, history[i - 1]));
    pstar = pagerankStationary(T, alpha).p;
    bars.forEach((b, i) => { b.tick.style.left = pct(pstar[i], 2); });
  }

  function draw(p, k, f) {
    const prev = history[k], jump = 1 - alpha;
    const moving = f > 1e-3 && f < 1 - 1e-3;
    nodes.forEach((n, i) => {
      setAttrs(n.glow, {r: 22 + 52 * Math.sqrt(p[i])});
      setAttrs(n.core, {'stroke-width': 1.5 + 8 * p[i]});
      setText(n.label, pct(p[i], 1));
      n.hubLine.setAttribute('stroke-opacity', jump > 1e-6 ? .4 : .08);
      const inMass = jump * prev[i], outMass = jump / N;
      if (moving && jump > 1e-6) {
        const first = f < .5, s = first ? f / .5 : (f - .5) / .5;
        const from = first ? n.a : n.b, to = first ? n.b : n.a, m = first ? inMass : outMass;
        setAttrs(first ? n.jumpIn : n.jumpOut, {cx: from[0] + (to[0] - from[0]) * s, cy: from[1] + (to[1] - from[1]) * s,
          r: 1.8 + 9 * Math.sqrt(m), opacity: m > 1e-6 ? .85 : 0});
        (first ? n.jumpOut : n.jumpIn).setAttribute('opacity', 0);
      } else { n.jumpIn.setAttribute('opacity', 0); n.jumpOut.setAttribute('opacity', 0); }
    });
    hub.setAttribute('opacity', jump > 1e-6 ? 1 : .25);
    hubLabel.setAttribute('opacity', jump > 1e-6 ? 1 : .4);
    startTag.setAttribute('opacity', k === 0 && f < 1e-3 ? 1 : 0);
    flows.forEach(fl => {
      const m = alpha * T[fl.to][fl.from] * prev[fl.from];
      setAttrs(fl.path, {'stroke-width': .8 + 10 * m, 'stroke-opacity': .22 + .6 * clamp(Math.sqrt(m) * 1.4, 0, 1)});
      fl.dots.forEach((dot, j) => {
        const s = f * 1.24 - j * .12;
        if (!moving || m < 1e-6 || s <= 0 || s >= 1) { dot.setAttribute('opacity', 0); return; }
        const [cx, cy] = bez(fl.start, fl.mid, fl.end, s);
        setAttrs(dot, {cx, cy, r: (2.4 + 9 * Math.sqrt(m)) * (1 - j * .25), opacity: .95 - j * .28});
      });
    });
    bars.forEach((b, i) => { b.fill.style.width = pct(p[i], 2); setText(b.value, pct(p[i], 1)); });
  }

  function render(q) {
    const k = Math.min(STEPS, Math.floor(q)), f = q - k, next = history[Math.min(k + 1, history.length - 1)];
    const p = history[k].map((x, i) => (1 - f) * x + f * next[i]);
    draw(p, k, f);
    const start = k === 0 && f < 1e-3, settled = !start && changes[Math.min(STEPS, k + 1)] < 1e-4;
    const top = Math.max(...pstar), leaders = [...NAMES].filter((_, i) => pstar[i] > top - 1e-3);
    const most = leaders.length > 1 ? `${leaders.join(' and ')} tie for the most` : `${leaders[0]} gets the most`;
    setHTML(caption, start ? 'Step 0, every surfer starts on A.'
      : alpha === 0 ? `Step ${k}, nobody follows links, so one step spreads everyone evenly.`
      : settled ? `Step ${k}, settled, ${most}${alpha === 1 ? ' and D, with no links in, gets nothing' : ''}.`
      : `Step ${k}, ${sym('x', 'links')} carry ${pct(alpha, 0)} of each share, ${sym('purple', 'jumps')} the rest. The thin marks are where it settles.`);
  }

  recompute();
  const controls = transport(playHolder, {input: stepper.input, render, section, compact: true, dwell: .2,
    secondsPerUnit: k => k < 4 ? 1.2 : k < 10 ? .6 : .25});
  // a tiny α switch on the same line as the replay button
  const bar = playHolder.querySelector('.lab-transport');
  const group = html(bar, 'span', 'pr-alpha');
  html(group, 'span', 'pr-alpha-label', 'follow a link, α');
  const alphaButtons = ALPHAS.map(a => {
    const b = button(group, String(a), '', `α = ${a}`);
    b.addEventListener('click', () => {
      alpha = a; mark(); recompute(); controls.pause(); controls.seek(0); controls.play();
    });
    return b;
  });
  const mark = () => alphaButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ALPHAS[i] === alpha)));
  mark();
  controls.refresh();
}
