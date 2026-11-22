// Rebuild a picture, one layer at a time: A_k = σ₁u₁v₁ᵀ + … + σ_k u_k v_kᵀ.
// A pure animation, the rank climbs and a single line counts the cost.
import {html, setText, slider, transport, drawPixels} from './lab-core.mjs';

const N = 80, PIX = N * N, PER = 2 * N + 1; // each layer stores u (80) + v (80) + σ (1)

// Cumulative reconstructions A_0 … A_N, built once.
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
  const rank = img.s.filter(x => x > 1e-6 * img.s[0]).length;
  return {frames, rank};
}

export async function mount(section, {data}) {
  const img = (await data).images.landscape;
  const {frames, rank} = prepare(img);
  const last = rank; // past the rank every layer is zero, so stop at the exact copy

  const pics = html(section, 'div', 'lab-grid-2 cmp-pics');
  const fig = (label, aria) => {
    const f = html(pics, 'figure'); const c = html(f, 'canvas');
    c.width = N; c.height = N; c.setAttribute('role', 'img'); c.setAttribute('aria-label', aria);
    html(f, 'figcaption', '', label);
    return c;
  };
  const original = fig('the original', 'The original 80 by 80 grayscale picture');
  const rebuilt = fig('rebuilt from the first k layers', 'The picture rebuilt from the first k layers');
  drawPixels(original, img.original);

  const line = html(section, 'p', 'cmp-count');
  line.setAttribute('aria-live', 'off');

  // hidden position driver for the transport
  const ks = slider(section, {label: 'Layers kept', min: 0, max: last, value: last});
  ks.wrap.style.display = 'none';

  const blend = new Float64Array(PIX);
  function render(q) {
    const k = Math.min(last - 1, Math.floor(q)), t = q >= last ? 1 : q - k;
    for (let i = 0; i < PIX; i++) blend[i] = frames[k][i] + t * (frames[k + 1][i] - frames[k][i]);
    drawPixels(rebuilt, blend);
    const n = Math.ceil(q - 1e-9), share = n * PER / PIX;
    const tail = n >= last ? (share > 1 ? `, an exact copy but bigger than the picture itself` : `, an exact copy`) : share > 1 ? `, more than the picture itself` : '';
    setText(line, `k = ${n} layer${n === 1 ? '' : 's'}, ${Math.round(100 * share)}% of the numbers${tail}`);
  }

  transport(section, {input: ks.input, render, dwell: .18, section, compact: true,
    secondsPerUnit: k => k < 10 ? 1 : k < 24 ? .4 : .14});
}
