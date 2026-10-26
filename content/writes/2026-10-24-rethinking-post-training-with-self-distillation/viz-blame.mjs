// Where does the grade land? The same wrong attempt at 3x + 7 = 22 graded four
// ways, from GRPO's one shared number down to a grade for every candidate token.
// Used three times in the post, data-modes picks which tabs a copy shows.
import {el, attrs, fmt, signed, story, onceVisible, pauseOffscreen, segmented, playButton} from './viz-core.mjs';

// the written tokens, with student and teacher probability for each, and the
// other likely candidates at that position (illustrative numbers, same as the static figures)
const TOKENS = [
  {t: '3x', alts: [['3x', .91, .92], ['3', .05, .05], ['x', .02, .01]]},
  {t: '=', alts: [['=', .97, .97], ['+', .01, .01]]},
  {t: '22', alts: [['22', .94, .91], ['15', .03, .06]]},
  {t: '+', bad: true, alts: [['−', .55, .93], ['+', .30, .03], ['=', .06, .03], ['×', .04, .01]]},
  {t: '7', gap: true, alts: [['7', .95, .93], ['22', .02, .03]]},
  {t: 'x', alts: [['x', .89, .88], ['3x', .08, .09]]},
  {t: '=', alts: [['=', .97, .96], ['≈', .01, .01]]},
  {t: '29/3', alts: [['29/3', .80, .67], ['9.67', .08, .10], ['5', .03, .12]]},
];
TOKENS.forEach(tok => {
  const [, ps, pt] = tok.alts.find(a => a[0] === tok.t);
  Object.assign(tok, {ps, pt, push: Math.log(pt) - Math.log(ps)});
  // the candidate the teacher would raise most here, drawn as an up bar in the "every candidate" view
  const up = tok.alts.filter(a => a[0] !== tok.t).map(a => [a[0], Math.log(a[2]) - Math.log(a[1])]).sort((a, b) => b[1] - a[1])[0];
  tok.up = up && up[1] > .05 ? up : null;
});
const SEQ = TOKENS.reduce((s, tok) => s + tok.push, 0) / TOKENS.length;

const MODES = {
  grpo: '1 number, from the group',
  seq: '1 number, from the teacher',
  token: '1 per token',
  logit: 'every candidate',
};
const UP = 26, DOWN = 30;         // px per unit of push, above and below the zero line
const TOP = 58, BOTTOM = 78;      // room above and below the zero line

export function mount(figure, data) {
  const modes = (data.modes || 'grpo,seq,token,logit').split(',').filter(m => MODES[m]);
  let mode = data.start && modes.includes(data.start) ? data.start : modes[modes.length - 1];
  let rewards = [0, 1, 0, 0], selected = 3;
  const bigTeacher = data.teacher === 'bigger';
  const s = story();

  // ---- header, the tabs ----
  let seg = null;
  if (modes.length > 1) {
    const bar = el('div', {class: 'sd-bar'});
    figure.append(bar);
    seg = segmented(bar, modes.map(m => [m, MODES[m]]), mode, m => { s.stop(); setMode(m); }, 'How the attempt is graded');
  }

  // ---- context, the group's rewards or what the teacher reads ----
  const context = el('div', {class: 'bl-context'});
  figure.append(context);
  const group = el('div', {class: 'bl-group'});
  const groupChips = rewards.map((_, i) => el('button', {type: 'button', class: 'bl-try', onclick: () => { s.stop(); rewards[i] = 1 - rewards[i]; render(); }}));
  const stats = el('span', {class: 'bl-stats sd-mono'});
  group.append(el('span', {class: 'sd-kicker bl-inline', text: 'the group, click to flip a reward'}), el('div', {class: 'bl-tries'}, groupChips), stats);
  const reads = el('div', {class: 'bl-reads'},
    el('span', {class: 'sd-kicker bl-inline', text: bigTeacher ? 'graded by' : 'the teacher reads'}),
    bigTeacher
      ? el('span', {class: 'bl-who'}, el('b', {class: 'sd-teacher', text: 'a bigger model'}), ' reading the same attempt, after the same prefix')
      : el('span', {class: 'bl-chips'},
        el('span', {class: 'sd-tok is-plain bl-small', text: 'the question'}),
        el('span', {class: 'sd-tok is-teacher bl-small', text: data.hint || 'x = 29/3 gives 36, not 22'}),
        el('span', {class: 'sd-tok bl-small', text: 'the same attempt'})));
  context.append(group, reads);

  // ---- the attempt with a bar under every token ----
  const row = el('div', {class: 'bl-row', role: 'group', 'aria-label': 'The attempt, one column per token'});
  figure.append(row);
  row.style.setProperty('--top', `${TOP}px`); row.style.setProperty('--bottom', `${BOTTOM}px`);
  const cols = TOKENS.map((tok, i) => {
    const chip = el('span', {class: `sd-tok${tok.bad ? ' is-bad' : ''}`, text: tok.t});
    const down = el('i', {class: 'bl-down'}), up = el('i', {class: 'bl-up'});
    const value = el('span', {class: 'bl-value sd-mono'}), upLabel = el('span', {class: 'bl-up-label sd-mono'});
    const col = el('button', {type: 'button', class: `bl-col${tok.gap ? ' bl-gap' : ''}`, onclick: () => { s.stop(); selected = i; render(); }},
      chip, el('span', {class: 'bl-area'}, up, down, value, upLabel));
    row.append(col);
    return {col, down, up, value, upLabel};
  });
  const legend = el('p', {class: 'bl-legend'},
    el('span', {}, el('i', {class: 'bl-key bl-key-down'}), 'pushed down'),
    el('span', {}, el('i', {class: 'bl-key bl-key-up'}), 'pushed up'));
  figure.append(legend);

  // ---- the selected token in numbers, and its candidates ----
  const readout = el('p', {class: 'bl-readout'});
  const cands = el('div', {class: 'bl-cands'});
  figure.append(readout, cands);
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'illustration with made-up numbers'}));
  figure.append(caption, foot);
  const play = playButton(foot, s, () => tour());

  function grpoAdvantage() {
    const mu = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const sigma = Math.sqrt(rewards.reduce((a, r) => a + (r - mu) ** 2, 0) / rewards.length);
    return {mu, sigma, a: sigma < 1e-9 ? 0 : (rewards[0] - mu) / sigma};
  }
  function setMode(m) { mode = m; seg?.set(m); render(); }

  function render() {
    const {mu, sigma, a} = grpoAdvantage();
    figure.dataset.mode = mode;
    group.hidden = mode !== 'grpo'; reads.hidden = mode === 'grpo';
    groupChips.forEach((b, i) => {
      b.innerHTML = `<span>${i === 0 ? 'ours' : `#${i + 1}`}</span><b>${rewards[i]}</b>`;
      b.dataset.pass = String(rewards[i] === 1);
      b.setAttribute('aria-label', `attempt ${i + 1}${i === 0 ? ', ours' : ''}, reward ${rewards[i]}, click to flip`);
    });
    attrs(stats, {text: sigma < 1e-9
      ? `μ = ${fmt(mu)}  σ = 0  so A = 0`
      : `μ = ${fmt(mu)}  σ = ${fmt(sigma)}  A = (${rewards[0]} − ${fmt(mu)}) / ${fmt(sigma)} = ${fmt(a)}`});

    TOKENS.forEach((tok, i) => {
      const v = mode === 'grpo' ? a : mode === 'seq' ? SEQ : tok.push;
      const c = cols[i];
      const h = v < 0 ? -v * DOWN : v * UP;
      attrs(c.down, {style: {height: `${v < 0 ? Math.min(h, BOTTOM - 16) : 0}px`}});
      const upV = mode === 'logit' && tok.up ? tok.up[1] : v > 0 ? v : 0;
      attrs(c.up, {style: {height: `${Math.min(upV * UP, TOP - 16)}px`}});
      const show = i === selected || Math.abs(v) > .25;
      attrs(c.value, {text: show ? fmt(v) : '', style: {top: `${TOP + (v < 0 ? Math.min(h, BOTTOM - 16) : 0) + 3}px`}});
      attrs(c.upLabel, {text: mode === 'logit' && tok.up ? tok.up[0] : '', style: {bottom: `${BOTTOM + Math.min(upV * UP, TOP - 16) + 2}px`}});
      c.col.setAttribute('aria-pressed', String(i === selected));
      c.col.setAttribute('aria-label', `${tok.t}, push ${fmt(v)}`);
    });

    const tok = TOKENS[selected];
    if (mode === 'grpo') {
      readout.innerHTML = `<span class="sd-tok bl-small">${tok.t}</span><span>push = A = <b>${fmt(a)}</b>, the same as every other token</span>`;
    } else if (mode === 'seq') {
      readout.innerHTML = `<span class="sd-tok bl-small">${tok.t}</span><span>push = the average of log π<sub>T</sub> − log π<sub>S</sub> over all ${TOKENS.length} tokens = <b>${fmt(SEQ)}</b></span>`;
    } else {
      readout.innerHTML = `<span class="sd-tok bl-small">${tok.t}</span><span class="sd-student">π<sub>S</sub> = ${fmt(tok.ps)}</span><span class="sd-teacher">π<sub>T</sub> = ${fmt(tok.pt)}</span><span>push = log ${fmt(tok.pt)} − log ${fmt(tok.ps)} = <b>${fmt(tok.push)}</b></span>`;
    }

    cands.hidden = mode !== 'logit';
    if (mode === 'logit') {
      const prefix = TOKENS.slice(0, selected).map(t => t.t).join(' ');
      cands.replaceChildren(el('p', {class: 'sd-label', html: prefix ? `every candidate after <span class="sd-mono">${prefix}</span>` : 'every candidate for the first token'}),
        ...tok.alts.map(([name, ps, pt]) => {
          const push = Math.log(pt) - Math.log(ps);
          return el('div', {class: `bl-cand${name === tok.t ? ' is-written' : ''}`},
            el('span', {class: 'sd-tok bl-small', text: name}),
            el('span', {class: 'bl-hbars'},
              el('i', {class: 'bl-h bl-h-s', style: {width: `${ps * 100}%`}}),
              el('i', {class: 'bl-h bl-h-t', style: {width: `${pt * 100}%`}})),
            el('span', {class: 'bl-probs sd-mono', html: `<span class="sd-student">${fmt(ps)}</span> <span class="sd-teacher">${fmt(pt)}</span>`}),
            el('span', {class: `bl-push sd-mono ${push < -.05 ? 'is-down' : push > .05 ? 'is-up' : ''}`, text: `${push < -.05 ? '▾' : push > .05 ? '▴' : '·'} ${signed(push)}`}));
        }),
        el('p', {class: 'bl-cand-key', html: '<span class="sd-student">student</span> and <span class="sd-teacher">teacher</span> probability, then the push'}));
    }

    caption.innerHTML = captionFor(a, sigma);
  }

  function captionFor(a, sigma) {
    if (mode === 'grpo') {
      if (sigma < 1e-9) return `Every attempt scored the same, so σ = 0 and every push is 0. <b>The whole group teaches nothing.</b>`;
      if (a > 0) return `Our attempt passed this time, so <b>every token goes up, the plus too.</b>`;
      return `GRPO's advantage hangs under every token, so <b>the plus and the 22 are blamed exactly the same.</b>`;
    }
    if (mode === 'seq') return `Still 1 number per answer, but it comes from how reading the feedback changed the model's view of this answer, so <b>no passing sibling is needed.</b>`;
    if (mode === 'token') return `Each written token gets its own push. About 0 wherever the teacher agrees, and <b>${fmt(TOKENS[3].push, 1)} at the plus.</b>`;
    return `Every likely token at every position gets a grade, so at the plus <b>the minus goes up while the plus goes down.</b> Click any token to see its candidates.`;
  }

  // ---- autoplay, once, when the figure comes into view ----
  async function tour() {
    await s.run(async go => {
      if (modes.length > 1) {
        for (const m of modes) { setMode(m); await go.wait(m === 'logit' ? 3400 : 2600); }
      } else {
        rewards = [0, 1, 0, 0]; render(); await go.wait(2600);
        rewards = [0, 0, 0, 0]; render(); await go.wait(2800);
        rewards = [1, 0, 0, 0]; render(); await go.wait(2600);
        rewards = [0, 1, 0, 0]; render();
      }
    });
  }
  pauseOffscreen(figure, s);
  render();
  onceVisible(figure, () => { play.markPlayed(); if (modes.length > 1) setMode(modes[0]); tour(); });
}
