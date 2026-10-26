// The tj-actions/changed-files compromise as a chain of hops, and the 3 fixes
// from the post, each of which breaks the link it protects.
import {el, story, onceVisible, pauseOffscreen, playButton} from './viz-core.mjs';

const NODES = [
  {name: 'a malicious pull request', sub: 'opened against SpotBugs',
    note: 'Anyone can open a pull request, and a pull request can trigger workflows in the target repo.'},
  {name: 'a pull_request_target workflow', sub: 'runs the PR code with the repo secrets',
    note: 'pull_request_target runs in the base repository with full access to secrets, so checking out and running the PR code hands them over.'},
  {name: 'a maintainer token', sub: 'a personal access token, now stolen',
    note: 'The token belonged to a SpotBugs maintainer and had write access.'},
  {name: 'SpotBugs', sub: 'write access',
    note: 'Write access to SpotBugs was the way into Reviewdog.'},
  {name: 'Reviewdog', sub: 'the next hop',
    note: 'From Reviewdog they reached tj-actions/changed-files.'},
  {name: 'tj-actions/changed-files', sub: 'version tags moved to a malicious commit',
    note: 'Version tags are mutable, so the attackers pointed existing tags at their own commit after the fact.'},
  {name: 'over 23,000 repos', sub: 'secrets printed into their workflow logs',
    note: 'Every workflow that used the tag ran the new code, which pulled secrets out of runner memory and printed them to the logs.'},
];
// each fix guards the link into a node
const FIXES = [
  {key: 'prt', label: 'no pull_request_target with PR checkout', guards: 1, held: 'the PR code never runs with secrets'},
  {key: 'pin', label: 'pin actions to a commit SHA', guards: 6, held: 'pinned repos keep running the old commit'},
  {key: 'ro', label: 'read-only GITHUB_TOKEN by default', guards: null, held: ''},
];

export function mount(figure) {
  const on = {prt: false, pin: false, ro: false};
  let reached = NODES.length - 1, pulse = -1;
  const tour = story(), run = story();

  figure.append(el('p', {class: 'sd-kicker', text: 'supply chain'}),
    el('p', {class: 'sd-title', text: 'How 1 pull request reached thousands of repos'}));
  const fixes = el('div', {class: 'sc-fixes', role: 'group', 'aria-label': 'Fixes'});
  figure.append(fixes);
  const switches = FIXES.map(f => {
    const b = el('button', {type: 'button', class: 'sd-switch sc-switch', 'aria-pressed': 'false', text: f.label,
      onclick: () => { tour.stop(); on[f.key] = !on[f.key]; b.setAttribute('aria-pressed', String(on[f.key])); replay(); }});
    fixes.append(b);
    return b;
  });

  const chain = el('ol', {class: 'sc-chain'});
  figure.append(chain);
  const rows = NODES.map((n, i) => {
    const link = i > 0 ? el('span', {class: 'sc-link'}, el('i', {class: 'sc-break'})) : null;
    const node = el('button', {type: 'button', class: 'sc-node', onclick: () => { tour.stop(); showNote(i); }},
      el('span', {class: 'sc-name', text: n.name}), el('span', {class: 'sc-sub', text: n.sub}));
    const li = el('li', {class: 'sc-row'}, link, node);
    chain.append(li);
    return {li, link, node};
  });
  const token = el('span', {class: 'sd-chip sc-token'});
  rows[NODES.length - 1].li.append(token);

  const note = el('p', {class: 'sc-note', 'aria-live': 'polite'});
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'tj-actions/changed-files, March 2025, simplified'}));
  figure.append(note, caption, foot);
  const play = playButton(foot, tour, () => runTour());

  function stopAt() {
    // the first guarded link that is switched on stops the chain before that node
    const guards = FIXES.filter(f => on[f.key] && f.guards !== null).map(f => f.guards);
    return guards.length ? Math.min(...guards) : NODES.length;
  }

  function paint() {
    const stop = stopAt();
    rows.forEach((r, i) => {
      const hit = i <= reached && i <= pulse && i < stop;
      r.node.dataset.state = hit ? 'hit' : i === stop && pulse >= stop ? 'held' : 'idle';
      if (r.link) {
        r.link.dataset.state = i < stop && i <= pulse ? 'hit' : i === stop && pulse >= stop ? 'held' : 'idle';
        const guard = FIXES.find(f => on[f.key] && f.guards === i);
        r.link.querySelector('.sc-break').textContent = guard ? guard.held : '';
      }
    });
    const end = rows[NODES.length - 1];
    const reachedEnd = stop >= NODES.length && pulse >= NODES.length - 1;
    token.hidden = !reachedEnd;
    token.className = `sd-chip sc-token ${on.ro ? 'is-ok' : 'is-bad'}`;
    token.textContent = on.ro ? 'the leaked GITHUB_TOKEN can only read' : 'the leaked GITHUB_TOKEN can write to the repo';
    end.li.classList.toggle('has-token', reachedEnd);
    caption.innerHTML = captionFor(stop, reachedEnd);
  }

  function captionFor(stop, reachedEnd) {
    if (pulse < NODES.length - 1 && pulse < stop) return 'Follow the hops.';
    if (stop === 1) return 'Without pull_request_target running PR code, <b>the first token is never stolen</b> and the chain never starts.';
    if (stop === 6) return 'The tags still moved, but <b>repos pinned to a commit SHA kept running the old code</b>.';
    if (on.ro) return 'Secrets still leak from runner memory, but <b>the leaked GITHUB_TOKEN can only read</b>. It limits the damage, it does not stop the chain.';
    return '1 stolen token, a few hops, and <b>every repo that used the moving tag printed its secrets</b> into its logs.';
  }

  function showNote(i) {
    note.innerHTML = `<b>${NODES[i].name}</b> ${NODES[i].note}`;
  }

  function replay(fast = false) {
    return run.run(async t => {
      const stop = stopAt();
      if (fast) { pulse = NODES.length; paint(); return; }
      pulse = -1; paint();
      for (let i = 0; i < NODES.length; i++) {
        pulse = i; paint();
        if (i >= stop) break;
        await t.wait(320);
      }
      pulse = NODES.length; paint();
    });
  }

  async function runTour() {
    note.innerHTML = '';
    await tour.run(async t => {
      for (const f of FIXES) { on[f.key] = false; }
      switches.forEach(b => b.setAttribute('aria-pressed', 'false'));
      await replay(); await t.wait(2400);
      on.ro = true; switches[2].setAttribute('aria-pressed', 'true'); await replay(); await t.wait(2400);
      on.pin = true; switches[1].setAttribute('aria-pressed', 'true'); await replay(); await t.wait(2400);
      on.prt = true; switches[0].setAttribute('aria-pressed', 'true'); await replay();
    });
  }

  pulse = NODES.length; paint();
  pauseOffscreen(figure, tour);
  onceVisible(figure, () => { play.markPlayed(); runTour(); });
}
