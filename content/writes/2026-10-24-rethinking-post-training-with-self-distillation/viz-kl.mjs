// Forward vs reverse KL on "water boils at ___". The teacher knows two answers,
// 100 (Celsius) and 212 (Fahrenheit), the student can hold one bump. Training is
// real, Adam on the student's mean and width against the KL on a grid.
import {el, sv, attrs, clamp, fmt, story, onceVisible, pauseOffscreen, segmented, playButton, canvas} from './viz-core.mjs';

const X0 = 40, X1 = 272, STEP = .5;              // symmetric round 156 so neither peak is favoured
const X = []; for (let x = X0; x <= X1 + 1e-9; x += STEP) X.push(x);
const PEAKS = [100, 212], WIDTH = 6;
const START = {mu: 128, sd: 20};
const YMAX = .11;                                 // room for a reverse-KL peak about 2× the teacher
const SD_MIN = 4, SD_MAX = 90, STEPS = 320;

const lse = a => { let m = -Infinity; for (const v of a) if (v > m) m = v; let s = 0; for (const v of a) s += Math.exp(v - m); return m + Math.log(s); };
const LOG_T = (() => {
  const raw = X.map(x => lse(PEAKS.map(p => Math.log(.5) - (x - p) ** 2 / (2 * WIDTH * WIDTH))));
  const z = lse(raw); return raw.map(v => v - z);
})();
const logS = (mu, sd) => {
  const raw = X.map(x => -((x - mu) ** 2) / (2 * sd * sd));
  const z = lse(raw); return raw.map(v => v - z);
};
function kl(dir, mu, sd) {
  const ls = logS(mu, sd); let k = 0;
  for (let i = 0; i < X.length; i++) k += dir === 'forward' ? Math.exp(LOG_T[i]) * (LOG_T[i] - ls[i]) : Math.exp(ls[i]) * (ls[i] - LOG_T[i]);
  return k;
}
// what each answer adds to the KL, so the plot can show where the penalty comes from
function terms(dir, mu, sd) {
  const ls = logS(mu, sd);
  return X.map((_, i) => dir === 'forward' ? Math.exp(LOG_T[i]) * (LOG_T[i] - ls[i]) : Math.exp(ls[i]) * (ls[i] - LOG_T[i]));
}

const TEXT = {
  forward: {
    formula: 'KL(p<sub>T</sub> ‖ p<sub>S</sub>) = Σ <b class="sd-teacher">p<sub>T</sub></b> log(p<sub>T</sub> / p<sub>S</sub>)',
    weight: 'every answer weighted by the <b class="sd-teacher">teacher</b>',
    idle: 'Forward KL averages where the <b class="sd-teacher">teacher</b> lives. <b>Missing 100 or 212 costs without limit.</b> Mass in the valley is free, because the teacher has none there. Drag the blue bell, then train.',
  },
  reverse: {
    formula: 'KL(p<sub>S</sub> ‖ p<sub>T</sub>) = Σ <b class="sd-student">p<sub>S</sub></b> log(p<sub>S</sub> / p<sub>T</sub>)',
    weight: 'every answer weighted by the <b class="sd-student">student</b>',
    idle: 'Reverse KL averages where the <b class="sd-student">student</b> lives. <b>Mass in the valley costs without limit</b>, so the bell is forced off the empty stretch. Dropping one of the teacher’s answers is cheap.',
  },
};

export function mount(figure) {
  let dir = 'forward', mu = START.mu, sd = START.sd, trained = false;
  const s = story();

  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, [['forward', 'forward KL'], ['reverse', 'reverse KL']], dir, d => { s.stop(); setDir(d); }, 'Which KL to train with');
  const trainButton = el('button', {type: 'button', class: 'kl-train', text: 'train the student', onclick: () => { s.stop(); run(); }});
  const reset = el('button', {type: 'button', text: 'reset', onclick: () => { s.stop(); mu = START.mu; sd = START.sd; trained = false; update(); }});
  bar.append(el('span', {class: 'kl-actions'}, trainButton, reset));

  const plotBox = el('div', {class: 'kl-plot'});
  figure.append(plotBox);
  const formula = el('p', {class: 'kl-formula'});
  const stats = el('div', {class: 'kl-stats'});
  const cell = label => { const v = el('strong', {class: 'sd-mono'}); stats.append(el('div', {}, v, el('span', {text: label}))); return v; };
  const klOut = cell('KL, nats'), answerOut = cell('the student’s answer, its peak'), verdictOut = cell('');
  verdictOut.classList.remove('sd-mono'); verdictOut.parentElement.classList.add('kl-verdict');
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'real optimisation on a toy pair of distributions'}));
  figure.append(formula, stats, caption, foot);
  const play = playButton(foot, s, () => tour());

  // ---- the plot, redrawn at real width ----
  figure.dataset.uid = Math.random().toString(36).slice(2, 8);
  let L = {};
  const M = {left: 12, right: 12, top: 34, axis: 26, strip: 30};
  const view = canvas(plotBox, (svg, w) => {
    const narrow = w < 480, H = narrow ? 210 : 240;
    const total = M.top + H + M.axis + M.strip + 14;
    const px = x => M.left + (x - X0) / (X1 - X0) * (w - M.left - M.right);
    const py = d => M.top + H - Math.min(d, YMAX * 1.04) / YMAX * H;
    svg.replaceChildren();
    svg.setAttribute('aria-label', 'Teacher with two peaks at 100 and 212 and the student as one bump');
    const base = M.top + H;
    for (const t of [50, 100, 150, 200, 250]) {
      svg.append(sv('line', {x1: px(t), x2: px(t), y1: base, y2: base + 5, class: 'kl-tick'}),
        sv('text', {x: px(t), y: base + 19, 'text-anchor': 'middle', text: t}));
    }
    svg.append(sv('line', {x1: M.left, x2: w - M.right, y1: base, y2: base, class: 'kl-axis'}));
    const curve = logs => {
      let d = `M${px(X0)} ${base}`;
      logs.forEach((l, i) => { d += `L${px(X[i]).toFixed(1)} ${py(Math.exp(l) / STEP).toFixed(1)}`; });
      return d + `L${px(X1)} ${base}Z`;
    };
    svg.append(sv('path', {d: curve(LOG_T), class: 'kl-teacher'}));
    const peakLabels = [[100, '°C'], [212, '°F']].map(([p, unit]) =>
      sv('text', {x: px(p), y: py(.5 / (WIDTH * Math.sqrt(2 * Math.PI))) - 8, 'text-anchor': 'middle', class: 'kl-peak', text: `${p} ${unit}`}));
    svg.append(sv('text', {x: narrow ? w - M.right : px(X0) + 2, y: 14, 'text-anchor': narrow ? 'end' : 'start', class: 'kl-key'},
      sv('tspan', {class: 'kl-key-t', text: 'teacher'}), sv('tspan', {class: 'kl-key-s', dx: 12, text: 'student'})));
    const clip = sv('clipPath', {id: `kl-clip-${figure.dataset.uid}`}, sv('rect', {x: 0, y: M.top - 6, width: w, height: H + 6}));
    svg.append(sv('defs', {}, clip));
    const student = sv('path', {class: 'kl-student', 'clip-path': `url(#kl-clip-${figure.dataset.uid})`});
    const handle = sv('circle', {r: narrow ? 9 : 8, class: 'kl-handle'});
    const says = sv('text', {class: 'kl-says', 'text-anchor': 'middle'});
    // the strip under the axis, where the KL's terms are big
    const stripTop = base + M.axis;
    svg.append(sv('text', {x: px(X0) + 2, y: stripTop + M.strip + 12, class: 'kl-strip-label', text: 'where the penalty comes from'}));
    const strip = sv('path', {class: 'kl-strip'});
    const valley = sv('text', {x: px(156), y: base - 10, 'text-anchor': 'middle', class: 'kl-valley', text: 'teacher is empty'});
    svg.append(strip, student, ...peakLabels, valley, handle, says);
    svg.append(sv('rect', {x: M.left, y: M.top - 6, width: w - M.left - M.right, height: H + 6, class: 'kl-hit'}));
    L = {px, py, base, H, w, student, handle, says, strip, stripTop, curve};
    paint();
    return total;
  });

  function paint() {
    if (!L.student) return;
    const ls = logS(mu, sd);
    attrs(L.student, {d: L.curve(ls)});
    const peak = 1 / (sd * Math.sqrt(2 * Math.PI));
    const hx = L.px(mu), hy = Math.max(L.py(peak), L.base - L.H);
    attrs(L.handle, {cx: hx, cy: hy});
    attrs(L.says, {x: clamp(hx, 50, L.w - 50), y: hy - 14, text: `says ${Math.round(mu)}`});
    // positive terms only, scaled to the strip, so you see where the cost sits
    const t = terms(dir, mu, sd), top = Math.max(1e-12, ...t);
    let d = `M${L.px(X0)} ${L.stripTop + M.strip}`;
    t.forEach((v, i) => { d += `L${L.px(X[i]).toFixed(1)} ${(L.stripTop + M.strip - Math.max(0, v) / top * M.strip).toFixed(1)}`; });
    attrs(L.strip, {d: d + `L${L.px(X1)} ${L.stripTop + M.strip}Z`, 'data-dir': dir});
  }

  function update() {
    paint();
    seg.set(dir);
    figure.dataset.dir = dir;
    formula.innerHTML = `<span class="sd-mono">${TEXT[dir].formula}</span><span class="kl-weight">${TEXT[dir].weight}</span>`;
    const k = kl(dir, mu, sd);
    attrs(klOut, {text: k > 99 ? '> 99' : fmt(k, 2)});
    attrs(answerOut, {text: Math.round(mu)});
    const near = PEAKS.find(p => Math.abs(mu - p) < 8 && sd < 15);
    const teacherPeak = 0.5 / (WIDTH * Math.sqrt(2 * Math.PI));
    const studentPeak = 1 / (sd * Math.sqrt(2 * Math.PI));
    const times = studentPeak / teacherPeak;
    const verdict = near ? `locks onto ${near}, about ${fmt(times, 1)}× the teacher’s peak`
      : sd > 30 && mu > 125 && mu < 190 ? 'mean in the valley, wrong in both units' : 'still somewhere in between';
    attrs(verdictOut, {text: verdict});
    let text = TEXT[dir].idle;
    if (trained && dir === 'forward') text = `The bell covers both answers, so <b>its top sits in the valley, near ${Math.round(mu)}</b>. That is not a mode the teacher has. A single bell that has to stay up at 100 and at 212 has nowhere else to put its mean.`;
    if (trained && dir === 'reverse') text = near
      ? `Zero-forcing. The student puts all of its mass on <b>${near}</b> and drops the other answer. The peak is about <b>${fmt(times, 1)}×</b> the teacher’s, because the teacher had split its mass in half. Start on the other side of 156 and it picks the other one.`
      : `<b>The two pulls cancel.</b> Wide and in the middle, the valley under the student is not empty, so reverse KL does not snap. That is why people train with forward KL first and reverse after.`;
    caption.innerHTML = text;
  }

  function setDir(d) { dir = d; trained = false; update(); }

  // Adam on (mean, log width), animated over a few seconds
  async function train(go) {
    let rho = Math.log(sd), done = 0;
    const m = [0, 0], v = [0, 0];
    const step = t => {
      const g = [(kl(dir, mu + .01, Math.exp(rho)) - kl(dir, mu - .01, Math.exp(rho))) / .02,
        (kl(dir, mu, Math.exp(rho + 1e-4)) - kl(dir, mu, Math.exp(rho - 1e-4))) / 2e-4];
      const decay = .12 + .88 * (1 - t / STEPS), lr = [3 * decay, .12 * decay];
      for (let k = 0; k < 2; k++) {
        m[k] = .9 * m[k] + .1 * g[k]; v[k] = .999 * v[k] + .001 * g[k] ** 2;
        const d = lr[k] * (m[k] / (1 - .9 ** t)) / (Math.sqrt(v[k] / (1 - .999 ** t)) + 1e-8);
        if (k === 0) mu = clamp(mu - d, X0, X1); else rho = clamp(rho - d, Math.log(SD_MIN), Math.log(SD_MAX));
      }
      sd = Math.exp(rho);
    };
    trained = false;
    await go.tween(3000, t => {
      const target = Math.round(t * STEPS);
      while (done < target) step(++done);
      update();
    }, x => x);
    trained = true; update();
  }
  const run = () => s.run(train);
  const restart = d => { mu = START.mu; sd = START.sd; setDir(d); };
  const tour = () => s.run(async go => {
    restart('forward'); await go.wait(900);
    await train(go); await go.wait(2800);
    restart('reverse'); await go.wait(900);
    await train(go);
  });

  // drag anywhere on the plot to move the student's peak, height sets the width
  let dragging = false;
  const toLocal = e => { const r = view.svg.getBoundingClientRect(); return [(e.clientX - r.left) * L.w / r.width, e.clientY - r.top]; };
  const dragTo = e => {
    const [x, y] = toLocal(e);
    mu = clamp(X0 + (x - L.px(X0)) / (L.px(X1) - L.px(X0)) * (X1 - X0), X0 + 5, X1 - 5);
    const peak = clamp((L.base - y) / L.H * YMAX, 1 / (SD_MAX * 2.5066), 1 / (5.5 * 2.5066));
    sd = clamp(1 / (peak * Math.sqrt(2 * Math.PI)), 5.5, SD_MAX);
    trained = false; update();
  };
  view.svg.addEventListener('pointerdown', e => {
    if (!e.target.classList?.contains('kl-hit') && e.target !== L.handle && e.target !== L.student) return;
    s.stop(); dragging = true; view.svg.setPointerCapture(e.pointerId); dragTo(e); e.preventDefault();
  });
  view.svg.addEventListener('pointermove', e => { if (dragging) dragTo(e); });
  view.svg.addEventListener('pointerup', () => { dragging = false; });
  view.svg.addEventListener('pointercancel', () => { dragging = false; });

  pauseOffscreen(figure, s);
  update();
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
