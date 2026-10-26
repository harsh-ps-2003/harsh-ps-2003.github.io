// An agent's loop is write, push, wait, read, fix. When the agent writes in a
// minute and CI takes twenty, the agent spends its hour blocked on CI.
import {sv, el, attrs, clamp, lerp, story, onceVisible, pauseOffscreen, canvas, segmented, playButton} from './viz-core.mjs';

// minutes for the agent's own work, the rest is waiting
const WRITE = 1.5, READ = .5, FIX = 1.5, PUSH = .3, QUEUE = 1.5;
const MODES = [['push', 'push and wait'], ['local', 'CI on the local diff']];

function steps(mode, ci) {
  return mode === 'push'
    ? [['write', WRITE, 'work'], ['push', PUSH, 'wait'], ['queue', QUEUE, 'wait'], ['full CI run', ci, 'wait'], ['read logs', READ, 'work'], ['fix', FIX, 'work']]
    : [['write', WRITE, 'work'], ['rerun 1 job', Math.max(.5, ci / 6), 'wait'], ['read logs', READ, 'work'], ['fix', FIX, 'work']];
}
const cycleOf = list => list.reduce((s, x) => s + x[1], 0);

export function mount(figure) {
  let mode = 'push', ci = 20, shownSteps = steps(mode, ci);
  const tour = story(), anim = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'agents in CI'}),
    el('p', {class: 'sd-title', text: 'An agent spends its hour waiting for CI'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, MODES, mode, m => { tour.stop(); mode = m; seg.set(m); update(); }, 'Where CI runs');
  const range = el('label', {class: 'sd-range al-range'});
  const out = el('output');
  const input = el('input', {type: 'range', min: 2, max: 40, step: 1, value: ci, 'aria-label': 'How long a full CI run takes, in minutes'});
  range.append(el('span', {}, el('span', {text: 'a full CI run takes'}), out), input);
  input.addEventListener('input', () => { tour.stop(); ci = Number(input.value); update(); });
  figure.append(range);

  const body = el('div', {class: 'al-body'});
  figure.append(body);
  const ringBox = el('div', {class: 'al-ring'});
  const ring = canvas(ringBox, drawRing, 'al-ring-svg');
  ring.svg.setAttribute('aria-label', 'The loop, with the waiting part in orange');
  const side = el('div', {class: 'al-side'});
  body.append(ringBox, side);
  const list = el('ol', {class: 'al-steps'});
  side.append(el('p', {class: 'sd-label', text: 'one hour of the agent'}));
  const hour = el('div', {class: 'al-hour'});
  side.append(hour, el('div', {class: 'al-hour-axis'}, el('span', {text: 'start'}), el('span', {text: '1 hour'})), list);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'},
    el('span', {class: 'al-key'}, el('i', {class: 'al-sw'}), 'agent working', el('i', {class: 'al-sw is-wait'}), 'agent blocked'));
  figure.append(caption, foot);
  const play = playButton(foot, tour, () => runTour());

  function drawRing(svg, w) {
    svg.replaceChildren();
    const size = Math.min(w, 220), cx = w / 2, cy = size / 2, r = size / 2 - 14, sw = 18;
    const total = cycleOf(shownSteps);
    let a0 = -Math.PI / 2;
    for (const [name, mins, kind] of shownSteps) {
      const a1 = a0 + (mins / total) * Math.PI * 2;
      const gap = Math.min(.03, (a1 - a0) / 3);
      svg.append(sv('path', {d: arc(cx, cy, r, a0 + gap, a1 - gap), class: `al-arc is-${kind}`, 'stroke-width': sw}));
      a0 = a1;
    }
    const tries = 60 / total;
    svg.append(sv('text', {x: cx, y: cy + 4, 'text-anchor': 'middle', class: 'al-big', text: tries >= 1 ? String(Math.floor(tries)) : '<1'}));
    svg.append(sv('text', {x: cx, y: cy + 24, 'text-anchor': 'middle', class: 'al-small', text: 'tries an hour'}));
    return size;
  }
  function arc(cx, cy, r, a0, a1) {
    const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1), large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function render() {
    const total = cycleOf(shownSteps);
    // the hour strip, cycle after cycle
    hour.replaceChildren();
    let t = 0;
    while (t < 60) {
      for (const [, mins, kind] of shownSteps) {
        if (t >= 60) break;
        const w = Math.min(mins, 60 - t);
        hour.append(el('i', {class: `al-seg is-${kind}`, style: {width: `${w / 60 * 100}%`}}));
        t += mins;
      }
    }
    list.replaceChildren(...shownSteps.map(([name, mins, kind]) => el('li', {class: `is-${kind}`},
      el('span', {class: 'al-name', text: name}), el('span', {class: 'al-len', style: {width: `${Math.max(3, mins / total * 100)}%`}}))));
    ring.redraw();
  }

  function update(ms = 450) {
    out.textContent = `${ci} min`;
    if (Number(input.value) !== ci) input.value = ci;
    const target = steps(mode, ci);
    const blocked = target.filter(s => s[2] === 'wait').reduce((a, s) => a + s[1], 0) / cycleOf(target);
    caption.innerHTML = mode === 'push'
      ? (blocked > .7
        ? `The agent writes in a minute, then <b>waits on CI for most of the loop</b>. CI is now in the critical path.`
        : `With fast CI the agent gets many more tries in the same hour, <b>the loop is the agent again</b>.`)
      : `Running CI on the local diff and rerunning only the job that matters skips the push and the queue, so <b>the same hour holds many more tries</b>.`;
    // morph lengths when the shape of the loop is the same, otherwise swap
    const from = shownSteps;
    if (from.length !== target.length || ms === 0) { shownSteps = target; render(); return; }
    anim.run(async a => {
      await a.tween(ms, t => { shownSteps = target.map((s, i) => [s[0], lerp(from[i][1], s[1], t), s[2]]); render(); });
      shownSteps = target; render();
    });
  }

  async function runTour() {
    await tour.run(async t => {
      mode = 'push'; seg.set(mode); ci = 30; update(0);
      await t.wait(1800);
      await t.tween(2600, p => { ci = Math.round(lerp(30, 4, p)); update(0); });
      await t.wait(1800);
      ci = 20; update(0); await t.wait(900);
      mode = 'local'; seg.set(mode); update(0);
    });
  }

  update(0);
  pauseOffscreen(figure, tour);
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
