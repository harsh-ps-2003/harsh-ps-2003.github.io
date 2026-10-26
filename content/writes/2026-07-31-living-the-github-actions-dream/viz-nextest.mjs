// cargo test against cargo nextest on 4 cores. cargo test runs test binaries one
// after another and waits for each binary's slowest test, nextest runs every test
// from every binary on whatever core is free.
import {el, attrs, clamp, story, onceVisible, pauseOffscreen, segmented, playButton} from './viz-core.mjs';

const CORES = 4;
// seconds per test, binary A has the long pole
const BINARIES = [
  {name: 'binary A', tests: [60, 4, 3, 5, 2, 4, 3]},
  {name: 'binary B', tests: [8, 6, 7, 5, 9, 4, 6, 5]},
  {name: 'binary C', tests: [12, 10, 9, 11, 8]},
];
const LONG = 60;

// greedy list scheduling, each test goes to the core that frees up first
function place(jobs, startAt) {
  const free = Array(CORES).fill(startAt), out = [];
  for (const j of jobs) {
    let c = 0;
    for (let k = 1; k < CORES; k++) if (free[k] < free[c] - 1e-9) c = k;
    out.push({...j, core: c, start: free[c], end: free[c] + j.d});
    free[c] += j.d;
  }
  return {blocks: out, end: Math.max(...free)};
}
function cargoTest() {
  let t = 0, blocks = [], marks = [];
  for (const [b, bin] of BINARIES.entries()) {
    const r = place(bin.tests.map(d => ({d, bin: b})), t);
    blocks = blocks.concat(r.blocks); t = r.end; marks.push({t, label: `${bin.name.replace("binary ", "")} done`});
  }
  return {blocks, end: t, marks};
}
function nextest() {
  const all = BINARIES.flatMap((bin, b) => bin.tests.map(d => ({d, bin: b})));
  const r = place(all, 0);
  return {blocks: r.blocks, end: r.end, marks: []};
}
const PLANS = {cargo: cargoTest(), nextest: nextest()};
const SCALE = Math.max(PLANS.cargo.end, PLANS.nextest.end);

export function mount(figure) {
  let mode = 'cargo', now = SCALE;
  const tour = story(), anim = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'rust tests'}),
    el('p', {class: 'sd-title', text: 'One slow test should not hold every core'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, [['cargo', 'cargo test'], ['nextest', 'cargo nextest']], mode, v => { tour.stop(); choose(v); }, 'Test runner');

  const chart = el('div', {class: 'nx-chart', role: 'img'});
  const lanesBox = el('div', {class: 'nx-lanes'});
  const lanes = Array.from({length: CORES}, (_, i) => {
    const lane = el('div', {class: 'nx-lane'});
    lanesBox.append(el('div', {class: 'nx-row'}, el('span', {class: 'nx-core', text: `core ${i + 1}`}), lane));
    return lane;
  });
  const marksBox = el('div', {class: 'nx-marks'});
  const playhead = el('i', {class: 'nx-playhead'});
  lanesBox.append(marksBox);
  chart.append(lanesBox);
  chart.append(el('p', {class: 'nx-key'},
    ...BINARIES.map((b, i) => el('span', {}, el('i', {class: `nx-sw nx-b${i}`}), b.name)),
    el('span', {}, el('i', {class: 'nx-sw nx-long'}), 'the long test'),
    el('span', {}, el('i', {class: 'nx-sw nx-idle'}), 'idle core')));
  figure.append(chart);

  const totals = el('div', {class: 'nx-totals'});
  const totalRows = {};
  for (const [k, label] of [['cargo', 'cargo test'], ['nextest', 'nextest']]) {
    const fill = el('i', {class: `nx-total-fill nx-total-${k}`});
    totalRows[k] = fill;
    totals.append(el('div', {class: 'nx-total'}, el('span', {class: 'nx-total-name', text: label}), el('span', {class: 'nx-total-track'}, fill)));
  }
  figure.append(totals);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'illustrative, 3 test binaries on 4 cores'}));
  figure.append(caption, foot);
  const play = playButton(foot, tour, () => runTour());

  let drawn = null, blockEls = [];
  function build() {
    const plan = PLANS[mode];
    lanes.forEach(l => l.replaceChildren());
    blockEls = plan.blocks.map(b => {
      const e = el('i', {class: `nx-block nx-b${b.bin}${b.d === LONG ? ' nx-long' : ''}`});
      lanes[b.core].append(e);
      return {b, e};
    });
    marksBox.replaceChildren(...plan.marks.slice(0, -1).map(m => el('span', {class: 'nx-mark', style: {left: `${100 * m.t / SCALE}%`}}, el('em', {text: m.label}))), playhead);
    chart.setAttribute('aria-label', `${mode === 'cargo' ? 'cargo test' : 'nextest'} finishes after ${Math.round(plan.end)} seconds on ${CORES} cores`);
    drawn = mode;
  }

  // shown[k] remembers how far each runner got, so the totals stay put while the other plays
  const shown = {cargo: 0, nextest: 0};
  function render() {
    if (drawn !== mode) build();
    const plan = PLANS[mode];
    for (const {b, e} of blockEls) {
      const w = clamp(now - b.start, 0, b.d);
      attrs(e, {style: {left: `${100 * b.start / SCALE}%`, width: `${100 * w / SCALE}%`}});
    }
    attrs(playhead, {style: {left: `${100 * Math.min(now, plan.end) / SCALE}%`, opacity: now < plan.end - 1e-6 ? 1 : 0}});
    shown[mode] = Math.max(shown[mode], Math.min(now, plan.end));
    for (const k of ['cargo', 'nextest']) attrs(totalRows[k], {style: {width: `${100 * shown[k] / SCALE}%`}});
    const done = now >= plan.end - 1e-6;
    caption.innerHTML = mode === 'cargo'
      ? (done ? 'Binary A waits for its 1 long test while 3 cores sit idle, and <b>B and C cannot start until it finishes</b>.'
        : 'cargo test runs 1 binary at a time and waits for its slowest test before moving on.')
      : (done ? (shown.cargo >= PLANS.cargo.end - 1e-6
        ? `Same tests, same cores, <b>about ${Math.round(100 * (1 - PLANS.nextest.end / PLANS.cargo.end))}% less wall time</b>, because the long test runs alongside everything else.`
        : 'Every other test fills the cores while the long one runs, so <b>the long test is the only thing you wait for</b>.')
        : 'nextest lists every test from every binary and gives each its own process on whichever core is free.');
  }

  async function sweep(go) {
    const end = PLANS[mode].end;
    now = 0; render();
    await go.tween(3200, k => { now = k * end; render(); }, t => t);
  }
  function choose(v) { mode = v; seg.set(v); anim.run(sweep); }

  async function runTour() {
    await tour.run(async go => {
      shown.cargo = 0; shown.nextest = 0;
      mode = 'cargo'; seg.set('cargo'); await sweep(go);
      await go.wait(2400);
      mode = 'nextest'; seg.set('nextest'); await sweep(go);
    });
  }

  pauseOffscreen(figure, tour);
  shown.cargo = PLANS.cargo.end; shown.nextest = PLANS.nextest.end;
  render();
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
