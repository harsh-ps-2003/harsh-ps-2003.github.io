// The life of 1 CI job after a push, as a timeline. Pick the runner and see how
// much of the wall time is the work you actually asked for.
import {el, attrs, clamp, story, onceVisible, pauseOffscreen, segmented, playButton} from './viz-core.mjs';

// illustrative seconds per phase, only the proportions matter
const PHASES = [
  {key: 'queue', name: 'queue'},
  {key: 'boot', name: 'boot a fresh VM'},
  {key: 'checkout', name: 'checkout'},
  {key: 'restore', name: 'restore caches'},
  {key: 'install', name: 'install deps'},
  {key: 'work', name: 'the actual work'},
  {key: 'save', name: 'save caches'},
];
const RUNNERS = {
  hosted: {label: 'hosted, cold VM', t: {queue: 25, boot: 35, checkout: 12, restore: 45, install: 70, work: 55, save: 30},
    skip: {},
    caption: 'A GitHub hosted runner starts from nothing every time, so <b>most of the job is getting ready</b> and moving caches over the network.'},
  warm: {label: 'self-hosted, warm', t: {queue: 8, boot: 0, checkout: 4, restore: 0, install: 8, work: 55, save: 0},
    skip: {boot: 'already running', restore: 'already on disk', save: 'stays on disk'},
    caption: 'A persistent runner is already warm with its caches on disk, so <b>almost everything is real work</b>, as long as you keep it patched and safe.'},
  sticky: {label: 'sticky disk', t: {queue: 6, boot: 4, checkout: 10, restore: 3, install: 12, work: 55, save: 2},
    skip: {},
    caption: 'An ephemeral runner with a sticky disk boots from a warm pool and <b>mounts the cache instead of downloading it</b>, clean every time and still fast.'},
};
const SCALE = Object.values(RUNNERS).reduce((m, r) => Math.max(m, Object.values(r.t).reduce((a, b) => a + b, 0)), 0);
const QUEUE_STEPS = ['download schema', 'download schema', 'download schema', 'get a token', 'create a session', 'long poll for a job'];

export function mount(figure) {
  let mode = 'hosted', progress = 0, detail = false;
  const tour = story(), anim = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'after you push'}),
    el('p', {class: 'sd-title', text: 'One job, and most of it is waiting'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, Object.entries(RUNNERS).map(([k, r]) => [k, r.label]), mode, v => { tour.stop(); choose(v); }, 'Runner type');

  const chart = el('div', {class: 'ps-chart', role: 'group', 'aria-label': 'Phases of one CI job'});
  figure.append(chart);
  const rows = PHASES.map(p => {
    const label = p.key === 'queue'
      ? el('button', {type: 'button', class: 'ps-name ps-queue-btn', 'aria-expanded': 'false', onclick: () => { tour.stop(); toggleDetail(); }},
        el('span', {text: p.name}), el('span', {class: 'ps-more', text: 'why?'}))
      : el('span', {class: 'ps-name', text: p.name});
    const fill = el('i', {class: `ps-fill ps-${p.key}`});
    const note = el('span', {class: 'ps-skip'});
    const track = el('span', {class: 'ps-track'}, fill, note);
    const row = el('div', {class: `ps-row${p.key === 'work' ? ' is-work' : ''}`}, label, track);
    chart.append(row);
    return {p, fill, note, row};
  });
  const wall = el('i', {class: 'ps-wall-fill'});
  chart.append(el('div', {class: 'ps-row ps-total'}, el('span', {class: 'ps-name', text: 'wall clock'}), el('span', {class: 'ps-track'}, wall)));

  const queueBox = el('div', {class: 'ps-detail', hidden: true});
  const queueChips = el('div', {class: 'ps-chips'});
  const queueText = el('p', {class: 'ps-detail-text'});
  queueBox.append(el('p', {class: 'sd-label', text: 'before a fresh runner can even ask for your job'}), queueChips, queueText);
  figure.append(queueBox);

  const readout = el('p', {class: 'ps-readout'});
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'illustrative timings, only the proportions matter'}));
  figure.append(readout, caption, foot);
  const play = playButton(foot, tour, () => runTour());

  const total = r => Object.values(r.t).reduce((a, b) => a + b, 0);

  function render() {
    const r = RUNNERS[mode];
    let start = 0;
    for (const {p, fill, note, row} of rows) {
      const d = r.t[p.key];
      const shown = clamp(progress - start, 0, d);
      attrs(fill, {style: {left: `${100 * start / SCALE}%`, width: `${100 * shown / SCALE}%`}});
      const skipped = d === 0;
      row.classList.toggle('is-skipped', skipped);
      attrs(note, {text: skipped ? (r.skip[p.key] || 'skipped') : ''});
      start += d;
    }
    const t = total(r);
    attrs(wall, {style: {width: `${100 * Math.min(progress, t) / SCALE}%`}});
    const share = Math.round(100 * r.t.work / t);
    readout.innerHTML = progress >= t - 1e-6
      ? `the actual work is <b>${share}%</b> of the wall time`
      : '&nbsp;';
    caption.innerHTML = r.caption;
    renderDetail();
  }

  function renderDetail() {
    queueBox.hidden = !detail;
    rows[0].row.querySelector('.ps-queue-btn').setAttribute('aria-expanded', String(detail));
    if (!detail) return;
    if (mode === 'warm') {
      queueChips.replaceChildren(el('span', {class: 'sd-chip is-ok', text: 'schema already on disk'}), el('span', {class: 'sd-chip', text: 'long poll for a job'}));
      queueText.innerHTML = 'A persistent runner keeps the schema on disk and refreshes it hourly, so <b>it only waits for a job</b>.';
    } else {
      queueChips.replaceChildren(...QUEUE_STEPS.map((s, i) => el('span', {class: `sd-chip ps-qchip${i < 3 ? ' is-bad' : ''}`, style: {animationDelay: `${i * 160}ms`}, text: s})));
      queueText.innerHTML = 'Every fresh runner downloads the same API schema <b>3 times</b> before it asks for a job. Caching 1 copy per organisation took the slowest waits from about 40 seconds to under 10.';
    }
  }

  function toggleDetail() { detail = !detail; renderDetail(); }

  async function sweep(go) {
    const t = total(RUNNERS[mode]);
    progress = 0; render();
    await go.tween(1800 + 6 * t, k => { progress = k * t; render(); });
  }

  function choose(v) {
    mode = v; seg.set(v);
    anim.run(sweep);
  }

  async function runTour() {
    await tour.run(async go => {
      detail = false;
      for (const k of ['hosted', 'warm', 'sticky']) {
        mode = k; seg.set(k);
        await sweep(go);
        await go.wait(2200);
      }
      mode = 'hosted'; seg.set('hosted'); progress = total(RUNNERS.hosted); detail = true; render();
    });
  }

  pauseOffscreen(figure, tour);
  progress = total(RUNNERS[mode]);
  render();
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
