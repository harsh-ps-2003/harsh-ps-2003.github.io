// Small, inspectable numerical kernels shared by the page and its tests.
export const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
export const mv = (a, x) => a.map(row => dot(row, x));
export const transpose = a => a[0].map((_, j) => a.map(row => row[j]));
export const rmse = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length);

// Fractional positions are explicitly an interpolation between adjacent ranks.
export const componentWeight = (position, i) => Math.max(0, Math.min(1, position - i));
export const rotate = (x, angle) => [Math.cos(angle) * x[0] - Math.sin(angle) * x[1], Math.sin(angle) * x[0] + Math.cos(angle) * x[1]];

// The picture at position q in [0, 3]: 0 input, 1 after Vᵀ, 2 after ΣVᵀ, 3 after UΣVᵀ = A.
// V from svd2 is always a rotation. A mirror in U is drawn as the sheet turning
// over (its side-on view squashes through zero) during the first half of step 3,
// followed by the rotation, so q = 2.5 is exactly diag(1, −1)ΣVᵀx.
export function geometryFrame(d, q, x) {
  const thV = Math.atan2(d.vt[0][1], d.vt[0][0]);
  let y = rotate(x, -thV * Math.max(0, Math.min(1, q)));
  if (q <= 1) return y;
  const t2 = Math.min(1, q - 1);
  y = [y[0] * (1 + t2 * (d.s[0] - 1)), y[1] * (1 + t2 * (d.s[1] - 1))];
  if (q <= 2) return y;
  const t = Math.min(1, q - 2), thU = Math.atan2(d.u[1][0], d.u[0][0]);
  if (d.u[0][0] * d.u[1][1] - d.u[0][1] * d.u[1][0] >= 0) return rotate(y, thU * t);
  if (t <= .5) return [y[0], y[1] * Math.cos(Math.PI * 2 * t)];
  return rotate([y[0], -y[1]], thU * (2 * t - 1));
}

export function solve(a, b) {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let j = 0; j < n; j++) {
    let pivot = j;
    for (let i = j + 1; i < n; i++) if (Math.abs(m[i][j]) > Math.abs(m[pivot][j])) pivot = i;
    [m[j], m[pivot]] = [m[pivot], m[j]];
    if (Math.abs(m[j][j]) < 1e-14) throw new Error('Singular system');
    const scale = m[j][j];
    for (let c = j; c <= n; c++) m[j][c] /= scale;
    for (let i = 0; i < n; i++) if (i !== j) {
      const factor = m[i][j];
      for (let c = j; c <= n; c++) m[i][c] -= factor * m[j][c];
    }
  }
  return m.map(row => row[n]);
}

export function recommend(data, position, ratings, lambda = 0.3) {
  const factors = data.movies.map((_, j) => data.s.map((s, c) =>
    data.vt[c][j] * Math.sqrt(s * componentWeight(position, c))));
  const n = data.s.length;
  const gram = Array.from({length:n}, (_, i) => Array.from({length:n}, (_, j) =>
    ratings.reduce((sum, rating) => sum + factors[rating.movie][i] * factors[rating.movie][j], i === j ? lambda : 0)));
  const rhs = Array.from({length:n}, (_, i) => ratings.reduce((sum, rating) =>
    sum + factors[rating.movie][i] * (rating.value - data.baseline), 0));
  const user = solve(gram, rhs);
  return {user, factors, scores: factors.map(q => data.baseline + dot(user, q))};
}

export function svd2(a) {
  const [p, q] = transpose(a);
  const angle = 0.5 * Math.atan2(2 * dot(p, q), dot(p, p) - dot(q, q));
  const v1 = [Math.cos(angle), Math.sin(angle)];
  const v2 = [-v1[1], v1[0]];
  const av1 = mv(a, v1), av2 = mv(a, v2);
  const s = [Math.hypot(...av1), Math.hypot(...av2)];
  const u1 = s[0] > 1e-12 ? av1.map(x => x / s[0]) : [1, 0];
  const u2 = s[1] > 1e-12 ? av2.map(x => x / s[1]) : [-u1[1], u1[0]];
  return {u: transpose([u1, u2]), s, vt: [v1, v2]};
}

export function reconstruct({u, s, vt, width, height}, k) {
  const a = new Float64Array(width * height);
  for (let i = 0; i < height; i++) {
    for (let c = 0; c < Math.ceil(k); c++) {
      const weight = u[i][c] * s[c] * componentWeight(k, c);
      for (let j = 0; j < width; j++) a[i * width + j] += weight * vt[c][j];
    }
  }
  return a;
}

// links[j] lists destinations FROM j. Empty columns redistribute uniformly.
export function transition(links) {
  const n = links.length;
  return Array.from({length: n}, (_, i) => links.map(destinations =>
    destinations.length ? (destinations.includes(i) ? 1 / destinations.length : 0) : 1 / n));
}

export function rankStep(p, t, alpha) {
  return mv(t, p).map(x => alpha * x + (1 - alpha) / p.length);
}

// --- PageRank lab helpers ---
// G = αT + (1 − α)/n · 11ᵀ, with T column stochastic (T[i][j] = chance of moving j → i).
export function pagerankMatrix(t, alpha) {
  const n = t.length;
  return t.map(row => row.map(x => alpha * x + (1 - alpha) / n));
}
// The stationary vector Gp = p, summing to 1, found by iterating from the uniform vector.
export function pagerankStationary(t, alpha, tolerance = 1e-14, maxSteps = 20000) {
  let p = Array(t.length).fill(1 / t.length);
  for (let i = 0; i < maxSteps; i++) {
    const next = rankStep(p, t, alpha);
    const change = next.reduce((s, x, j) => s + Math.abs(x - p[j]), 0);
    p = next;
    if (change < tolerance) return {p, converged: true, steps: i + 1};
  }
  return {p, converged: false, steps: maxSteps};
}
// The input direction a matrix stretches most: power iteration on MᵀM from the all-ones
// vector. Returns a unit vector v with a non-negative sum and σ₁ = ‖Mv‖.
export function topSingularVector(m, iterations = 2000) {
  const mt = transpose(m);
  let v = Array(m[0].length).fill(1 / Math.sqrt(m[0].length));
  for (let i = 0; i < iterations; i++) {
    const w = mv(mt, mv(m, v)), norm = Math.hypot(...w);
    if (norm < 1e-300) break;
    const next = w.map(x => x / norm), diff = next.reduce((s, x, j) => s + Math.abs(x - v[j]), 0);
    v = next;
    if (diff < 1e-15) break;
  }
  if (v.reduce((a, b) => a + b, 0) < 0) v = v.map(x => -x);
  return {v, sigma: Math.hypot(...mv(m, v))};
}
