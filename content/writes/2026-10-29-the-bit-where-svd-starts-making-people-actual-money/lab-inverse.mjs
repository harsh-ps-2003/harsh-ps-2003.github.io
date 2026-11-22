// A tiny error, a huge answer: undoing A = diag(1, ε) divides by ε, so a small
// measurement error along v₂ comes back multiplied by 1/ε.
import {C, html, svg, setAttrs, setText, stage, arrowMarker, slider, legend,
  narrator, transport, fmt, sym, reducedMotion} from './lab-core.mjs';

// A fixed measurement error δ along v₂, the squashed direction, the worst case.
const W = 320, H = 300, DELTA = .01;

function solve(eps) {
  const b = [1, eps + DELTA];
  return {eps, delta: DELTA, b, exact: [b[0], b[1] / eps], kappa: 1 / eps};
}

export function mount(section) {
  const top = html(section, 'div', 'inv-top');
  const epsS = slider(top, {label: 'The small stretch ε', min: -4, max: 0, value: 0, show: v => (10 ** v).toFixed(4)});

  const panels = html(section, 'div', 'lab-grid-2 inv-panels');
  const left = stage(html(panels, 'figure'), W, H, 'Measurement space, the true b, the measured b and the small circle of possible errors');
  const right = stage(html(panels, 'figure'), W, H, 'Solution space, the true x, the exact inverse and the ellipse the error circle turns into');
  legend(section, [['x', 'exact inverse A⁻¹b'], ['j', 'every error of size δ = 0.01'], ['s1', 'v₁'], ['s2', 'v₂']]);
  const say = narrator(section);

  // ---------- left panel, b space (fixed scale) ----------
  const LS = 100, LO = [118, 178];
  const lxy = ([x, y]) => [LO[0] + x * LS, LO[1] - y * LS];
  const ml = {s1: arrowMarker(left, 'inv-l1', C.s1), s2: arrowMarker(left, 'inv-l2', C.s2)};
  svg(left, 'text', {x: 14, y: 24, fill: C.dim}, 'what we measured, b = Ax');
  const lAxes = svg(left, 'g', {stroke: C.faint});
  svg(lAxes, 'line', {x1: 8, x2: W - 8, y1: LO[1], y2: LO[1]});
  svg(lAxes, 'line', {x1: LO[0], x2: LO[0], y1: 40, y2: H - 8});
  svg(left, 'circle', {cx: LO[0], cy: LO[1], r: LS, fill: 'none', stroke: C.dim, 'stroke-dasharray': '4 5', opacity: .5});
  const squashed = svg(left, 'ellipse', {cx: LO[0], cy: LO[1], rx: LS, fill: C.tint, stroke: C.ink, 'stroke-width': 1.3});
  const u1 = svg(left, 'line', {x1: LO[0], y1: LO[1], stroke: C.s1, 'stroke-width': 3, 'marker-end': ml.s1});
  const u2 = svg(left, 'line', {x1: LO[0], y1: LO[1], stroke: C.s2, 'stroke-width': 3, 'marker-end': ml.s2});
  const u2Label = svg(left, 'text', {fill: C.s2, 'font-size': 12});
  svg(left, 'text', {x: LO[0] + LS - 6, y: LO[1] + 18, fill: C.s1, 'font-size': 12, 'text-anchor': 'middle'}, 'σ₁ = 1');
  const lCircle = svg(left, 'circle', {fill: C.tint, stroke: C.j, 'stroke-width': 1.2});
  const lTrue = svg(left, 'circle', {r: 4.5, fill: 'none', stroke: C.ink, 'stroke-width': 1.6});
  const lMeas = svg(left, 'circle', {r: 3.6, fill: C.x});
  svg(left, 'text', {x: 14, y: H - 14, fill: C.dim, 'font-size': 11}, 'A squashes the unit circle flat');
  // magnifier around b
  const mag = svg(left, 'g', {transform: 'translate(206 40)'});
  svg(mag, 'rect', {width: 104, height: 104, rx: 8, fill: C.panel, stroke: C.faint});
  const magLabel = svg(mag, 'text', {x: 8, y: 16, fill: C.dim, 'font-size': 11});
  const magCircle = svg(mag, 'circle', {fill: C.tint, stroke: C.j, 'stroke-width': 1.2});
  const magTrue = svg(mag, 'circle', {r: 4.5, fill: 'none', stroke: C.ink, 'stroke-width': 1.6});
  const magMeas = svg(mag, 'circle', {r: 3.6, fill: C.x});
  const magLine = svg(mag, 'line', {stroke: C.x, 'stroke-width': 1.4});
  const leader = svg(left, 'line', {stroke: C.dim, 'stroke-dasharray': '2 3'});

  // ---------- right panel, x space (zooms) ----------
  const mr = {s1: arrowMarker(right, 'inv-r1', C.s1), s2: arrowMarker(right, 'inv-r2', C.s2)};
  const rTitle = svg(right, 'text', {x: 14, y: 24, fill: C.dim}, 'what we solve for, x');
  const zoomText = svg(right, 'text', {x: W - 14, y: 24, fill: C.dim, 'text-anchor': 'end'});
  const gridG = svg(right, 'g');
  const ellipse = svg(right, 'ellipse', {fill: C.tint, stroke: C.j, 'stroke-width': 1.3});
  const errLine = svg(right, 'line', {stroke: C.x, 'stroke-width': 1.6, 'stroke-dasharray': '3 3'});
  const rTrue = svg(right, 'circle', {r: 6, fill: 'none', stroke: C.ink, 'stroke-width': 1.8});
  const rTrueLabel = svg(right, 'text', {fill: C.ink, 'font-size': 11, 'text-anchor': 'end'}, 'true x = (1, 1)');
  const rExact = svg(right, 'circle', {r: 5, fill: C.x});
  // fixed compass, independent of zoom
  const compass = svg(right, 'g', {transform: `translate(26 ${H - 26})`});
  svg(compass, 'line', {x1: 0, y1: 0, x2: 30, y2: 0, stroke: C.s1, 'stroke-width': 2.4, 'marker-end': mr.s1});
  svg(compass, 'line', {x1: 0, y1: 0, x2: 0, y2: -30, stroke: C.s2, 'stroke-width': 2.4, 'marker-end': mr.s2});
  svg(compass, 'text', {x: 34, y: 4, fill: C.s1, 'font-size': 11}, 'v₁');
  svg(compass, 'text', {x: -4, y: -36, fill: C.s2, 'font-size': 11}, 'v₂');

  // ---------- state ----------
  let state, view = {z: 85, cy: .9}, target = {z: 85, cy: .9}, frame = 0, prevT = null;

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
      svg(gridG, 'line', {x1: 0, x2: W, y1: y, y2: y, stroke: k === 0 ? C.dim : C.faint});
      if ((k % 2 === 0 || hi - lo < 10) && y < H - 52) svg(gridG, 'text', {x: 6, y: y - 3, fill: C.dim, 'font-size': 10}, fmt(k * step, step < 1 ? 1 : 0));
    }
    const xl = Math.ceil((cx - W / 2 / z) / step), xh = Math.floor((cx + W / 2 / z) / step);
    for (let k = xl; k <= xh && xh - xl < 40; k++) svg(gridG, 'line', {x1: X(k * step), x2: X(k * step), y1: 34, y2: H, stroke: k === 0 ? C.dim : C.faint});
    setAttrs(ellipse, {cx: X(1), cy: Y(1), rx: Math.max(1.5, DELTA * z), ry: Math.max(1.5, DELTA / s.eps * z)});
    setAttrs(rTrue, {cx: X(1), cy: Y(1)});
    setAttrs(rTrueLabel, {x: X(1) - 8, y: Y(1) - 12});
    setAttrs(errLine, {x1: X(1), y1: Y(1), x2: X(s.exact[0]), y2: Y(s.exact[1])});
    setAttrs(rExact, {cx: X(s.exact[0]), cy: Y(s.exact[1])});
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
    const eps = 10 ** logEps;
    state = solve(eps);
    const s = state;
    // left panel
    setAttrs(squashed, {ry: Math.max(.6, eps * LS)});
    const [u1x, u1y] = lxy([1, 0]), [u2x, u2y] = lxy([0, eps]);
    setAttrs(u1, {x2: u1x - 6, y2: u1y});
    setAttrs(u2, {x2: u2x, y2: Math.min(u2y, LO[1] - .1), opacity: eps * LS > 7 ? 1 : 0});
    setAttrs(u2Label, {x: LO[0] - 52, y: Math.min(u2y, LO[1] - 12) - 4});
    setText(u2Label, `σ₂ = ε`);
    const tb = lxy([1, eps]), mb = lxy(s.b);
    setAttrs(lTrue, {cx: tb[0], cy: tb[1]}); setAttrs(lMeas, {cx: mb[0], cy: mb[1]});
    setAttrs(lCircle, {cx: tb[0], cy: tb[1], r: Math.max(1.2, DELTA * LS)});
    const mz = 34 / (1.25 * DELTA);
    const m0 = [52, 58], mxy = ([x, y]) => [m0[0] + (x - 1) * mz, m0[1] - (y - eps) * mz];
    setText(magLabel, `near b, ×${Math.round(mz / LS)}`);
    setAttrs(magCircle, {cx: m0[0], cy: m0[1], r: DELTA * mz});
    setAttrs(magTrue, {cx: m0[0], cy: m0[1]});
    const [mmx, mmy] = mxy(s.b); setAttrs(magMeas, {cx: mmx, cy: mmy});
    setAttrs(magLine, {x1: m0[0], y1: m0[1], x2: mmx, y2: mmy});
    setAttrs(leader, {x1: tb[0] + 4, y1: tb[1] - 4, x2: 206, y2: 98});
    // right panel, zoom out until the whole error ellipse fits
    const ys = [0, 1, s.exact[1], 1 + DELTA / eps, 1 - DELTA / eps];
    const ymin = Math.min(...ys, -.4), ymax = Math.max(...ys, 2.1);
    target = {z: Math.min(85, (H / 2 - 40) / ((ymax - ymin) / 2)), cy: (ymin + ymax) / 2};
    if (reducedMotion.matches) { view = {...target}; drawRight(); }
    else if (!frame) { drawRight(); frame = requestAnimationFrame(animateView); }
    tell(s);
  }

  // one short live sentence, with the number that matters
  function tell({eps, exact, kappa}) {
    const V2 = sym('s2', 'v₂'), x2 = sym('x', `x₂ = ${exact[1] < 100 ? fmt(exact[1], 2) : Math.round(exact[1]).toLocaleString('en')}`);
    const k = kappa < 10 ? fmt(kappa, 1) : Math.round(kappa).toLocaleString('en');
    say({text: eps > .999
      ? `With ε = 1 nothing is squashed, so ${x2} is off by just the error δ = 0.01.`
      : `Undoing A divides by ε, so the error along ${V2} grows ${k} times and ${x2} instead of 1.`});
  }

  const controls = transport(section, {input: epsS.input, render, secondsPerUnit: 2.2, dwell: .3, direction: -1, compact: true, section});
  // the play button sits next to the ε slider, above the two panels
  top.prepend(section.querySelector('.lab-transport'));
  controls.refresh();
}
