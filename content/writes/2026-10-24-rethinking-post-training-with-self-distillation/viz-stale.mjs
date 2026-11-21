// Stale data in an async trainer, and the two caps that keep it safe.
// data-part="timeline" (default) plays users finishing at different times while
// the trainer keeps stepping. data-part="caps" shows one stale attempt's
// per-token push, ratio times advantage, with both caps you can switch on.
import {el, sv, attrs, clamp, lerp, ease, fmt, animate, holdHeight, story, onceVisible, pauseOffscreen, canvas, segmented, playButton} from './viz-core.mjs';

export function mount(figure, data) {
  if (data.part === 'caps') caps(figure); else timeline(figure);
}

// ---------------------------------------------------------------------------
// timeline, the same six users as the static figure, but running

const USERS = [
  {start: .10, end: .85},
  {start: .15, end: 1.82},
  {start: .20, end: 3.93},
  {start: 1.20, end: 2.80},
  {start: 2.08, end: 2.86},
  {start: 3.05, end: 5.40},   // still running when the window ends
];
const T_END = 4.55;
const LATE = ['fresh', 'one update late', 'two updates late', 'three updates late'];

// every attempt is learned from at the first trainer step after it finishes
function schedule(wait) {
  const steps = wait ? [Math.max(...USERS.slice(0, 5).map(u => u.end))] : [1, 2, 3, 4];
  const users = USERS.map(u => {
    const w = steps.filter(t => t <= u.start).length;          // written by θw
    const c = steps.findIndex(t => t >= u.end);                 // learned at step c + 1
    return {...u, w, at: c < 0 ? null : steps[c], k: c < 0 ? null : c - w};
  });
  const firstDone = Math.min(...USERS.map(u => u.end));
  return {steps, users, idle: wait ? [firstDone, steps[0]] : null};
}

function timeline(figure) {
  let wait = false, t = T_END, plan = schedule(false);
  const s = story();

  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, [['async', 'train as attempts finish'], ['wait', 'wait for the slowest']], 'async',
    v => { seg.set(v); wait = v === 'wait'; plan = schedule(wait); view.redraw(); tour(); }, 'When the trainer steps');

  const chart = el('div', {class: 'st-chart'});
  figure.append(chart);
  const view = canvas(chart, draw);
  view.svg.setAttribute('aria-label', 'Six user tasks on a timeline crossing trainer steps, each learned from at the next step after it finishes');

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', html: 'K = trainer steps between the policy that wrote the tokens and the one learning from them'}));
  figure.append(caption, foot);
  holdHeight(caption, () => {
    const keep = [wait, t, plan], out = [];
    for (const w of [false, true]) { wait = w; plan = schedule(w); for (const v of [0, plan.steps[0] + .01, 3.9, T_END]) { t = v; out.push(captionFor()); } }
    [wait, t, plan] = keep; return out;
  });
  const play = playButton(foot, s, () => tour());

  let live = null;
  function draw(svg, W) {
    svg.replaceChildren();
    const narrow = W < 520;
    const L = narrow ? 46 : 62, R = W - (narrow ? 70 : 158), rowH = narrow ? 30 : 34, top = 46;
    const X = tt => L + tt / T_END * (R - L);
    const rows = USERS.length, trainerY = top + rows * rowH + 8, bottom = trainerY + 28;

    // policy bands between trainer steps
    const edges = [0, ...plan.steps, T_END];
    const bands = edges.slice(0, -1).map((a, i) => {
      const g = sv('g', {class: `st-band${i % 2 ? '' : ' is-shaded'}`});
      g.append(sv('rect', {x: X(a), y: 28, width: X(edges[i + 1]) - X(a), height: bottom - 28}));
      const label = sv('text', {class: 'st-policy', x: (X(a) + X(edges[i + 1])) / 2, y: 42, 'text-anchor': 'middle'}, `θ${i}`);
      if (!narrow || X(edges[i + 1]) - X(a) > 26) g.append(label);
      if (!narrow && X(edges[i + 1]) - X(a) > 90) label.textContent = `policy θ${i}`;
      svg.append(g);
      return g;
    });

    // trainer steps
    const steps = plan.steps.map((st, i) => {
      const g = sv('g', {class: 'st-step'});
      g.append(sv('line', {x1: X(st), x2: X(st), y1: 20, y2: bottom}),
        sv('text', {x: X(st), y: 14, 'text-anchor': 'middle'}, wait ? 'step 1' : narrow ? `${i + 1}` : `step ${i + 1}`));
      svg.append(g);
      return {g, at: st};
    });

    // the trainer itself, updating or idle
    svg.append(sv('text', {class: 'st-user', x: 0, y: trainerY + 14}, 'trainer'));
    const idle = plan.idle ? sv('rect', {class: 'st-idle', x: X(plan.idle[0]), y: trainerY + 3, height: 16, rx: 3, width: 0}) : null;
    const idleText = plan.idle ? sv('text', {class: 'st-idle-text', x: X(plan.idle[0]) + 8, y: trainerY + 15}, 'idle, waiting for user 3') : null;
    if (idle) svg.append(idle, idleText);
    const ticks = plan.steps.map(st => { const r = sv('rect', {class: 'st-update', x: X(st) - 5, y: trainerY + 3, width: 10, height: 16, rx: 2}); svg.append(r); return r; });
    const updates = sv('text', {class: 'st-k', x: R + 12, y: trainerY + 15});
    svg.append(updates);

    // users
    const users = plan.users.map((u, i) => {
      const y = top + i * rowH;
      const g = sv('g', {class: 'st-row'});
      g.append(sv('text', {class: 'st-user', x: 0, y: y + 13}, narrow ? `user ${i + 1}` : `user ${i + 1}`));
      const rect = sv('rect', {class: 'st-attempt', x: X(u.start), y: y, height: 18, rx: 9, width: 0});
      const long = !narrow && X(Math.min(u.end, T_END)) - X(u.start) > 104;
      const label = sv('text', {class: 'st-written', x: X(u.start) + 9, y: y + 13}, long ? `written by θ${u.w}` : `θ${u.w}`);
      const link = sv('line', {class: 'st-link', y1: y + 9, y2: y + 9, x1: X(u.end), x2: X(u.end)});
      const dot = sv('circle', {class: 'st-dot', cy: y + 9, r: 5.5, cx: u.at === null ? 0 : X(u.at)});
      const tag = sv('text', {class: 'st-k', x: R + 12, y: y + 13});
      g.append(rect, link, label, dot, tag);
      svg.append(g);
      return {u, y, rect, label, link, dot, tag};
    });
    const now = sv('line', {class: 'st-now', y1: 22, y2: bottom});
    svg.append(now);
    live = {X, steps, users, ticks, idle, idleText, updates, now, narrow};
    update();
    return bottom + 6;
  }

  function update() {
    if (!live) return;
    const {X, steps, users, ticks, idle, idleText, updates, now, narrow} = live;
    attrs(now, {x1: X(t), x2: X(t)});
    now.style.opacity = t < T_END - 1e-6 ? 1 : 0;
    steps.forEach(st => st.g.classList.toggle('is-done', t >= st.at));
    ticks.forEach((r, i) => r.classList.toggle('is-done', t >= plan.steps[i]));
    if (idle) {
      const [a, b] = plan.idle, w = Math.max(0, X(clamp(t, a, b)) - X(a));
      attrs(idle, {width: w}); idleText.style.opacity = t > a + .9 ? 1 : 0;
    }
    const done = plan.steps.filter(st => t >= st).length;
    attrs(updates, {text: `${done} update${done === 1 ? '' : 's'}`});
    for (const r of users) {
      const {u} = r;
      const right = clamp(t, u.start, Math.min(u.end, T_END));
      attrs(r.rect, {width: Math.max(0, X(right) - X(u.start))});
      r.label.style.opacity = t > u.start + .25 ? 1 : 0;
      const landed = u.at !== null && t >= u.at;
      attrs(r.link, {x2: u.at === null ? X(u.end) : X(clamp(t, u.end, u.at))});
      r.link.style.opacity = t >= u.end ? 1 : 0;
      r.dot.style.opacity = landed ? 1 : 0;
      r.dot.classList.toggle('is-landed', landed);
      let tag = '';
      if (landed) tag = narrow ? `K = ${u.k}` : `K = ${u.k}  ${LATE[u.k] || `${u.k} updates late`}`;
      else if (u.at === null && t > u.start) tag = narrow ? 'running' : wait ? 'running on θ0' : 'still running';
      attrs(r.tag, {text: tag});
      r.tag.classList.toggle('is-late', landed && u.k > 0);
    }
    caption.innerHTML = captionFor();
  }

  function captionFor() {
    if (wait) {
      if (t < plan.steps[0]) return 'The trainer waits for every attempt in the batch, so it sits idle while user 3 is still going.';
      return `Every attempt is fresh now, but the trainer idled until user 3 was done, <b>1 update where the async run made 4</b>, and user 6 already started on the old model, so it will be stale anyway.`;
    }
    if (t < 3.93) return 'Each attempt is learned from at the first trainer step after it finishes, so slow tasks land on a newer model than the one that wrote them.';
    return `User 3 was written by θ0 but finished at step 4, so it is learned from <b>3 updates late, K = 3.</b>`;
  }

  function setT(v) { t = clamp(v, 0, T_END); update(); }
  async function tour() {
    await s.run(async go => {
      setT(0);
      await go.wait(400);
      await go.tween(wait ? 7000 : 8000, x => setT(x * T_END), ease.linear);
      setT(T_END);
    });
  }
  pauseOffscreen(figure, s);
  update();
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}

// ---------------------------------------------------------------------------
// caps, one stale tool call, push = ratio × advantage on every token

const TOKENS = [
  ["I'll", .05], [' cancel', -.12], [' it', .08], ['cancel_order', -.35], ['(', .02], ['order_id', .14],
  ['="#W2378"', -.22], [',', .01], ['reason', 6.8], ['="ordered', -1.9], [' by mistake"', .18], [')', .03],
];
const RATIO_TOKEN = 3, ADV_TOKEN = 8;
const RUNNING_MEAN = .5, ADV_CAP = 3 * RUNNING_MEAN, LO = .8, HI = 1.2, SHOW = 2.2;

// a fixed, seeded spread of how much each token's probability moved per update
function seeded(seed) {
  let a = seed;
  const rand = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
}
const normal = seeded(11);
const DRIFT = TOKENS.map(() => normal());

function ratioAt(i, K) {
  if (i === RATIO_TOKEN) {
    // written when the old model gave it 0.001, the current model gives it 0.1 by K = 3
    const lr = K <= 3 ? Math.log(100) * Math.sqrt(K / 3) : Math.log(100) + Math.log(10) * (K - 3) / 7;
    return Math.exp(lr);
  }
  return Math.exp(.06 * Math.sqrt(K) * DRIFT[i]);
}

// Three steps, each adds 1 cap. The bars glide between steps, the two rows that
// cause trouble carry a note saying why, and the strip under the chart shows how
// much of the whole update each token is.
const STEPS = [
  {ratio: false, adv: false, label: '1 stale, no caps'},
  {ratio: true, adv: false, label: '2 cap the ratio'},
  {ratio: true, adv: true, label: '3 cap the advantage too'},
];
const K_STALE = 3;

function caps(figure) {
  let step = 0, tween = null;
  const s = story();

  const bar = el('div', {class: 'sd-bar'});
  figure.append(bar);
  const seg = segmented(bar, STEPS.map((st, i) => [String(i), st.label]), '0', v => { s.stop(); goTo(Number(v)); }, 'Which caps are on');

  const chart = el('div', {class: 'st-chart'});
  figure.append(chart);
  const view = canvas(chart, draw);
  view.svg.setAttribute('aria-label', 'The push on every token of one stale tool call, ratio times advantage');

  const segs = TOKENS.map(() => el('i'));
  const shareOut = el('b');
  figure.append(el('div', {class: 'st-share'},
    el('div', {class: 'st-share-head'}, el('span', {text: 'share of the whole update, one slice per token'}), shareOut),
    el('div', {class: 'st-share-bar'}, ...segs)));

  const caption = el('p', {class: 'sd-caption', 'aria-live': 'polite'});
  const foot = el('div', {class: 'sd-foot'}, el('span', {class: 'sd-note', text: 'illustration, one tool call with made-up numbers'}));
  figure.append(caption, foot);
  const play = playButton(foot, s, () => tour());

  const target = n => TOKENS.map(([, a], i) => {
    const r = ratioAt(i, K_STALE), {ratio, adv} = STEPS[n];
    return {r: ratio ? clamp(r, LO, HI) : r, a: adv ? clamp(a, -ADV_CAP, ADV_CAP) : a, rCut: ratio && (r < LO || r > HI), aCut: adv && Math.abs(a) > ADV_CAP};
  });
  let cur = target(0);

  let live = null;
  function draw(svg, W) {
    svg.replaceChildren();
    const narrow = W < 520;
    const tokW = narrow ? 92 : 124, numW = narrow ? 42 : 60, rowH = narrow ? 25 : 28, head = 22;
    const x0 = tokW + 2 * numW + 12, x1 = W - 6, zero = (x0 + x1) / 2, unit = (x1 - x0) / 2 / SHOW;
    svg.append(sv('text', {class: 'st-head', x: 0, y: 12}, 'token'),
      sv('text', {class: 'st-head', x: tokW + numW - 8, y: 12, 'text-anchor': 'end'}, 'ratio'),
      sv('text', {class: 'st-head', x: tokW + 2 * numW - 8, y: 12, 'text-anchor': 'end'}, 'adv.'),
      sv('text', {class: 'st-head', x: zero, y: 12, 'text-anchor': 'middle'}, narrow ? 'push' : 'push = ratio × advantage'));
    const H = head + TOKENS.length * rowH;
    svg.append(sv('line', {class: 'st-axis', x1: zero, x2: zero, y1: head - 4, y2: H}));
    const rows = TOKENS.map(([tok], i) => {
      const y = head + i * rowH, mid = y + rowH / 2, key = i === RATIO_TOKEN || i === ADV_TOKEN;
      const g = sv('g', {class: `st-tokrow${key ? ' is-key' : ''}`});
      if (key) g.append(sv('rect', {class: 'st-band', x: -6, y: y + 1, width: W + 12, height: rowH - 2, rx: 6}));
      g.append(sv('text', {class: 'st-tok', x: 0, y: mid + 4}, tok));
      const rText = sv('text', {class: 'st-num', x: tokW + numW - 8, y: mid + 4, 'text-anchor': 'end'});
      const aText = sv('text', {class: 'st-num', x: tokW + 2 * numW - 8, y: mid + 4, 'text-anchor': 'end'});
      const barEl = sv('rect', {class: 'st-push', y: mid - 7, height: 14, rx: 2});
      const arrow = sv('path', {class: 'st-arrow'});
      const value = sv('text', {class: 'st-value', y: mid + 4});
      const note = sv('text', {class: 'st-note', y: mid + 4});
      g.append(rText, aText, barEl, arrow, value, note);
      svg.append(g);
      return {mid, rText, aText, barEl, arrow, value, note};
    });
    live = {rows, zero, unit, x0, x1, narrow};
    paint();
    return H + 4;
  }

  const fmtRatio = r => r >= 10 ? Math.round(r).toLocaleString('en') : r.toFixed(2);

  function notes() {
    const n = live?.narrow, st = STEPS[step];
    const ratioNote = st.ratio ? (n ? 'capped' : 'ratio capped at 1.2') : (n ? '0.001 → 0.1' : 'written at 0.001, now 0.1, ratio 100');
    const advNote = st.adv ? (n ? 'capped' : 'advantage capped at 1.5') : (n ? 'log(.9/.001)' : 'teacher 0.9 vs student 0.001');
    return {[RATIO_TOKEN]: ratioNote, [ADV_TOKEN]: advNote};
  }

  function paint() {
    const pushes = cur.map(v => v.r * v.a);
    const total = pushes.reduce((a, p) => a + Math.abs(p), 0);
    let big = 0;
    pushes.forEach((p, i) => { if (Math.abs(p) > Math.abs(pushes[big])) big = i; });
    segs.forEach((sg, i) => {
      sg.style.width = `${100 * Math.abs(pushes[i]) / total}%`;
      sg.className = i === big ? (pushes[i] < 0 ? 'is-down' : 'is-up') : '';
    });
    attrs(shareOut, {text: `${Math.round(100 * Math.abs(pushes[big]) / total)}% from ${TOKENS[big][0].trim()}`});
    if (!live) return;
    const {zero, unit, x0, x1} = live, tgt = target(step), txt = notes();
    cur.forEach((v, i) => {
      const row = live.rows[i], p = pushes[i];
      attrs(row.rText, {text: fmtRatio(v.r)}); row.rText.classList.toggle('is-capped', tgt[i].rCut);
      attrs(row.aText, {text: fmt(v.a, 2)}); row.aText.classList.toggle('is-capped', tgt[i].aCut);
      const w = Math.min(Math.abs(p), SHOW) * unit;
      attrs(row.barEl, {x: p < 0 ? zero - w : zero, width: Math.max(w, .8)});
      row.barEl.classList.toggle('is-up', p >= 0);
      const over = Math.abs(p) > SHOW, edge = p < 0 ? x0 : x1, dir = p < 0 ? -1 : 1;
      attrs(row.arrow, {d: over ? `M${edge - dir * 2} ${row.mid - 9} L${edge + dir * 6} ${row.mid} L${edge - dir * 2} ${row.mid + 9}Z` : ''});
      row.arrow.classList.toggle('is-up', p >= 0);
      const showValue = over || Math.abs(p) >= .5;
      // a label that would run past the plot goes inside its bar instead
      const inside = over || w + 34 > (x1 - x0) / 2;
      const vx = over ? edge - dir * 8 : inside ? zero + dir * (w - 5) : zero + dir * (w + 5);
      attrs(row.value, {x: vx, 'text-anchor': (inside ? -dir : dir) < 0 ? 'end' : 'start', text: showValue ? fmt(p, Math.abs(p) >= 10 ? 0 : 1) : ''});
      row.value.classList.toggle('is-inside', inside);
      // the note sits on the empty side of the zero line
      if (txt[i] !== undefined) attrs(row.note, {x: zero - dir * 10, 'text-anchor': dir > 0 ? 'end' : 'start', text: txt[i]});
    });
  }

  function captionFor() {
    const pushes = target(step).map(v => v.r * v.a);
    const total = pushes.reduce((a, p) => a + Math.abs(p), 0);
    const pct = i => `${Math.round(100 * Math.abs(pushes[i]) / total)}%`;
    const biggest = Math.max(...pushes.map(Math.abs));
    if (step === 0) return `${K_STALE} updates stale, the old model wrote cancel_order at 0.001 and the current one gives it 0.1, so its ratio is 100 and <b>that 1 token is ${pct(RATIO_TOKEN)} of the update.</b>`;
    if (step === 1) return `Capping the ratio at 1.2 tames cancel_order, but <b>reason's advantage of 6.8 still carries ${pct(ADV_TOKEN)}.</b> The other number needs a cap too.`;
    return `With the advantage capped at 1.5 as well, <b>no single token drowns out the rest</b>, the biggest now carries ${Math.round(100 * biggest / total)}%.`;
  }

  function goTo(n, instant = false) {
    step = n;
    seg.set(String(n));
    caption.innerHTML = captionFor();
    tween?.cancel();
    const from = cur.map(v => ({...v})), to = target(n);
    if (instant) { cur = to; paint(); return Promise.resolve(); }
    // the ratio moves on a log scale, so 100 → 1.2 reads as one smooth slide
    tween = animate(650, t => {
      cur = to.map((v, i) => ({...v, r: Math.exp(lerp(Math.log(from[i].r), Math.log(v.r), t)), a: lerp(from[i].a, v.a, t)}));
      paint();
    }, ease.inOut);
    return tween;
  }

  async function tour() {
    await s.run(async go => {
      goTo(0, true);
      await go.wait(4600);
      goTo(1); await go.wait(4600);
      goTo(2);
    });
  }
  pauseOffscreen(figure, s);
  goTo(0, true);
  onceVisible(figure, () => { play.markPlayed(); tour(); });
}
