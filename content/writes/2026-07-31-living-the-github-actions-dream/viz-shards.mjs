// Job density. Every shard pays the same setup cost, so splitting a suite wider
// buys wall clock with overhead. Drag the shard count and the setup time.
import {el, attrs, story, onceVisible, pauseOffscreen, playButton} from './viz-core.mjs';

const TESTS = 60;          // minutes of tests in the whole suite, as in the post
const MAX_SHARDS = 16;

const fmtMin = m => m < 1 ? `${Math.round(m * 60)} s` : `${Math.round(m * 10) / 10} min`;

export function mount(figure) {
  let shards = 1, setup = 3;
  const tour = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'sharding'}),
    el('p', {class: 'sd-title', text: 'Every shard pays for setup again'}));

  const controls = el('div', {class: 'sd-bar sh-controls'});
  const shardOut = el('output'), setupOut = el('output');
  const shardIn = el('input', {type: 'range', min: 1, max: MAX_SHARDS, step: 1, value: shards, 'aria-label': 'Number of shards',
    oninput: e => { tour.stop(); shards = Number(e.target.value); render(); }});
  const setupIn = el('input', {type: 'range', min: .25, max: 6, step: .25, value: setup, 'aria-label': 'Setup time per shard in minutes',
    oninput: e => { tour.stop(); setup = Number(e.target.value); render(); }});
  controls.append(
    el('label', {class: 'sd-range'}, el('span', {}, 'shards', shardOut), shardIn),
    el('label', {class: 'sd-range'}, el('span', {}, 'setup per shard', setupOut), setupIn));
  figure.append(controls);

  const chart = el('div', {class: 'sh-chart', role: 'img'});
  const lanes = el('div', {class: 'sh-lanes'});
  chart.append(lanes);
  const rows = Array.from({length: MAX_SHARDS}, () => {
    const s = el('i', {class: 'sh-setup'}), t = el('i', {class: 'sh-tests'});
    const row = el('div', {class: 'sh-lane'}, s, t);
    lanes.append(row);
    return {row, s, t};
  });
  chart.append(el('p', {class: 'sh-key'},
    el('span', {}, el('i', {class: 'sh-sw sh-sw-setup'}), 'setup, you learn nothing'),
    el('span', {}, el('i', {class: 'sh-sw sh-sw-tests'}), 'running tests')));
  figure.append(chart);

  const gauge = el('div', {class: 'sh-gauge'});
  const gaugeFill = el('i', {class: 'sh-gauge-fill'});
  gauge.append(el('span', {class: 'sh-gauge-track'}, gaugeFill, el('i', {class: 'sh-gauge-line'}), el('em', {class: 'sh-gauge-label', text: '80%'})));
  const stats = el('div', {class: 'sh-stats'});
  const density = el('strong', {class: 'sh-density'}), wall = el('strong'), limit = el('strong');
  stats.append(
    el('div', {}, density, el('span', {text: 'job density'})),
    el('div', {}, wall, el('span', {text: 'wall clock'})),
    el('div', {}, limit, el('span', {text: 'most shards above 80%'})));
  figure.append(gauge, stats);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: '60 minutes of tests, setup is checkout, runtimes, deps, browsers, seed data'}));
  figure.append(caption, foot);
  const play = playButton(foot, tour, () => runTour());

  function render() {
    shardIn.value = shards; setupIn.value = setup;
    attrs(shardOut, {text: String(shards)}); attrs(setupOut, {text: fmtMin(setup)});
    const per = TESTS / shards, job = setup + per, scale = setup + TESTS;
    const d = per / job;
    rows.forEach((r, i) => {
      const on = i < shards;
      r.row.classList.toggle('is-off', !on);
      attrs(r.s, {style: {width: on ? `${100 * setup / scale}%` : '0%'}});
      attrs(r.t, {style: {width: on ? `${100 * per / scale}%` : '0%'}});
    });
    lanes.dataset.single = String(shards === 1);
    const ok = d >= .8;
    figure.dataset.ok = String(ok);
    attrs(density, {text: `${Math.round(d * 100)}%`});
    attrs(wall, {text: fmtMin(job)});
    const most = Math.max(1, Math.floor(TESTS / (4 * setup)));
    attrs(limit, {text: String(most)});
    attrs(gaugeFill, {style: {width: `${d * 100}%`}});
    chart.setAttribute('aria-label', `${shards} shards, each with ${fmtMin(setup)} of setup and ${fmtMin(per)} of tests`);
    caption.innerHTML = shards === 1
      ? 'One big job spends almost all its time testing, <b>the setup is a rounding error</b>, but the wall clock is long.'
      : ok
        ? `Each shard still tests at least 4 times as long as it sets up, so <b>the extra machines are mostly doing real work</b>.`
        : `Faster wall clock, but <b>${Math.round((1 - d) * 100)}% of every billed minute is now setup</b>, and each extra shard makes it worse.`;
  }

  async function slide(go, from, to, set, ms) {
    await go.tween(ms, k => { set(from + (to - from) * k); render(); });
  }

  async function runTour() {
    await tour.run(async go => {
      shards = 1; setup = 3; render();
      await go.wait(1600);
      await slide(go, 1, 12, v => { shards = Math.round(v); }, 2600);
      await go.wait(2400);
      await slide(go, 3, .75, v => { setup = Math.round(v * 4) / 4; }, 1800);
      await go.wait(2000);
      await slide(go, .75, .25, v => { setup = Math.round(v * 4) / 4; }, 900);
    });
  }

  pauseOffscreen(figure, tour);
  render();
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
