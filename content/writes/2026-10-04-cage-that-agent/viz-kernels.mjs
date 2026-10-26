// Same agent code in three cages. data-mode="path" follows a syscall down each
// stack and opens an "inside" view per runtime, data-mode="copyfail" runs the
// Copy Fail page cache write against all three.
import {el, attrs, story, onceVisible, pauseOffscreen, playButton, ease} from './viz-core.mjs';

const COLUMNS = [
  {
    key: 'runc', name: 'runc', sub: 'a container',
    verdict: 'fastest, but a kernel bug is everyone’s bug',
    who: ['Daytona', 'Cloudflare Sandboxes'],
    inside: [
      ['dockerd', 'takes your docker run'],
      ['containerd', 'manages containers, one shim each'],
      ['shim', 'stays on as the container’s parent'],
      ['runc', 'builds the box, then exits'],
    ],
    insideFoot: 'After that the app is a normal process, and the one shared kernel does all the isolating.',
    cf: {verdict: 'other tenants hit', bad: true},
  },
  {
    key: 'gvisor', name: 'gVisor', sub: 'a user space kernel',
    verdict: 'no KVM needed, but some syscalls are missing',
    who: ['Modal', 'GKE Agent Sandbox'],
    inside: [
      ['systrap', 'bounces each syscall to gVisor, not the host'],
      ['Sentry', 'a kernel in Go that answers most calls itself'],
      ['Gofer', 'does file access on the host for it'],
    ],
    insideFoot: 'The host only ever sees the Sentry’s own short, filtered list of calls.',
    cf: {verdict: 'never reaches the host', bad: false},
  },
  {
    key: 'fc', name: 'Firecracker', sub: 'a microVM',
    verdict: 'own kernel per agent, but no GPU',
    who: ['E2B', 'Fly Sprites', 'Vercel', 'Lambda'],
    inside: [
      ['jailer', 'locks the VMM in a chroot with seccomp'],
      ['VMM', 'a small Rust program on KVM, one per microVM'],
      ['vCPU threads', 'run the guest, each one filtered'],
      ['devices', 'a fake disk, network card and a few more, no USB or GPU'],
    ],
    insideFoot: 'Kata puts this kind of microVM behind a normal Kubernetes pod, RuntimeClass picks it and kubectl stays the same.',
    cf: {verdict: 'stuck inside one guest', bad: false},
  },
];

const box = (cls, title, sub, ...kids) => el('div', {class: `kn-box ${cls}`}, el('b', {text: title}), sub ? el('small', {text: sub}) : null, ...kids);

export function mount(figure, data) {
  const copyfail = data.mode === 'copyfail';
  const s = story();
  let selected = null;

  figure.append(
    el('p', {class: 'sd-kicker', text: copyfail ? 'copy fail' : 'what if the kernel wasn’t shared'}),
    el('p', {class: 'sd-title', text: copyfail ? 'Same exploit, three cages' : 'Same agent code, three cages'}));

  let runButton = null;
  if (copyfail) {
    const bar = el('div', {class: 'sd-bar'});
    runButton = el('button', {type: 'button', class: 'kn-run', text: 'run Copy Fail', onclick: () => { s.stop(); fire(); }});
    bar.append(runButton, el('button', {type: 'button', text: 'reset', onclick: () => { s.stop(); reset(); }}));
    figure.append(bar);
  }

  const grid = el('div', {class: 'kn-grid'});
  figure.append(grid);
  const cols = COLUMNS.map(c => {
    const col = el('div', {class: 'kn-col', 'data-key': c.key});
    const head = el('div', {class: 'kn-head'}, el('b', {text: c.name}), el('span', {text: c.sub}));
    const agent = box('kn-agent', copyfail ? 'Copy Fail' : 'agent code', copyfail ? '4 byte write' : 'nobody reviewed it');
    const stack = el('div', {class: 'kn-stack'}, agent);
    const parts = {agent};
    if (c.key === 'runc') {
      parts.cache = el('span', {class: 'sd-chip kn-cache', text: 'page cache'});
      parts.neighbours = [el('span', {class: 'sd-chip', text: 'tenant B'}), el('span', {class: 'sd-chip', text: 'tenant C'})];
      parts.host = box('kn-host kn-line kn-tall', 'host kernel', 'shared by every container',
        el('span', {class: 'kn-entry', text: '↓ every syscall, direct'}), parts.cache, el('span', {class: 'kn-neighbours'}, parts.neighbours));
      stack.append(parts.host);
      parts.firstStop = parts.host;
    } else if (c.key === 'gvisor') {
      parts.note = el('span', {class: 'sd-chip kn-note', text: 'no AF_ALG here'});
      parts.first = box('kn-guest', 'Sentry', 'its own kernel, in Go', parts.note);
      parts.bridge = box('kn-bridge', 'filtered calls', 'its own short list');
      parts.host = box('kn-host kn-line', 'host kernel', 'never sees the app’s calls');
      stack.append(parts.first, parts.bridge, parts.host);
    } else {
      parts.cache = el('span', {class: 'sd-chip kn-cache', text: 'page cache'});
      parts.first = box('kn-guest', 'guest kernel', 'its own Linux', parts.cache);
      parts.bridge = box('kn-bridge kn-line', 'VMM', 'VM exits, a few devices');
      parts.host = box('kn-host', 'host kernel', 'never runs guest calls');
      stack.append(parts.first, parts.bridge, parts.host);
    }
    const dot = el('i', {class: 'kn-dot', 'aria-hidden': 'true'}), small = el('i', {class: 'kn-dot kn-small', 'aria-hidden': 'true'});
    const verdict = el('p', {class: 'kn-verdict', text: copyfail ? '' : c.verdict});
    const who = el('p', {class: 'kn-who'}, c.who.map(w => el('span', {text: w})));
    col.append(head, stack, dot, small, verdict, who);
    if (!copyfail) {
      col.setAttribute('role', 'button'); col.setAttribute('tabindex', '0');
      col.setAttribute('aria-label', `look inside ${c.name}`);
      // a click ends the tour, so settle the scene before opening the inside view
      const pick = () => { if (s.playing) { s.stop(); settle(); } select(selected === c.key ? null : c.key); };
      col.addEventListener('click', pick);
      col.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }
    grid.append(col);
    return {c, col, parts, dot, small, verdict};
  });

  // the "inside" panel, path mode only
  const inside = el('div', {class: 'kn-inside', 'aria-live': 'polite'});
  if (!copyfail) figure.append(inside);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: copyfail ? 'the bug was in the kernel itself, not in runc' : 'click a column to look inside'}));
  figure.append(caption, foot);
  const play = playButton(foot, s, () => tour());

  // ---- dots ----
  const centerY = (col, node) => {
    const a = col.getBoundingClientRect(), b = node.getBoundingClientRect();
    return b.top - a.top + b.height / 2;
  };
  const place = (dot, y, show = true) => attrs(dot, {style: {transform: `translate(-50%, ${y}px)`, opacity: show ? 1 : 0}});
  const hideDots = () => cols.forEach(k => { place(k.dot, 0, false); place(k.small, 0, false); });
  async function travel(go, k, dot, from, to, ms) {
    const y0 = centerY(k.col, from), y1 = centerY(k.col, to);
    place(dot, y0);
    // the other columns' tweens keep ticking after a stop, so only the live run may move dots
    await go.tween(ms, t => { if (go.alive()) place(dot, y0 + (y1 - y0) * t); }, ease.inOut);
  }
  const flash = node => { node.classList.remove('kn-flash'); void node.offsetWidth; node.classList.add('kn-flash'); };

  function select(key) {
    selected = key;
    cols.forEach(k => k.col.setAttribute('aria-pressed', String(k.c.key === key)));
    if (!key) {
      inside.replaceChildren(el('p', {class: 'kn-inside-hint', text: 'Click runc, gVisor or Firecracker to see what is inside.'}));
      return;
    }
    const c = COLUMNS.find(x => x.key === key);
    const chain = el('div', {class: 'kn-chain'});
    c.inside.forEach(([name, role], i) => {
      if (i) chain.append(el('span', {class: 'kn-arrow', 'aria-hidden': 'true', text: '→'}));
      chain.append(el('div', {class: 'kn-part'}, el('b', {text: name}), el('span', {text: role})));
    });
    inside.replaceChildren(el('p', {class: 'sd-label', text: `inside ${c.name}`}), chain, el('p', {class: 'kn-inside-foot', text: c.insideFoot}));
  }

  // ---- path mode ----
  async function syscalls(go) {
    hideDots();
    cols.forEach(k => k.col.classList.remove('kn-done'));
    caption.innerHTML = 'Same agent code in all three. <b>Watch where its syscalls land.</b>';
    await go.wait(500);
    const [r, g, f] = cols;
    // all three leave at once, runc lands first because nothing is in the way
    await Promise.all([
      (async () => { await travel(go, r, r.dot, r.parts.agent, r.parts.host, 900); flash(r.parts.host); })(),
      (async () => {
        await travel(go, g, g.dot, g.parts.agent, g.parts.first, 900); flash(g.parts.first); place(g.dot, 0, false);
        await travel(go, g, g.small, g.parts.first, g.parts.host, 1000); flash(g.parts.host);
      })(),
      (async () => {
        await travel(go, f, f.dot, f.parts.agent, f.parts.first, 900); flash(f.parts.first); place(f.dot, 0, false);
        await travel(go, f, f.small, f.parts.first, f.parts.bridge, 700); flash(f.parts.bridge);
        await travel(go, f, f.small, f.parts.bridge, f.parts.host, 600);
      })(),
    ]);
    cols.forEach(k => k.col.classList.add('kn-done'));
    caption.innerHTML = 'In runc every syscall lands in the kernel <b>every container on the box shares</b>. gVisor and Firecracker answer them in a kernel of their own, and only a narrow, filtered path reaches the host.';
  }

  // ---- copy fail mode ----
  function reset() {
    hideDots();
    figure.dataset.cf = 'idle';
    cols.forEach(k => {
      attrs(k.verdict, {text: ''});
      k.verdict.className = 'kn-verdict';
      k.parts.cache?.classList.remove('is-bad');
      k.parts.neighbours?.forEach(n => n.classList.remove('is-bad'));
      k.parts.note?.classList.remove('is-ok');
      k.parts.host.classList.remove('kn-hit', 'kn-safe');
      k.parts.first?.classList.remove('kn-hit');
    });
    caption.innerHTML = 'Copy Fail lets normal code write <b>4 bytes into the kernel’s page cache</b>, the in memory copy of files, and that is enough to become root. Same exploit in all three.';
  }
  async function exploit(go) {
    reset(); figure.dataset.cf = 'running';
    await go.wait(350);
    const [r, g, f] = cols;
    await Promise.all([
      (async () => {
        await travel(go, r, r.dot, r.parts.agent, r.parts.cache, 900);
        r.parts.cache.classList.add('is-bad'); r.parts.host.classList.add('kn-hit'); place(r.dot, 0, false);
        await go.wait(350);
        r.parts.neighbours.forEach(n => n.classList.add('is-bad'));
      })(),
      (async () => {
        await travel(go, g, g.dot, g.parts.agent, g.parts.first, 900);
        g.parts.note.classList.add('is-ok'); place(g.dot, 0, false);
        await go.wait(350);
        g.parts.host.classList.add('kn-safe');
      })(),
      (async () => {
        await travel(go, f, f.dot, f.parts.agent, f.parts.cache, 900);
        f.parts.cache.classList.add('is-bad'); f.parts.first.classList.add('kn-hit'); place(f.dot, 0, false);
        await go.wait(350);
        f.parts.host.classList.add('kn-safe');
      })(),
    ]);
    cols.forEach(k => {
      attrs(k.verdict, {text: k.c.cf.verdict});
      k.verdict.className = `kn-verdict ${k.c.cf.bad ? 'sd-bad' : 'sd-good'}`;
    });
    figure.dataset.cf = 'done';
    caption.innerHTML = 'Only the shared kernel turns it into <b>everyone’s problem</b>. gVisor never offers the socket it needs, Firecracker keeps the damage in one guest, and E2B had already built its guest kernel without it.';
  }

  async function tour() {
    await s.run(async go => {
      if (copyfail) await exploit(go);
      else { select(null); await syscalls(go); }
    });
  }
  function fire() { s.run(go => exploit(go)); }

  // final state without motion, so the figure reads even before it plays
  function settle() {
    if (copyfail) reset();
    else {
      hideDots();
      caption.innerHTML = 'In runc every syscall lands in the kernel <b>every container on the box shares</b>. gVisor and Firecracker answer them in a kernel of their own, and only a narrow, filtered path reaches the host.';
    }
  }
  if (!copyfail) select(null);
  settle();
  pauseOffscreen(figure, s);
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
