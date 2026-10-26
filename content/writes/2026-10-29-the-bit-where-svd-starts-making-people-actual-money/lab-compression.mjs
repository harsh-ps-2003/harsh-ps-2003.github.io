// Rebuild a picture, one layer at a time: A_k = σ₁u₁v₁ᵀ + … + σ_k u_k v_kᵀ.
import {C, html, svg, setAttrs, setText, setHTML, stage, slider, choice, row, readouts, legend,
  narrator, transport, tween, drawPixels, fmt, pct, sym, clamp, lerp} from './lab-core.mjs';

const N = 80, PIX = N * N, PER = 2 * N + 1; // each layer stores u (80) + v (80) + σ (1)
const KINDS = [['landscape', 'A little landscape'], ['noise', 'Seeded random noise'], ['noisy', 'Landscape + noise']];
const sub = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
const grouped = n => Math.round(n).toLocaleString('en-US');
const FLOOR = -5;           // spectrum shows σᵢ/σ₁ down to 10⁻⁵
const ERR_TOP = .2;         // denoising chart y range, RMSE 0 … 0.2

// Cumulative reconstructions, energies and error curves, built once per picture.
function prepare(img) {
  const frames = [new Float64Array(PIX)];
  for (let c = 0; c < N; c++) {
    const next = Float64Array.from(frames[c]);
    for (let i = 0; i < N; i++) {
      const w = img.s[c] * img.u[i][c];
      if (w) { const v = img.vt[c]; for (let j = 0; j < N; j++) next[i * N + j] += w * v[j]; }
    }
    frames.push(next);
  }
  const sq = img.s.map(x => x * x), total = sq.reduce((a, b) => a + b, 0), cum = [0];
  sq.forEach((x, i) => cum.push(cum[i] + x));
  const rmseTo = (ref, f) => { let e = 0; for (let i = 0; i < PIX; i++) e += (ref[i] - f[i]) ** 2; return Math.sqrt(e / PIX); };
  const errObs = frames.map(f => rmseTo(img.original, f));
  const errClean = img.clean ? frames.map(f => rmseTo(img.clean, f)) : null;
  let best = 0;
  if (errClean) errClean.forEach((e, k) => { if (e < errClean[best]) best = k; });
  const rank = img.s.filter(x => x > 1e-6 * img.s[0]).length;
  return {img, frames, sq, total, cum, errObs, errClean, best, rank, rmseTo};
}

export async function mount(section, {data}) {
  const images = (await data).images;
  const cache = {};
  const get = kind => cache[kind] ??= prepare(images[kind]);

  // ---- controls ----
  const top = row(section);
  const picker = choice(top, {label: 'Picture', options: KINDS, value: 'landscape'});
  const ks = slider(top, {label: 'Layers kept', min: 0, max: N, value: 3, show: v => Number.isInteger(v) ? `${v} / 80` : `${fmt(v, 2)} / 80`});

  // ---- the two pictures ----
  const pics = html(section, 'div', 'lab-grid-2 cmp-pics');
  const fig = (label, aria) => {
    const f = html(pics, 'figure'); const c = html(f, 'canvas');
    c.width = N; c.height = N; c.setAttribute('role', 'img'); c.setAttribute('aria-label', aria);
    return {canvas: c, caption: html(f, 'figcaption', '', label)};
  };
  const original = fig('the original', 'The original 80 by 80 grayscale picture');
  const rebuilt = fig('rebuilt from 3 layers', 'The picture rebuilt from the kept layers');

  // ---- the newest layer, drawn as column × row ----
  const box = html(section, 'div', 'cmp-op-box');
  box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'The newest layer is one column pattern times one row pattern');
  const op = html(box, 'div', 'cmp-op');
  const corner = html(op, 'div', 'cmp-corner', 'σ×');
  const vWrap = html(op, 'div', 'cmp-strip cmp-strip-v');
  const vCanvas = html(vWrap, 'canvas'); vCanvas.width = N; vCanvas.height = 1;
  const vMark = html(vWrap, 'i', 'cmp-mark');
  const uWrap = html(op, 'div', 'cmp-strip cmp-strip-u');
  const uCanvas = html(uWrap, 'canvas'); uCanvas.width = 1; uCanvas.height = N;
  const uMark = html(uWrap, 'i', 'cmp-mark');
  const lWrap = html(op, 'div', 'cmp-layer');
  const lCanvas = html(lWrap, 'canvas'); lCanvas.width = N; lCanvas.height = N;
  lCanvas.setAttribute('role', 'img'); lCanvas.setAttribute('aria-label', 'The newest layer, negative values in the text colour and positive ones in orange');
  const crossH = html(lWrap, 'i', 'cmp-cross cmp-cross-h'), crossV = html(lWrap, 'i', 'cmp-cross cmp-cross-v');
  const explain = html(box, 'div', 'cmp-explain');
  const layerTitle = html(explain, 'p', 'cmp-title');
  html(explain, 'p', 'cmp-line', 'This layer is one column pattern (left strip) times one row pattern (top strip), scaled by its σ. Every pixel is just three numbers multiplied together, which is why a single layer can only draw stripes and checks.');
  const weightBar = html(html(explain, 'div', 'cmp-weight'), 'span');
  const weightText = html(explain, 'p', 'cmp-weight-text');
  const cellMath = html(explain, 'p', 'cmp-cell');
  html(explain, 'p', 'cmp-hint', 'Point at the layer to pick a pixel.');

  const say = narrator(section);

  // ---- spectrum: log bars + energy curve ----
  const SW = 640, SH = 200, X0 = 58, X1 = 592, YT = 40, YB = 160, BW = (X1 - X0) / N;
  const spec = stage(section, SW, SH, 'Each layer’s σ on a log scale, the kept layers lit, with the share of energy kept drawn as a curve');
  svg(spec, 'text', {x: 16, y: 20, style: `font-size:12px;fill:${C.dim}`}, 'how big each layer is, σᵢ / σ₁, log scale');
  svg(spec, 'text', {x: SW - 16, y: 20, style: `font-size:12px;fill:${C.s2}`, 'text-anchor': 'end'}, 'energy kept');
  const logY = r => YB - (Math.max(FLOOR, Math.log10(Math.max(r, 1e-300))) - FLOOR) / -FLOOR * (YB - YT);
  for (let e = 0; e >= FLOOR; e--) {
    const y = logY(10 ** e);
    svg(spec, 'line', {x1: X0, x2: X1, y1: y, y2: y, stroke: C.faint});
    svg(spec, 'text', {x: X0 - 8, y: y + 4, 'text-anchor': 'end', style: `font-size:11px;fill:${C.dim}`}, e === 0 ? '1' : e === -1 ? '0.1' : `10${'⁻' + '⁰¹²³⁴⁵⁶⁷⁸⁹'[-e]}`);
  }
  for (const [p, label] of [[0, '0%'], [.5, '50%'], [1, '100%']])
    svg(spec, 'text', {x: X1 + 8, y: YB - p * (YB - YT) + 4, style: `font-size:11px;fill:${C.s2}`}, label);
  const bars = Array.from({length: N}, (_, i) => svg(spec, 'rect', {x: X0 + i * BW + .6, width: BW - 1.2, rx: 1}));
  const curve = svg(spec, 'polyline', {fill: 'none', stroke: C.s2, 'stroke-width': 2});
  const curveDot = svg(spec, 'circle', {r: 4, fill: C.s2});
  const marker = svg(spec, 'line', {y1: YT - 6, y2: YB, stroke: C.x, 'stroke-width': 2});
  const markerText = svg(spec, 'text', {y: YT + 12, style: `font-size:12px;fill:${C.x}`});
  svg(spec, 'text', {x: X0, y: YB + 18, style: `font-size:11px;fill:${C.dim}`}, 'layer 1');
  svg(spec, 'text', {x: X0 + 40 * BW, y: YB + 18, style: `font-size:11px;fill:${C.dim}`, 'text-anchor': 'middle'}, '40');
  svg(spec, 'text', {x: X1, y: YB + 18, style: `font-size:11px;fill:${C.dim}`, 'text-anchor': 'end'}, '80');
  const rankNote = svg(spec, 'text', {x: SW / 2, y: YB + 34, style: `font-size:11px;fill:${C.dim}`, 'text-anchor': 'middle'});

  // ---- denoising chart (landscape + noise only) ----
  const DH = 224, DY0 = 48, DY1 = 160;
  const den = stage(section, SW, DH, 'Error against the noisy picture and against the clean picture for every number of layers', 'cmp-denoise');
  svg(den, 'text', {x: 16, y: 22, style: `font-size:12px;fill:${C.dim}`}, 'error, RMSE, for every number of layers');
  const errY = e => DY1 - Math.min(e, ERR_TOP) / ERR_TOP * (DY1 - DY0);
  const errX = k => X0 + k * (X1 - X0) / N;
  for (const e of [0, .05, .1, .15, .2]) {
    svg(den, 'line', {x1: X0, x2: X1, y1: errY(e), y2: errY(e), stroke: C.faint});
    svg(den, 'text', {x: X0 - 8, y: errY(e) + 4, 'text-anchor': 'end', style: `font-size:11px;fill:${C.dim}`}, e.toFixed(2));
  }
  svg(den, 'text', {x: X0, y: DY1 + 18, style: `font-size:11px;fill:${C.dim}`}, '0 layers');
  svg(den, 'text', {x: X1, y: DY1 + 18, style: `font-size:11px;fill:${C.dim}`, 'text-anchor': 'end'}, '80');
  const bestLine = svg(den, 'line', {y1: DY0, y2: DY1, stroke: C.pos, 'stroke-dasharray': '4 4', opacity: .7});
  const bestText = svg(den, 'text', {y: DY0 - 8, style: `font-size:11px;fill:${C.pos}`, 'text-anchor': 'middle'});
  const obsLine = svg(den, 'polyline', {fill: 'none', stroke: C.s2, 'stroke-width': 2});
  const cleanLine = svg(den, 'polyline', {fill: 'none', stroke: C.pos, 'stroke-width': 2.4});
  const obsDot = svg(den, 'circle', {r: 4.5, fill: C.s2}), cleanDot = svg(den, 'circle', {r: 4.5, fill: C.pos});
  const denMark = svg(den, 'line', {y1: DY0, y2: DY1, stroke: C.x, 'stroke-width': 1.5, opacity: .8});
  svg(den, 'text', {x: X0, y: DY1 + 38, style: `font-size:11px;fill:${C.s2}`}, '━ error against the noisy picture we were given');
  svg(den, 'text', {x: X0, y: DY1 + 55, style: `font-size:11px;fill:${C.pos}`}, '━ error against the clean picture, our secret');

  // ---- storage bar ----
  const store = html(section, 'div', 'cmp-store');
  const storeLabel = html(store, 'p', 'cmp-store-label');
  const track = html(store, 'div', 'cmp-store-track');
  const fill = html(track, 'span', 'cmp-store-fill');
  const one = html(track, 'i', 'cmp-store-one'); one.style.left = `${100 * PIX / (N * PER)}%`;
  html(one, 'em', '', '1×, the 6,400 pixels');

  const [setEnergy, setError, setStored, setClean] = readouts(section, [
    {label: 'energy kept, the share of Σσᵢ²'}, {label: 'RMSE against the picture shown'},
    {label: 'numbers stored vs the pixels'}, {label: 'RMSE against the clean picture', cls: 'pos'}]);
  const cleanCell = section.querySelector('.lab-readouts').lastElementChild;
  html(section, 'p', 'lab-intro cmp-note', 'Energy kept is a sum of squared pixel values, so it is not the same thing as how recognisable the picture is. Numbers stored is a count of numbers, not a file size, real codecs like JPEG do a lot more.');

  // ---- state ----
  let kind = '', P = null, shownLayer = -1, cell = [17, 58];
  const blend = new Float64Array(PIX);
  const shown = {u: new Float64Array(N), v: new Float64Array(N), layer: new Float64Array(PIX)};
  const layerOf = a => {
    const {s, u, vt} = P.img, out = new Float64Array(PIX);
    for (let i = 0; i < N; i++) { const w = s[a] * u[i][a]; for (let j = 0; j < N; j++) out[i * N + j] = w * vt[a][j]; }
    return {u: Float64Array.from(u, r => r[a]), v: Float64Array.from(vt[a]), layer: out};
  };
  const drawLayer = () => {
    drawPixels(uCanvas, shown.u, 'signed'); drawPixels(vCanvas, shown.v, 'signed'); drawPixels(lCanvas, shown.layer, 'signed');
  };
  function showLayer(a, instant) {
    if (a === shownLayer) return;
    shownLayer = a;
    const target = layerOf(a), from = {u: shown.u.slice(), v: shown.v.slice(), layer: shown.layer.slice()};
    tween('cmp-layer', 0, 1, instant ? 0 : 260, t => {
      for (const key of ['u', 'v', 'layer']) for (let i = 0; i < target[key].length; i++) shown[key][i] = lerp(from[key][i], target[key][i], t);
      drawLayer();
    });
  }

  function setKind(next) {
    const first = !P;
    kind = next; P = get(kind); shownLayer = -1;
    drawPixels(original.canvas, P.img.original);
    const heights = P.img.s.map(x => logY(x / P.img.s[0]));
    const old = bars.map(b => Number(b.getAttribute('y') || YB));
    tween('cmp-bars', old, heights, first ? 0 : 450, ys => bars.forEach((b, i) => setAttrs(b, {y: ys[i], height: Math.max(0, YB - ys[i])})));
    setAttrs(curve, {points: P.cum.map((c, i) => `${X0 + i * BW},${YB - c / P.total * (YB - YT)}`).join(' ')});
    setText(rankNote, P.rank < N ? `σ is 0 after layer ${P.rank}, this picture only has rank ${P.rank}` : '');
    const noisy = !!P.errClean;
    den.style.display = noisy ? '' : 'none'; cleanCell.style.display = noisy ? '' : 'none';
    if (noisy) {
      setAttrs(obsLine, {points: P.errObs.map((e, k) => `${errX(k)},${errY(e)}`).join(' ')});
      setAttrs(cleanLine, {points: P.errClean.map((e, k) => `${errX(k)},${errY(e)}`).join(' ')});
      setAttrs(bestLine, {x1: errX(P.best), x2: errX(P.best)});
      setAttrs(bestText, {x: errX(P.best)}); setText(bestText, `cleanest at k = ${P.best}`);
    }
  }

  function render(q) {
    if (picker.input.value !== kind) setKind(picker.input.value);
    const {img, frames, sq, total, cum} = P;
    const k = Math.min(N - 1, Math.floor(q)), t = q >= N ? 1 : q - k;
    for (let i = 0; i < PIX; i++) blend[i] = frames[k][i] + t * (frames[k + 1][i] - frames[k][i]);
    drawPixels(rebuilt.canvas, blend);
    const whole = Number.isInteger(q);
    setText(rebuilt.caption, whole ? `rebuilt from ${q} layer${q === 1 ? '' : 's'}` : `rebuilt from ${k} layers + ${Math.round(t * 100)}% of layer ${k + 1}`);

    // exact energy and error of A(t) = A_k + t σ_{k+1} u_{k+1} v_{k+1}ᵀ (layers are orthogonal)
    const kept = q >= N ? total : cum[k] + t * t * sq[k];
    const left = q >= N ? 0 : (1 - t) ** 2 * sq[k] + (total - cum[k + 1]);
    const err = Math.sqrt(Math.max(0, left) / PIX);
    const storedCount = Math.ceil(q - 1e-9) * PER, ratio = storedCount / PIX;
    setEnergy(pct(kept / total, 2)); setError(fmt(err, 4)); setStored(`${fmt(ratio, 2)}×`);

    // the newest layer
    const a = q <= 1e-9 ? 0 : Math.min(N - 1, Math.ceil(q - 1e-9) - 1), w = clamp(q - a, 0, 1);
    showLayer(a, shownLayer === -1);
    setHTML(layerTitle, `Layer ${a + 1} · ${sym('s1', `σ${sub(a + 1)} = ${fmt(img.s[a], 3)}`)}`);
    weightBar.style.width = pct(w, 1);
    setText(weightText, w <= 1e-9 ? 'next up, not added yet' : w >= 1 - 1e-9 ? 'fully added to the picture' : `fading in, ${Math.round(w * 100)}% added`);
    const [ci, cj] = cell;
    const value = img.s[a] * img.u[ci][a] * img.vt[a][cj];
    setText(cellMath, `pixel (row ${ci + 1}, column ${cj + 1}) = σ × u[${ci + 1}] × v[${cj + 1}] = ${fmt(img.s[a], 3)} × ${fmt(img.u[ci][a], 3)} × ${fmt(img.vt[a][cj], 3)} = ${fmt(value, 4)}`);
    uMark.style.top = `${100 * ci / N}%`; vMark.style.left = `${100 * cj / N}%`;
    crossH.style.top = `${100 * (ci + .5) / N}%`; crossV.style.left = `${100 * (cj + .5) / N}%`;

    // spectrum
    bars.forEach((b, i) => {
      const on = i < k || (i === k && t > 0) || q >= N;
      const weight = i < Math.floor(q) || q >= N ? 1 : i === k ? t : 0;
      setAttrs(b, {fill: on ? C.pos : C.dim, opacity: on ? .35 + .65 * weight : .3});
    });
    const mx = X0 + q * BW;
    setAttrs(marker, {x1: mx, x2: mx}); setAttrs(markerText, mx > X1 - 70 ? {x: mx - 6, 'text-anchor': 'end'} : {x: mx + 6, 'text-anchor': 'start'}); setText(markerText, `k = ${whole ? q : fmt(q, 1)}`);
    setAttrs(curveDot, {cx: mx, cy: YB - kept / total * (YB - YT)});

    // denoising
    let clean = null;
    if (P.errClean) {
      clean = P.rmseTo(img.clean, blend);
      setClean(fmt(clean, 4));
      const dx = errX(q);
      setAttrs(denMark, {x1: dx, x2: dx});
      setAttrs(obsDot, {cx: dx, cy: errY(err)}); setAttrs(cleanDot, {cx: dx, cy: errY(clean)});
    }

    // storage
    fill.style.width = `${100 * storedCount / (N * PER)}%`;
    fill.dataset.over = String(ratio > 1);
    setText(storeLabel, `numbers stored, ${grouped(storedCount)} (that is ${Math.ceil(q - 1e-9)} × 161) against the ${grouped(PIX)} pixels of the original, ${fmt(ratio, 2)}×`);

    tell(q, k, t, whole, kept / total, err, clean, ratio);
  }

  function tell(q, k, t, whole, energy, err, clean, ratio) {
    const name = KINDS.find(x => x[0] === kind)[1];
    const n = Math.ceil(q - 1e-9);
    const step = q <= 1e-9 ? `${name} · no layers yet` : whole ? `${name} · ${q} of 80 layers` : `${name} · adding layer ${k + 1}`;
    let text;
    if (q <= 1e-9) {
      text = 'With zero layers the rebuilt matrix is all zeros, so every pixel is black. Press play and the layers come back one by one, biggest first.';
    } else if (q >= N - 1e-9) {
      text = kind === 'noisy' ? 'All 80 layers rebuild the noisy picture exactly, noise and all. Perfect copy, worse picture.'
        : `All 80 layers are back, so this is an exact copy of the original. Any matrix comes back perfectly if you keep every layer, the trick is how few you can get away with.${kind === 'landscape' ? ` For this one the layers after ${P.rank} are zero anyway.` : ''}`;
    } else if (kind === 'noise') {
      text = n <= 3 ? 'Random noise has no big patterns to find. Look at the spectrum, after the first bar (that is just the average grey) the bars are almost flat, so no single layer explains much.'
        : n < 40 ? 'Even with a lot of layers this still looks like fuzz. Every layer you add fixes only a tiny bit, because there is nothing simple hiding inside noise, so keeping fewer layers just throws real information away.'
        : 'Past 40 layers storing the layers costs more numbers than the 6,400 pixels themselves, and the picture still is not right. Noise is the worst case for this kind of compression.';
    } else if (kind === 'noisy') {
      const b = P.best;
      text = n < b - 1 ? 'The first layers grab the landscape. Its big shapes are strong enough to stand out from the noise, so these layers are mostly picture.'
        : n <= b + 2 ? `This is about where the picture looks cleanest. The error against the clean picture bottoms out around k = ${b}, the big shapes are in and most of the noise is still left out. We only know this because we made the noise ourselves, with a real photo you never get to see the clean version.`
        : 'From here every layer gets us closer to the noisy picture we were given but further from the clean one. Look at the orange curve going back up, the extra layers are mostly rebuilding noise.';
    } else {
      text = n <= 1 ? 'The first layer is one column pattern times one row pattern, so all it can draw is a soft grid of light and dark, brighter at the top where the sky is. Even so, it already holds about 95% of the energy.'
        : n <= 4 ? 'A few layers in and the big shapes show up, the sky getting darker towards the ground and the rough line of the hills. Each layer is still only stripes (look at the newest one), but stripes add up.'
        : n <= 15 ? 'Now the house and the sun start to separate from the background. Each new layer fixes whatever the earlier ones got most wrong, so the error falls quickly.'
        : n < 40 ? 'From here layers mostly sharpen edges, the slope of the roof and the steps along the hills. Your eye cares about them, but they carry so little energy that the energy number barely moves.'
        : `You are past the break-even point. Storing ${n} layers takes ${grouped(n * PER)} numbers, more than the 6,400 pixels themselves, so as compression this stopped making sense around 40 layers.`;
    }
    const moving = whole ? [] : [`layer ${k + 1} fading in`, 'the rebuilt picture', 'the energy and error'];
    const done = whole ? q : k;
  const still = ['the original', 'every layer pattern', ...(done > 0 ? [done === 1 ? 'the first layer' : `the first ${done} layers`] : [])];
    const eq = q <= 1e-9 ? 'A₀ = 0, every pixel is 0'
      : whole ? `A${sub(q)} = σ₁u₁v₁ᵀ + … + σ${sub(q)}u${sub(q)}v${sub(q)}ᵀ, the best picture of rank ${q} or less`
      : `A(t) = A${sub(k)} + ${fmt(t)} × σ${sub(k + 1)}u${sub(k + 1)}v${sub(k + 1)}ᵀ, a fade between ranks ${k} and ${k + 1}, not a rank of ${fmt(q, 2)}`;
    const tail = `\nenergy kept = ${pct(energy, 2)}    RMSE = √(leftover σ² / 6400) = ${fmt(err, 4)}${clean !== null ? `    against clean = ${fmt(clean, 4)}` : ''}    stored ${fmt(ratio, 2)}×`;
    say({step, text, moving, still, math: eq + tail});
  }

  const controls = transport(section, {input: ks.input, render, dwell: .18, section,
    secondsPerUnit: k => k < 10 ? 1.15 : k < 24 ? .42 : .13});
  pics.before(section.querySelector('.lab-transport'));

  picker.input.addEventListener('change', () => { controls.refresh(); });
  const pick = e => {
    const r = lCanvas.getBoundingClientRect();
    const j = clamp(Math.floor((e.clientX - r.left) / r.width * N), 0, N - 1), i = clamp(Math.floor((e.clientY - r.top) / r.height * N), 0, N - 1);
    if (i !== cell[0] || j !== cell[1]) { cell = [i, j]; controls.refresh(); }
  };
  lCanvas.addEventListener('pointermove', pick);
  lCanvas.addEventListener('pointerdown', pick);
}
