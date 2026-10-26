// A tiny error, a huge answer: undoing A = diag(1, ε) divides by ε, so a small
// measurement error along v₂ comes back multiplied by 1/ε.
import {C, html, svg, setAttrs, setText, setHTML, stage, arrowMarker, slider, choice, row, readouts, legend,
  narrator, transport, fmt, sym, clamp, reducedMotion} from './lab-core.mjs';

const W = 320, H = 300, CUTOFF = .01;
const DIRS = {v2: [0, 1], v1: [1, 0], diag: [Math.SQRT1_2, Math.SQRT1_2]};
const ORDER = ['about 1', 'about 10', 'about 100', 'about 1,000', 'about 10,000'];

// Everything the lab shows, computed from the three knobs and the error direction.
function solve(eps, delta, lambda, dir) {
  const d = DIRS[dir], e = [delta * d[0], delta * d[1]];
  const b = [1 + e[0], eps + e[1]];
  const exact = [b[0], b[1] / eps];
  const truncated = eps <= CUTOFF + 1e-12 ? [b[0], 0] : exact.slice();
  const ridge = [b[0] / (1 + lambda), b[1] * eps / (eps * eps + lambda)];
  return {eps, delta, lambda, dir, d, e, b, exact, truncated, ridge, kappa: 1 / eps};
}

export function mount(section) {
  const knobs = row(section);
  const direction = choice(knobs, {label: 'The measurement error points along', value: 'v2',
    options: [['v2', 'v₂, the squashed direction'], ['v1', 'v₁, the direction A leaves alone'], ['diag', 'halfway between']]});
  direction.wrap.classList.add('inv-direction');
  const deltaS = slider(knobs, {label: 'Measurement error δ', min: -.05, max: .05, step: .001, value: .01, show: v => fmt(v, 3)});
  const lambdaS = slider(knobs, {label: 'Ridge strength λ', min: -6, max: -2, step: .05, value: -4,
    show: v => (10 ** v).toExponential(1).replace('-', '−')});
  const epsS = slider(section, {label: 'The small stretch ε', min: -4, max: 0, value: 0, show: v => (10 ** v).toFixed(4)});
  epsS.wrap.classList.add('inv-eps');

  const panels = html(section, 'div', 'lab-grid-2 inv-panels');
  const left = stage(html(panels, 'figure'), W, H, 'Measurement space, the true b, the measured b and the small circle of possible errors');
  const right = stage(html(panels, 'figure'), W, H, 'Solution space, the true x, the three estimates and the ellipse the error circle turns into');
  const ruler = stage(section, 640, 92, 'The second coordinate x₂ of each estimate on a signed logarithmic ruler', 'inv-ruler');
  legend(section, [['x', 'exact inverse'], ['purple', 'truncated, drops σ₂ once ε ≤ 0.01'], ['i', 'ridge'],
    ['j', 'every possible error of size |δ|'], ['s1', 'v₁'], ['s2', 'v₂']]);
  const say = narrator(section);
  const [setExact, setTrunc, setRidge, setKappa] = readouts(section, [
    {label: 'exact inverse x₂', cls: 'x'}, {label: 'truncated x₂', cls: 'purple'},
    {label: 'ridge x₂', cls: 'i'}, {label: 'κ₂(A) = 1/ε, worst-case blow up'}]);
  html(section, 'p', 'lab-intro inv-fine', 'The 0.01 cutoff and the range of λ are teaching choices, in a real problem they depend on the scale of A and on how noisy the measurements are. κ₂ = 1/ε is the worst case, an error that points along v₁ is not amplified at all, which you can check with the menu at the top.');

  // ---------- left panel, b space (fixed scale) ----------
  const LS = 100, LO = [118, 178];
  const lxy = ([x, y]) => [LO[0] + x * LS, LO[1] - y * LS];
  const ml = {s1: arrowMarker(left, 'inv-l1', C.s1), s2: arrowMarker(left, 'inv-l2', C.s2)};
  svg(left, 'text', {x: 14, y: 24, fill: C.dim}, 'what we measured, b = Ax');
  const lAxes = svg(left, 'g', {stroke: C.faint});
  svg(lAxes, 'line', {x1: 8, x2: W - 8, y1: LO[1], y2: LO[1]});
  svg(lAxes, 'line', {x1: LO[0], x2: LO[0], y1: 40, y2: H - 8});
  svg(left, 'circle', {cx: LO[0], cy: LO[1], r: LS, fill: 'none', stroke: C.dim, 'stroke-dasharray': '4 5', opacity: .5});
  const squashed = svg(left, 'ellipse', {cx: LO[0], cy: LO[1], rx: LS, fill: 'rgba(88,196,221,.10)', stroke: C.ink, 'stroke-width': 1.3});
  const u1 = svg(left, 'line', {x1: LO[0], y1: LO[1], stroke: C.s1, 'stroke-width': 3, 'marker-end': ml.s1});
  const u2 = svg(left, 'line', {x1: LO[0], y1: LO[1], stroke: C.s2, 'stroke-width': 3, 'marker-end': ml.s2});
  const u2Label = svg(left, 'text', {fill: C.s2, 'font-size': 12});
  svg(left, 'text', {x: LO[0] + LS - 6, y: LO[1] + 18, fill: C.s1, 'font-size': 12, 'text-anchor': 'middle'}, 'σ₁ = 1');
  const lCircle = svg(left, 'circle', {fill: 'rgba(252,98,85,.12)', stroke: C.j, 'stroke-width': 1.2});
  const lTrue = svg(left, 'circle', {r: 4.5, fill: 'none', stroke: C.ink, 'stroke-width': 1.6});
  const lMeas = svg(left, 'circle', {r: 3.6, fill: C.x});
  svg(left, 'text', {x: 14, y: H - 14, fill: C.dim, 'font-size': 11}, 'A squashes the unit circle flat');
  // magnifier around b
  const mag = svg(left, 'g', {transform: 'translate(206 40)'});
  svg(mag, 'rect', {width: 104, height: 104, rx: 8, fill: '#15203a', stroke: 'rgba(143,161,189,.35)'});
  const magLabel = svg(mag, 'text', {x: 8, y: 16, fill: C.dim, 'font-size': 11});
  const magCircle = svg(mag, 'circle', {fill: 'rgba(252,98,85,.12)', stroke: C.j, 'stroke-width': 1.2});
  const magTrue = svg(mag, 'circle', {r: 4.5, fill: 'none', stroke: C.ink, 'stroke-width': 1.6});
  const magMeas = svg(mag, 'circle', {r: 3.6, fill: C.x});
  const magLine = svg(mag, 'line', {stroke: C.x, 'stroke-width': 1.4});
  const leader = svg(left, 'line', {stroke: 'rgba(143,161,189,.5)', 'stroke-dasharray': '2 3'});

  // ---------- right panel, x space (zooms) ----------
  const mr = {s1: arrowMarker(right, 'inv-r1', C.s1), s2: arrowMarker(right, 'inv-r2', C.s2)};
  const rTitle = svg(right, 'text', {x: 14, y: 24, fill: C.dim}, 'what we solve for, x');
  const zoomText = svg(right, 'text', {x: W - 14, y: 24, fill: C.dim, 'text-anchor': 'end'});
  const gridG = svg(right, 'g');
  const ellipse = svg(right, 'ellipse', {fill: 'rgba(252,98,85,.13)', stroke: C.j, 'stroke-width': 1.3});
  const errLine = svg(right, 'line', {stroke: C.x, 'stroke-width': 1.6, 'stroke-dasharray': '3 3'});
  const rTrue = svg(right, 'circle', {r: 6, fill: 'none', stroke: C.ink, 'stroke-width': 1.8});
  const rTrueLabel = svg(right, 'text', {fill: C.ink, 'font-size': 11, 'text-anchor': 'end'}, 'true x = (1, 1)');
  const rTrunc = svg(right, 'rect', {width: 9, height: 9, fill: C.purple});
  const rRidge = svg(right, 'path', {fill: C.i});
  const rExact = svg(right, 'circle', {r: 5, fill: C.x});
  // fixed compass, independent of zoom
  const compass = svg(right, 'g', {transform: `translate(26 ${H - 26})`});
  svg(compass, 'line', {x1: 0, y1: 0, x2: 30, y2: 0, stroke: C.s1, 'stroke-width': 2.4, 'marker-end': mr.s1});
  svg(compass, 'line', {x1: 0, y1: 0, x2: 0, y2: -30, stroke: C.s2, 'stroke-width': 2.4, 'marker-end': mr.s2});
  svg(compass, 'text', {x: 34, y: 4, fill: C.s1, 'font-size': 11}, 'v₁');
  svg(compass, 'text', {x: -4, y: -36, fill: C.s2, 'font-size': 11}, 'v₂');

  // ---------- ruler (rebuilt for narrow screens so its labels stay readable) ----------
  const RY = 40, narrow = matchMedia('(max-width: 520px)');
  let RX0 = 70, RX1 = 620;
  const rmap = v => (RX0 + RX1) / 2 + (RX1 - RX0) / 2 * Math.sign(v) * Math.log10(1 + Math.abs(v)) / 3;
  const rulerStatic = svg(ruler, 'g');
  function buildRuler() {
    const small = narrow.matches, w = small ? 380 : 640;
    RX0 = small ? 40 : 70; RX1 = w - 20;
    ruler.setAttribute('viewBox', `0 0 ${w} 92`);
    rulerStatic.replaceChildren();
    svg(rulerStatic, 'text', {x: small ? 6 : 10, y: RY + 4, fill: C.dim, 'font-size': 12}, 'x₂');
    svg(rulerStatic, 'line', {x1: RX0, x2: RX1, y1: RY, y2: RY, stroke: C.dim});
    for (const v of small ? [-1000, -10, 0, 10, 1000] : [-1000, -100, -10, -1, 0, 1, 10, 100, 1000]) {
      const x = rmap(v);
      svg(rulerStatic, 'line', {x1: x, x2: x, y1: RY - 5, y2: RY + 5, stroke: C.dim});
      svg(rulerStatic, 'text', {x, y: RY + 22, fill: C.dim, 'font-size': 11, 'text-anchor': 'middle'}, String(v).replace('-', '−'));
    }
    svg(rulerStatic, 'text', {x: RX1, y: 84, fill: C.dim, 'font-size': 10, 'text-anchor': 'end'},
      small ? 'signed log ruler' : 'signed log ruler, the readouts give the real numbers');
  }
  buildRuler();
  const tickTrue = svg(ruler, 'line', {y1: RY - 13, y2: RY + 13, stroke: C.ink, 'stroke-width': 2});
  const dotTrunc = svg(ruler, 'rect', {y: RY - 4.5 - 10, width: 9, height: 9, fill: C.purple});
  const dotRidge = svg(ruler, 'path', {fill: C.i});
  const dotExact = svg(ruler, 'circle', {cy: RY, r: 5.5, fill: C.x});

  // ---------- state ----------
  let state, last = 'eps', view = {z: 85, cy: .9}, target = {z: 85, cy: .9}, frame = 0, prevT = null;
  const diamond = (x, y, r) => `M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z`;

  function drawRight() {
    const {z, cy} = view, s = state;
    const cx = .6, X = x => W / 2 + (x - cx) * z, Y = y => H / 2 + 12 - (y - cy) * z;
    // grid with a step that suits the zoom
    const half = (H / 2) / z, step = 10 ** Math.floor(Math.log10(half / 1.5));
    gridG.replaceChildren();
    const lo = Math.ceil((cy - half - 1) / step), hi = Math.floor((cy + half + 1) / step);
    for (let k = lo; k <= hi && hi - lo < 40; k++) {
      const y = Y(k * step);
      if (y < 34 || y > H - 4) continue;
      svg(gridG, 'line', {x1: 0, x2: W, y1: y, y2: y, stroke: k === 0 ? 'rgba(232,236,245,.35)' : C.faint});
      if ((k % 2 === 0 || hi - lo < 10) && y < H - 52) svg(gridG, 'text', {x: 6, y: y - 3, fill: C.dim, 'font-size': 10}, fmt(k * step, step < 1 ? 1 : 0));
    }
    const xl = Math.ceil((cx - W / 2 / z) / step), xh = Math.floor((cx + W / 2 / z) / step);
    for (let k = xl; k <= xh && xh - xl < 40; k++) svg(gridG, 'line', {x1: X(k * step), x2: X(k * step), y1: 34, y2: H, stroke: k === 0 ? 'rgba(232,236,245,.35)' : C.faint});
    const r = Math.abs(s.delta) > 1e-9 ? Math.abs(s.delta) : CUTOFF;
    setAttrs(ellipse, {cx: X(1), cy: Y(1), rx: Math.max(1.5, r * z), ry: Math.max(1.5, r / s.eps * z),
      'stroke-dasharray': Math.abs(s.delta) > 1e-9 ? 'none' : '3 3', 'fill-opacity': Math.abs(s.delta) > 1e-9 ? 1 : .4});
    setAttrs(rTrue, {cx: X(1), cy: Y(1)});
    setAttrs(rTrueLabel, {x: X(1) - 8, y: Y(1) - 12});
    setAttrs(errLine, {x1: X(1), y1: Y(1), x2: X(s.exact[0]), y2: Y(s.exact[1])});
    setAttrs(rExact, {cx: X(s.exact[0]), cy: Y(s.exact[1])});
    setAttrs(rTrunc, {x: X(s.truncated[0]) - 4.5 + 9, y: Y(s.truncated[1]) - 4.5});
    setAttrs(rRidge, {d: diamond(X(s.ridge[0]) - 10, Y(s.ridge[1]), 6)});
    const n = 85 / z;
    setText(zoomText, n < 1.05 ? 'zoom ×1' : `zoomed out ×${n < 10 ? fmt(n, 1) : Math.round(n).toLocaleString('en')}`);
  }

  function animateView(now) {
    const dt = prevT === null ? 16 : Math.min(now - prevT, 50); prevT = now;
    const k = 1 - Math.exp(-dt / 140);
    view.z = Math.exp(Math.log(view.z) + k * (Math.log(target.z) - Math.log(view.z)));
    view.cy += k * (target.cy - view.cy);
    drawRight();
    if (Math.abs(Math.log(view.z / target.z)) > 1e-3 || Math.abs(view.cy - target.cy) * view.z > .3) frame = requestAnimationFrame(animateView);
    else { view = {...target}; drawRight(); frame = 0; prevT = null; }
  }

  function render(logEps) {
    const eps = 10 ** logEps, delta = Number(deltaS.input.value), lambda = 10 ** Number(lambdaS.input.value);
    state = solve(eps, delta, lambda, direction.input.value);
    const s = state;
    // left panel
    setAttrs(squashed, {ry: Math.max(.6, eps * LS)});
    const [u1x, u1y] = lxy([1, 0]), [u2x, u2y] = lxy([0, eps]);
    setAttrs(u1, {x2: u1x - 6, y2: u1y});
    setAttrs(u2, {x2: u2x, y2: Math.min(u2y, LO[1] - .1), opacity: eps * LS > 7 ? 1 : 0});
    setAttrs(u2Label, {x: LO[0] - 52, y: Math.min(u2y, LO[1] - 12) - 4});
    setText(u2Label, `σ₂ = ε`);
    const tb = lxy([1, eps]), mb = lxy(s.b), r = Math.max(Math.abs(delta), 1e-9);
    setAttrs(lTrue, {cx: tb[0], cy: tb[1]}); setAttrs(lMeas, {cx: mb[0], cy: mb[1]});
    setAttrs(lCircle, {cx: tb[0], cy: tb[1], r: Math.max(1.2, (Math.abs(delta) > 1e-9 ? r : CUTOFF) * LS),
      'stroke-dasharray': Math.abs(delta) > 1e-9 ? 'none' : '2 2'});
    const magR = Math.abs(delta) > 1e-9 ? Math.abs(delta) : CUTOFF, mz = 34 / (1.25 * magR);
    const m0 = [52, 58], mxy = ([x, y]) => [m0[0] + (x - 1) * mz, m0[1] - (y - eps) * mz];
    setText(magLabel, `near b, ×${Math.round(mz / LS)}`);
    setAttrs(magCircle, {cx: m0[0], cy: m0[1], r: magR * mz, 'stroke-dasharray': Math.abs(delta) > 1e-9 ? 'none' : '2 2'});
    setAttrs(magTrue, {cx: m0[0], cy: m0[1]});
    const [mmx, mmy] = mxy(s.b); setAttrs(magMeas, {cx: mmx, cy: mmy});
    setAttrs(magLine, {x1: m0[0], y1: m0[1], x2: mmx, y2: mmy});
    setAttrs(leader, {x1: tb[0] + 4, y1: tb[1] - 4, x2: 206, y2: 98});
    // right panel target view
    const ys = [0, 1, s.exact[1], s.ridge[1], s.truncated[1], 1 + Math.max(Math.abs(delta), CUTOFF) / eps * (Math.abs(delta) > 1e-9 ? 1 : 0),
      1 - (Math.abs(delta) > 1e-9 ? Math.abs(delta) / eps : 0)];
    const ymin = Math.min(...ys, -.4), ymax = Math.max(...ys, 2.1);
    target = {z: Math.min(85, (H / 2 - 40) / ((ymax - ymin) / 2)), cy: (ymin + ymax) / 2};
    if (reducedMotion.matches) { view = {...target}; drawRight(); }
    else if (!frame) { drawRight(); frame = requestAnimationFrame(animateView); }
    // ruler
    const tx = rmap(1);
    setAttrs(tickTrue, {x1: tx, x2: tx});
    setAttrs(dotExact, {cx: rmap(s.exact[1])});
    setAttrs(dotTrunc, {x: rmap(s.truncated[1]) - 4.5});
    setAttrs(dotRidge, {d: diamond(rmap(s.ridge[1]), RY + 14, 6)});
    // numbers
    setExact(fmt(s.exact[1], 2)); setTrunc(fmt(s.truncated[1], 2)); setRidge(fmt(s.ridge[1], 2));
    setKappa(s.kappa < 10 ? fmt(s.kappa, 2) : Math.round(s.kappa).toLocaleString('en'));
    tell(s);
  }

  function tell(s) {
    const {eps, delta, lambda, dir} = s;
    const decade = clamp(Math.round(-Math.log10(eps)), 0, 4);
    const cut = eps <= CUTOFF + 1e-12, zeroErr = Math.abs(delta) < 1e-9, neg = delta < 0, start = eps > .999;
    const V1 = sym('s1', 'v₁'), V2 = sym('s2', 'v₂'), red = sym('j', 'red');
    let step, text;
    if (last === 'dir' && dir === 'v1') {
      step = 'An error along the untouched direction';
      text = `This time the error points along ${V1}, the direction A leaves alone. Undoing A does not amplify it at all, so the answer stays close to the truth however small ε gets. That is why κ = 1/ε is only the worst case, the damage depends on which way the error points.`;
    } else if (last === 'lambda') {
      step = 'Ridge, a softer fix';
      text = `Ridge does not switch the ${V2} direction off, it fades it out. Each direction gets the weight σ/(σ² + λ), which is close to 1/σ while σ is large compared with √λ and close to σ/λ once σ is much smaller. So the ${sym('i', 'green')} estimate slides smoothly from the exact answer towards zero instead of jumping at a cutoff.`;
    } else if (zeroErr) {
      step = 'No measurement error';
      text = cut
        ? `With δ = 0 the measurement is perfect, so the ${sym('x', 'exact inverse')} gets x right no matter how small ε is. Now the ${sym('purple', 'truncated')} one is the mistake, it threw away the real x₂ = 1 along with noise that was never there.`
        : `With δ = 0 the measurement is perfect, so dividing by ε is harmless and the ${sym('x', 'exact inverse')} gets x exactly right. The dotted ${red} shapes only show where errors would go if there were any.`;
    } else if (dir === 'v1') {
      step = 'An error along the untouched direction';
      text = `The error lies along ${V1}, which A does not squash, so undoing A leaves it the same size. Shrinking ε changes nothing about this answer.`;
    } else if (start) {
      step = 'Nothing squashed yet';
      text = `With ε = 1 the matrix does not squash anything, so undoing it does not stretch anything either. The little ${red} circle of possible errors stays a little circle, and x₂ comes out as 1 + δ, off by exactly the measurement error.`;
    } else if (!cut) {
      step = 'Squashing the second direction';
      text = `A now squashes the ${V2} direction down to ε, so to undo it we divide by ε and the error in that direction gets multiplied by 1/ε, ${ORDER[decade]} right now. The small ${red} circle on the left turns into a long ${red} ellipse on the right${dir === 'diag' ? ', only the part of the error along ' + V2 + ' grows, which here is about 70% of it' : ''}.`;
    } else {
      step = 'Past the cutoff';
      text = `ε is at or below the 0.01 cutoff, so the ${sym('purple', 'truncated')} inverse stops trusting the ${V2} direction and sets that part to zero. Its error cannot blow up any more, but it also throws away the real x₂ = 1. The ${sym('x', 'exact')} one keeps dividing, its error is now ${ORDER[decade]} times δ.`;
    }
    if (neg && !zeroErr && dir !== 'v1' && !start && last !== 'lambda' && !(last === 'dir' && dir === 'v1'))
      text += s.exact[1] < 0 ? ' The error points down this time, so the blow up goes the other way and x₂ ends up below zero.'
        : ' The error points down this time, so the answer gets pulled below 1 instead of above it.';
    const chips = {
      eps: [['ε, how much A squashes v₂', 'the red ellipse', 'the zoom'], ['the true x', 'the error δ', 'v₁ and v₂']],
      delta: [['the measured b', 'the exact estimate'], ['the matrix A', 'the true x']],
      lambda: [['the ridge estimate'], ['the exact and truncated estimates', 'the matrix A']],
      dir: [['which way the error points'], ['how big the error is', 'the matrix A']],
    }[last];
    const e2 = s.e[1];
    const math = [
      `x = A⁻¹b = (b₁/1, b₂/ε)   b = (${fmt(s.b[0], 3)}, ${fmt(s.b[1], 4)})`,
      `exact x₂ = (ε ${e2 < 0 ? '−' : '+'} ${fmt(Math.abs(e2), 3)})/ε = 1 ${e2 < 0 ? '−' : '+'} ${fmt(Math.abs(e2), 3)}/${eps.toFixed(4)} = ${fmt(s.exact[1], 3)}`,
      `truncated ${cut ? 'drops 1/σ₂ since ε ≤ 0.01, x₂ = 0' : 'keeps 1/σ₂ since ε > 0.01, same as exact'}`,
      `ridge x₂ = b₂·ε/(ε² + λ) = ${fmt(s.ridge[1], 3)}   with λ = ${lambda.toExponential(1)}`,
      `κ₂(A) = σ₁/σ₂ = 1/ε = ${s.kappa < 10 ? fmt(s.kappa, 2) : Math.round(s.kappa)}`,
    ].join('\n');
    say({step, text, moving: chips[0], still: chips[1], math});
  }

  const controls = transport(section, {input: epsS.input, render, secondsPerUnit: 2.2, dwell: .3, direction: -1,
    chapters: ['ε = 1', '0.1', '0.01', '0.001', '0.0001'], section});
  panels.before(section.querySelector('.lab-transport'), section.querySelector('.lab-chapters'), epsS.wrap);

  epsS.input.addEventListener('input', () => { last = 'eps'; });
  section.querySelector('.lab-transport').addEventListener('click', () => { last = 'eps'; controls.refresh(); });
  section.querySelector('.lab-chapters').addEventListener('click', () => { last = 'eps'; controls.refresh(); });
  deltaS.input.addEventListener('input', () => { last = 'delta'; controls.refresh(); });
  lambdaS.input.addEventListener('input', () => { last = 'lambda'; controls.refresh(); });
  direction.input.addEventListener('change', () => { last = 'dir'; controls.refresh(); });
  narrow.addEventListener('change', () => { buildRuler(); controls.refresh(); });
  controls.refresh();
}
