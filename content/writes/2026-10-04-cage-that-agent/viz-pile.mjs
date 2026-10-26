// Fixing one failing test, one step at a time. Every step hands the session
// something new, nothing is handed back, and every risk has a gate.
import {el, attrs, story, onceVisible, pauseOffscreen, segmented, playButton} from './viz-core.mjs';

// kind: 'auth' is authority the session holds, 'untrusted' is input that can steer it
const STEPS = [
  {cmd: 'git clone', adds: [['git token', 'auth'], ['repo on disk', 'auth']],
    why: 'Cloning needs a credential the runtime can use, so the agent process can usually read it too.',
    worst: 'the token is readable by the process', gate: 'tool gateway', fix: 'a scoped token minted per call'},
  {cmd: 'read code', adds: [['the whole repo', 'auth']],
    why: 'Reading 1 test and its source quietly becomes access to the whole repo.',
    worst: 'it reads way beyond the task', gate: 'sandbox', fix: 'files scoped to the workspace'},
  {cmd: 'pnpm install', adds: [['postinstall scripts', 'untrusted'], ['process.env', 'auth']],
    why: 'Hundreds of packages from a public registry run their install scripts with the agents permissions.',
    worst: 'an install script steals env vars', gate: 'egress and the tool gateway', fix: 'an empty env and an allowlisted network'},
  {cmd: 'write fix', adds: [['LLM-written fix', 'untrusted']],
    why: 'The fix is code that nobody reviewed.',
    worst: 'it edits files it shouldnt touch', gate: 'policy engine', fix: 'a path policy on which files it may change'},
  {cmd: 'pnpm test', adds: [['test fixtures', 'untrusted'], ['exec + network', 'auth']],
    why: 'Running the tests executes code against data files that may hold untrusted input.',
    worst: 'test code runs on fixture input', gate: 'sandbox and egress', fix: 'a microVM and default deny networking'},
  {cmd: 'git push', adds: [['repo write', 'auth']],
    why: 'With write access, nothing obvious stops it from touching unrelated files.',
    worst: 'it pushes whatever changed', gate: 'human gate', fix: 'push a branch, a human merges'},
];
const TOTAL = STEPS.reduce((n, s) => n + s.adds.length, 0);

export function mount(figure) {
  let at = 0, gates = false;
  const tour = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'in practice'}),
    el('p', {class: 'sd-title', text: 'Fix 1 failing test, watch the pile grow'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, STEPS.map((s, i) => [String(i), s.cmd]), '0', v => { tour.stop(); show(Number(v)); }, 'Step of the task');
  const gateSw = el('button', {type: 'button', class: 'sd-switch pl-gates', 'aria-pressed': 'false', text: 'gates on',
    onclick: () => { tour.stop(); gates = !gates; gateSw.setAttribute('aria-pressed', String(gates)); show(at, false); }});
  bar.append(gateSw);

  const stage = el('div', {class: 'pl-stage'});
  figure.append(stage);
  const step = el('div', {class: 'pl-step'});
  const cmd = el('code', {class: 'pl-cmd'});
  const adds = el('div', {class: 'pl-adds'});
  const risk = el('p', {class: 'pl-risk', 'aria-live': 'polite'});
  step.append(el('p', {class: 'sd-label', text: 'the agent runs'}), cmd, el('p', {class: 'sd-label pl-gap', text: 'and now also holds'}), adds, risk);
  const bag = el('div', {class: 'pl-bag'});
  const meter = el('i', {class: 'pl-meter-fill'});
  const held = el('div', {class: 'pl-held'});
  bag.append(el('p', {class: 'sd-label', text: 'everything the session holds'}), el('div', {class: 'pl-meter'}, meter), held);
  stage.append(step, bag);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'},
    el('span', {class: 'pl-key'}, el('i', {class: 'pl-swatch'}), 'authority it holds', el('i', {class: 'pl-swatch is-bad'}), 'untrusted input'));
  figure.append(caption, foot);
  const play = playButton(foot, tour, () => runTour());

  const chip = ([name, kind], fresh) => el('span', {class: `sd-chip pl-item${kind === 'untrusted' ? ' is-bad' : ''}${fresh ? ' is-new' : ''}`, text: name});

  function show(i, fresh = true) {
    at = i; seg.set(String(i));
    const s = STEPS[i];
    attrs(cmd, {text: s.cmd});
    adds.replaceChildren(...s.adds.map(a => chip(a, fresh)));
    const all = STEPS.slice(0, i + 1).flatMap((x, k) => x.adds.map(a => chip(a, fresh && k === i)));
    held.replaceChildren(...all);
    meter.style.width = `${100 * all.length / TOTAL}%`;
    bag.setAttribute('aria-label', `${all.length} of ${TOTAL} things held`);
    risk.dataset.state = gates ? 'closed' : 'open';
    risk.innerHTML = gates
      ? `<b>closed by the ${s.gate}</b>, ${s.fix}`
      : `<b>worst case</b>, ${s.worst}`;
    caption.innerHTML = s.why + (i === STEPS.length - 1
      ? (gates ? ' <b>Every risk had a gate, and none of them was a better system prompt.</b>' : ' <b>The pile never shrinks</b>, and every item is real authority.')
      : '');
  }

  async function runTour() {
    await tour.run(async go => {
      gates = false; gateSw.setAttribute('aria-pressed', 'false');
      for (let i = 0; i < STEPS.length; i++) { show(i); await go.wait(2600); }
      await go.wait(600);
      gates = true; gateSw.setAttribute('aria-pressed', 'true'); show(STEPS.length - 1, false);
    });
  }

  pauseOffscreen(figure, tour);
  show(0, false);
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
