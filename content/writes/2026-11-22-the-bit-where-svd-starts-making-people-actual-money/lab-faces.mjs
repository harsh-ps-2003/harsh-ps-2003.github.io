// A face as a handful of numbers: the mean face plus k eigenfaces, k going up.
// A pure animation of one new photo being rebuilt.
import {dot, componentWeight} from './math.mjs';
import {html, setText, slider, transport, drawPixels} from './lab-core.mjs';

function canvas(parent, label) {
  const c = html(parent, 'canvas');
  c.width = 40; c.height = 40;
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', label);
  return c;
}

export async function mount(section, {data}) {
  const F = (await data).faces;
  const N = F.basis.length; // 11
  const face = F.queries[0]; // a new photo of person A, an expression the training set never saw
  const z = F.basis.map(v => dot(v, face.map((x, i) => x - F.mean[i])));

  const trio = html(section, 'div', 'lab-grid-3 faces-trio');
  const fig = (label, aria) => { const f = html(trio, 'figure'); const c = canvas(f, aria); const cap = html(f, 'figcaption', '', label); return {c, cap}; };
  const photo = fig('the new photo', 'The new photo being rebuilt');
  const recon = fig('mean face + k eigenfaces', 'The mean face plus the first k eigenfaces');
  const eigen = fig('eigenface being added', 'The eigenface being added right now, negative in the text colour and positive in orange');
  drawPixels(photo.c, face);

  const line = html(section, 'p', 'faces-count');

  const ks = slider(section, {label: 'Eigenfaces kept', min: 0, max: N, value: N});
  ks.wrap.style.display = 'none';

  let shownEigen = -2;
  function render(q) {
    const w = z.map((_, i) => componentWeight(q, i));
    const out = F.mean.map((m, p) => z.reduce((s, c, j) => w[j] ? s + c * w[j] * F.basis[j][p] : s, m));
    drawPixels(recon.c, out);
    const n = Math.ceil(q - 1e-9), a = Math.max(0, n - 1);
    if (a !== shownEigen) {
      shownEigen = a;
      drawPixels(eigen.c, F.basis[a], 'signed');
      setText(eigen.cap, `eigenface ${a + 1}, added now`);
    }
    eigen.c.style.opacity = n === 0 ? .3 : 1;
    setText(line, n === 0 ? `k = 0, just the mean face` : `k = ${n} of ${N} eigenfaces`);
  }

  transport(section, {input: ks.input, render, secondsPerUnit: 1.1, dwell: .3, section, compact: true});
}
