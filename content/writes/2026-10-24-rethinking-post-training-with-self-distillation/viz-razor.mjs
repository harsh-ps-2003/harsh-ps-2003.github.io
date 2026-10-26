// RL's Razor as a map of models. Distance from the base model stands for KL,
// old skills fade with distance, and the pale oval is every model with 90% on
// the new task. Each method's path ends somewhere different inside it.
// A schematic in the spirit of the RL's Razor and SDFT papers, not their data.
import {el, sv, attrs, clamp, lerp, fmt, ease, story, onceVisible, pauseOffscreen, segmented, playButton, canvas} from './viz-core.mjs';

const U = 1.36;                                   // map is U wide and 1 tall, in map units
const BASE = [.20, .86], SPREAD = .42, TOP_SKILL = 80;
const OVAL = {c: [.835, .40], rx: .50, ry: .095, a: Math.atan2(-.46, .87)};
const DEMO = [1.18, .215], TEACHER = [.48, .59];
const RINGS = [70, 30, 10].map(level => [level, SPREAD * Math.sqrt(2 * Math.log(TOP_SKILL / level))]);

const METHODS = {
  sft: {name: 'SFT', path: [BASE, [.42, .98], [1.20, .80], [.97, .38]], ms: 2800},
  rl: {name: 'RL', path: [BASE, [.17, .66], [.30, .62], [.45, .605]], ms: 2400},
  sdft: {name: 'SDFT', path: [BASE, [.26, .74], [.36, .64], [.44, .615]], ms: 3600},
};
const ARROW = [DEMO, [1.20, .52], [.78, .66], TEACHER];   // demonstrator to teacher, "reads the demonstration"

const bez = ([p0, p1, p2, p3], t) => [0, 1].map(k => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * p1[k] + 3 * (1 - t) * t * t * p2[k] + t ** 3 * p3[k]);
const oldSkills = p => TOP_SKILL * Math.exp(-((p[0] - BASE[0]) ** 2 + (p[1] - BASE[1]) ** 2) / (2 * SPREAD * SPREAD));
// every method learns the new task at the same pace and ends inside the oval at 90%,
// what differs is how far from the base it ends up, so how much old skill is left
const newTask = t => 15 + 75 * t;
const distance = p => Math.hypot(p[0] - BASE[0], p[1] - BASE[1]);

const CAPTION = {
  intro: 'Every point is a version of the model. Distance from the base stands for KL, how differently it answers, and <b>old skills fade with distance.</b>',
  rl: 'RL only reweights answers the model already gives, so <b>it stops at the near end of the oval</b>, 90% on the new task with most old skills kept.',
  sft: 'SFT has to reproduce someone else’s text, wording and habits included, so <b>it ends at the far end.</b> Same 90% on the new task, old skills mostly gone.',
  sdft: 'The demonstrator is far away. The teacher is the base model reading the demonstration, it still answers in the model’s own words so <b>it sits close by, and the SDFT student follows it there.</b>',
};

export function mount(figure, data) {
  const methods = (data.methods || 'sft,rl').split(',').filter(m => METHODS[m]);
  let current = data.start && methods.includes(data.start) ? data.start : methods[0];
  const progress = Object.fromEntries(methods.map(m => [m, 0]));
  let touched = false;
  const s = story();

  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, methods.map(m => [m, METHODS[m].name]), current, m => { s.stop(); s.run(go => travel(go, m)); }, 'Which method to train with');

  const grid = el('div', {class: 'rz-grid'});
  const mapBox = el('div', {class: 'rz-map'}), plotBox = el('div', {class: 'rz-plot'});
  grid.append(mapBox, plotBox);
  figure.append(grid);
  const stats = el('div', {class: 'rz-stats'});
  const cell = label => { const v = el('strong', {class: 'sd-mono'}); stats.append(el('div', {}, v, el('span', {text: label}))); return v; };
  const whoOut = cell('method'), newOut = cell('new task'), oldOut = cell('old skills'), klOut = cell('distance from base, KL');
  whoOut.classList.remove('sd-mono');
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'schematic, after the RL’s Razor and SDFT papers'}));
  figure.append(stats, caption, foot);
  const play = playButton(foot, s, () => tour());

  // ---- the map ----
  let Mp = null;
  const uid = Math.random().toString(36).slice(2, 8);
  const map = canvas(mapBox, (svg, w) => {
    const k = w / U, h = Math.round(k);
    const P = p => [p[0] * k, p[1] * k];
    svg.replaceChildren();
    svg.setAttribute('aria-label', 'A map of model versions around the base model, with each method’s path to the 90% oval');
    svg.append(sv('defs', {}, sv('clipPath', {id: `rz-clip-${uid}`}, sv('rect', {width: w, height: h, rx: 10}))));
    const field = sv('g', {'clip-path': `url(#rz-clip-${uid})`});
    field.append(sv('rect', {width: w, height: h, class: 'rz-bg'}));
    // soft shading, more ink where old skills are higher
    for (let level = 6; level <= 78; level += 6) {
      const r = SPREAD * Math.sqrt(2 * Math.log(TOP_SKILL / level)) * k;
      field.append(sv('circle', {cx: P(BASE)[0], cy: P(BASE)[1], r, class: 'rz-shade'}));
    }
    for (const [level, r] of RINGS) {
      field.append(sv('circle', {cx: P(BASE)[0], cy: P(BASE)[1], r: r * k, class: 'rz-ring'}));
      const dir = [-.12, -.993], at = P([BASE[0] + dir[0] * (r - .035), BASE[1] + dir[1] * (r - .035)]);
      field.append(sv('text', {x: at[0], y: at[1], 'text-anchor': 'middle', class: 'rz-ring-label', text: level}));
    }
    svg.append(field);
    const [ox, oy] = P(OVAL.c), deg = OVAL.a * 180 / Math.PI;
    svg.append(sv('ellipse', {cx: ox, cy: oy, rx: OVAL.rx * k, ry: OVAL.ry * k, transform: `rotate(${deg} ${ox} ${oy})`, class: 'rz-oval'}));
    svg.append(sv('text', {x: ox, y: oy + 4, 'text-anchor': 'middle', transform: `rotate(${deg} ${ox} ${oy})`, class: 'rz-oval-label',
      text: w < 420 ? '90% on the new task' : 'every model with 90% on the new task'}));
    const [bx, by] = P(BASE);
    svg.append(sv('text', {x: bx + 4, y: Math.min(h - 8, by + 24), 'text-anchor': 'middle', class: 'rz-label', text: 'base model'}));
    svg.append(sv('text', {x: w - 10, y: 18, 'text-anchor': 'end', class: 'rz-key', text: 'shading and rings show old skills'}));

    const layer = {};
    if (methods.includes('sdft')) {
      const arrowD = pathD(ARROW, P);
      layer.arrow = sv('path', {d: arrowD, class: 'rz-arrow', 'marker-end': `url(#rz-head-${uid})`});
      svg.querySelector('defs').append(sv('marker', {id: `rz-head-${uid}`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'},
        sv('path', {d: 'M0 1 L9 5 L0 9 z', class: 'rz-arrow-head'})));
      const [dx, dy] = P(DEMO), [tx, ty] = P(TEACHER), mid = P(bez(ARROW, .45));
      layer.demo = sv('g', {class: 'rz-demo'}, sv('circle', {cx: dx, cy: dy, r: 6.5}),
        sv('text', {x: dx, y: dy - 12, 'text-anchor': 'end', class: 'rz-label', text: 'demonstrator'}));
      layer.arrowLabel = sv('text', {x: mid[0] + 6, y: mid[1] + 18, 'text-anchor': 'middle', class: 'rz-arrow-label', text: 'reads the demonstration'});
      layer.teacher = sv('g', {class: 'rz-teacher'}, sv('circle', {cx: tx, cy: ty, r: 6.5}),
        sv('text', {x: tx + 10, y: ty - 10, class: 'rz-label rz-teacher-label', text: 'teacher'}));
      svg.append(layer.arrow, layer.demo, layer.arrowLabel, layer.teacher);
    }
    layer.paths = Object.fromEntries(methods.map(m => {
      const g = sv('g', {class: `rz-path rz-${m}`});
      const line = sv('path', {class: 'rz-line'}), label = sv('text', {class: 'rz-path-label', text: METHODS[m].name});
      g.append(line, label); svg.append(g);
      return [m, {g, line, label}];
    }));
    svg.append(sv('circle', {cx: bx, cy: by, r: 6.5, class: 'rz-base'}));
    layer.dot = sv('circle', {r: 7, class: 'rz-dot'});
    svg.append(layer.dot);
    Mp = {P, k, layer};
    paint();
    return h;
  });

  // ---- old skills against new task, traced live ----
  let Pl = null;
  const plot = canvas(plotBox, (svg, w) => {
    const narrow = w < 300 || figure.clientWidth < 520;
    const h = narrow ? 200 : Math.round(w * 1.55 / U);
    const m = {l: 34, r: 12, t: 26, b: 36};
    const X = v => m.l + v / 100 * (w - m.l - m.r), Y = v => m.t + (1 - v / 85) * (h - m.t - m.b);
    svg.replaceChildren();
    svg.setAttribute('aria-label', 'Old skills against new task performance for each method as it trains');
    svg.append(sv('rect', {x: 0, y: 0, width: w, height: h, rx: 10, class: 'rz-plot-bg'}));
    svg.append(sv('line', {x1: m.l, x2: w - m.r, y1: Y(0), y2: Y(0), class: 'rz-axis'}), sv('line', {x1: m.l, x2: m.l, y1: m.t, y2: Y(0), class: 'rz-axis'}));
    for (const v of [0, 50, 100]) svg.append(sv('text', {x: X(v), y: Y(0) + 15, 'text-anchor': 'middle', class: 'rz-tick', text: v}));
    for (const v of [0, 40, 80]) svg.append(sv('text', {x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'rz-tick', text: v}));
    svg.append(sv('text', {x: w - m.r, y: h - 6, 'text-anchor': 'end', class: 'rz-axis-label', text: 'new task →'}));
    svg.append(sv('text', {x: 8, y: 15, class: 'rz-axis-label', text: '↑ old skills'}));
    svg.append(sv('line', {x1: X(90), x2: X(90), y1: m.t, y2: Y(0), class: 'rz-ninety'}));
    svg.append(sv('text', {x: X(90) - 4, y: m.t + 10, 'text-anchor': 'end', class: 'rz-tick', text: '90%'}));
    const traces = Object.fromEntries(methods.map(mm => {
      const line = sv('polyline', {class: `rz-trace rz-${mm}`}), label = sv('text', {class: `rz-trace-label rz-${mm}`, text: METHODS[mm].name});
      svg.append(line, label);
      return [mm, {line, label}];
    }));
    Pl = {X, Y, traces};
    paint();
    return h;
  });

  function pathD(curve, P, upto = 1) {
    let d = '';
    for (let i = 0; i <= 48; i++) { const t = upto * i / 48, q = P(bez(curve, t)); d += `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }
    return d;
  }
  // SDFT spends its first stretch on the demonstrator arrow, then the student moves
  const split = m => m === 'sdft' ? {arrow: clamp(progress[m] / .32, 0, 1), walk: clamp((progress[m] - .28) / .72, 0, 1)} : {arrow: 1, walk: progress[m]};

  function paint() {
    if (Mp) {
      const {P, layer} = Mp;
      for (const m of methods) {
        const {walk} = split(m), L = layer.paths[m];
        attrs(L.line, {d: walk > 0 ? pathD(METHODS[m].path, P, walk) : ''});
        L.g.dataset.state = m === current ? 'now' : walk > 0 ? 'done' : 'todo';
        const end = P(bez(METHODS[m].path, Math.max(walk, .001)));
        const off = m === 'sft' ? [10, 4] : m === 'rl' ? [-8, -10] : [-12, 18];
        attrs(L.label, {x: end[0] + off[0], y: end[1] + off[1], 'text-anchor': m === 'sft' ? 'start' : 'end', opacity: walk > .98 ? 1 : 0});
      }
      if (layer.arrow) {
        const {arrow} = split('sdft'), len = layer.arrow.getTotalLength?.() || 400;
        attrs(layer.arrow, {'stroke-dasharray': `${len}`, 'stroke-dashoffset': `${(1 - arrow) * len}`, opacity: arrow > 0 ? 1 : 0});
        layer.arrowLabel.setAttribute('opacity', arrow > .9 ? 1 : 0);
        layer.teacher.setAttribute('opacity', arrow > .95 ? 1 : .0);
        layer.demo.setAttribute('opacity', current === 'sdft' || progress.sdft > 0 ? 1 : .35);
      }
      const at = P(bez(METHODS[current].path, split(current).walk));
      attrs(layer.dot, {cx: at[0], cy: at[1], class: `rz-dot rz-${current}`});
    }
    if (Pl) {
      for (const m of methods) {
        const {walk} = split(m), T = Pl.traces[m], pts = [];
        for (let i = 0; i <= 40; i++) { const t = walk * i / 40; pts.push(`${Pl.X(newTask(t)).toFixed(1)},${Pl.Y(oldSkills(bez(METHODS[m].path, t))).toFixed(1)}`); }
        attrs(T.line, {points: walk > 0 ? pts.join(' ') : '', 'data-state': m === current ? 'now' : 'done'});
        const end = bez(METHODS[m].path, walk);
        attrs(T.label, {x: Pl.X(newTask(walk)) - 6, y: Pl.Y(oldSkills(end)) + (m === 'sft' ? -8 : -9), 'text-anchor': 'end', opacity: walk > .98 ? 1 : 0, 'data-state': m === current ? 'now' : 'done'});
      }
    }
    const walk = split(current).walk, p = bez(METHODS[current].path, walk);
    attrs(whoOut, {text: METHODS[current].name, class: `rz-who rz-${current}`});
    attrs(newOut, {text: `${Math.round(newTask(walk))}%`});
    attrs(oldOut, {text: `${Math.round(oldSkills(p))}`});
    attrs(klOut, {text: fmt(distance(p), 2)});
    caption.innerHTML = touched ? CAPTION[current] : CAPTION.intro;
  }

  async function travel(go, m) {
    current = m; touched = true; seg.set(m);
    progress[m] = 0; paint();
    await go.tween(METHODS[m].ms, t => { progress[m] = t; paint(); }, ease.inOut);
    progress[m] = 1; paint();
  }
  const tour = () => s.run(async go => {
    for (const m of methods) progress[m] = 0;
    for (const m of methods) { await travel(go, m); await go.wait(1100); }
  });

  pauseOffscreen(figure, s);
  paint();
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
