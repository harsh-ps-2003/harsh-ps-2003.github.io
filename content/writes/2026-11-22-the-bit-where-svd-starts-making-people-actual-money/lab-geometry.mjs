// The unit circle under A = UΣVᵀ, applied one factor at a time: x, Vᵀx, ΣVᵀx, UΣVᵀx = Ax.
import {svd2, mv, geometryFrame as frame} from './math.mjs';
import {C, html, svg, setAttrs, setText, stage, arrowMarker, slider, choice, row, legend,
  narrator, transport, tween, fmt, sym} from './lab-core.mjs';

const PRESETS = [
  ['shear', 'Shear', [1, 1, 0, 1]],
  ['tilted', 'A general 2 × 2 matrix', [1.3, .8, -.4, .9]],
  ['stretch', 'Diagonal, stretch and squash', [2, 0, 0, .5]],
  ['flat', 'Rank 1, everything onto a line', [1, 1, .5, .5]],
  ['mirror', 'Negative determinant, with a reflection', [-1.4, .4, .3, .8]],
  ['turn', 'Rotation by 90°', [0, -1, 1, 0]],
  ['zero', 'The zero matrix', [0, 0, 0, 0]],
];
const W = 640, H = 340, CX = 320, CY = 188, R = 138;
const EXPR = ['x', 'Vᵀx', 'ΣVᵀx', 'UΣVᵀx', 'UΣVᵀx = Ax'];

export function mount(section) {
  // ---- controls, all above the drawing ----
  const top = row(section);
  const preset = choice(top, {label: 'Pick a matrix', options: PRESETS.map(([v, l]) => [v, l]), value: 'shear'});
  const editor = html(top, 'fieldset', 'geo-editor');
  html(editor, 'legend', '', 'or type your own A');
  const grid = html(editor, 'div', 'geo-matrix');
  const cells = [0, 1, 2, 3].map(i => {
    const input = html(grid, 'input'); Object.assign(input, {type: 'number', min: -3, max: 3, step: .1, value: PRESETS[0][2][i]});
    input.setAttribute('aria-label', `A row ${1 + (i >> 1)} column ${1 + (i & 1)}`); return input;
  });
  const sliders = row(section, 'geo-sliders');
  const stepper = slider(sliders, {label: 'Step, from x (0) to Ax (3)', min: 0, max: 3, value: 0, show: v => `${fmt(v, 2)} / 3`});
  const angle = slider(sliders, {label: 'x = (cos θ, sin θ), θ', min: 0, max: 360, step: 1, value: 35, show: v => `${v}°`});

  // the factorisation with its actual numbers, colour coded like the drawing
  const strip = html(section, 'div', 'geo-factors');
  strip.setAttribute('aria-label', 'A equals U times Sigma times V transpose, with their entries');
  const mats = {};
  const matrix = (key, name) => {
    const box = html(strip, 'div', 'geo-mat'); box.dataset.key = key;
    html(box, 'span', 'geo-mat-name', name);
    const body = html(box, 'div', 'geo-mat-body');
    const entries = [0, 1, 2, 3].map(() => html(body, 'span'));
    const note = html(box, 'span', 'geo-mat-note');
    mats[key] = {box, entries, note};
  };
  matrix('A', 'A'); html(strip, 'span', 'geo-op', '=');
  matrix('U', 'U'); matrix('S', 'Σ'); matrix('V', 'Vᵀ');

  const plot = stage(section, W, H, 'The unit circle carried through Vᵀ, Σ and U');
  legend(section, [['x', 'x, drag its tip'], ['s1', 'v₁ ↦ σ₁u₁'], ['s2', 'v₂ ↦ σ₂u₂'], ['i', 'Ae₁, Ae₂, the columns of A']]);
  const say = narrator(section);

  // ---- drawing ----
  const mark = {x: arrowMarker(plot, 'geo-ax', C.x), s1: arrowMarker(plot, 'geo-a1', C.s1), s2: arrowMarker(plot, 'geo-a2', C.s2),
    i: arrowMarker(plot, 'geo-ai', C.i), j: arrowMarker(plot, 'geo-aj', C.j)};
  const fixed = svg(plot, 'g', {stroke: C.grid, 'stroke-width': 1});
  const moving = svg(plot, 'g', {stroke: C.faint, 'stroke-width': 1});
  const lines = [];
  for (let k = -6; k <= 6; k++) for (const ends of [[[-6, k], [6, k]], [[k, -6], [k, 6]]])
    lines.push({ends, a: svg(fixed, 'line'), b: svg(moving, 'line', k === 0 ? {'stroke-width': 1.6} : {})});
  const ghost = svg(plot, 'circle', {fill: 'none', stroke: C.dim, 'stroke-dasharray': '4 5', opacity: .55});
  const blob = svg(plot, 'polygon', {fill: C.tint, stroke: C.ink, 'stroke-width': 1.5});
  // the dots darken as they go round, so a turn or a flip is easy to follow
  const dots = Array.from({length: 36}, (_, k) => svg(plot, 'circle', {r: 3, fill: C.ink, opacity: (.12 + .83 * k / 35).toFixed(2)}));
  const arrow = (color, m, w) => svg(plot, 'line', {stroke: color, 'stroke-width': w, 'marker-end': m, 'stroke-linecap': 'round'});
  const basis = [arrow(C.i, mark.i, 1.6), arrow(C.j, mark.j, 1.6)];
  const sing = [arrow(C.s1, mark.s1, 3.2), arrow(C.s2, mark.s2, 3.2)];
  const follow = arrow(C.x, mark.x, 3.4);
  const knob = svg(plot, 'circle', {r: 9, fill: C.x, 'fill-opacity': .25, stroke: C.x, cursor: 'grab'});
  const labels = [C.s1, C.s2, C.i, C.j, C.x].map(fill => svg(plot, 'text', {class: 'geo-lbl', fill, 'font-weight': 700, 'font-size': 14}));
  svg(plot, 'circle', {cx: CX, cy: CY, r: 3, fill: C.ink});
  const flipNote = svg(plot, 'text', {class: 'geo-note', x: CX, y: CY + 40, 'text-anchor': 'middle', fill: C.dim, opacity: 0},
    'U reflects, the plane turning over, seen edge on');
  const expr = svg(plot, 'text', {class: 'geo-head', x: 18, y: 34, 'font-size': 22, 'font-weight': 700, fill: C.x});
  const stepName = svg(plot, 'text', {class: 'geo-step', x: W - 18, y: 32, 'text-anchor': 'end', fill: C.dim, 'font-size': 14});

  // ---- state ----
  let M = PRESETS[0][2].slice(), dec = svd2([[M[0], M[1]], [M[2], M[3]]]), scale = 1, theta = 35 * Math.PI / 180;
  const setMatrix = m => { M = m; dec = svd2([[m[0], m[1]], [m[2], m[3]]]); };
  const mirrored = () => dec.u[0][0] * dec.u[1][1] - dec.u[0][1] * dec.u[1][0] < 0;
  const stageOf = q => q <= 1e-9 ? 0 : q <= 1 ? 1 : q <= 2 ? 2 : q < 3 - 1e-9 ? 3 : 4;

  function render(q) {
    const f = x => frame(dec, q, x);
    scale = R / Math.max(1.35, dec.s[0] + .3);
    const xy = p => [CX + p[0] * scale, CY - p[1] * scale];
    const line = (el, a, b) => { const [x1, y1] = xy(a), [x2, y2] = xy(b); setAttrs(el, {x1, y1, x2, y2}); };
    for (const g of lines) { line(g.a, ...g.ends); line(g.b, ...g.ends.map(f)); }
    setAttrs(ghost, {cx: CX, cy: CY, r: scale});
    const ring = Array.from({length: 120}, (_, k) => xy(f([Math.cos(k * Math.PI / 60), Math.sin(k * Math.PI / 60)])));
    setAttrs(blob, {points: ring.map(p => p.join(',')).join(' ')});
    dots.forEach((d, k) => { const [cx, cy] = xy(f([Math.cos(k * Math.PI / 18), Math.sin(k * Math.PI / 18)])); setAttrs(d, {cx, cy}); });
    const tip = (el, v) => { const p = f(v); line(el, [0, 0], p); return xy(p); };
    const x = [Math.cos(theta), Math.sin(theta)];
    const ends = [tip(sing[0], dec.vt[0]), tip(sing[1], dec.vt[1]), tip(basis[0], [1, 0]), tip(basis[1], [0, 1]), tip(follow, x)];
    setAttrs(knob, {cx: ends[4][0], cy: ends[4][1]});

    const s = stageOf(q);
    // labels say what each arrow is at this step
    const names = [
      [['v₁', 'v₂'], ['Vᵀv₁', 'Vᵀv₂'], ['σ₁e₁', 'σ₂e₂'], ['σ₁u₁', 'σ₂u₂'], ['Av₁ = σ₁u₁', 'Av₂ = σ₂u₂']][s],
      s === 0 ? ['e₁', 'e₂'] : s === 4 ? ['Ae₁', 'Ae₂'] : ['', ''],
      [EXPR[s === 4 ? 4 : s].replace(' = Ax', '')],
    ].flat();
    if (s === 4) names[4] = 'Ax';
    const hide = mirrored() && q > 2 && q < 2.5 && Math.abs(Math.cos(Math.PI * 2 * (q - 2))) < .35;
    ends.forEach(([px, py], k) => {
      const dx = px - CX, dy = py - CY, n = Math.hypot(dx, dy) || 1;
      const anchor = dx < -4 ? 'end' : 'start';
      setAttrs(labels[k], {x: px + 10 * dx / n + (anchor === 'end' ? -4 : 4), y: py + 12 * dy / n + 5, 'text-anchor': anchor});
      setText(labels[k], names[k]);
      labels[k].setAttribute('opacity', hide ? 0 : k === 2 || k === 3 ? .9 : 1);
    });
    flipNote.setAttribute('opacity', hide ? 1 : 0);
    setText(expr, EXPR[s]);
    setText(stepName, ['the input', 'step 1 of 3 · rotate by Vᵀ', 'step 2 of 3 · scale by Σ',
      `step 3 of 3 · ${mirrored() ? 'reflect and rotate' : 'rotate'} by U`, 'all three factors applied'][s]);
    for (const [key, active] of [['V', s === 1], ['S', s === 2], ['U', s === 3], ['A', s === 4]]) {
      mats[key].box.dataset.active = String(active);
      mats[key].box.dataset.done = String(key === 'A' ? false : s >= {V: 1, S: 2, U: 3}[key] && !active);
    }
    tell(s);
  }

  // one short sentence per step, the drawing and the number strip carry the rest
  function tell(s) {
    const [s1, s2] = dec.s;
    const zero = s1 < 1e-9, flat = !zero && s2 < 1e-9, rigid = Math.abs(s1 - 1) < 1e-6 && Math.abs(s2 - 1) < 1e-6;
    const round = !zero && Math.abs(s1 - s2) < 1e-6;
    const V1 = sym('s1', 'v₁'), V2 = sym('s2', 'v₂'), U1 = sym('s1', 'u₁'), U2 = sym('s2', 'u₂');
    const S1 = sym('s1', 'σ₁'), S2 = sym('s2', 'σ₂');
    const text = [
      zero ? 'The zero matrix sends every x to 0, so any orthonormal pair can play v₁ and v₂.'
        : round ? `σ₁ = σ₂, every direction stretches the same, so any orthonormal pair works as ${V1} and ${V2}.`
        : `The dots are unit vectors x, ${V1} is the direction A stretches most and ${V2} the one it stretches least.`,
      `Vᵀ turns ${V1} onto e₁ and ${V2} onto e₂, lengths and angles stay exactly the same.`,
      zero ? 'Σ = 0, so the whole circle collapses to the origin.'
        : flat ? `${S2} = 0 wipes out the second coordinate, the part of x along ${V2} is gone for good.`
        : rigid ? 'Σ = I, nothing changes size, so A is a pure rotation or reflection.'
        : `Σ stretches the axes by ${S1} = ${fmt(s1)} and ${S2} = ${fmt(s2)}, the only step that changes lengths.`,
      mirrored() ? `det U = −1, so U flips the plane over, then turns e₁ to ${U1} and e₂ to ${U2}.`
        : `U turns the ellipse rigidly, taking e₁ to ${U1} and e₂ to ${U2}.`,
      zero ? 'Everything sits at the origin, the zero map keeps nothing of x.'
        : flat ? 'Rank 1, so the circle lands on a segment and Av₂ = 0.'
        : `That is Ax for every x, and σ₁u₁ is the longest image of a unit vector, so σ₁ = ‖A‖₂.`,
    ][s];
    say({text});
  }

  function refreshNumbers() {
    const put = (key, a, colour) => mats[key].entries.forEach((e, i) => {
      setText(e, fmt(a[i >> 1][i & 1])); e.className = colour(i >> 1, i & 1);
    });
    put('A', [[M[0], M[1]], [M[2], M[3]]], () => 'c-ink');                           // columns are Ae₁, Ae₂
    put('U', dec.u, (r, c) => c === 0 ? 'c-s1' : 'c-s2');                            // columns are u₁, u₂
    put('S', [[dec.s[0], 0], [0, dec.s[1]]], (r, c) => r !== c ? 'geo-zero' : r === 0 ? 'c-s1' : 'c-s2');
    put('V', dec.vt, r => r === 0 ? 'c-s1' : 'c-s2');                                  // rows are v₁ᵀ, v₂ᵀ
    setText(mats.A.note, 'columns Ae₁, Ae₂');
    setText(mats.U.note, mirrored() ? 'reflect + rotate' : 'rotate');
    setText(mats.S.note, 'scale');
    setText(mats.V.note, 'rotate');
  }

  const controls = transport(section, {input: stepper.input, render, secondsPerUnit: 2.6, dwell: .3, compact: true,
    chapters: ['x · start', 'Vᵀx · rotate', 'ΣVᵀx · scale', 'UΣVᵀx · rotate'], section});
  // one row with the play button and the step chapters, under the sliders
  const playRow = html(null, 'div', 'geo-playrow');
  playRow.append(section.querySelector('.lab-transport'), section.querySelector('.lab-chapters'));
  sliders.after(playRow);

  const morphTo = target => {
    tween('geo-matrix', M.slice(), target, 650, m => { setMatrix(m); controls.refresh(); refreshNumbers(); });
  };
  preset.input.addEventListener('change', () => {
    const m = PRESETS.find(p => p[0] === preset.input.value)[2];
    cells.forEach((c, i) => { c.value = m[i]; });
    morphTo(m.slice());
  });
  cells.forEach(c => c.addEventListener('input', () => {
    if (cells.some(x => x.value === '' || !x.validity.valid)) return;
    preset.input.selectedIndex = -1;
    morphTo(cells.map(x => Number(x.value)));
  }));
  angle.input.addEventListener('input', () => { theta = Number(angle.input.value) * Math.PI / 180; controls.refresh(); });

  // drag the tip of x at any step: pick the unit vector whose image is nearest the pointer
  let dragging = false;
  const toLocal = e => { const r = plot.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const dragTo = e => {
    const [px, py] = toLocal(e), q = controls.position;
    let best = theta, bestD = Infinity;
    for (let k = 0; k < 360; k++) {
      const a = k * Math.PI / 180, p = frame(dec, q, [Math.cos(a), Math.sin(a)]);
      const d = (CX + p[0] * scale - px) ** 2 + (CY - p[1] * scale - py) ** 2;
      if (d < bestD) { bestD = d; best = a; }
    }
    theta = best; angle.input.value = Math.round(best * 180 / Math.PI) % 360; angle.update(); controls.refresh();
  };
  plot.addEventListener('pointerdown', e => {
    const [px, py] = toLocal(e), cx = Number(knob.getAttribute('cx')), cy = Number(knob.getAttribute('cy'));
    if (Math.hypot(px - cx, py - cy) > 26) return;
    dragging = true; plot.setPointerCapture(e.pointerId); controls.pause(); dragTo(e);
  });
  plot.addEventListener('pointermove', e => { if (dragging) dragTo(e); });
  plot.addEventListener('pointerup', () => { dragging = false; });

  refreshNumbers();
  controls.refresh();
}
