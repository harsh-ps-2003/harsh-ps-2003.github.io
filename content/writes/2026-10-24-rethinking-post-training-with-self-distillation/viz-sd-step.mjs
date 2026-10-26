// One self-distillation step on 3x + 7 = 22, in four chapters. The student
// writes, the checker explains, the same weights reread the attempt with and
// without the explanation, and the gap at each token becomes the grade.
import {el, attrs, fmt, lerp, story, onceVisible, pauseOffscreen, segmented, playButton} from './viz-core.mjs';

// same numbers as viz-blame, student and teacher probability for each written token
const TOKENS = [
  {t: '3x', ps: .91, pt: .92}, {t: '=', ps: .97, pt: .97}, {t: '22', ps: .94, pt: .91},
  {t: '+', ps: .30, pt: .03, bad: true}, {t: '7', ps: .95, pt: .93, gap: true},
  {t: 'x', ps: .89, pt: .88}, {t: '=', ps: .97, pt: .96}, {t: '29/3', ps: .80, pt: .67},
];
// after the update the student has moved toward the teacher, most at the plus
const MOVED = TOKENS.map(tok => tok.bad ? .10 : lerp(tok.ps, tok.pt, .6));
// the student's choice right after "3x = 22", before and after the update
const AT_PLUS = [['−', .55, .78], ['+', .30, .10], ['other', .15, .12]];
const PROB = 52, GRADE = 30;   // px for probability 1, px per unit of grade

const CHAPTERS = [['1', '1 write'], ['2', '2 check'], ['3', '3 reread twice'], ['4', '4 update']];
const CAPTIONS = {
  1: 'The model reads only the question, exactly like at test time, and writes its attempt. <b>One bad token, the plus.</b>',
  2: 'The checker says what went wrong with this attempt without giving away the answer. <b>Plain RL would keep only the 0.</b>',
  3: 'The same weights read the attempt twice and write nothing new. With the feedback in front of it the model <b>agrees on every token except the plus, 0.30 against 0.03.</b>',
  4: 'The gap at each token is its grade. Moving the student toward the teacher <b>pushes the plus down and the minus up</b>, and the gap closes.',
};

export function mount(figure) {
  const tour = story(), act = story();
  let st = {chapter: 1, typed: 0, reward: false, u: 0};

  // ---- chapter buttons ----
  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, CHAPTERS, '1', k => { tour.stop(); act.run(go => enter(go, Number(k))); }, 'Steps of one training step');

  // ---- the top zone, what is being read or said at this chapter ----
  const zone = el('div', {class: 'ss-zone'});
  figure.append(zone);
  const pill = (text, cls = 'is-plain') => el('span', {class: `sd-tok ss-pill ${cls}`, text});
  const z1 = el('div', {class: 'ss-z', 'data-z': '1'},
    el('p', {class: 'sd-kicker', text: 'the student writes'}),
    el('div', {class: 'ss-reads'}, el('span', {class: 'ss-who sd-student', text: 'student reads'}), pill('the question only')));
  const z2 = el('div', {class: 'ss-z', 'data-z': '2'},
    el('p', {class: 'sd-kicker', text: 'the environment explains'}),
    el('div', {class: 'ss-checker'}, el('span', {class: 'ss-checker-label', text: 'checker'}),
      el('span', {class: 'sd-mono', text: 'x = 29/3 gives 3 · 29/3 + 7 = 36, not 22'})));
  const z3 = el('div', {class: 'ss-z', 'data-z': '3'},
    el('p', {class: 'sd-kicker', text: 'one model, same weights, two prompts'}),
    el('div', {class: 'ss-reads'}, el('span', {class: 'ss-who sd-teacher', text: 'teacher reads'}),
      pill('the question'), pill('x = 29/3 gives 36, not 22', 'is-teacher'), pill('the same attempt', '')),
    el('div', {class: 'ss-reads'}, el('span', {class: 'ss-who sd-student', text: 'student reads'}),
      pill('the question'), pill('the same attempt', '')));
  const atPlus = AT_PLUS.map(([t]) => {
    const fill = el('i'), value = el('span', {class: 'sd-mono'});
    return {row: el('div', {class: 'ss-at-row'}, el('span', {class: 'sd-tok ss-pill is-plain', text: t}), el('span', {class: 'ss-at-track'}, fill), value), fill, value};
  });
  const z4 = el('div', {class: 'ss-z', 'data-z': '4'},
    el('p', {class: 'sd-label', html: 'the student’s next token right after <span class="sd-mono">3x = 22</span>'}),
    el('div', {class: 'ss-at'}, atPlus.map(r => r.row)));
  zone.append(z1, z2, z3, z4);
  const panels = {1: z1, 2: z2, 3: z3, 4: z4};
  // the zone eases to the height of the panel that is showing
  const fitZone = () => { zone.style.height = `${panels[st.chapter].offsetHeight}px`; };
  new ResizeObserver(fitZone).observe(zone);

  // ---- the attempt, a column per token with probability and grade bars ----
  const row = el('div', {class: 'ss-row', role: 'group', 'aria-label': 'The attempt, one column per token'});
  figure.append(row);
  const cols = TOKENS.map(tok => {
    const chip = el('span', {class: `sd-tok${tok.bad ? ' is-bad' : ''}`, text: tok.t});
    const ps = el('i', {class: 'ss-ps'}), pt = el('i', {class: 'ss-pt'});
    const pv = el('span', {class: 'ss-pv sd-mono'});
    const grade = el('i', {class: 'ss-grade'}), ghost = el('i', {class: 'ss-ghost'}), gv = el('span', {class: 'ss-gv sd-mono'});
    const col = el('div', {class: `ss-col${tok.gap ? ' ss-gap' : ''}`},
      chip, el('span', {class: 'ss-probs'}, ps, pt, pv), el('span', {class: 'ss-grades'}, ghost, grade, gv));
    row.append(col);
    return {col, chip, ps, pt, pv, grade, ghost, gv};
  });
  const badge = el('span', {class: 'ss-badge'}, el('b', {text: '0'}), el('span', {text: 'the checker says wrong'}));
  row.append(badge);
  const legend = el('p', {class: 'ss-legend'},
    el('span', {class: 'ss-l-probs'}, el('i', {class: 'ss-key-s'}), el('span', {html: 'student π<sub>S</sub>'})),
    el('span', {class: 'ss-l-probs'}, el('i', {class: 'ss-key-t'}), el('span', {html: 'teacher π<sub>T</sub>'})),
    el('span', {class: 'ss-l-grade'}, el('i', {class: 'ss-key-g'}), el('span', {html: 'grade, log π<sub>T</sub> − log π<sub>S</sub>'})),
    el('span', {class: 'ss-l-ghost'}, el('i', {class: 'ss-key-ghost'}), el('span', {text: 'grade before the update'})));
  figure.append(legend);

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'illustration with made-up numbers'}));
  figure.append(caption, foot);
  const play = playButton(foot, tour, () => startTour());

  function render() {
    const {chapter, typed, reward, u} = st;
    figure.dataset.chapter = chapter;
    figure.dataset.moved = String(u > 0);
    seg.set(String(chapter));
    zone.dataset.z = chapter;
    fitZone();
    TOKENS.forEach((tok, i) => {
      const c = cols[i], ps = lerp(tok.ps, MOVED[i], u), g = Math.log(tok.pt) - Math.log(ps);
      c.col.classList.toggle('is-typed', i < typed);
      const probs = chapter >= 3, grades = chapter >= 4;
      c.ps.style.height = `${probs ? ps * PROB : 0}px`;
      c.pt.style.height = `${probs ? tok.pt * PROB : 0}px`;
      c.pv.innerHTML = probs && tok.bad ? `<span class="sd-student">${fmt(ps).replace(/^0/, '')}</span> <span class="sd-teacher">${fmt(tok.pt).replace(/^0/, '')}</span>` : '';
      c.grade.style.height = `${grades ? Math.min(-Math.min(g, 0) * GRADE, 74) : 0}px`;
      // once the student starts moving, the old grade stays behind as an outline
      const g0 = Math.log(tok.pt) - Math.log(tok.ps);
      c.ghost.style.height = `${grades && u > 0 ? Math.min(-Math.min(g0, 0) * GRADE, 74) : 0}px`;
      c.ghost.style.opacity = grades && u > 0 && g0 < -.15 ? 1 : 0;
      const depth = grades ? Math.max(Math.min(-Math.min(g, 0) * GRADE, 74), u > 0 ? Math.min(-Math.min(g0, 0) * GRADE, 74) : 0) : 0;
      attrs(c.gv, {text: grades && (tok.bad || Math.abs(g) > .15) ? fmt(g) : '', style: {top: `${depth + 3}px`}});
    });
    badge.classList.toggle('is-shown', reward);
    atPlus.forEach((r, i) => {
      const p = lerp(AT_PLUS[i][1], AT_PLUS[i][2], u);
      r.fill.style.width = `${p * 100}%`;
      attrs(r.value, {text: fmt(p)});
    });
    caption.innerHTML = CAPTIONS[chapter];
  }
  const set = patch => { st = {...st, ...patch}; render(); };

  // play one chapter's entrance, starting from the end of the chapter before it
  async function enter(go, k) {
    if (k === 1) {
      set({chapter: 1, typed: 0, reward: false, u: 0});
      for (let i = 1; i <= TOKENS.length; i++) { await go.wait(i === 1 ? 250 : 170); set({typed: i}); }
      await go.wait(350); set({reward: true});
    } else if (k === 2 || k === 3) {
      set({chapter: k, typed: TOKENS.length, reward: true, u: 0});
    } else {
      set({chapter: 4, typed: TOKENS.length, reward: true, u: 0});
      await go.wait(1500);
      await go.tween(1800, t => set({u: t}));
    }
  }

  function startTour() {
    act.stop();
    return tour.run(async go => {
      await enter(go, 1); await go.wait(1600);
      await enter(go, 2); await go.wait(3000);
      await enter(go, 3); await go.wait(3600);
      await enter(go, 4);
    });
  }

  pauseOffscreen(figure, tour);
  render();
  onceVisible(figure, () => { play.markPlayed(); startTour(); });
}
