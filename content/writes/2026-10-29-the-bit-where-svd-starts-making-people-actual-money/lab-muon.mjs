// What Muon does to an update. A 2 × 2 momentum matrix G is normalised and pushed
// through Newton–Schulz steps, X ← aX + b(XXᵀ)X + c(XXᵀ)²X, which act on each singular
// value as σ ← aσ + bσ³ + cσ⁵ and leave the singular vectors alone. After a few steps
// every σ sits near 1, so the update is roughly UVᵀ, the SVD with Σ thrown away.
import {svd2, mv} from './math.mjs';
import {C, html, svg, setAttrs, setText, setHTML, stage, arrowMarker, slider, transport, fmt, sym} from './lab-core.mjs';

// the quintic coefficients from Muon's reference implementation
const A = 3.4445, B = -4.7750, Cq = 2.0315, STEPS = 5;
// a lopsided momentum, one direction dominates
const G0 = [2.4, .9, .6, .35];
const W = 640, H = 310, R = 92;   // pixels for a singular value of 1

const mm = (p, q) => [[p[0][0] * q[0][0] + p[0][1] * q[1][0], p[0][0] * q[0][1] + p[0][1] * q[1][1]],
  [p[1][0] * q[0][0] + p[1][1] * q[1][0], p[1][0] * q[0][1] + p[1][1] * q[1][1]]];
const T = p => [[p[0][0], p[1][0]], [p[0][1], p[1][1]]];
const add = (...ms) => ms.reduce((s, [k, m]) => [[s[0][0] + k * m[0][0], s[0][1] + k * m[0][1]], [s[1][0] + k * m[1][0], s[1][1] + k * m[1][1]]], [[0, 0], [0, 0]]);

// X₀ = G / ‖G‖_F, then 5 Newton–Schulz steps
function iterates(g) {
  const G = [[g[0], g[1]], [g[2], g[3]]];
  const f = Math.hypot(...g) || 1;
  let X = [[G[0][0] / f, G[0][1] / f], [G[1][0] / f, G[1][1] / f]];
  const out = [X];
  for (let k = 0; k < STEPS; k++) {
    const S = mm(X, T(X)), S2 = mm(S, S);
    X = add([A, X], [B, mm(S, X)], [Cq, mm(S2, X)]);
    out.push(X);
  }
  return out;
}

export function mount(section) {
  const stepper = slider(section, {label: 'Newton–Schulz step', min: 0, max: STEPS, value: 0});
  stepper.wrap.hidden = true; stepper.wrap.style.display = "none";

  const svgEl = stage(section, W, H, 'The unit circle under the current update matrix, with its two singular directions, next to bars for σ₁ and σ₂');
  const m1 = arrowMarker(svgEl, 'mu-a1', C.s1), m2 = arrowMarker(svgEl, 'mu-a2', C.x);
  const CX = 200, CY = 165;
  svg(svgEl, 'text', {x: 24, y: 28, fill: C.dim}, 'the circle under the update X');
  svg(svgEl, 'circle', {cx: CX, cy: CY, r: R, fill: 'none', stroke: C.dim, 'stroke-dasharray': '4 5', opacity: .55});
  svg(svgEl, 'text', {x: CX + R * .72, y: CY - R * .76, fill: C.dim, 'font-size': 11}, 'σ = 1');
  const shape = svg(svgEl, 'path', {fill: C.tint, stroke: C.ink, 'stroke-width': 1.6});
  const a1 = svg(svgEl, 'line', {x1: CX, y1: CY, stroke: C.s1, 'stroke-width': 3, 'marker-end': m1});
  const a2 = svg(svgEl, 'line', {x1: CX, y1: CY, stroke: C.x, 'stroke-width': 3, 'marker-end': m2});

  // the two singular values as bars against the target line at 1
  const BX = 430, BY = 270, BH = 110;
  svg(svgEl, 'text', {x: BX - 6, y: 28, fill: C.dim}, 'singular values of X');
  svg(svgEl, 'line', {x1: BX - 10, x2: BX + 170, y1: BY, y2: BY, stroke: C.faint});
  svg(svgEl, 'line', {x1: BX - 10, x2: BX + 170, y1: BY - BH, y2: BY - BH, stroke: C.dim, 'stroke-dasharray': '4 4'});
  svg(svgEl, 'text', {x: BX + 174, y: BY - BH + 4, fill: C.dim, 'font-size': 11}, '1');
  const bar1 = svg(svgEl, 'rect', {x: BX + 10, width: 46, rx: 6, fill: C.s1});
  const bar2 = svg(svgEl, 'rect', {x: BX + 96, width: 46, rx: 6, fill: C.x});
  const lab1 = svg(svgEl, 'text', {x: BX + 33, 'text-anchor': 'middle', fill: C.s1, 'font-size': 13});
  const lab2 = svg(svgEl, 'text', {x: BX + 119, 'text-anchor': 'middle', fill: C.x, 'font-size': 13});
  svg(svgEl, 'text', {x: BX + 33, y: BY + 20, 'text-anchor': 'middle', fill: C.dim, 'font-size': 12}, 'σ₁');
  svg(svgEl, 'text', {x: BX + 119, y: BY + 20, 'text-anchor': 'middle', fill: C.dim, 'font-size': 12}, 'σ₂');

  const foot = html(section, 'div', 'mu-foot');
  const caption = html(foot, 'p', 'mu-caption');
  caption.setAttribute('aria-live', 'polite');

  const xs = iterates(G0);
  // the directions never change, so read them once from G and keep them fixed
  const base = svd2(xs[0]);

  function render(pos) {
    const k = Math.min(Math.floor(pos), STEPS - 1), f = pos - k;
    const X = pos >= STEPS ? xs[STEPS] : add([1 - f, xs[k]], [f, xs[k + 1]]);
    const {s} = svd2(X);
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const t = i / 96 * 2 * Math.PI, p = mv(X, [Math.cos(t), Math.sin(t)]);
      pts.push(`${i ? 'L' : 'M'}${(CX + p[0] * R).toFixed(1)} ${(CY - p[1] * R).toFixed(1)}`);
    }
    setAttrs(shape, {d: pts.join('') + 'Z'});
    const up = [mv(X, base.vt[0]), mv(X, base.vt[1])];
    setAttrs(a1, {x2: CX + up[0][0] * R, y2: CY - up[0][1] * R});
    setAttrs(a2, {x2: CX + up[1][0] * R, y2: CY - up[1][1] * R});
    const h = v => Math.min(BH * 1.25, Math.max(1, v * BH));
    setAttrs(bar1, {y: BY - h(s[0]), height: h(s[0])});
    setAttrs(bar2, {y: BY - h(s[1]), height: h(s[1])});
    setAttrs(lab1, {y: BY - h(s[0]) - 6}); setText(lab1, fmt(s[0], 2));
    setAttrs(lab2, {y: BY - h(s[1]) - 6}); setText(lab2, fmt(s[1], 2));
    const ratio = fmt(s[0] / Math.max(s[1], 1e-6), 1);
    setHTML(caption, pos < .02 ? `The momentum G, ${sym('s1', 'σ₁')} is ${ratio}× ${sym('x', 'σ₂')}, so a plain step goes almost all one way.`
      : pos < STEPS - .02 ? `Step ${Math.ceil(pos)}, σ ↦ aσ + bσ³ + cσ⁵ lifts the small one and pulls the big one back, the directions stay put.`
      : `After 5 steps both σ land roughly between 0.7 and 1.2, so X ≈ UVᵀ, the SVD of G with Σ thrown away.`);
  }

  transport(foot, {input: stepper.input, render, secondsPerUnit: 1.6, dwell: .3, section, compact: true});
}
