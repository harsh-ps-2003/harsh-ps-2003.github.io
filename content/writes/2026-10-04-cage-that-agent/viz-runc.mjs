// runc builds the cage from inside it. The setup steps play in order, the guards
// switch on late, and the known escapes sit on the steps before they are all on.
import {el, story, onceVisible, pauseOffscreen, playButton} from './viz-core.mjs';

const GUARDS = [['cg', 'cgroup'], ['ns', 'namespaces'], ['mask', 'masked paths'], ['caps', 'caps dropped'], ['sec', 'seccomp']];
const STEPS = [
  {text: 'runc starts on the host', on: [], cve: 'exe'},
  {text: 'join the cgroup', on: ['cg'], cve: 'fd'},
  {text: 'unshare the namespaces', on: ['ns']},
  {text: 'mount the rootfs, pivot_root', on: [], cve: 'symlink'},
  {text: '/dev nodes and the console', on: [], cve: 'races'},
  {text: 'mask the risky /proc paths', on: ['mask']},
  {text: 'drop capabilities', on: ['caps']},
  {text: 'load seccomp, run the app', on: ['sec']},
];
const ESCAPES = {
  exe: {name: 'runc overwrite', id: 'CVE-2019-5736',
    story: 'A process in the container rewrote the host\'s runc binary through /proc/self/exe, so the next container start ran attacker code as root on the host.'},
  fd: {name: 'leaked fd', id: 'CVE-2024-21626, Leaky Vessels',
    story: 'runc kept a handle to the host cgroup filesystem open while it built the box, and WORKDIR /proc/self/fd/7 pointed the app straight at the host filesystem.'},
  symlink: {name: 'symlink swap', id: 'CVE-2021-30465', race: true,
    story: 'runc checked that a mount target sat inside the container, then a symlink got swapped in before the mount, so the mount landed outside.'},
  races: {name: '2025 races', id: 'CVE-2025-31133, CVE-2025-52565, CVE-2025-52881', race: true,
    story: 'Three more races on masked paths, /dev/console and /proc/self/attr, each redirecting a write runc thought was safe.'},
};

export function mount(figure) {
  const s = story();
  figure.append(el('p', {class: 'sd-kicker', text: 'anatomy of an escape'}), el('p', {class: 'sd-title', text: 'runc builds the cage from inside it'}));

  // guard lamps
  const lamps = Object.fromEntries(GUARDS.map(([key, name]) => [key, el('span', {class: 'rc-lamp', 'data-key': key}, el('i', {class: 'rc-bulb', 'aria-hidden': 'true'}), name)]));
  figure.append(el('div', {class: 'rc-lamps', role: 'group', 'aria-label': 'Guards'}, el('span', {class: 'rc-lamps-label', text: 'guards on'}), Object.values(lamps)));

  // the steps
  const list = el('ol', {class: 'rc-steps'});
  const rows = STEPS.map((step, i) => {
    const dots = GUARDS.map(([key]) => el('i', {class: 'rc-g', 'data-key': key, title: key}));
    const marker = step.cve ? el('button', {type: 'button', class: 'rc-mark', 'data-cve': step.cve, onclick: () => pick(step.cve, true)},
      el('i', {class: 'rc-mark-dot', 'aria-hidden': 'true'}), ESCAPES[step.cve].name) : null;
    const row = el('li', {class: 'rc-step'},
      el('span', {class: 'rc-n', text: String(i + 1)}), el('span', {class: 'rc-text', text: step.text}),
      el('span', {class: 'rc-dots', 'aria-hidden': 'true'}, dots), marker);
    list.append(row);
    return {row, dots, marker};
  });
  const windowTag = el('p', {class: 'rc-window', text: 'the window, before the masks, the cap drop and seccomp'});

  // the detail panel, the picked escape and the race
  const detail = el('div', {class: 'rc-detail'});
  const head = el('p', {class: 'rc-head'}), body = el('p', {class: 'rc-story'}), cveId = el('p', {class: 'rc-id'});
  const beats = [
    ['check', 'rootfs/proc', 'inside the container, ok'],
    ['swap', 'rootfs/proc → /', 'now a symlink to the host'],
    ['use', 'mount lands on /', 'outside the container'],
  ].map(([verb, what, why], i) => el('li', {class: `rc-beat${i ? ' bad' : ' good'}`},
    el('span', {class: 'rc-verb', text: verb}), el('span', {class: 'sd-chip rc-what', text: what}), el('span', {class: 'rc-why', text: why})));
  const race = el('div', {class: 'rc-race'}, el('p', {class: 'rc-race-label', text: 'a race, check then use'}), el('ol', {class: 'rc-beats'}, beats));
  detail.append(head, body, race, cveId);
  figure.append(el('div', {class: 'rc-grid'}, el('div', {}, list, windowTag), detail));

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'click a marker for its story'}));
  figure.append(caption, foot);
  const play = playButton(foot, s, () => tour());

  let picked = null;
  function setStep(n) {
    // n steps done, guards from those steps are on
    const on = new Set(STEPS.slice(0, n).flatMap(st => st.on));
    for (const [key] of GUARDS) lamps[key].classList.toggle('on', on.has(key));
    rows.forEach((r, i) => {
      const before = new Set(STEPS.slice(0, i + 1).flatMap(st => st.on));
      r.row.classList.toggle('done', i < n);
      r.row.classList.toggle('now', i === n - 1);
      r.row.classList.toggle('open', i < n && !before.has('mask'));
      r.dots.forEach(d => d.classList.toggle('on', i < n && before.has(d.dataset.key)));
      if (r.marker) r.marker.classList.toggle('shown', i < n);
    });
    windowTag.classList.toggle('shown', n >= 5);
  }
  function pick(key, byUser) {
    if (byUser) { s.stop(); play.markPlayed(); setStep(STEPS.length); }
    picked = key;
    const e = ESCAPES[key];
    rows.forEach(r => r.marker?.setAttribute('aria-pressed', String(r.marker.dataset.cve === key)));
    head.textContent = e.name; body.textContent = e.story; cveId.textContent = e.id;
    race.hidden = !e.race;
    detail.classList.remove('idle');
    if (e.race) raceBeats(byUser);
  }
  async function raceBeats(byUser) {
    if (!byUser) return;
    s.run(async go => { beats.forEach(b => b.classList.remove('on')); for (const b of beats) { await go.wait(420); b.classList.add('on'); } });
  }
  function idle() {
    picked = null;
    rows.forEach(r => r.marker?.setAttribute('aria-pressed', 'false'));
    detail.classList.add('idle');
    head.textContent = 'every guard switches on late';
    body.textContent = 'Watch the lamps. Most of setup happens before the masks, the cap drop and seccomp exist, and that is where escapes land.';
    cveId.textContent = ''; race.hidden = true;
  }
  function say(n) {
    caption.innerHTML = n === 0 ? 'runc has to build the container while standing inside it, so the walls go up one step at a time.'
      : n < STEPS.length ? `Step ${n}, ${STEPS[n - 1].text}. ${n < 6 ? '<b>Some guards are still off.</b>' : 'More guards are on now.'}`
      : 'The escapes all hit steps before every guard was on, <b>usually by racing a check and its use</b>, in the runtime and not in the kernel primitives.';
  }

  async function tour() {
    await s.run(async go => {
      idle(); setStep(0); say(0);
      await go.wait(900);
      for (let n = 1; n <= STEPS.length; n++) {
        setStep(n); say(n);
        const step = STEPS[n - 1];
        if (step.cve === 'symlink') {
          pick('symlink', false);
          beats.forEach(b => b.classList.remove('on'));
          for (const b of beats) { await go.wait(520); b.classList.add('on'); }
          await go.wait(900);
        } else await go.wait(950);
      }
      say(STEPS.length);
      if (picked !== 'symlink') pick('symlink', false);
      beats.forEach(b => b.classList.add('on'));
    });
  }

  idle(); setStep(STEPS.length); say(STEPS.length); beats.forEach(b => b.classList.add('on'));
  pauseOffscreen(figure, s);
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
