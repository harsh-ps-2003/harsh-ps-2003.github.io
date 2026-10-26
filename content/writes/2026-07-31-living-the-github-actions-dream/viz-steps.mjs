// One CI job scheduled three ways. Lint and unit tests never need the database,
// so they can hide behind its boot, while the integration tests still wait for it.
import {sv, el, attrs, clamp, lerp, story, onceVisible, pauseOffscreen, canvas, segmented, playButton} from './viz-core.mjs';

const ROWS = [
  {key: 'checkout', name: 'checkout', note: 'Same in every mode, nothing can start before the code is there.'},
  {key: 'install', name: 'install deps', note: 'Same in every mode, everything after it needs the dependencies.'},
  {key: 'db', name: 'database', note: '`docker run -d` returns at once, the database keeps booting in the background.'},
  {key: 'wait', name: 'wait for db', note: 'Only the integration tests need the database, so this is the only place worth waiting for it.'},
  {key: 'lint', name: 'lint', note: 'Lint never touches the database, so it can run while the database boots.'},
  {key: 'unit', name: 'unit tests', note: 'Unit tests never touch the database either.'},
  {key: 'integ', name: 'integration', note: 'The integration tests still wait for the database in every mode.'},
];
const BOOT = 4;
// [start, duration] per row, and the database row also has a boot part after its start
const PLANS = {
  serial: {checkout: [0, 1], install: [1, 3], db: [4, .6], wait: [4.6, BOOT], lint: [8.6, 2], unit: [10.6, 4], integ: [14.6, 5]},
  early: {checkout: [0, 1], install: [1, 3], db: [4, .6], wait: [10.6, 0], lint: [4.6, 2], unit: [6.6, 4], integ: [10.6, 5]},
  parallel: {checkout: [0, 1], install: [1, 3], db: [4, .6], wait: [4.6, BOOT], lint: [4.6, 2], unit: [4.6, 4], integ: [8.6, 5]},
};
const total = plan => Math.max(...Object.values(plan).map(([a, d]) => a + d));
const SERIAL = total(PLANS.serial);
const MODES = [['serial', 'one after another'], ['early', 'start services early'], ['parallel', 'run side by side']];
const CAPTIONS = {
  serial: 'Every step waits for the one before it, even lint and unit tests, which <b>never touch the database</b>.',
  early: 'Start the database first and wait for it only right before the integration tests, so <b>its boot hides behind lint and unit tests</b>.',
  parallel: 'Lint and unit tests run next to the database branch. The integration tests still wait, and <b>the job ends when the slowest branch does</b>.',
};

export function mount(figure) {
  let mode = 'serial', shown = clonePlan(PLANS.serial), reveal = SERIAL, picked = null;
  const tour = story(), anim = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'parallel steps'}),
    el('p', {class: 'sd-title', text: 'One CI job, three ways to schedule it'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, MODES, mode, m => { tour.stop(); go(m); }, 'How the steps are scheduled');

  const wrap = el('div', {class: 'st-chart'});
  figure.append(wrap);
  const chart = canvas(wrap, draw, 'st-svg');
  chart.svg.setAttribute('aria-label', 'Gantt chart of one CI job');
  const note = el('p', {class: 'st-note', 'aria-live': 'polite'});
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'},
    el('span', {class: 'st-key'},
      el('i', {class: 'st-sw'}), 'work', el('i', {class: 'st-sw is-boot'}), 'database booting', el('i', {class: 'st-sw is-wait'}), 'blocked'));
  figure.append(note, caption, foot);
  const play = playButton(foot, tour, () => runTour());

  function clonePlan(p) { return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.slice()])); }

  function draw(svg, w) {
    svg.replaceChildren();
    const narrow = w < 480, L = narrow ? 92 : 128, R = 14, rowH = narrow ? 26 : 30, top = 6;
    const trackW = w - L - R, scale = trackW / (SERIAL * 1.02);
    const X = t => L + t * scale;
    const H = top + ROWS.length * rowH + 30;
    // faint guide where the serial job would end
    const end = total(shown);
    ROWS.forEach((row, i) => {
      const y = top + i * rowH;
      const g = sv('g', {class: `st-row${picked === row.key ? ' is-picked' : ''}`, role: 'button', tabindex: 0, 'aria-label': row.name});
      g.addEventListener('click', () => pick(row.key));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(row.key); } });
      g.append(sv('rect', {x: 0, y, width: w, height: rowH, class: 'st-hit'}));
      g.append(sv('text', {x: L - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'st-label', text: row.name}));
      const [a, d] = shown[row.key];
      const vis = clamp(reveal - a, 0, d);
      if (row.key === 'db') {
        // the start, then the boot that runs in the background
        const bootVis = clamp(reveal - (a + d), 0, BOOT);
        if (bootVis > 0) g.append(sv('rect', {x: X(a + d), y: y + 7, width: bootVis * scale, height: rowH - 14, rx: 3, class: 'st-boot'}));
        if (vis > 0) g.append(sv('rect', {x: X(a), y: y + 5, width: Math.max(2, vis * scale), height: rowH - 10, rx: 3, class: 'st-work'}));
      } else if (vis > .01) {
        g.append(sv('rect', {x: X(a), y: y + 5, width: vis * scale, height: rowH - 10, rx: 3, class: row.key === 'wait' ? 'st-wait' : 'st-work'}));
      }
      svg.append(g);
    });
    const yb = top + ROWS.length * rowH;
    svg.append(sv('line', {x1: L, x2: L + trackW, y1: yb + 4, y2: yb + 4, class: 'st-axis'}));
    if (reveal >= end - .01) {
      if (mode !== 'serial') {
        svg.append(sv('line', {x1: X(SERIAL), x2: X(SERIAL), y1: top, y2: yb + 8, class: 'st-ghost'}));
        svg.append(sv('line', {x1: X(end), x2: X(SERIAL), y1: yb + 14, y2: yb + 14, class: 'st-saved'}));
        svg.append(sv('text', {x: (X(end) + X(SERIAL)) / 2, y: yb + 27, 'text-anchor': 'middle', class: 'st-saved-text', text: 'saved'}));
      }
      svg.append(sv('line', {x1: X(end), x2: X(end), y1: top, y2: yb + 8, class: 'st-end'}));
      svg.append(sv('text', {x: X(end) - 4, y: yb + 27, 'text-anchor': 'end', class: 'st-end-text', text: mode === 'serial' ? 'job done' : 'done'}));
    } else {
      svg.append(sv('line', {x1: X(reveal), x2: X(reveal), y1: top, y2: yb + 8, class: 'st-head'}));
    }
    return H;
  }

  function pick(key) {
    tour.stop();
    picked = picked === key ? null : key;
    const row = ROWS.find(r => r.key === key);
    note.innerHTML = picked ? `<b>${row.name}</b> ${row.note.replace(/`([^`]+)`/g, '<code>$1</code>')}` : '';
    chart.redraw();
  }

  function go(next, ms = 750) {
    mode = next; seg.set(next);
    caption.innerHTML = CAPTIONS[next];
    const from = clonePlan(shown), to = PLANS[next];
    reveal = Math.max(reveal, total(to));
    return anim.run(async a => {
      await a.tween(ms, t => {
        for (const k of Object.keys(to)) shown[k] = [lerp(from[k][0], to[k][0], t), lerp(from[k][1], to[k][1], t)];
        reveal = Math.max(total(shown), reveal);
        chart.redraw();
      });
      shown = clonePlan(to); reveal = total(to); chart.redraw();
    });
  }

  async function runTour() {
    picked = null; note.innerHTML = '';
    await tour.run(async t => {
      mode = 'serial'; seg.set(mode); caption.innerHTML = CAPTIONS.serial;
      shown = clonePlan(PLANS.serial); reveal = 0; chart.redraw();
      await t.tween(3600, p => { reveal = p * SERIAL; chart.redraw(); }, x => x);
      reveal = SERIAL; chart.redraw();
      await t.wait(1600);
      go('early'); await t.wait(3200);
      go('parallel'); await t.wait(800);
    });
  }

  caption.innerHTML = CAPTIONS[mode];
  pauseOffscreen(figure, tour);
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
