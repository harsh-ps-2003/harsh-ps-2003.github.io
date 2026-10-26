// Three skills in a row, SDFT against SFT, on the paper's own numbers. One
// playhead sweeps both runs phase by phase, so the moment a new skill starts
// you see what happens to the old ones in each.
import DATA from './viz-seq-data.mjs';
import {el, sv, attrs, clamp, lerp, ease, fmt, story, onceVisible, pauseOffscreen, canvas, playButton} from './viz-core.mjs';

const SKILLS = [['tool', 'tool use', 'var(--sd-ink)'], ['science', 'science', 'var(--sd-student)'], ['medical', 'medical', 'var(--sd-teacher)']];
const PHASES = ['tool use', 'science', 'medical'];
const METHODS = [
  ['sdft', 'SDFT', 'its own answers, graded with the demo in the prompt'],
  ['sft', 'SFT', 'copies the demonstrations'],
];
const FLOOR = -.6, CEIL = 1;

// gradient steps <-> phase time u in [0, 3], each phase gets the same width
const toU = (m, s) => {
  const [a, b] = m.phases;
  return s <= a ? s / a : s <= b ? 1 + (s - a) / (b - a) : 2 + (s - b) / (m.end - b);
};
const fromU = (m, u) => {
  const [a, b] = m.phases;
  return u <= 1 ? u * a : u <= 2 ? a + (u - 1) * (b - a) : b + (u - 2) * (m.end - b);
};
for (const [key] of METHODS) { const m = DATA[key]; m.us = m.steps.map(s => toU(m, s)); }

// the run up to phase time u, as [u, [mean, low, high]] points, ending exactly at u
function upTo(m, skill, u) {
  const rows = m[skill], pts = [];
  for (let i = 0; i < m.us.length; i++) {
    if (m.us[i] <= u) { pts.push([m.us[i], rows[i]]); continue; }
    if (i > 0) {
      const t = (u - m.us[i - 1]) / (m.us[i] - m.us[i - 1]);
      pts.push([u, rows[i].map((v, k) => lerp(rows[i - 1][k], v, t))]);
    }
    break;
  }
  return pts;
}

export function mount(figure) {
  let u = 0;
  const s = story();

  const chart = el('div', {class: 'sq-chart'});
  figure.append(chart);
  const view = canvas(chart, draw);
  view.svg.setAttribute('aria-label', 'Normalised performance on tool use, science and medical while SDFT and SFT learn them one after another');

  const scrub = el('label', {class: 'sd-range sq-scrub'});
  const scrubOut = el('output');
  scrub.append(el('span', {}, el('span', {text: 'training, phase by phase'}), scrubOut));
  const input = el('input', {type: 'range', min: 0, max: 3, step: .002, value: 0, 'aria-label': 'Training progress'});
  input.addEventListener('input', () => { s.stop(); setU(Number(input.value)); });
  scrub.append(input);
  figure.append(scrub);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'SDFT paper, Qwen2.5-7B, shaded is the spread over seeds, each phase drawn the same width'}));
  figure.append(caption, foot);
  const play = playButton(foot, s, () => tour());

  // ---- drawing, rebuilt at the real width, then update(u) moves the live parts ----
  let live = null;
  function draw(svg, W) {
    svg.replaceChildren();
    const narrow = W < 520;
    const padL = narrow ? 28 : 36, padR = narrow ? 108 : 124, plotW = W - padL - padR;
    const PH = narrow ? 112 : 128, stripH = 26, chartGap = narrow ? 18 : 22;
    const X = uu => padL + uu / 3 * plotW;

    // which skill is being trained, one cell per phase over the plot
    const cells = PHASES.map((name, i) => {
      const g = sv('g', {class: 'sq-cell'});
      g.append(sv('rect', {x: X(i) + 1.5, y: 0, width: plotW / 3 - 3, height: stripH - 4, rx: 6}),
        sv('text', {x: X(i + .5), y: stripH / 2 + 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          text: narrow ? name : `${i + 1}  train on ${name}`}));
      svg.append(g);
      return g;
    });

    const charts = METHODS.map(([key, title, sub], ci) => {
      const m = DATA[key];
      const top = stripH + 14 + ci * (PH + 58 + chartGap);
      const plotTop = top + 22, plotBot = plotTop + PH;
      const Y = v => plotTop + (CEIL - clamp(v, FLOOR, CEIL)) / (CEIL - FLOOR) * PH;
      const g = sv('g', {class: 'sq-one'});
      svg.append(g);
      g.append(sv('text', {class: 'sq-title', x: padL, y: top + 10}, title));
      if (!narrow) g.append(sv('text', {class: 'sq-sub', x: padL + (title.length * 9.5) + 10, y: top + 10}, sub));
      for (const v of [1, .5, 0, -.5]) {
        g.append(sv('line', {class: v === 0 ? 'sq-zero' : 'sq-grid', x1: padL, x2: padL + plotW, y1: Y(v), y2: Y(v)}));
        g.append(sv('text', {class: 'sq-tick', x: padL - 6, y: Y(v) + 4, 'text-anchor': 'end'}, v === 0 ? '0' : fmt(v, 1).replace('0.', '.')));
      }
      g.append(sv('line', {class: 'sq-frame', x1: padL, x2: padL + plotW, y1: plotBot, y2: plotBot}));
      for (const b of [1, 2]) g.append(sv('line', {class: 'sq-phase', x1: X(b), x2: X(b), y1: plotTop, y2: plotBot}));
      [0, ...m.phases, m.end].forEach((step, i) => g.append(sv('text', {class: 'sq-tick', x: X(i), y: plotBot + 15,
        'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}, i === 3 ? `${step} steps` : String(step))));
      const series = SKILLS.map(([skill, name, colour]) => {
        const sg = sv('g', {class: 'sq-series', style: `--c: ${colour}`});
        const band = sv('path', {class: 'sq-band'}), under = sv('path', {class: 'sq-under'}), line = sv('path', {class: 'sq-line'});
        const dot = sv('circle', {class: 'sq-dot', r: 3.5}), label = sv('text', {class: 'sq-label'});
        sg.append(band, under, line, dot, label);
        g.append(sg);
        return {skill, name, band, under, line, dot, label};
      });
      return {m, X, Y, plotTop, plotBot, series};
    });

    const last = charts[charts.length - 1];
    const playhead = sv('line', {class: 'sq-playhead', y1: stripH, y2: last.plotBot});
    const handle = sv('circle', {class: 'sq-handle', r: 6, cy: stripH + 2});
    svg.append(playhead, handle);
    live = {cells, charts, playhead, handle, X, padL, plotW, narrow};
    update();
    return last.plotBot + 22;
  }

  function update() {
    if (!live) return;
    const {cells, charts, playhead, handle, X} = live;
    const phase = Math.min(2, Math.floor(u));
    cells.forEach((c, i) => c.classList.toggle('is-now', i === phase));
    attrs(playhead, {x1: X(u), x2: X(u)}); attrs(handle, {cx: X(u)});
    for (const c of charts) {
      const ends = c.series.map(sr => {
        const pts = upTo(c.m, sr.skill, u).map(([uu, row]) => [c.X(uu), row]);
        drawSeries(sr, pts, c);
        const endPt = pts[pts.length - 1];
        return {sr, x: endPt[0], v: endPt[1][0]};
      });
      // labels at the line ends, pushed apart so they never overlap
      const placed = ends.map(e => ({...e, y: c.Y(e.v)})).sort((a, b) => a.y - b.y);
      for (let i = 1; i < placed.length; i++) placed[i].y = Math.max(placed[i].y, placed[i - 1].y + 13);
      const over = placed[placed.length - 1].y - (c.plotBot + 4);
      if (over > 0) placed.forEach(p => { p.y -= over; });
      for (let i = placed.length - 2; i >= 0; i--) placed[i].y = Math.min(placed[i].y, placed[i + 1].y - 13);
      for (const p of placed) {
        const below = p.v < FLOOR;
        attrs(p.sr.dot, {cx: p.x, cy: c.Y(p.v)});
        attrs(p.sr.label, {x: p.x + 8, y: p.y + 4, text: below ? `${p.sr.name} < −.6` : `${p.sr.name} ${fmt(p.v, 2)}`});
      }
    }
    input.value = u;
    const steps = METHODS.map(([key, title]) => `${title} step ${Math.round(fromU(DATA[key], u))}`).join(', ');
    attrs(scrubOut, {text: live.narrow ? `${PHASES[phase]}` : `${PHASES[phase]}, ${steps}`});
    caption.innerHTML = captionFor();
  }

  // solid where the line is on the chart, dotted along the floor where it fell below −0.6
  function drawSeries(sr, pts, c) {
    let solid = '', under = '', prev = null;
    const P = (x, v) => `${x.toFixed(1)} ${c.Y(v).toFixed(1)}`;
    const piece = (type, a, b) => {
      const d = (type === prev ? '' : `M${P(a[0], a[1])}`) + `L${P(b[0], b[1])}`;
      if (type === 'solid') solid += d; else under += d;
      prev = type;
    };
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = [pts[i][0], pts[i][1][0]], b = [pts[i + 1][0], pts[i + 1][1][0]];
      const ab = a[1] < FLOOR, bb = b[1] < FLOOR;
      if (ab === bb) piece(ab ? 'under' : 'solid', a, b);
      else {
        const t = (FLOOR - a[1]) / (b[1] - a[1]), cross = [lerp(a[0], b[0], t), FLOOR];
        piece(ab ? 'under' : 'solid', a, cross); piece(bb ? 'under' : 'solid', cross, b);
      }
    }
    const upper = pts.map(([x, r]) => P(x, r[2])), lower = pts.map(([x, r]) => P(x, r[1])).reverse();
    attrs(sr.band, {d: pts.length > 1 ? `M${upper.join('L')}L${lower.join('L')}Z` : ''});
    attrs(sr.line, {d: solid}); attrs(sr.under, {d: under});
  }

  function captionFor() {
    if (u < .02) return 'Both runs start from the same model, every skill at 0, which is the base model.';
    if (u < 1) return `Both learn tool use. SFT's two untrained skills already sink <b>below where the base model started</b> while it does.`;
    if (u < 2) return `Science starts. SDFT keeps tool use around 0.8, while <b>SFT's tool use falls off a cliff</b>, far below where it started.`;
    if (u < 2.995) return `Medical starts. SDFT keeps both earlier skills up, <b>SFT now drops science the same way.</b>`;
    return `SDFT ends with all 3 skills near the top. <b>SFT keeps only the last one it learned.</b>`;
  }

  function setU(v) { u = clamp(v, 0, 3); update(); }

  // drag anywhere on the chart to scrub
  let dragging = false;
  const toLocal = e => { const r = view.svg.getBoundingClientRect(); return (e.clientX - r.left - live.padL) / live.plotW * 3; };
  view.svg.addEventListener('pointerdown', e => { if (!live) return; dragging = true; view.svg.setPointerCapture(e.pointerId); s.stop(); setU(toLocal(e)); });
  view.svg.addEventListener('pointermove', e => { if (dragging) setU(toLocal(e)); });
  view.svg.addEventListener('pointerup', () => { dragging = false; });

  async function tour() {
    await s.run(async go => {
      setU(0);
      await go.wait(500);
      for (let i = 0; i < 3; i++) {
        await go.tween(i === 0 ? 2600 : 3200, t => setU(i + t), ease.linear);
        await go.wait(i < 2 ? 900 : 0);
      }
      setU(3);
    });
  }

  pauseOffscreen(figure, s);
  update();
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
