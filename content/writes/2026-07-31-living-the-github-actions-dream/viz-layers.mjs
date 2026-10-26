// A Dockerfile as a chain of layers. Change something and a wave of
// invalidation runs from that layer to the end, so the order decides
// whether the slow install reruns on every edit.
import {el, attrs, story, onceVisible, pauseOffscreen, segmented, playButton, reduced} from './viz-core.mjs';

// cost is a rough relative weight, only used for bar lengths
const ORDERS = {
  bad: [
    {code: 'FROM node:20-slim', cost: 1, why: 'base image'},
    {code: 'RUN apt-get install …', cost: 3, why: 'system deps'},
    {code: 'COPY . .', cost: 0.6, why: 'all your files', src: true, dep: true},
    {code: 'RUN pnpm install', cost: 9, why: 'the slow step', slow: true},
    {code: 'RUN pnpm run build', cost: 3, why: 'your build'},
  ],
  good: [
    {code: 'FROM node:20-slim', cost: 1, why: 'base image'},
    {code: 'RUN apt-get install …', cost: 3, why: 'system deps'},
    {code: 'COPY package.json pnpm-lock.yaml ./', cost: 0.3, why: 'only the manifest', dep: true},
    {code: 'RUN pnpm install', cost: 9, why: 'the slow step', slow: true},
    {code: 'COPY . .', cost: 0.6, why: 'all your files', src: true},
    {code: 'RUN pnpm run build', cost: 3, why: 'your build'},
  ],
};
const ORDER_NAMES = [['bad', 'copy everything first'], ['good', 'manifest first']];

export function mount(figure) {
  let order = 'bad', change = null;
  const s = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'docker layers'}),
    el('p', {class: 'sd-title', text: 'Change 1 file, how much of the build reruns?'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, ORDER_NAMES, order, v => { s.stop(); setOrder(v); }, 'Dockerfile order');
  const actions = el('div', {class: 'ly-actions'});
  const srcBtn = el('button', {type: 'button', text: 'edit a source file'});
  const depBtn = el('button', {type: 'button', text: 'add a dependency'});
  actions.append(srcBtn, depBtn);
  bar.append(actions);

  const stack = el('ol', {class: 'ly-stack', 'aria-label': 'Dockerfile instructions, one layer each'});
  figure.append(stack);
  const total = el('div', {class: 'ly-total'},
    el('span', {class: 'sd-label', text: 'time spent rebuilding'}),
    el('span', {class: 'ly-track'}, el('i', {class: 'ly-fill'})));
  const fill = total.querySelector('.ly-fill');
  figure.append(total);
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'},
    el('span', {class: 'ly-key'}, el('i', {class: 'ly-sw is-cached'}), 'cached', el('i', {class: 'ly-sw is-rebuilt'}), 'rebuilt'));
  figure.append(caption, foot);
  const play = playButton(foot, s, () => tour());

  let rows = [];
  function draw() {
    const layers = ORDERS[order];
    const max = Math.max(...layers.map(l => l.cost));
    stack.replaceChildren();
    rows = layers.map((l, i) => {
      const li = el('li', {class: `ly-row${l.slow ? ' is-slow' : ''}`, 'data-state': 'idle'},
        el('span', {class: 'ly-num', text: String(i + 1)}),
        el('code', {class: 'ly-code', text: l.code}),
        el('span', {class: 'ly-why', text: l.why}),
        el('span', {class: 'ly-cost'}, el('i', {style: {width: `${Math.max(6, 100 * l.cost / max)}%`}})),
        el('span', {class: 'ly-state'}));
      stack.append(li);
      return li;
    });
    fill.style.width = '0%';
  }
  function setOrder(v) { order = v; seg.set(v); change = null; draw(); caption.textContent = 'Pick a change and watch which layers survive.'; }

  const firstHit = kind => ORDERS[order].findIndex(l => (kind === 'src' ? l.src : l.dep));

  async function run(kind, go) {
    change = kind;
    const layers = ORDERS[order], hit = firstHit(kind);
    const all = layers.reduce((a, l) => a + l.cost, 0);
    let spent = 0;
    rows.forEach(r => { r.dataset.state = 'idle'; attrs(r.querySelector('.ly-state'), {text: ''}); });
    fill.style.width = '0%';
    caption.textContent = kind === 'src' ? 'You edit 1 source file.' : 'You add 1 dependency.';
    for (let i = 0; i < rows.length; i++) {
      const rebuilt = i >= hit;
      rows[i].dataset.state = rebuilt ? 'rebuilt' : 'cached';
      attrs(rows[i].querySelector('.ly-state'), {text: rebuilt ? (i === hit ? 'changed' : 'rebuilt') : 'cached'});
      if (rebuilt) { spent += layers[i].cost; fill.style.width = `${100 * spent / all}%`; }
      if (go && !reduced.matches) await go.wait(rebuilt ? 380 : 160);
    }
    const slowRebuilt = layers.findIndex(l => l.slow) >= hit;
    caption.innerHTML = slowRebuilt
      ? (kind === 'dep' && order === 'good'
        ? 'A new dependency changes the manifest, so the install reruns, <b>which is the only time it should</b>.'
        : `${kind === 'src' ? 'One edited file' : 'A new dependency'} changes <code>COPY . .</code>, and everything after it rebuilds, <b>including the slow install, every single time</b>.`)
      : 'Only the layers after <code>COPY . .</code> rebuild. <b>The install stays cached</b> until the lockfile changes.';
  }

  async function tour() {
    await s.run(async go => {
      setOrder('bad'); await go.wait(700);
      await run('src', go); await go.wait(2600);
      setOrder('good'); await go.wait(900);
      await run('src', go); await go.wait(2600);
      await run('dep', go);
    });
  }

  // a click plays the wave on its own, outside the tour
  const click = kind => () => { s.run(go => run(kind, go)); };
  srcBtn.addEventListener('click', click('src'));
  depBtn.addEventListener('click', click('dep'));
  pauseOffscreen(figure, s);
  setOrder('bad');
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
