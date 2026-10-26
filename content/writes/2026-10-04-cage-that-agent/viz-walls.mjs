// Five walls, one shared kernel. The five Linux layers a container stacks around
// a process, each doing its one job in a tiny scene, and then one syscall that
// passes all five and still lands in the kernel every container shares.
import {el, story, onceVisible, pauseOffscreen, segmented, playButton} from './viz-core.mjs';

const LAYERS = [
  {key: 'ns', name: 'namespaces', q: 'what can it see?',
    says: 'Namespaces give each container its own view of processes, files and network. <b>The view is private, the kernel doing the work is shared.</b>',
    broke: 'User namespaces hand the packet filter to anyone who makes one, and a use-after-free in nf_tables gave root (CVE-2024-1086).'},
  {key: 'cg', name: 'cgroups', q: 'how much can it use?',
    says: 'Cgroups are meters, not walls. They cap CPU, memory and process count, and <b>over the line the kernel just kills the process.</b>',
    broke: 'In Leaky Vessels runc leaked an fd into the host cgroup filesystem, and /proc/self/fd walked straight into the host (CVE-2024-21626).'},
  {key: 'caps', name: 'capabilities', q: 'which root powers?',
    says: 'Root is split into separate powers. Docker drops the scary ones, but <b>the ones it keeps are exactly the ones an agent needs.</b>',
    broke: 'Grant CAP_BPF and the process can load programs that read host memory, and the other walls stop mattering.'},
  {key: 'sec', name: 'seccomp', q: 'which syscalls?',
    says: 'Seccomp checks every syscall at the door. The default list bounces a few dangerous ones and <b>lets most of the kernel through.</b>',
    broke: 'Every call the list allows still reaches kernel code that grows each release, and that is the code an exploit needs.'},
  {key: 'lsm', name: 'LSMs', q: 'which files and paths?',
    says: 'LSMs say yes or no to paths. Landlock fits agents best, <b>it limits what the code may touch instead of guessing what it will run.</b>',
    broke: 'AppArmor profiles assume you know the app\'s paths, and an agent invents new ones every task. Landlock still can\'t lock /proc.'},
];
const ALL = {key: 'all', name: 'one syscall',
  says: 'All five can do their job and the call still lands in the one kernel every container shares. <b>A bug there is everyone\'s bug.</b>',
  broke: 'Copy Fail was a bug in that shared kernel, so a process in one container could corrupt files its neighbours read.'};
const TABS = [...LAYERS, ALL];

// Reset a scene with no transitions, so a replay starts from a clean frame.
function instant(node, fn) { node.classList.add('wl-instant'); fn(); void node.offsetWidth; node.classList.remove('wl-instant'); }

// ---- the five scenes, each with reset() and play(go) ----
function nsScene(box) {
  const make = (name, procs) => el('div', {class: 'ns-c'},
    el('span', {class: 'ns-name', text: name}),
    el('ul', {class: 'ns-list'}, procs.map(([pid, p]) => el('li', {}, el('span', {class: 'ns-pid', text: `pid ${pid}`}), ` ${p}`))),
    el('i', {class: 'ns-arrow', 'aria-hidden': 'true'}));
  const a = make('container A', [[1, 'agent'], [2, 'python']]), b = make('container B', [[1, 'nginx'], [2, 'worker']]);
  const kernel = el('div', {class: 'ns-kernel', text: 'one host kernel runs both'});
  box.append(el('div', {class: 'ns-row'}, a, b), kernel);
  return {
    reset() { [a, b].forEach(c => c.classList.remove('on', 'down')); kernel.classList.remove('on'); },
    async play(go) {
      await go.wait(250); a.classList.add('on');
      await go.wait(450); b.classList.add('on');
      await go.wait(1100); a.classList.add('down'); b.classList.add('down');
      await go.wait(650); kernel.classList.add('on');
      await go.wait(1700);
    },
  };
}

function cgScene(box) {
  const fill = el('i', {class: 'cg-fill'}), proc = el('span', {class: 'sd-chip cg-proc', text: 'agent'});
  const stamp = el('span', {class: 'cg-stamp', text: 'OOM killed'});
  box.append(
    el('div', {class: 'cg-row'}, proc, el('span', {class: 'cg-meter', role: 'img', 'aria-label': 'memory use against the cgroup limit'}, fill, el('span', {class: 'cg-limit', text: 'limit'}))),
    el('p', {class: 'cg-legend', text: 'memory'}), stamp);
  const level = p => { fill.style.width = `${p}%`; };
  return {
    reset() { level(8); proc.classList.remove('is-dim', 'cg-dead'); stamp.classList.remove('on'); fill.classList.remove('full'); },
    async play(go) {
      for (const p of [30, 52, 71, 88, 100]) { await go.wait(480); level(p); }
      fill.classList.add('full');
      await go.wait(500); stamp.classList.add('on'); proc.classList.add('is-dim', 'cg-dead');
      await go.wait(1900);
    },
  };
}

// Docker keeps 14 of 41. These are the ones the post names, half kept, half dropped.
const KEYS = [
  ['CHOWN', 1, 1], ['DAC_OVERRIDE', 1, 1], ['SETUID', 1, 1], ['SETGID', 1, 1], ['NET_RAW', 1, 1], ['KILL', 1, 1], ['MKNOD', 1, 1],
  ['NET_BIND_SERVICE', 1, 0], ['SYS_ADMIN', 0, 0], ['SYS_MODULE', 0, 0], ['BPF', 0, 0], ['SYS_PTRACE', 0, 0],
  ['NET_ADMIN', 0, 0], ['SYS_TIME', 0, 0], ['SYS_RAWIO', 0, 0], ['SYS_BOOT', 0, 0],
];
function capsScene(box) {
  const label = el('p', {class: 'caps-label'});
  const keys = KEYS.map(([name, kept, need]) => el('span', {class: 'caps-key', 'data-kept': kept, 'data-need': need, text: name}));
  const note = el('p', {class: 'caps-note'}, el('i', {class: 'caps-dot'}), 'agents use these, so they stay on');
  box.append(label, el('div', {class: 'caps-grid'}, keys), note);
  return {
    reset() { label.textContent = 'root, one keyring that opens everything'; keys.forEach(k => k.classList.add('lit')); keys.forEach(k => k.classList.remove('need')); note.classList.remove('on'); },
    async play(go) {
      await go.wait(1000);
      label.textContent = 'a default docker container keeps 14 of 41';
      for (const k of keys.filter(k => k.dataset.kept === '0')) { await go.wait(170); k.classList.remove('lit'); }
      await go.wait(600);
      keys.filter(k => k.dataset.need === '1').forEach(k => k.classList.add('need')); note.classList.add('on');
      await go.wait(2000);
    },
  };
}

const CALLS = [['read', 1], ['openat', 1], ['write', 1], ['mount', 0], ['execve', 1], ['socket', 1], ['bpf', 0], ['clone', 1], ['reboot', 0], ['mmap', 1]];
function secScene(box) {
  const queue = el('span', {class: 'sec-queue'}), door = el('span', {class: 'sec-door', text: 'seccomp'});
  const inBin = el('div', {class: 'sec-bin'}), outBin = el('div', {class: 'sec-bin'});
  const note = el('p', {class: 'sec-note', text: 'docker\'s default bounces about 44 and lets 300+ through'});
  box.append(
    el('div', {class: 'sec-row'}, queue, door),
    el('div', {class: 'sec-bins'},
      el('div', {}, el('p', {class: 'sec-head', text: 'the kernel runs it'}), inBin),
      el('div', {}, el('p', {class: 'sec-head sd-good', text: 'bounced'}), outBin)),
    note);
  return {
    reset() { queue.replaceChildren(); inBin.replaceChildren(); outBin.replaceChildren(); door.className = 'sec-door'; note.classList.remove('on'); },
    async play(go) {
      for (const [name, ok] of CALLS) {
        queue.replaceChildren(el('span', {class: 'sd-chip sec-call', text: name}));
        door.className = 'sec-door';
        await go.wait(320);
        door.classList.add(ok ? 'pass' : 'block');
        queue.replaceChildren();
        (ok ? inBin : outBin).append(el('span', {class: `sd-chip sec-landed${ok ? '' : ' is-ok'}`, text: name}));
        await go.wait(260);
      }
      door.className = 'sec-door';
      await go.wait(300); note.classList.add('on');
      await go.wait(1900);
    },
  };
}

const PATHS = [['/workspace/app.py', 'allowed', ''], ['~/.ssh/id_rsa', 'denied', 'ok'], ['/etc/resolv.conf', 'denied', 'ok'], ['/proc/self/environ', 'allowed, a gap', 'bad']];
function lsmScene(box) {
  const rows = PATHS.map(([path, verdict, tone]) => el('li', {class: 'lsm-req'},
    el('span', {class: 'lsm-path', text: path}),
    el('span', {class: `lsm-verdict${tone ? ` sd-${tone === 'ok' ? 'good' : 'bad'}` : ''}`, text: verdict})));
  box.append(el('p', {class: 'lsm-rule'}, el('span', {class: 'sd-chip', text: 'landlock'}), ' only touch /workspace'), el('ul', {class: 'lsm-list'}, rows));
  return {
    reset() { rows.forEach(r => r.classList.remove('on')); },
    async play(go) {
      for (const r of rows) { await go.wait(650); r.classList.add('on'); }
      await go.wait(2000);
    },
  };
}

export function mount(figure) {
  const s = story();
  figure.append(el('p', {class: 'sd-kicker', text: 'container isolation'}), el('p', {class: 'sd-title', text: 'Five walls, one shared kernel'}));
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  let current = 'ns';
  const seg = segmented(bar, TABS.map(t => [t.key, t.name]), current, key => select(key, true), 'Pick a layer');

  // ---- the stack, agent on top, five bands, the shared kernel at the bottom ----
  const stack = el('div', {class: 'wl-stack'});
  const proc = el('div', {class: 'wl-proc'}, el('span', {text: 'agent process'}), el('span', {class: 'wl-sub', text: 'code nobody reviewed'}));
  const bands = LAYERS.map(l => el('button', {type: 'button', class: 'wl-band', 'data-key': l.key, onclick: () => select(l.key, true)},
    el('span', {class: 'wl-name', text: l.name}), el('span', {class: 'wl-q', text: l.q})));
  const neighbours = [el('span', {class: 'sd-chip wl-n', text: 'container B'}), el('span', {class: 'sd-chip wl-n', text: 'container C'})];
  const kernel = el('div', {class: 'wl-kernel'}, el('span', {class: 'wl-kname', text: 'host kernel'}), el('span', {class: 'wl-ns'}, el('span', {class: 'wl-sub', text: 'shared with'}), neighbours));
  const dot = el('i', {class: 'wl-dot', 'aria-hidden': 'true'});
  stack.append(proc, ...bands, kernel, dot);

  // ---- the scene for the picked layer ----
  const detail = el('div', {class: 'wl-detail'});
  const scenes = {};
  const sceneBoxes = {};
  for (const [key, make] of [['ns', nsScene], ['cg', cgScene], ['caps', capsScene], ['sec', secScene], ['lsm', lsmScene]]) {
    const box = el('div', {class: `wl-scene wl-${key}`});
    sceneBoxes[key] = box; scenes[key] = make(box);
  }
  const checks = LAYERS.map(l => el('li', {class: 'wl-check'}, el('span', {class: 'wl-tick', text: '✓'}), l.name));
  const bug = el('li', {class: 'wl-check wl-bugline'}, el('span', {class: 'wl-tick', text: '!'}), 'kernel bug, every container hit');
  sceneBoxes.all = el('div', {class: 'wl-scene wl-all'}, el('ul', {class: 'wl-checks'}, checks, bug));
  scenes.all = {
    reset() { checks.forEach(c => c.classList.remove('on')); bug.classList.remove('on'); },
    async play(go) {
      dot.classList.add('on');
      moveDot(proc);
      for (let i = 0; i < bands.length; i++) {
        await go.wait(520);
        moveDot(bands[i]); bands[i].classList.add('pass'); checks[i].classList.add('on');
      }
      await go.wait(560); moveDot(kernel, 18);
      await go.wait(700); kernel.classList.add('bug'); bug.classList.add('on'); dot.classList.remove('on');
      await go.wait(450); neighbours.forEach(n => n.classList.add('is-bad'));
      await go.wait(2200);
    },
  };
  const broke = el('p', {class: 'wl-broke'});
  detail.append(...Object.values(sceneBoxes), broke);
  figure.append(el('div', {class: 'wl-grid'}, stack, detail));

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'every container on the box sits on the same kernel'}));
  figure.append(caption, foot);
  const play = playButton(foot, s, () => tour());

  function moveDot(target, y) {
    const box = stack.getBoundingClientRect(), r = target.getBoundingClientRect();
    dot.style.top = `${r.top - box.top + (y ?? r.height / 2)}px`;
  }
  function show(key) {
    current = key;
    seg.set(key);
    const t = TABS.find(x => x.key === key);
    figure.dataset.layer = key;
    bands.forEach(b => b.classList.toggle('sel', b.dataset.key === key));
    for (const [k, box] of Object.entries(sceneBoxes)) box.hidden = k !== key;
    caption.innerHTML = t.says;
    broke.replaceChildren(el('span', {class: 'wl-broke-label', text: key === 'all' ? 'in real life' : 'how it broke'}), ' ', t.broke);
    instant(stack, () => {
      bands.forEach(b => b.classList.remove('pass'));
      kernel.classList.remove('bug'); neighbours.forEach(n => n.classList.remove('is-bad'));
      dot.classList.remove('on');
    });
    instant(detail, () => scenes[key].reset());
  }
  const playLayer = async (go, key) => { show(key); await scenes[key].play(go); };
  function select(key, byUser) {
    if (byUser) play.markPlayed();
    s.run(go => playLayer(go, key));
  }
  async function tour() {
    await s.run(async go => {
      for (const t of TABS) { await playLayer(go, t.key); await go.wait(300); }
    });
  }

  show('ns');
  pauseOffscreen(figure, s);
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
