// How a model writes. After "3x = 22" the student puts a probability on every
// next token, a random point between 0 and 1 picks one, and the line carries on
// from whatever got drawn. Sampling many times shows the draws follow the bars.
import {el, attrs, fmt, ease, story, reduced, onceVisible, pauseOffscreen, playButton} from './viz-core.mjs';

const DIST = [['−', .55], ['+', .30], ['=', .06], ['×', .04], ['7', .03], ['…', .02]];
const STARTS = DIST.reduce((acc, [, p], i) => [...acc, acc[i] + p], [0]);
// what comes after each draw, '|' is the gap between lines
const AFTER = {
  '−': {toks: ['7', '|', '3x', '=', '15', '|', 'x', '=', '5'], ok: true},
  '+': {toks: ['7', '|', '3x', '=', '29', '|', 'x', '=', '29/3'], ok: false},
};
const OTHER = {toks: ['…'], ok: null};
const MAX = .6;       // the bars are drawn against 0..0.6
const DOTS = 300;     // how many draws stay on the rug under the strip

const pick = u => Math.max(0, STARTS.findIndex((s, i) => i > 0 && u < s) - 1);
const pct = x => `${Math.round(x * 100)}%`;

export function mount(figure) {
  figure.style.position = 'relative';
  const tour = story(), act = story();
  const counts = DIST.map(() => 0);
  let total = 0, last = null;

  // ---- what has been written so far ----
  figure.append(el('p', {class: 'sd-kicker', text: 'what the model has written so far'}));
  figure.append(el('div', {class: 'nt-question'}, el('span', {text: 'Solve for x'}), el('span', {class: 'sd-mono', text: '3x + 7 = 22'})));
  const line = el('div', {class: 'nt-line', 'aria-live': 'polite'});
  figure.append(line);
  ['3x', '=', '22'].forEach(t => line.append(el('span', {class: 'sd-tok', text: t})));
  const slot = el('span', {class: 'sd-tok is-plain nt-slot', text: '?'});
  const tail = el('span', {class: 'nt-tail'});
  line.append(slot, tail);

  // ---- the draw, a random point on a strip split by probability ----
  figure.append(el('p', {class: 'sd-kicker nt-gap', text: 'one draw, a random point between 0 and 1'}));
  const strip = el('div', {class: 'nt-strip'});
  const segs = DIST.map(([t, p], i) => {
    const seg = el('span', {class: 'nt-seg', style: {width: `${p * 100}%`}}, p >= .05 ? el('span', {class: 'sd-mono', text: t}) : null);
    seg.style.setProperty('--i', i);
    strip.append(seg);
    return seg;
  });
  const marker = el('i', {class: 'nt-marker'});
  strip.append(marker);
  const rug = el('div', {class: 'nt-rug', 'aria-hidden': 'true'});
  figure.append(el('div', {class: 'nt-strip-wrap'}, strip, rug, el('div', {class: 'nt-scale'}, el('span', {text: '0'}), el('span', {text: '1'}))));

  // ---- the probabilities, with how often each one has actually been drawn ----
  figure.append(el('p', {class: 'sd-kicker nt-gap', text: 'its probability for every next token'}));
  const rows = DIST.map(([t, p]) => {
    const freq = el('i', {class: 'nt-freq'}), freqText = el('span', {class: 'nt-freq-text sd-mono'});
    const row = el('div', {class: 'nt-row'},
      el('span', {class: 'sd-tok nt-row-tok', text: t}),
      el('span', {class: 'nt-track'}, el('i', {class: 'nt-p', style: {width: `${p / MAX * 100}%`}}), freq),
      el('span', {class: 'nt-p-text sd-mono', text: fmt(p).replace(/^0/, '')}),
      freqText);
    return {row, freq, freqText};
  });
  figure.append(el('div', {class: 'nt-rows'}, rows.map(r => r.row)));
  figure.append(el('p', {class: 'nt-key', html: '<span><i class="nt-key-p"></i><span>probability π<sub>θ</sub></span></span><span><i class="nt-key-f"></i><span>share of the draws so far</span></span>'}));

  // ---- controls ----
  const bar = el('div', {class: 'sd-bar nt-buttons'});
  const again = el('button', {type: 'button', text: 'sample again', onclick: () => { tour.stop(); act.run(go => drawOne(go, Math.random())); }});
  const many = el('button', {type: 'button', text: 'sample 100', onclick: () => { tour.stop(); act.run(go => sampleMany(go, 100)); }});
  const reset = el('button', {type: 'button', text: 'reset', onclick: () => { tour.stop(); act.stop(); clear(); }});
  bar.append(again, many, reset);
  figure.append(bar);
  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'illustration with made-up numbers'}));
  figure.append(caption, foot);
  const play = playButton(foot, tour, () => startTour());

  // ---- state to DOM ----
  function setMarker(u) {
    marker.style.left = `${u * 100}%`;
    const i = pick(u);
    segs.forEach((s, k) => s.classList.toggle('is-on', k === i));
  }
  function addSample(u) {
    const i = pick(u);
    counts[i]++; total++;
    const dot = el('i', {style: {left: `${u * 100}%`, top: `${2 + Math.random() * 14}px`}});
    rug.append(dot);
    if (rug.childElementCount > DOTS) rug.firstElementChild.remove();
    return i;
  }
  function renderTally() {
    rows.forEach((r, i) => {
      const f = total ? counts[i] / total : 0;
      r.freq.style.width = `${Math.min(1, f / MAX) * 100}%`;
      attrs(r.freqText, {text: total ? pct(f) : ''});
    });
    reset.disabled = total === 0;
  }
  function setLine(token) {
    tail.replaceChildren();
    attrs(slot, {text: token || '?'});
    slot.classList.toggle('is-plain', !token);
    slot.classList.toggle('is-bad', token === '+');
  }
  function clear() {
    counts.fill(0); total = 0; last = null; rug.replaceChildren();
    setLine(null); setMarker(0); segs.forEach(s => s.classList.remove('is-on'));
    marker.classList.remove('is-shown');
    renderTally(); tell();
  }

  function tell(after) {
    const plus = total ? counts[1] / total : 0;
    if (after === 'many') {
      caption.innerHTML = `${total} draws so far, and the + came up ${counts[1]} times, <b>${pct(plus)}</b>. The more you draw, the closer that gets to <span class="nt-nowrap">π<sub>θ</sub>(+ | x, 3x = 22) = 0.30</span>.`;
    } else if (last === '+') {
      caption.innerHTML = `This time it drew <b>the +</b>, the mistake, and everything after it is correct algebra on a wrong line. <span class="nt-nowrap">π<sub>θ</sub>(+ | x, 3x = 22) = 0.30</span>, so this happens about 3 times in 10.`;
    } else if (last === '−') {
      caption.innerHTML = `This time it drew <b>the −</b>, and the rest of the line comes out right. Same model, same prompt, a different random point.`;
    } else if (last) {
      caption.innerHTML = `This time it drew <b>${last}</b>, a rare pick, and the line goes somewhere else.`;
    } else {
      caption.innerHTML = `The model puts a probability on every possible next token, then draws one at random in proportion to the bars.`;
    }
  }

  // ---- one draw, animated ----
  async function drawOne(go, u) {
    setLine(null);
    marker.classList.add('is-shown');
    await go.tween(1300, t => setMarker(((1 + u) * t) % 1), ease.out);   // one lap, then it settles on u
    setMarker(u);
    const i = addSample(u), token = DIST[i][0];
    renderTally();
    await fly(go, segs[i], token);
    last = token;
    setLine(token);
    const after = AFTER[token] || OTHER;
    for (const t of after.toks) {
      tail.append(t === '|' ? el('span', {class: 'nt-break'}) : el('span', {class: `sd-tok nt-in${token === '+' && t === '29/3' ? ' is-wrong' : ''}`, text: t}));
      await go.wait(t === '|' ? 60 : 120);
    }
    tail.append(el('span', {class: `nt-verdict nt-in ${after.ok ? 'is-ok' : after.ok === false ? 'is-wrong' : ''}`,
      text: after.ok ? 'right' : after.ok === false ? 'wrong, the checker says 0' : 'somewhere else'}));
    tell();
  }

  // the drawn token flies from its segment up into the ? slot
  async function fly(go, seg, token) {
    if (reduced.matches) return;
    const box = figure.getBoundingClientRect(), from = seg.getBoundingClientRect(), to = slot.getBoundingClientRect();
    const chip = el('span', {class: `sd-tok nt-fly${token === '+' ? ' is-bad' : ''}`, text: token, 'aria-hidden': 'true',
      style: {left: `${to.left - box.left}px`, top: `${to.top - box.top}px`, width: `${to.width}px`}});
    figure.append(chip);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    try {
      await go.tween(520, t => { chip.style.transform = `translate(${dx * (1 - t)}px, ${dy * (1 - t)}px) scale(${.8 + .2 * t})`; }, ease.inOut);
    } finally { chip.remove(); }
  }

  async function sampleMany(go, n) {
    marker.classList.add('is-shown');
    let added = 0;
    await go.tween(1500, t => {
      while (added < Math.round(t * n)) { const u = Math.random(); setMarker(u); addSample(u); added++; }
      renderTally();
    }, ease.linear);
    tell('many');
  }

  function startTour() {
    act.stop();
    return tour.run(async go => {
      clear();
      await go.wait(500);
      await drawOne(go, .55 + .30 * .45);   // the first draw lands on the +, as in the text
      await go.wait(2800);
      await sampleMany(go, 100);
    });
  }

  pauseOffscreen(figure, tour);
  pauseOffscreen(figure, act);
  clear();
  onceVisible(figure, () => { play.markPlayed(); startTour(); });
}
