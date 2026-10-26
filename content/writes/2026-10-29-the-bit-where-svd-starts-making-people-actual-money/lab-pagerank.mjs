// Where does the random surfer end up? PageRank as probability flowing round a tiny web,
// p(t+1) = αTp(t) + (1 − α)v, next to the different question SVD would answer.
import {transition, rankStep, pagerankMatrix, pagerankStationary, topSingularVector} from './math.mjs';
import {C, html, svg, setAttrs, setText, setHTML, stage, arrowMarker, slider, choice, row, readouts, legend,
  narrator, transport, tween, fmt, pct, sym, clamp} from './lab-core.mjs';

const GRAPHS = {
  web: {label: 'A tiny web', links: [[1, 2], [2], [0], [2]],
    about: 'In this little web A links to B and C, B links to C, C links back to A, and D links to C.'},
  cycle: {label: 'A four page cycle', links: [[1], [2], [3], [0]],
    about: 'Four pages in a loop, A to B to C to D and back to A, each with exactly one link out.'},
  dangling: {label: 'A page with no links out', links: [[1, 2], [2], [], [2]],
    about: 'The same little web, except C has no links out at all. Whatever reaches C gets spread evenly over all four pages (the dashed arrows), otherwise it would just leak away.'},
};
const NAMES = 'ABCD', N = 4, STEPS = 80;
const W = 360, H = 300, POS = [[70, 82], [232, 82], [232, 228], [70, 228]], HUB = [322, 155];
const bez = (a, m, b, s) => [(1 - s) ** 2 * a[0] + 2 * s * (1 - s) * m[0] + s * s * b[0],
  (1 - s) ** 2 * a[1] + 2 * s * (1 - s) * m[1] + s * s * b[1]];
const l1 = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
// colours and sizes on text go in style, so they always win over the stage defaults
const ts = (fill, size, weight) => `fill:${fill};${size ? `font-size:${size}px;` : ''}${weight ? `font-weight:${weight};` : ''}`;
const sup = n => String(n).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);

export function mount(section) {
  const top = row(section);
  const graph = choice(top, {label: 'Pick a web', options: Object.entries(GRAPHS).map(([k, g]) => [k, g.label]), value: 'web'});
  const alpha = slider(top, {label: 'Follow a link, α', min: 0, max: 1, step: .01, value: .85,
    show: v => `${fmt(v, 2)} · ${Math.round(v * 100)}% of the time`});
  const playHolder = html(section, 'div');
  const stepper = slider(section, {label: 'Step', min: 0, max: STEPS, value: 0,
    show: v => `${Number.isInteger(v) ? v : fmt(v, 1)} / ${STEPS}`});

  // ---- the graph and the bars ----
  const main = html(section, 'div', 'lab-grid-2 pr-main');
  const plot = stage(main, W, H, 'Four web pages with their links, and probability flowing along them');
  const side = html(main, 'div', 'pr-side');
  html(side, 'p', 'pr-side-title', 'Share of surfers on each page');
  const bars = [...NAMES].map(name => {
    const r = html(side, 'div', 'pr-bar-row');
    html(r, 'span', 'pr-bar-name', name);
    const track = html(r, 'div', 'pr-track');
    const fill = html(track, 'div', 'pr-fill');
    const tick = html(track, 'div', 'pr-tick');
    const value = html(r, 'span', 'pr-bar-value', '');
    return {fill, tick, value};
  });
  html(side, 'p', 'pr-note', 'The thin mark on each bar is where that page settles in the long run.');
  legend(side, [['x', 'share moving along links'], ['purple', 'share taking a random jump']]);

  const spark = stage(section, 640, 124, 'How much the shares change at each step, on a log scale', 'pr-spark');
  const say = narrator(section);
  const [setTotal, setChange, setTop] = readouts(section, [
    {label: 'total probability, always 100%'}, {label: 'change made by this step'}, {label: 'most visited page right now'}]);

  html(section, 'h4', '', 'Two different questions');
  html(section, 'p', 'pr-compare-intro', 'PageRank asks where the surfer spends their time, which is the vector G leaves unchanged. SVD would ask which input G stretches the most. Same matrix, different question, and usually a different answer.');
  const panel = stage(section, 640, 214, 'The PageRank vector next to the top singular vector of the same matrix G', 'pr-panel');
  const compareNote = html(section, 'p', 'pr-compare-note');

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

  // ---- sparkline (rebuilt when the lab switches between wide and narrow layouts) ----
  let narrow = false, SX, SY, sparkLine, sparkNow, sparkDot;
  const LOGMIN = -14, LOGMAX = Math.log10(2);
  function buildSpark() {
    spark.replaceChildren();
    const w = narrow ? 360 : 640, left = narrow ? 40 : 52, right = w - 16;
    spark.setAttribute('viewBox', `0 0 ${w} 124`);
    SX = i => left + i * ((right - left) / STEPS);
    SY = v => 104 - (Math.log10(clamp(v, 1e-15, 2)) - LOGMIN) / (LOGMAX - LOGMIN) * 80;
    svg(spark, 'text', {x: 14, y: 18, style: ts(C.dim, 11)}, narrow ? 'change per step, log scale' : 'how much the shares change each step, log scale');
    for (const e of [0, -7, -14]) {
      svg(spark, 'line', {x1: SX(0), x2: SX(STEPS), y1: SY(10 ** e), y2: SY(10 ** e), stroke: C.faint});
      svg(spark, 'text', {x: left - 8, y: SY(10 ** e) + 4, 'text-anchor': 'end', style: ts(C.dim, 10)}, e === 0 ? '1' : `10${sup(e)}`);
    }
    svg(spark, 'line', {x1: SX(0), x2: SX(STEPS), y1: SY(1e-4), y2: SY(1e-4), stroke: C.dim, 'stroke-dasharray': '4 4', opacity: .6});
    svg(spark, 'text', {x: SX(STEPS), y: SY(1e-4) - 5, 'text-anchor': 'end', style: ts(C.dim, 10)}, 'basically settled');
    svg(spark, 'text', {x: SX(STEPS), y: 120, 'text-anchor': 'end', style: ts(C.dim, 10)}, `step ${STEPS}`);
    svg(spark, 'text', {x: SX(0), y: 120, style: ts(C.dim, 10)}, 'step 1');
    sparkLine = svg(spark, 'polyline', {fill: 'none', stroke: C.x, 'stroke-width': 2});
    sparkNow = svg(spark, 'line', {y1: 24, y2: 106, stroke: C.ink, opacity: .35});
    sparkDot = svg(spark, 'circle', {r: 4.5, fill: C.x, stroke: C.bg, 'stroke-width': 2});
    if (changes) drawSparkLine();
  }
  const drawSparkLine = () => setAttrs(sparkLine, {points: changes.slice(1, STEPS + 1).map((c, i) => `${SX(i + 1)},${SY(c)}`).join(' ')});

  // ---- two questions panel, side by side when wide, stacked when narrow ----
  let groups = [];
  function buildPanel() {
    panel.replaceChildren();
    panel.setAttribute('viewBox', narrow ? '0 0 340 424' : '0 0 640 214');
    groups = [
      {x0: narrow ? 30 : 44, y0: 0, color: C.x, title: 'PageRank, where surfers end up', sub: 'the p with Gp = p'},
      {x0: narrow ? 30 : 362, y0: narrow ? 210 : 0, color: C.s1, title: 'Top singular vector of G', sub: ''},
    ].map(g => {
      svg(panel, 'text', {x: g.x0, y: g.y0 + 26, style: ts(g.color, 13, 700)}, g.title);
      const sub = svg(panel, 'text', {x: g.x0, y: g.y0 + 44, style: ts(C.dim, 11)}, g.sub);
      svg(panel, 'line', {x1: g.x0 - 6, x2: g.x0 + 248, y1: g.y0 + 178, y2: g.y0 + 178, stroke: C.faint});
      const cols = [...NAMES].map((name, i) => {
        const x = g.x0 + i * 64;
        svg(panel, 'text', {x: x + 22, y: g.y0 + 198, 'text-anchor': 'middle', style: ts(C.ink, 12)}, name);
        return {bar: svg(panel, 'rect', {x, width: 44, rx: 3, fill: g.color}),
          value: svg(panel, 'text', {x: x + 22, 'text-anchor': 'middle', style: ts(C.ink, 11)})};
      });
      return {sub, cols, y0: g.y0};
    });
    if (sigma !== undefined) groups[1].sub.textContent = `the x that G stretches most, σ₁ = ${fmt(sigma, 2)}`;
    drawPanel(shownPanel);
  }

  // ---- state ----
  let key = '', links, T, history, changes, pstar, sv, sigma, flows = [], action = null, actionStep = 0;
  let shownPanel = Array(8).fill(.25);

  function buildLinks() {
    linkLayer.replaceChildren(); packetLayer.querySelectorAll('.pr-packet').forEach(p => p.remove()); flows = [];
    links.forEach((dests, from) => {
      const dangling = dests.length === 0, out = dangling ? [0, 1, 2, 3] : dests;
      out.forEach(to => {
        if (from === to) return;
        const a = POS[from], b = POS[to], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        const start = [a[0] + d[0] * 25, a[1] + d[1] * 25], end = [b[0] - d[0] * 29, b[1] - d[1] * 29];
        const bow = (links[to].includes(from) || links[to].length === 0) ? 30 : 18;
        const mid = [(a[0] + b[0]) / 2 - d[1] * bow, (a[1] + b[1]) / 2 + d[0] * bow];
        const path = svg(linkLayer, 'path', {d: `M${start} Q${mid} ${end}`, fill: 'none', stroke: C.dim,
          'stroke-dasharray': dangling ? '3 4' : 'none', 'marker-end': arrowHead});
        const dots = [0, 1, 2].map(() => svg(packetLayer, 'circle', {class: 'pr-packet', fill: C.x, opacity: 0}));
        flows.push({from, to, start, mid, end, path, dots});
      });
    });
  }

  function recompute(rebuildGraph) {
    const g = graph.input.value, a = Number(alpha.input.value);
    links = GRAPHS[g].links; T = transition(links);
    if (rebuildGraph) buildLinks();
    history = [[1, 0, 0, 0]];
    for (let i = 0; i <= STEPS; i++) history.push(rankStep(history[i], T, a));
    changes = history.map((p, i) => i === 0 ? 0 : l1(p, history[i - 1]));
    pstar = pagerankStationary(T, a).p;
    const top = topSingularVector(pagerankMatrix(T, a)), s = top.v.reduce((x, y) => x + y, 0);
    sv = top.v.map(x => x / s); sigma = top.sigma;
    drawSparkLine();
    bars.forEach((b, i) => { b.tick.style.left = pct(pstar[i], 2); });
    const target = [...pstar, ...sv];
    tween('pr-panel', shownPanel, target, 550, v => { shownPanel = v; drawPanel(v); });
    groups[1].sub.textContent = `the x that G stretches most, σ₁ = ${fmt(sigma, 2)}`;
    explainPanel(g, a);
    key = `${g}/${a}`;
  }

  function drawPanel(v) {
    const max = Math.max(.5, ...v);
    groups.forEach((g, k) => g.cols.forEach((c, i) => {
      const value = v[k * 4 + i], h = 118 * value / max;
      setAttrs(c.bar, {y: g.y0 + 178 - h, height: Math.max(.5, h)});
      setAttrs(c.value, {y: g.y0 + 172 - h});
      setText(c.value, pct(value, 0));
    }));
  }

  function explainPanel(g, a) {
    const d = l1(pstar, sv), order = [0, 1, 2, 3].sort((i, j) => sv[j] - sv[i]);
    const pTop = pstar.indexOf(Math.max(...pstar));
    let note;
    if (g === 'cycle' && a === 1) note = 'Here G only moves every page\'s share on to the next page, so it stretches every direction by exactly 1 and no single direction is stretched most. The power method just hands back the uniform vector, which happens to be the PageRank too.';
    else if (d < .05) note = 'Here the two agree, because this G treats every page alike. They still answer different questions, and on most webs they come out different, like the tiny web with α = 0.85.';
    else note = `They disagree a lot. PageRank puts the most weight on page ${NAMES[pTop]} (${pct(pstar[pTop], 0)}), while the most stretched direction leans on ${NAMES[order[0]]} and ${NAMES[order[1]]}. Where the surfer settles is an eigenvector question, the p with Gp = p, and SVD answers a different one, so the top singular vector is not the PageRank.`;
    setText(compareNote, note);
  }

  function draw(p, k, f) {
    const a = Number(alpha.input.value), prev = history[k], jump = 1 - a;
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
      const m = a * T[fl.to][fl.from] * prev[fl.from];
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
    const g = graph.input.value, a = Number(alpha.input.value);
    if (`${g}/${a}` !== key) recompute(false);
    const k = Math.min(STEPS, Math.floor(q)), f = q - k, next = history[Math.min(k + 1, history.length - 1)];
    const p = history[k].map((x, i) => (1 - f) * x + f * next[i]);
    draw(p, k, f);
    // sparkline marker
    const at = clamp(q, 1, STEPS);
    setAttrs(sparkNow, {x1: SX(q), x2: SX(q), opacity: q >= 1 ? .35 : 0});
    setAttrs(sparkDot, {cx: SX(at), cy: SY(changes[Math.max(1, Math.round(at))]), opacity: q >= 1 ? 1 : 0});
    const topNow = p.indexOf(Math.max(...p));
    setTotal(pct(p.reduce((s, x) => s + x, 0), 1));
    setChange(k === 0 && f === 0 ? '—' : changes[Math.min(STEPS, k + 1)].toExponential(1).replace('-', '−'));
    setTop(`${NAMES[topNow]} · ${pct(p[topNow], 1)}`);
    if (action && k !== actionStep) action = null;
    tell(g, a, k, f, q);
  }

  function tell(g, a, k, f) {
    const lead = action === 'graph' ? GRAPHS[g].about + ' '
      : action === 'alpha' ? (a === 1 ? 'You set α to 1, so the surfer always follows a link and never jumps. '
        : a === 0 ? 'You set α to 0, so the surfer never follows a link and always jumps to a random page. '
        : `You set α to ${fmt(a, 2)}, so the surfer follows a link ${pct(a, 0)} of the time and jumps to a random page the other ${pct(1 - a, 0)}. `) : '';
    const start = k === 0 && f < 1e-3, settled = !start && changes[Math.min(STEPS, k + 1)] < 1e-4;
    const inDeg = [0, 1, 2, 3].map(i => links.filter((d, j) => d.includes(i) && j !== i).length);
    const best = pstar.indexOf(Math.max(...pstar));
    let step, text;
    if (start) {
      step = 'Step 0 · everyone starts on A';
      text = 'All the probability starts on page A, as if every surfer begins there. Press play or step forward to watch it flow along the links.'
        + (g === 'dangling' && action !== 'graph' ? ' Page C has no links out, so whatever reaches it gets spread evenly over all four pages.' : '');
    } else if (g === 'cycle' && a === 1) {
      step = `Step ${k} · going round in circles`;
      text = 'With α = 1 the surfer always takes the one link out, so the whole 100% goes round A, B, C, D and back to A every 4 steps. A steady answer does exist, 25% on every page, but starting from A you never reach it, and that is exactly why PageRank adds the random jump.';
    } else if (a === 0) {
      step = `Step ${k} · links do not matter`;
      text = 'With α = 0 nobody follows links, every step is a pure random jump, so after a single step every page has 25% and the links make no difference at all.';
    } else if (settled) {
      step = `Step ${k} · settled`;
      const why = g === 'cycle' ? 'every page has exactly one link in, so they all tie at 25%'
        : `${inDeg[best]} page${inDeg[best] === 1 ? '' : 's'} link to it`;
      text = `The bars have basically stopped moving. This is the stationary distribution, the long run share of time the surfer spends on each page, and you would get the same answer starting from any page. ${g === 'cycle' ? 'Here ' + why + '.' : `Page ${NAMES[best]} ends up with the most because ${why}.`}`;
    } else {
      step = `Step ${k} → ${k + 1} · probability spreading`;
      text = (a === 1 ? 'Every step, each page passes its whole share along its links (the orange dots).'
        : `Every step, ${pct(a, 0)} of each page's share follows its links (the orange dots) and the other ${pct(1 - a, 0)} is pooled and spread evenly over all four pages (the grey jump circle).`)
        + (k < 3 ? ' The swings are big at first.' : ' The swings get smaller every step, and the thin marks on the bars show where they are heading.')
        + (g === 'dangling' ? ' Page C has no links out, so its share goes to everyone, itself included (the dashed arrows).' : '');
    }
    const focus = 1, linked = a * T[focus].reduce((s, t, j) => s + t * history[k][j], 0), tele = (1 - a) / N;
    say({step, text: lead + text,
      moving: start ? [] : ["each page's share", ...(f > 1e-3 ? ['dots along the links'] : [])],
      still: ['the links', `α = ${fmt(a, 2)}`, 'the total, always 100%'],
      math: `p${k + 1}(B) = α·Σⱼ T[B,j]·p${k}(j) + (1 − α)/4 = ${fmt(linked, 4)} + ${fmt(tele, 4)} = ${fmt(linked + tele, 4)}\n‖p${k + 1} − p${k}‖₁ = ${changes[Math.min(STEPS, k + 1)].toExponential(2)}`});
  }

  narrow = section.clientWidth < 520;
  buildSpark(); buildPanel();
  recompute(true);
  new ResizeObserver(() => {
    const now = section.clientWidth < 520;
    if (now !== narrow) { narrow = now; buildSpark(); buildPanel(); controls.refresh(); }
  }).observe(section);
  const controls = transport(playHolder, {input: stepper.input, render, section, dwell: .22,
    secondsPerUnit: k => k < 6 ? 1.5 : k < 16 ? .7 : .28});
  graph.input.addEventListener('change', () => {
    controls.pause(); action = 'graph'; actionStep = 0; recompute(true); controls.seek(0);
  });
  alpha.input.addEventListener('input', () => {
    action = 'alpha'; actionStep = Math.floor(controls.position); recompute(false); controls.refresh();
  });
}
