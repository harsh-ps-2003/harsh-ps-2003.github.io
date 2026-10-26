// A snapshot is a copy of guest RAM, secrets included. data-mode="plain" plays
// boot, snapshot, scan and restore. data-mode="sev" starts with SEV-SNP on, where
// the host only sees noise but code inside the guest still reads the token.
import {el, attrs, story, onceVisible, pauseOffscreen, segmented, playButton} from './viz-core.mjs';

const COLS = 8, ROWS = 5, N = COLS * ROWS;
// where the token ends up in RAM, and who put it there (from the post's hands on run)
const TOKENS = [[3, 'kernel command line'], [10, 'kernel command line'], [17, 'init env'], [22, 'dmesg ring'], [29, 'journal'], [36, 'journal']];
const TOK = new Map(TOKENS);
const USED = new Set([0, 1, 2, 4, 6, 8, 9, 12, 13, 14, 16, 18, 20, 21, 24, 25, 27, 30, 31, 33, 34, 35, 38, 39]);
const HEX = '0123456789abcdef';
// ciphertext looks random, so each page gets its own made up bytes
const noise = i => { const h = Math.imul(i + 11, 2654435761) >>> 0; return HEX[h >>> 28] + HEX[(h >>> 20) & 15]; };
const CHAPTERS = [['boot', 'boot'], ['snapshot', 'snapshot'], ['scan', 'scan'], ['restore', 'restore twice'], ['inside', 'from inside']];

export function mount(figure, data) {
  let sev = data.mode === 'sev', at = 0;
  const tour = story(), poke = story();

  const title = el('p', {class: 'sd-title'});
  figure.append(el('p', {class: 'sd-kicker', text: sev ? 'confidential computing' : 'secrets in snapshots'}), title);
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, CHAPTERS, 'boot', v => go(CHAPTERS.findIndex(c => c[0] === v)), 'Step');
  const restoreBtn = seg.box.querySelector('[data-value="restore"]');
  const sevSw = el('button', {type: 'button', class: 'sd-switch sn-sev', 'aria-pressed': String(sev), text: 'SEV-SNP',
    onclick: () => { sev = !sev; sevSw.setAttribute('aria-pressed', String(sev)); if (sev && at === 3) at = 2; go(at); }});
  bar.append(sevSw);

  // the guest on the left, the host disk on the right
  const stage = el('div', {class: 'sn-stage'});
  figure.append(stage);
  const grid = cls => { const g = el('div', {class: `sn-grid ${cls}`}); const cells = Array.from({length: N}, (_, i) => el('i', {class: 'sn-cell'})); g.append(...cells); return {g, cells}; };
  const ram = grid('sn-ram'), mem = grid('sn-mem');
  const paused = el('span', {class: 'sn-badge', text: 'paused'});
  const pkg = el('span', {class: 'sd-chip is-bad sn-pkg', text: 'evil-pkg postinstall'});
  const source = el('p', {class: 'sn-source', 'aria-live': 'polite'});
  const leak = el('span', {class: 'sd-chip is-bad sn-leak', text: 'token → attacker.com'});
  const guest = el('div', {class: 'sn-box sn-guest'},
    el('p', {class: 'sd-label'}, 'microVM, guest RAM ', paused),
    el('span', {class: 'sd-chip sn-token', text: 'SECRET_DEMO_TOKEN'}),
    ram.g, source, pkg, leak);
  const scanner = el('i', {class: 'sn-scanner'});
  mem.g.append(scanner);
  const count = el('b', {class: 'sn-count'});
  const host = el('div', {class: 'sn-box sn-host'},
    el('p', {class: 'sd-label', text: 'host disk, snap.mem'}),
    mem.g,
    el('p', {class: 'sn-grep'}, el('code', {text: 'strings snap.mem | grep -c SECRET'}), count));
  stage.append(guest, el('span', {class: 'sn-arrow', 'aria-hidden': 'true', text: '→'}), host);
  const clones = el('div', {class: 'sn-clones'},
    ...['restore A', 'restore B'].map(name => el('div', {class: 'sn-clone'}, el('span', {class: 'sd-label', text: name}), el('span', {class: 'sd-chip is-bad', text: 'SECRET_DEMO_TOKEN'}))));
  figure.append(clones);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'schematic, 1 square stands for many pages of a 256 MB guest'}));
  figure.append(caption, foot);
  const play = playButton(foot, tour, () => runTour());

  ram.cells.forEach((c, i) => { c.dataset.kind = TOK.has(i) ? 'tok' : USED.has(i) ? 'page' : 'free'; });
  mem.cells.forEach((c, i) => { c.dataset.kind = ram.cells[i].dataset.kind; });

  // the resting state after chapter c, every step keeps what the earlier ones did
  function base(c) {
    figure.dataset.sev = String(sev);
    restoreBtn.hidden = sev;
    seg.box.dataset.odd = String(!sev);  // 5 steps without SEV, 4 with it
    title.textContent = sev ? 'Encrypt the RAM and the host only sees noise' : 'A snapshot is a copy of RAM, secrets included';
    seg.set(CHAPTERS[c][0]);
    ram.cells.forEach(cell => { cell.classList.toggle('is-on', true); cell.classList.remove('is-hit'); });
    paused.hidden = c < 1;
    mem.cells.forEach((cell, i) => {
      cell.classList.toggle('is-on', c >= 1);
      cell.classList.toggle('is-noise', c >= 1 && sev);
      cell.textContent = c >= 1 && sev ? noise(i) : '';
      cell.classList.toggle('is-hit', c >= 2 && !sev && TOK.has(i));
    });
    scanner.style.left = c >= 2 ? '100%' : '0%';
    scanner.hidden = c < 2;
    count.textContent = c >= 2 ? (sev ? '0' : '65') : '';
    count.dataset.state = sev ? 'ok' : 'bad';
    clones.hidden = !(c >= 3 && !sev);
    pkg.hidden = c < 4; leak.hidden = c < 4;
    if (c >= 4) TOKENS.forEach(([i]) => ram.cells[i].classList.add('is-hit'));
    source.textContent = c === 0 ? 'copied by the kernel command line, init env, dmesg and the journal' : '';
    caption.innerHTML = captionFor(c);
  }

  function captionFor(c) {
    if (c === 0) return 'The token goes in on the kernel command line, and the kernel and init copy it <b>all over RAM</b>.';
    if (c === 1) return sev
      ? 'Pausing writes RAM to a file, but the CPU encrypted it with a key <b>the host never gets</b>.'
      : 'Pausing for scale to zero writes RAM to a file on the host, <b>no encryption, no redaction</b>.';
    if (c === 2) return sev
      ? 'Same scan, <b>0 matches</b>, the host only ever holds ciphertext.'
      : '<b>65 copies</b> of the token, found with strings and grep, no exploit needed.';
    if (c === 3) return 'Restore the same file twice and <b>both microVMs wake up holding the same token</b>.';
    return sev
      ? '<b>But a package inside the guest still reads it.</b> SEV-SNP protects RAM from the host, not from code running inside.'
      : 'And a package inside the guest reads it too, no snapshot needed.';
  }

  // the motion inside each chapter, played after base() sets the scene
  async function animate(g, c, slow) {
    const k = slow ? 1 : .6;
    if (c === 0) {
      ram.cells.forEach(cell => cell.classList.remove('is-on'));
      await g.tween(500 * k, t => ram.cells.forEach((cell, i) => cell.classList.toggle('is-on', i / N <= t && cell.dataset.kind !== 'tok')));
      for (const [i, who] of TOKENS) { ram.cells[i].classList.add('is-on'); source.textContent = `copied by ${who}`; await g.wait(320 * k); }
      source.textContent = 'copied by the kernel command line, init env, dmesg and the journal';
    } else if (c === 1) {
      mem.cells.forEach(cell => { cell.classList.remove('is-on', 'is-noise'); cell.textContent = ''; });
      await g.tween(1000 * k, t => mem.cells.forEach((cell, i) => {
        const on = (i % COLS) / COLS <= t;
        cell.classList.toggle('is-on', on); cell.classList.toggle('is-noise', on && sev); cell.textContent = on && sev ? noise(i) : '';
      }));
    } else if (c === 2) {
      mem.cells.forEach(cell => cell.classList.remove('is-hit'));
      scanner.hidden = false;
      await g.tween(1500 * k, t => {
        scanner.style.left = `${100 * t}%`;
        let hits = 0;
        TOKENS.forEach(([i]) => { const hit = !sev && (i % COLS + .5) / COLS <= t; mem.cells[i].classList.toggle('is-hit', hit); hits += hit; });
        count.textContent = sev ? '0' : String(Math.round(65 * Math.min(1, t * 1.05)));
      });
    } else if (c === 3) {
      clones.classList.remove('is-in'); void clones.offsetWidth; clones.classList.add('is-in');
      await g.wait(700 * k);
    } else {
      TOKENS.forEach(([i]) => ram.cells[i].classList.remove('is-hit')); leak.hidden = true;
      await g.wait(500 * k);
      for (const [i] of TOKENS) { ram.cells[i].classList.add('is-hit'); await g.wait(120 * k); }
      leak.hidden = false;
    }
  }

  function go(c) { tour.stop(); at = c; base(c); poke.run(g => animate(g, c, false)); }

  async function runTour() {
    poke.stop();
    await tour.run(async g => {
      const path = sev ? [0, 1, 2, 4] : [0, 1, 2, 3];
      for (const c of path) { at = c; base(c); await animate(g, c, true); await g.wait(2200); }
    });
  }

  pauseOffscreen(figure, tour);
  base(0);
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
