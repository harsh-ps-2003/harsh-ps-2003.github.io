// Pick a cage. data-show="cage" walks the yes/no questions to one runtime,
// data-show="products" picks one of the 8 workload cells and lists who ships it.
import {el, story, onceVisible, pauseOffscreen, playButton, segmented} from './viz-core.mjs';

// ---------- the runtime flow ----------
const QUESTIONS = [
  {key: 'trusted', q: 'Is it code your team wrote and reviewed?'},
  {key: 'snippets', q: 'Does it only run small snippets that call your tools?'},
  {key: 'gpu', q: 'Does it need a GPU?'},
  {key: 'long', q: 'Does it run for a long time?', under: 'gpu'},
  {key: 'kvm', q: 'Can you get KVM on your hosts?'},
  {key: 'k8s', q: 'Do you run everything on Kubernetes?'},
];
const CAGES = {
  runc: {name: 'runc, plain Docker', why: 'fast and already everywhere', price: 'a shared kernel, so trusted code only', who: 'your normal deploys'},
  interp: {name: 'an interpreter sandbox', why: 'starts instantly, no container at all', price: 'a language subset, no shell and no pip install', who: 'Monty, WASI, Pyodide'},
  nvproxy: {name: 'gVisor with nvproxy', why: 'serverless GPU without needing KVM', price: 'a user space kernel, some syscalls missing', who: 'Modal'},
  chkata: {name: 'Cloud Hypervisor or Kata', why: 'hands a real GPU to a VM that can grow while it runs', price: 'a slower boot, younger snapshots', who: 'Fly GPU machines, Northflank'},
  gvisor: {name: 'gVisor', why: 'isolation that runs anywhere, starts like a process', price: 'some syscalls missing, slower file IO', who: 'Cloud Run, GKE Sandbox'},
  kata: {name: 'Kata Containers', why: 'a microVM behind a normal pod, kubectl stays the same', price: 'an extra shim layer', who: 'GKE Agent Sandbox, Northflank'},
  fc: {name: 'Firecracker', why: 'its own kernel per agent, snapshot restore, dense', price: 'no GPU and more ops work', who: 'E2B, Fly Sprites, Vercel'},
};
function decide(a) {
  // returns [the questions that were asked, the cage]
  if (a.trusted) return [['trusted'], 'runc'];
  if (a.snippets) return [['trusted', 'snippets'], 'interp'];
  if (a.gpu) return [['trusted', 'snippets', 'gpu', 'long'], a.long ? 'chkata' : 'nvproxy'];
  if (!a.kvm) return [['trusted', 'snippets', 'gpu', 'kvm'], 'gvisor'];
  return [['trusted', 'snippets', 'gpu', 'kvm', 'k8s'], a.k8s ? 'kata' : 'fc'];
}

// ---------- the workload map ----------
// primitive kinds, how much kernel the agent shares with its neighbours
const KIND = {Firecracker: 'own', microVM: 'own', VM: 'own', 'Cloud Hypervisor': 'own', gVisor: 'user', container: 'shared', unstated: 'unknown', 'k8s pods': 'unknown'};
const CELLS = {
  'eph-cpu-stateless': {say: 'Short CPU jobs that forget everything. <b>E2B resumes a Firecracker snapshot for every sandbox.</b>',
    list: [['E2B', 'Firecracker', 'a fresh snapshot resume each time'], ['AWS AgentCore', 'microVM', 'a microVM per session, VMM not named']]},
  'eph-cpu-stateful': {tag: 'thin', say: 'Short sessions that keep their files. <b>This barely exists outside AgentCore.</b>',
    list: [['AgentCore session storage', 'microVM', 'preview']]},
  'per-cpu-stateless': {tag: 'empty', say: 'A box that lives for weeks but forgets every call. <b>Nobody ships this shape.</b>', list: []},
  'per-cpu-stateful': {tag: 'crowded', say: 'A computer per agent that sleeps cheaply between tasks. <b>The most crowded cell in 2026.</b>',
    list: [['Fly Sprites', 'Firecracker', 'checkpoints only move metadata'], ['Vercel Sandbox', 'Firecracker', ''], ['Together Code Sandbox', 'microVM', ''],
      ['Cursor Cloud Agents', 'VM', ''], ['Coder Agents', 'VM', ''], ['Manus Cloud Computer', 'unstated', ''],
      ['Daytona', 'container', 'shared kernel, Copy Fail reached it'], ['Cloudflare Sandboxes', 'container', '']]},
  'eph-gpu-stateless': {say: 'Serverless GPU that wakes fast. <b>Modal checkpoints the CUDA state and restores it.</b>',
    list: [['Modal', 'gVisor', 'GPU memory snapshots for fast cold starts']]},
  'eph-gpu-stateful': {tag: 'thin', say: 'Short GPU sessions that keep state. <b>Only alpha and preview features so far.</b>',
    list: [['Modal GPU snapshots', 'gVisor', 'alpha'], ['GKE Pod Snapshots', 'k8s pods', 'preview']]},
  'per-gpu-stateless': {tag: 'empty', say: 'Long lived GPU boxes that forget every call. <b>Nobody ships this shape.</b>', list: []},
  'per-gpu-stateful': {tag: 'no agent product', say: 'GPU machines that stay up. <b>The VMs have existed for years, nobody packages them for agents yet.</b>',
    list: [['RunPod, Lightning AI, Lambda, ThunderCompute', 'VM', 'GPU VMs, not agent first'], ['Fly GPU Machines', 'Cloud Hypervisor', '']]},
};
const SHORT = {
  'eph-cpu-stateless': 'E2B', 'eph-cpu-stateful': 'thin', 'per-cpu-stateless': 'empty', 'per-cpu-stateful': 'crowded',
  'eph-gpu-stateless': 'Modal', 'eph-gpu-stateful': 'thin', 'per-gpu-stateless': 'empty', 'per-gpu-stateful': 'no agent SKU',
};

export function mount(figure, data) {
  if (data.show === 'products') products(figure); else cage(figure);
}

function cage(figure) {
  const s = story();
  const answers = {trusted: false, snippets: false, gpu: false, long: false, kvm: true, k8s: false};
  figure.append(el('p', {class: 'sd-kicker', text: 'pick your cage'}), el('p', {class: 'sd-title', text: 'Which sandbox fits your agent?'}));
  const wrap = el('div', {class: 'pk-wrap'});
  const list = el('div', {class: 'pk-questions'});
  const rows = QUESTIONS.map(({key, q, under}) => {
    const yes = el('button', {type: 'button', text: 'yes', onclick: () => { s.stop(); set(key, true); }});
    const no = el('button', {type: 'button', text: 'no', onclick: () => { s.stop(); set(key, false); }});
    const row = el('div', {class: `pk-q${under ? ' pk-under' : ''}`}, el('span', {class: 'pk-text', text: q}), el('span', {class: 'pk-yn', role: 'group', 'aria-label': q}, yes, no));
    list.append(row);
    return {key, row, yes, no};
  });
  const card = el('div', {class: 'pk-card', 'aria-live': 'polite'});
  wrap.append(list, card);
  figure.append(wrap);
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'none of these fixes creds in env vars, secrets in snapshots or prompt injection on its own'}));
  figure.append(foot);
  const play = playButton(foot, s, () => tour());

  function set(key, v) { answers[key] = v; render(); }
  function render() {
    const [asked, pick] = decide(answers);
    rows.forEach(r => {
      const on = asked.includes(r.key);
      r.row.dataset.state = on ? (asked[asked.length - 1] === r.key ? 'last' : 'asked') : 'skipped';
      r.yes.setAttribute('aria-pressed', String(answers[r.key]));
      r.no.setAttribute('aria-pressed', String(!answers[r.key]));
      r.yes.disabled = r.no.disabled = false;
    });
    const c = CAGES[pick];
    card.dataset.pick = pick;
    card.replaceChildren(
      el('p', {class: 'sd-label', text: 'your cage'}),
      el('p', {class: 'pk-name', text: c.name}),
      el('p', {class: 'pk-line'}, el('span', {class: 'sd-good', text: '+ '}), c.why),
      el('p', {class: 'pk-line'}, el('span', {class: 'sd-bad', text: '− '}), c.price),
      el('p', {class: 'pk-who', text: c.who}));
    card.classList.remove('pk-pop'); void card.offsetWidth; card.classList.add('pk-pop');
  }
  async function tour() {
    await s.run(async go => {
      Object.assign(answers, {trusted: false, snippets: false, gpu: false, long: false, kvm: true, k8s: false}); render();
      await go.wait(2400);
      set('k8s', true); await go.wait(2400);
      set('gpu', true); await go.wait(2400);
      Object.assign(answers, {gpu: false, k8s: false}); render();
    });
  }
  render();
  pauseOffscreen(figure, s);
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}

function products(figure) {
  const s = story();
  const pick = {dur: 'eph', cpu: 'cpu', state: 'stateless'};
  figure.append(el('p', {class: 'sd-kicker', text: 'workload shapes'}), el('p', {class: 'sd-title', text: 'Pick the shape first, then the vendor'}));
  const bar = el('div', {class: 'sd-bar pk-axes'});
  figure.append(bar);
  const axes = {
    dur: segmented(bar, [['eph', 'ephemeral'], ['per', 'persistent']], pick.dur, v => { s.stop(); pick.dur = v; render(); }, 'How long it lives'),
    cpu: segmented(bar, [['cpu', 'CPU'], ['gpu', 'GPU']], pick.cpu, v => { s.stop(); pick.cpu = v; render(); }, 'CPU or GPU'),
    state: segmented(bar, [['stateless', 'stateless'], ['stateful', 'stateful']], pick.state, v => { s.stop(); pick.state = v; render(); }, 'State between calls'),
  };
  const body = el('div', {class: 'pk-body'});
  const maps = el('div', {class: 'pk-maps'});
  const cellButtons = {};
  for (const cpu of ['cpu', 'gpu']) {
    const grid = el('div', {class: 'pk-map', role: 'group', 'aria-label': `${cpu.toUpperCase()} cells`},
      el('span', {class: 'pk-map-title', text: cpu === 'cpu' ? 'CPU' : 'GPU'}),
      el('span', {class: 'pk-col-h', text: 'stateless'}), el('span', {class: 'pk-col-h', text: 'stateful'}));
    for (const dur of ['eph', 'per']) {
      grid.append(el('span', {class: 'pk-row-h', text: dur === 'eph' ? 'ephemeral' : 'persistent'}));
      for (const state of ['stateless', 'stateful']) {
        const key = `${dur}-${cpu}-${state}`;
        const b = el('button', {type: 'button', class: 'pk-cell', 'data-tag': CELLS[key].tag || 'live', text: SHORT[key],
          'aria-label': `${dur === 'eph' ? 'ephemeral' : 'persistent'} ${cpu} ${state}`,
          onclick: () => { s.stop(); Object.assign(pick, {dur, cpu, state}); render(); }});
        cellButtons[key] = b; grid.append(b);
      }
    }
    maps.append(grid);
  }
  const listBox = el('div', {class: 'pk-list', 'aria-live': 'polite'});
  body.append(maps, listBox);
  figure.append(body);
  const caption = el('p', {class: 'sd-caption'});
  figure.append(caption);
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'GKE Agent Sandbox and Northflank span cells, gVisor or Kata depending on setup'}));
  figure.append(foot);
  const play = playButton(foot, s, () => tour());

  function render() {
    const key = `${pick.dur}-${pick.cpu}-${pick.state}`, cell = CELLS[key];
    axes.dur.set(pick.dur); axes.cpu.set(pick.cpu); axes.state.set(pick.state);
    Object.entries(cellButtons).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === key)));
    const rows = cell.list.length
      ? cell.list.map(([name, prim, note]) => el('div', {class: 'pk-item'},
        el('span', {class: 'pk-item-name'}, el('b', {text: name}), note ? el('small', {text: note}) : null),
        el('span', {class: `sd-chip pk-prim ${KIND[prim] === 'own' ? 'is-ok' : KIND[prim] === 'shared' ? 'is-bad' : ''}`, text: prim})))
      : [el('p', {class: 'pk-empty', text: 'no vendor here yet'})];
    listBox.replaceChildren(...rows);
    listBox.classList.remove('pk-pop'); void listBox.offsetWidth; listBox.classList.add('pk-pop');
    caption.innerHTML = cell.say;
  }
  async function tour() {
    await s.run(async go => {
      Object.assign(pick, {dur: 'eph', cpu: 'cpu', state: 'stateless'}); render(); await go.wait(2600);
      Object.assign(pick, {dur: 'eph', cpu: 'gpu', state: 'stateless'}); render(); await go.wait(2600);
      Object.assign(pick, {dur: 'per', cpu: 'cpu', state: 'stateful'}); render();
      caption.innerHTML = 'E2B and Fly Sprites both run on Firecracker and still sit in opposite corners, <b>the same cage can ship as very different products.</b>';
    });
  }
  render();
  pauseOffscreen(figure, s);
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
