// Docker has at least three caches, and only one of them travels. A dependency
// change on three kinds of runner, with the post's Rust numbers.
import {el, attrs, story, onceVisible, pauseOffscreen, segmented, playButton, ease} from './viz-core.mjs';

const CACHES = [
  {id: 'layer', name: 'layer cache', role: 'the chain of instructions, export backends save it'},
  {id: 'mount', name: 'mount caches', role: 'package downloads and compiler state, never exported'},
  {id: 'store', name: 'image store', role: '/var/lib/docker, pulled and built images'},
];
const RUNNERS = [
  {id: 'persist', name: 'persistent builder', secs: 4,
    state: {layer: ['on disk', 'ok'], mount: ['warm', 'ok'], store: ['warm', 'ok']},
    caption: 'On a persistent builder the mount caches are still warm, so the step the change invalidated <b>reruns cheaply</b>.'},
  {id: 'export', name: 'fresh runner, exported cache', short: 'exported cache', secs: 164,
    state: {layer: ['imported, then invalidated', 'meh'], mount: ['empty', 'bad'], store: ['empty', 'dim']},
    caption: 'A fresh runner imports and exports layers the change invalidated anyway, and every mount cache starts empty. <b>Slower than having no cache at all.</b>'},
  {id: 'none', name: 'no cache at all', short: 'no cache', secs: 19,
    state: {layer: ['none', 'dim'], mount: ['empty', 'bad'], store: ['empty', 'dim']},
    caption: 'No cache means the step rebuilds from scratch, <b>but nothing gets imported or exported</b>, so it still beats the exported cache.'},
];
const MAX = 164;

export function mount(figure) {
  let current = 'persist';
  const done = {};
  const s = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'three caches'}),
    el('p', {class: 'sd-title', text: 'Change 1 dependency, which caches are still warm?'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, RUNNERS.map(r => [r.id, r.name]), current, v => { s.run(go => run(v, go)); }, 'Where the build runs');

  const cards = el('div', {class: 'ca-cards'});
  const cardEls = Object.fromEntries(CACHES.map(c => {
    const chip = el('span', {class: 'sd-chip ca-chip'});
    const card = el('div', {class: 'ca-card'},
      el('p', {class: 'ca-name', text: c.name}), el('p', {class: 'ca-role', text: c.role}), chip);
    cards.append(card);
    return [c.id, {card, chip}];
  }));
  figure.append(cards);

  figure.append(el('p', {class: 'sd-label ca-results-label', text: 'time for the rebuild after a dependency change, Rust'}));
  const results = el('div', {class: 'ca-results'});
  const rowEls = Object.fromEntries(RUNNERS.map(r => {
    const fill = el('i', {class: 'ca-fill'}), num = el('span', {class: 'ca-num'});
    const row = el('div', {class: 'ca-row'},
      el('span', {class: 'ca-row-name', text: r.short || r.name}),
      el('span', {class: 'ca-track'}, fill), num);
    results.append(row);
    return [r.id, {row, fill, num}];
  }));
  figure.append(results);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'numbers from a Rust build with BuildKit cache mounts'}));
  figure.append(caption, foot);
  const playBtn = playButton(foot, s, () => tour());

  function show(id) {
    current = id; seg.set(id);
    const r = RUNNERS.find(x => x.id === id);
    for (const c of CACHES) {
      const [text, kind] = r.state[c.id], {card, chip} = cardEls[c.id];
      card.dataset.state = kind;
      chip.className = `sd-chip ca-chip${kind === 'ok' ? ' is-ok' : kind === 'bad' ? ' is-bad' : kind === 'dim' ? ' is-dim' : ''}`;
      attrs(chip, {text});
    }
    for (const x of RUNNERS) rowEls[x.id].row.dataset.current = String(x.id === id);
  }
  const setRow = (id, secs) => {
    rowEls[id].fill.style.width = `${Math.max(.6, 100 * secs / MAX)}%`;
    attrs(rowEls[id].num, {text: secs > 0 ? `${Math.round(secs)}s` : ''});
  };

  async function run(id, go) {
    show(id);
    const r = RUNNERS.find(x => x.id === id);
    caption.innerHTML = 'You bump 1 dependency in Cargo.toml.';
    setRow(id, 0);
    await go.wait(500);
    await go.tween(500 + r.secs * 18, k => setRow(id, k * r.secs), ease.out);
    setRow(id, r.secs); done[id] = true;
    caption.innerHTML = r.caption;
  }

  async function tour() {
    await s.run(async go => {
      for (const r of RUNNERS) { await run(r.id, go); await go.wait(2300); }
      show('export'); caption.innerHTML = RUNNERS[1].caption;
    });
  }

  pauseOffscreen(figure, s);
  show('persist');
  caption.textContent = 'Pick where the build runs and watch the rebuild.';
  onceVisible(figure, () => { playBtn.markPlayed(); tour(); });
}
