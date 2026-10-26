// A face as a handful of numbers: mean face + a few eigenfaces, and where a
// face sits in "face space".
import {dot, rmse, componentWeight} from './math.mjs';
import {C, html, svg, setAttrs, setText, setHTML, stage, slider, choice, row, readouts, legend,
  narrator, transport, tween, drawPixels, fmt, pct, sym, clamp} from './lab-core.mjs';

const WHO = ['A', 'B', 'C', 'D'];
// one marker shape per person, all in the ink colour, so the orange query stands out
const SHAPES = [
  r => `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
  r => `M${-.85 * r} ${-.85 * r}h${1.7 * r}v${1.7 * r}h${-1.7 * r}z`,
  r => `M0 ${-1.15 * r}L${1.1 * r} ${.8 * r}H${-1.1 * r}z`,
  r => `M0 ${-1.2 * r}L${1.2 * r} 0L0 ${1.2 * r}L${-1.2 * r} 0z`,
];
const PERSON_CLS = ['face0', 'face1', 'face2', 'face3'];
const MW = 640, MH = 330, BW = 640, BH = 170;

function canvas(parent, label, cls = '') {
  const c = html(parent, 'canvas', cls);
  c.width = 40; c.height = 40;
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', label);
  return c;
}

export async function mount(section, {data}) {
  const F = (await data).faces;
  const N = F.basis.length; // 11
  const center = f => f.map((x, i) => x - F.mean[i]);
  const coords = f => { const c = center(f); return F.basis.map(v => dot(v, c)); };
  const trainingZ = F.training.map(coords);
  const lit = (who, light) => F.queries[who].map((x, i) => clamp(x + light * F.lights[who][i], 0, 1));

  // ---- controls ----
  const top = row(section);
  const person = choice(top, {label: 'Whose new photo?', options: WHO.map((w, i) => [i, `person ${w}`]), value: 0});
  const light = slider(top, {label: 'Side lighting', min: -.6, max: .6, step: .02, value: 0,
    show: v => v === 0 ? 'even' : `${fmt(Math.abs(v))} ${v < 0 ? 'left' : 'right'}`});
  const kSlider = slider(section, {label: 'Eigenfaces kept', min: 0, max: N, value: 3, show: v => `${fmt(v, 2)} of ${N}`});

  // ---- the three faces ----
  const trio = html(section, 'div', 'lab-grid-3 faces-trio');
  const fig = (label, aria) => { const f = html(trio, 'figure'); const c = canvas(f, aria); const cap = html(f, 'figcaption', '', label); return {c, cap}; };
  const queryFig = fig('the new photo', 'The new query face');
  const reconFig = fig('rebuilt from the kept numbers', 'Mean face plus the kept eigenfaces');
  const nearFig = fig('nearest training face', 'Nearest training face in face space');

  // ---- the visual equation strip ----
  html(section, 'h4', '', 'The recipe');
  const strip = html(section, 'div', 'faces-strip');
  strip.setAttribute('aria-label', 'The rebuilt face as the mean face plus coefficients times eigenfaces');
  const cell = (cls = '') => html(strip, 'div', `faces-term ${cls}`.trim());
  const op = t => html(strip, 'span', 'faces-op', t);
  const qCell = cell('faces-endcap'); const qCanvas = canvas(qCell, 'The query'); html(qCell, 'span', 'faces-term-name', 'new photo');
  op('≈');
  const mCell = cell(); const mCanvas = canvas(mCell, 'The mean face'); html(mCell, 'span', 'faces-term-name', 'average μ');
  const terms = F.basis.map((v, i) => {
    op('+');
    const t = cell('faces-eigen');
    const coef = html(t, 'span', 'faces-coef', '×0');
    const c = canvas(t, `Eigenface ${i + 1}, negative in the text colour and positive in orange`);
    drawPixels(c, v, 'signed');
    const meter = html(t, 'span', 'faces-meter'); const fill = html(meter, 'span');
    html(t, 'span', 'faces-term-name', `eigenface ${i + 1}`);
    return {t, coef, fill};
  });
  op('=');
  const rCell = cell('faces-endcap'); const rCanvas = canvas(rCell, 'The rebuilt face'); html(rCell, 'span', 'faces-term-name', 'rebuilt');
  drawPixels(mCanvas, F.mean);

  // ---- face space map ----
  html(section, 'h4', '', 'Face space, the first two numbers');
  const map = stage(section, MW, MH, 'Training faces and the new photo plotted by their first two eigenface coordinates');
  const coefBars = stage(section, BW, BH, 'The new photo coordinates on all eleven eigenfaces, with the kept ones bright', 'faces-bars');
  legend(section, [...WHO.map((w, i) => [PERSON_CLS[i], `person ${w}, training photos`]), ['x', 'the new photo']]);
  const say = narrator(section);
  const [setVar, setErr, setDist, setNear] = readouts(section, [
    {label: 'training variation kept'}, {label: 'rebuild error, RMSE'},
    {label: 'distance to nearest'}, {label: 'nearest training face'}]);
  html(section, 'p', 'lab-intro faces-note',
    'Toy data, four drawn people with three training pictures each. Every new photo has an expression the training set never saw. The nearest dot is just the closest point on the map, it is not proof of who someone is.');

  // map geometry, fixed so nothing rescales while you play
  const paths = WHO.map((_, w) => Array.from({length: 41}, (_, k) => coords(lit(w, -.6 + 1.2 * k / 40)).slice(0, 2)));
  const all = [...trainingZ.map(z => z.slice(0, 2)), ...paths.flat()];
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const span = (a) => { const lo = Math.min(...a), hi = Math.max(...a), pad = .14 * (hi - lo || 1); return [lo - pad, hi + pad]; };
  const [x0, x1] = span(xs), [y0, y1] = span(ys);
  const L = 54, R = MW - 20, T = 22, B = MH - 44;
  const mx = z => L + (z - x0) / (x1 - x0) * (R - L), my = z => B - (z - y0) / (y1 - y0) * (B - T);
  const axisX = svg(map, 'line', {x1: L, x2: R, y1: my(0), y2: my(0), stroke: C.dim, 'stroke-width': 1});
  const axisY = svg(map, 'line', {x1: mx(0), x2: mx(0), y1: T, y2: B, stroke: C.dim, 'stroke-width': 1});
  const axisXLabel = svg(map, 'text', {x: R, y: MH - 16, 'text-anchor': 'end', fill: C.dim}, 'z₁ → how much of eigenface 1');
  const axisYLabel = svg(map, 'text', {x: 12, y: 16, fill: C.dim}, '↑ z₂, eigenface 2');
  const lightPath = svg(map, 'polyline', {fill: 'none', stroke: C.x, 'stroke-width': 1.5, 'stroke-dasharray': '3 5', opacity: .45});
  const pathLabel = svg(map, 'text', {fill: C.x, opacity: .75, 'font-size': 11});
  const link = svg(map, 'line', {stroke: C.x, 'stroke-width': 2, 'stroke-dasharray': '5 4'});
  const trainDots = trainingZ.map((z, i) => {
    const g = svg(map, 'g');
    const who = WHO.indexOf(F.labels[i]);
    const c = svg(g, 'path', {d: SHAPES[who](7), transform: `translate(${mx(z[0])} ${my(z[1])})`,
      fill: C.ink, 'fill-opacity': .8, stroke: C.bg, 'stroke-width': 1.5});
    return {g, c, who};
  });
  // one letter per person, at the middle of their three photos
  WHO.forEach((w, p) => {
    const pts = trainingZ.filter((_, i) => F.labels[i] === w);
    const cx = pts.reduce((s, z) => s + z[0], 0) / 3, cy = pts.reduce((s, z) => s + z[1], 0) / 3;
    svg(map, 'text', {x: mx(cx) + 12, y: my(cy) - 10, fill: C.ink, 'font-weight': 700}, w);
  });
  const ring = svg(map, 'circle', {r: 12, fill: 'none', stroke: C.x, 'stroke-width': 2});
  const qDot = svg(map, 'circle', {r: 9, fill: C.x, stroke: C.bg, 'stroke-width': 2});
  const mapNote = svg(map, 'text', {x: MW / 2, y: MH - 16, 'text-anchor': 'middle', fill: C.dim, 'font-size': 12});

  // coefficient bars, fixed scale over every photo and lighting
  let zmax = 1e-9;
  for (const z of trainingZ) for (const v of z) zmax = Math.max(zmax, Math.abs(v));
  for (let w = 0; w < 4; w++) for (const l of [-.6, 0, .6]) for (const v of coords(lit(w, l))) zmax = Math.max(zmax, Math.abs(v));
  const bl = 40, br = BW - 16, slot = (br - bl) / N, mid = 82, half = 58;
  svg(coefBars, 'line', {x1: bl, x2: br, y1: mid, y2: mid, stroke: C.dim});
  svg(coefBars, 'text', {x: 12, y: 18, fill: C.dim, 'font-size': 12}, 'the new photo, one number per eigenface');
  const bars = Array.from({length: N}, (_, i) => {
    const r = svg(coefBars, 'rect', {x: bl + i * slot + slot * .18, width: slot * .64, rx: 2});
    svg(coefBars, 'text', {x: bl + (i + .5) * slot, y: BH - 12, 'text-anchor': 'middle', fill: C.dim, 'font-size': 12}, i + 1);
    return r;
  });
  const cut = svg(coefBars, 'line', {y1: 24, y2: BH - 28, stroke: C.x, 'stroke-width': 2, 'stroke-dasharray': '4 4'});
  const cutLabel = svg(coefBars, 'text', {y: 34, fill: C.x, 'font-size': 12}, 'kept ← | → ignored');

  // ---- state ----
  let who = 0, lightValue = 0, face = lit(0, 0), z = coords(face), shown = z.slice(0, 2);
  let event = 'k', anchorNearest = null, lastActive = -1, nearestNow = null;
  const refreshQuery = () => {
    face = lit(who, lightValue); z = coords(face);
    drawPixels(queryFig.c, face); drawPixels(qCanvas, face);
    setAttrs(lightPath, {points: paths[who].map(p => `${mx(p[0])},${my(p[1])}`).join(' ')});
    const end = paths[who][lightValue < 0 ? 0 : 40];
    const ex = mx(end[0]), nearRight = ex > MW - 170;
    setAttrs(pathLabel, {x: nearRight ? ex - 10 : ex + 8, y: my(end[1]) + (lightValue < 0 ? 16 : -8), 'text-anchor': nearRight ? 'end' : 'start'});
    setText(pathLabel, lightValue < 0 ? 'lit from the left' : 'lit from the right');
  };
  const placeDot = p => {
    shown = p;
    setAttrs(qDot, {cx: mx(p[0]), cy: my(p[1])});
    if (nearestNow !== null) {
      const t = trainingZ[nearestNow];
      setAttrs(link, {x1: mx(p[0]), y1: my(p[1]), x2: mx(t[0]), y2: my(t[1]), opacity: 1});
    } else link.setAttribute('opacity', 0);
  };

  function render(q) {
    const w = Array.from({length: N}, (_, i) => componentWeight(q, i));
    const kept = z.map((v, i) => v * w[i]);
    const recon = F.mean.map((m, p) => kept.reduce((s, c, j) => c ? s + c * F.basis[j][p] : s, m));
    drawPixels(reconFig.c, recon); drawPixels(rCanvas, recon);
    const dist = trainingZ.map(t => Math.hypot(...t.map((v, i) => (v - z[i]) * w[i])));
    const nearest = q > 1e-9 ? dist.indexOf(Math.min(...dist)) : null;
    if (nearest !== nearestNow) {
      nearestNow = nearest;
      drawPixels(nearFig.c, nearest === null ? F.mean : F.training[nearest]);
    }
    setText(nearFig.cap, nearest === null ? 'no match yet, all tied' : `nearest, person ${F.labels[nearest]}`);
    setText(reconFig.cap, `rebuilt from ${fmt(q, q % 1 ? 2 : 0)} eigenface${q === 1 ? '' : 's'}`);
    // the recipe strip
    terms.forEach((t, i) => {
      t.t.style.opacity = .35 + .65 * w[i];
      t.t.dataset.active = String(w[i] > 0 && w[i] < 1);
      setText(t.coef, `×${fmt(z[i])}`);
      t.coef.className = `faces-coef ${z[i] < 0 ? 'c-neg' : 'c-pos'}`;
      t.fill.style.width = pct(Math.abs(z[i]) / zmax, 0);
      t.fill.style.background = z[i] < 0 ? C.neg : C.pos;
    });
    const active = Math.min(N - 1, Math.max(0, Math.ceil(q) - 1));
    if (active !== lastActive) {
      lastActive = active;
      const card = terms[active].t.getBoundingClientRect(), box = strip.getBoundingClientRect();
      const left = active <= 2 ? 0 : strip.scrollLeft + card.left - box.left - box.width / 2 + card.width / 2;
      strip.scrollTo({left, behavior: 'smooth'});
    }
    // bars
    bars.forEach((r, i) => {
      const h = Math.abs(z[i]) / zmax * half;
      setAttrs(r, {y: z[i] >= 0 ? mid - h : mid, height: Math.max(.5, h), fill: z[i] < 0 ? C.neg : C.pos, opacity: .18 + .82 * w[i]});
    });
    const cx = bl + clamp(q, 0, N) * slot;
    setAttrs(cut, {x1: cx, x2: cx}); setAttrs(cutLabel, {x: clamp(cx - 64, bl, br - 130)});
    // map: axes fade when they do not count for matching yet
    axisX.setAttribute('opacity', .35 + .65 * w[0]); axisXLabel.setAttribute('opacity', .4 + .6 * w[0]);
    axisY.setAttribute('opacity', .35 + .65 * w[1]); axisYLabel.setAttribute('opacity', .4 + .6 * w[1]);
    setText(mapNote, q < 1e-9 ? 'no numbers kept, every dot counts as equally close'
      : q < 2 - 1e-9 ? 'only the left to right position counts for matching so far' : '');
    trainDots.forEach((d, i) => setAttrs(d.c, {d: SHAPES[d.who](i === nearest ? 9 : 7)}));
    if (nearest !== null) { const t = trainingZ[nearest]; setAttrs(ring, {cx: mx(t[0]), cy: my(t[1]), opacity: 1}); }
    else ring.setAttribute('opacity', 0);
    placeDot(shown);
    // numbers
    const energy = F.s.reduce((s, x, i) => s + (x * w[i]) ** 2, 0) / F.s.reduce((s, x) => s + x * x, 0);
    const err = rmse(face, recon);
    setVar(pct(energy)); setErr(fmt(err, 3)); setDist(nearest === null ? '—' : fmt(dist[nearest]));
    setNear(nearest === null ? 'none yet' : `person ${F.labels[nearest]}`);
    tell(q, nearest, err);
  }

  function tell(q, nearest, err) {
    const k = Math.floor(q + 1e-9), between = q - k > 1e-6;
    const name = nearest === null ? null : F.labels[nearest];
    const me = WHO[who];
    const zs = z.slice(0, 3).map(v => fmt(v)).join(', ');
    const math = `z = Vₖᵀ(f − μ) = (${zs}, …)\nf̂ = μ + Σᵢ wᵢ zᵢ vᵢ    RMSE(f, f̂) = ${fmt(err, 3)}`;
    let step, text, moving, still;
    if (event === 'light') {
      const side = lightValue === 0 ? 'back to even' : lightValue < 0 ? 'to the left' : 'to the right';
      step = `Light moved ${side}`;
      const changed = anchorNearest !== null && name !== null && anchorNearest !== name;
      text = `It is still person ${me}, only the light changed, yet every number changed with it. Watch the ${sym('x', 'orange dot')} slide along the dashed lighting path. `
        + (changed ? `The nearest match just jumped from person ${anchorNearest} to person ${name}, even though the person didn't change. That's the catch with PCA, it keeps whatever varies most, and in this little set light varies more than identity.`
          : name === null ? 'With no eigenfaces kept there is no match to change.'
          : `The nearest match is still person ${name}, because the light mostly pushes the dot along eigenface 2 and every person's training photos are spread along that same direction. The distance to the match grew though, so it got shakier even though the person is the same.`);
      moving = ['the photo', 'its coordinates', 'the orange dot']; still = ['the eigenfaces', 'the average face', 'the training dots'];
    } else if (event === 'who') {
      step = `Now it's person ${me}`;
      text = `This new photo of person ${me} has an expression none of the training photos had, so it won't sit exactly on any training dot. ${name === null ? 'Keep at least one eigenface to get a match.' : `The closest dot belongs to person ${name}, which is a nearest neighbour, not a proof of who it is.`}`;
      moving = ['the photo', 'its coordinates']; still = ['the eigenfaces', 'the average face', 'the training dots'];
    } else if (k === 0 && !between) {
      step = 'No eigenfaces kept';
      text = 'With nothing kept, every face gets rebuilt as the average face of the training set, so all four people look identical and there is nothing to match on. We subtracted this average before the SVD, so the eigenfaces only have to describe how faces differ from it.';
      moving = []; still = ['the average face', 'every eigenface'];
    } else if (k >= N) {
      step = `All ${N} eigenfaces kept`;
      text = `Everything is in, and the rebuild is still a little off. These ${N} eigenfaces only describe how the 12 training photos differ from each other, and a new photo with a new expression has bits that fall outside all of them.`;
      moving = []; still = ['the eigenfaces', 'the coordinates'];
    } else {
      const n = between ? k + 1 : k;
      step = between ? `Adding eigenface ${k + 1}` : `Keeping ${k} of ${N}`;
      text = `The rebuilt face is the average face plus a little of each eigenface you keep, and the numbers in the recipe say how much. Each eigenface is a way the faces in this set differ from the average, not a nose or an eye. ${n <= 2 ? 'The first ones carry the biggest differences, mostly overall shape and light.' : 'Later ones add smaller and smaller corrections.'} ${name ? `Right now the nearest training photo is person ${name}'s.` : ''}`;
      moving = between ? [`how much of eigenface ${k + 1} is added`, 'the rebuilt face'] : [];
      still = ['the new photo', 'its coordinates', 'the eigenfaces'];
    }
    say({step, text: text.trim(), moving, still, math});
  }

  kSlider.input.addEventListener('input', () => { event = 'k'; });
  const controls = transport(section, {input: kSlider.input, render, secondsPerUnit: 1.3, dwell: .3, section});
  // playback controls sit with the k slider, above the faces
  trio.before(kSlider.wrap, section.querySelector('.lab-transport'));

  const moveDot = () => tween('faces-dot', shown, z.slice(0, 2), 360, p => placeDot(p));
  person.input.addEventListener('change', () => {
    controls.pause(); who = Number(person.input.value); event = 'who';
    refreshQuery(); controls.refresh(); anchorNearest = nearestNow === null ? null : F.labels[nearestNow]; moveDot();
  });
  light.input.addEventListener('input', () => {
    controls.pause();
    if (event !== 'light') anchorNearest = nearestNow === null ? null : F.labels[nearestNow];
    event = 'light'; lightValue = Number(light.input.value);
    refreshQuery(); controls.refresh(); moveDot();
  });
  section.querySelector('.lab-transport').addEventListener('click', () => { event = 'k'; controls.refresh(); });

  refreshQuery(); shown = z.slice(0, 2); controls.refresh();
}
