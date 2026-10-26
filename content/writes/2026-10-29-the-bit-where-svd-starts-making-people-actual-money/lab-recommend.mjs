// Taste as a direction: a toy ratings table rebuilt from k SVD components,
// a taste map of people and movies, and a new viewer fitted from two ratings.
import {reconstruct, recommend, componentWeight, dot} from './math.mjs';
import {C, html, svg, setAttrs, setText, setHTML, button, stage, arrowMarker, slider, row, readouts, legend,
  narrator, transport, tween, fmt, pct, sym, clamp} from './lab-core.mjs';

const SHORT = ['Orb', 'Sig', 'Sta', 'Let', 'Pun', 'Day'];
const UNSEEN = [1, 3, 4, 5];
const MW = 640, MH = 400, OX = 320, OY = 262, SCALE = 160;
// label placement on the taste map, tuned to this data so neighbours do not collide
const USER_LABEL = [[-11, 5, 'end'], [-11, 15, 'end'], [11, 5, 'start'], [11, 16, 'start'], [11, 5, 'start'], [-11, 5, 'end']];
const MOVIE_LABEL = [[11, -5, 'start'], [11, 15, 'start'], [11, 5, 'start'], [11, -7, 'start'], [-11, 5, 'end'], [11, 14, 'start']];

// rating colour, one fixed scale, grey below the 3 star baseline, orange above,
// mixed in CSS so it follows the theme and the text colour stays readable on it
function heat(v) {
  const t = clamp((v - 3) / 2, -1, 1);
  return `color-mix(in srgb, ${t < 0 ? C.neg : C.pos} ${Math.round(70 * Math.abs(t))}%, ${C.panel})`;
}

export async function mount(section, {data}) {
  const d = (await data).recommendations;
  const nU = d.users.length, nM = d.movies.length, nC = d.s.length;
  const sqrtS = d.s.map(Math.sqrt);

  // ---- layout ----
  const k = slider(section, {label: 'Taste components kept, k', min: 0, max: nC, value: 2, show: v => `${fmt(v, 2)} / ${nC}`});
  k.wrap.classList.add('rec-k');
  const mapBox = html(section, 'figure', 'rec-map');
  const map = stage(mapBox, MW, MH, 'Taste map, people and movies placed by the first two SVD components');
  html(mapBox, 'figcaption', '', 'The taste map uses only the first two components, the guesses use all k. Click a dot or a diamond to pick a person or a movie.');
  const tables = html(section, 'div', 'lab-grid-2 rec-tables');
  const known = table(tables, 'Known ratings, click any cell', true);
  const rebuilt = table(tables, 'Rebuilt from 3 + k components', false);
  legend(section, [['ink', 'people'], ['purple gem', 'movies'], ['x', 'you, the new viewer'], ['neg', 'below 3 stars'], ['pos', 'above 3 stars']]);
  const say = narrator(section);

  html(section, 'h4', '', 'How the selected rating is built');
  const fall = stage(section, 640, 236, 'The selected rating built up from the 3 star baseline, one component at a time', 'rec-fall');
  const [setScore, setRmse, setEnergy] = readouts(section, [
    {label: 'selected rating, rebuilt', cls: 'x'}, {label: 'training RMSE, all 36 ratings'}, {label: 'share of the taste pattern kept'}]);

  html(section, 'h4', '', 'A new viewer, rate two and get four guesses');
  html(section, 'p', 'lab-intro rec-viewer-intro', 'Your two ratings are the only thing fitted here. The movie positions stay exactly where they are.');
  const rr = row(section, 'rec-rate');
  const orbit = slider(rr, {label: 'Orbit', min: 1, max: 5, step: .5, value: 5, show: v => `${fmt(v, 1)} ★`});
  const starlit = slider(rr, {label: 'Starlit', min: 1, max: 5, step: .5, value: 1, show: v => `${fmt(v, 1)} ★`});
  const swap = button(rr, '⇄ Swap the two ratings', 'rec-swap');
  const cards = html(section, 'div', 'rec-cards');
  const card = UNSEEN.map(j => {
    const c = html(cards, 'div', 'rec-card');
    html(c, 'span', 'rec-card-name', d.movies[j]);
    const score = html(c, 'strong', '', '—');
    const track = html(c, 'span', 'rec-card-track'); const fill = html(track, 'i');
    const badge = html(c, 'small', '', '');
    return {c, score, fill, badge};
  });
  const sayViewer = narrator(section, 'Your guesses');
  const notes = html(section, 'p', 'lab-intro rec-notes');
  notes.textContent = 'Every rating in this toy table is known, which real data never gives you. An unrated movie is not a 0 star review, so real systems fit only the ratings they actually have. ' +
    'Training RMSE only says how well this table gets rebuilt, not how good the recommendations are, and the guesses can drift outside 1 to 5 because nothing in the model clamps them. ' +
    'A brand new movie has no position on the map at all until somebody rates it, which is the cold start problem.';

  // ---- taste map drawing ----
  const mk = {ink: arrowMarker(map, 'rec-ai', C.ink), purple: arrowMarker(map, 'rec-ap', C.purple), x: arrowMarker(map, 'rec-ax', C.x)};
  const gridG = svg(map, 'g', {stroke: C.faint});
  for (let t = -2; t <= 2.01; t += .5) {
    const x = OX + t * SCALE, y = OY - t * SCALE;
    svg(gridG, 'line', {x1: x, y1: 10, x2: x, y2: MH - 10});
    if (y > 8 && y < MH - 8) svg(gridG, 'line', {x1: 10, y1: y, x2: MW - 10, y2: y});
  }
  const axis1 = svg(map, 'line', {x1: 10, y1: OY, x2: MW - 10, y2: OY, stroke: C.s1, 'stroke-opacity': .7, 'stroke-width': 1.4});
  const axis2 = svg(map, 'line', {x1: OX, y1: 10, x2: OX, y2: MH - 10, stroke: C.s2, 'stroke-opacity': .7, 'stroke-width': 1.4});
  svg(map, 'text', {x: MW - 14, y: OY + 18, 'text-anchor': 'end', fill: C.s1, 'font-size': 11}, 'component 1 →');
  svg(map, 'text', {x: OX - 8, y: 22, 'text-anchor': 'end', fill: C.s2, 'font-size': 11}, '↑ component 2');
  const proj = svg(map, 'line', {stroke: C.pos, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: .85});
  const perp = svg(map, 'line', {stroke: C.dim, 'stroke-dasharray': '3 4'});
  const userArrow = svg(map, 'line', {stroke: C.ink, 'stroke-width': 2.2, 'marker-end': mk.ink});
  const movieArrow = svg(map, 'line', {stroke: C.purple, 'stroke-width': 2.2, 'marker-end': mk.purple});
  const users = d.users.map((name, i) => {
    const g = svg(map, 'g', {class: 'rec-pt', tabindex: -1});
    const ring = svg(g, 'circle', {r: 10, fill: 'none', stroke: C.ink, 'stroke-width': 1.5, opacity: 0});
    const dotEl = svg(g, 'circle', {r: 5.5, fill: C.ink});
    const label = svg(g, 'text', {'font-size': 12, fill: C.ink, 'text-anchor': USER_LABEL[i][2]}, name);
    g.addEventListener('click', () => select(i, selected[1]));
    return {g, ring, dot: dotEl, label};
  });
  const movies = d.movies.map((name, j) => {
    const g = svg(map, 'g', {class: 'rec-pt'});
    const ring = svg(g, 'circle', {r: 11, fill: 'none', stroke: C.purple, 'stroke-width': 1.5, opacity: 0});
    const gem = svg(g, 'path', {d: 'M0 -7 L7 0 L0 7 L-7 0 Z', fill: C.purple});
    const label = svg(g, 'text', {'font-size': 12, fill: C.purple, 'font-weight': 700, 'text-anchor': MOVIE_LABEL[j][2]}, name);
    g.addEventListener('click', () => select(selected[0], j));
    return {g, ring, gem, label};
  });
  const you = svg(map, 'g');
  const youLine = svg(you, 'line', {x1: OX, y1: OY, stroke: C.x, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', 'marker-end': mk.x});
  const youDot = svg(you, 'circle', {r: 7, fill: C.x, stroke: C.bg, 'stroke-width': 2});
  const youLabel = svg(you, 'text', {'font-size': 12, fill: C.x, 'font-weight': 700, 'text-anchor': 'end'}, 'you');
  const caption = svg(map, 'text', {x: 16, y: MH - 14, 'font-size': 11, fill: C.dim});

  // ---- waterfall drawing ----
  const FX0 = 92, FX1 = 396, star = v => FX0 + (clamp(v, .5, 5.5) - .5) / 5 * (FX1 - FX0);
  for (let v = 1; v <= 5; v++) {
    svg(fall, 'line', {x1: star(v), x2: star(v), y1: 18, y2: 214, stroke: v === 3 ? C.dim : C.faint, 'stroke-dasharray': v === 3 ? '3 4' : ''});
    svg(fall, 'text', {x: star(v), y: 230, 'text-anchor': 'middle', fill: C.dim, 'font-size': 11}, `${v}★`);
  }
  const fallRows = ['baseline', ...d.s.map((_, c) => `part ${c + 1}`), 'rebuilt'].map((name, r) => {
    const y = 24 + r * 24;
    const label = svg(fall, 'text', {x: 12, y: y + 4, 'font-size': 12, fill: C.ink}, name);
    const bar = svg(fall, 'rect', {y: y - 7, height: 14, rx: 3});
    const link = svg(fall, 'line', {y1: y + 7, y2: y + 17, stroke: C.dim, 'stroke-width': 1});
    const note = svg(fall, 'text', {x: 410, y: y + 4, 'font-size': 11.5, fill: C.dim, class: 'rec-note'});
    return {label, bar, link, note, y};
  });
  const truth = svg(fall, 'g');
  svg(truth, 'line', {y1: 14, y2: 214, stroke: C.ink, 'stroke-width': 2});
  const truthText = svg(truth, 'text', {y: 12, 'text-anchor': 'middle', 'font-size': 11, fill: C.ink});

  // ---- tables ----
  function table(parent, caption, interactive) {
    const wrap = html(parent, 'div', 'rec-table-wrap');
    const t = html(wrap, 'table', 'rec-table');
    html(t, 'caption', '', caption);
    const hr = html(html(t, 'thead'), 'tr');
    html(hr, 'th', '', '');
    d.movies.forEach((m, j) => { const th = html(hr, 'th', '', SHORT[j]); th.scope = 'col'; th.title = m; });
    const body = html(t, 'tbody');
    return d.users.map((user, i) => {
      const r = html(body, 'tr');
      const th = html(r, 'th', '', user); th.scope = 'row';
      return d.movies.map((movie, j) => {
        const cell = html(r, 'td');
        const node = interactive ? button(cell, '', 'rec-cell') : html(cell, 'span', 'rec-cell');
        if (interactive) node.addEventListener('click', () => select(i, j));
        return {cell, node, user, movie};
      });
    });
  }

  // ---- state ----
  let q = Number(k.input.value), selected = [3, 2], focus = 'k', lastQ = -1;
  let shown = [Number(orbit.input.value), Number(starlit.input.value)], viewerEvent = 'start';
  const coord = (vecFn, c, qq) => vecFn(c) * Math.sqrt(d.s[c] * componentWeight(qq, c));
  const userXY = (i, qq) => [coord(c => d.u[i][c], 0, qq), coord(c => d.u[i][c], 1, qq)];
  const movieXY = (j, qq) => [coord(c => d.vt[c][j], 0, qq), coord(c => d.vt[c][j], 1, qq)];
  const px = ([a, b]) => [OX + a * SCALE, OY - b * SCALE];

  function select(i, j) { selected = [i, j]; focus = 'cell'; render(q, true); }

  function render(position, keepFocus = false) {
    q = position;
    if (!keepFocus && Math.abs(q - lastQ) > 1e-9) focus = 'k';
    lastQ = q;
    const centered = reconstruct(d, q);
    let err = 0;
    for (let i = 0; i < nU; i++) for (let j = 0; j < nM; j++) {
      const v = 3 + centered[i * nM + j], on = i === selected[0] && j === selected[1];
      paint(known[i][j], d.ratings[i][j], on, true); paint(rebuilt[i][j], v, on, false);
      err += (d.ratings[i][j] - v) ** 2;
    }
    const [ui, mj] = selected;
    const parts = d.s.map((s, c) => d.u[ui][c] * s * d.vt[c][mj] * componentWeight(q, c));
    const score = 3 + parts.reduce((a, b) => a + b, 0);
    setScore(fmt(score)); setRmse(fmt(Math.sqrt(err / (nU * nM)), 3));
    setEnergy(pct(d.s.reduce((a, s, c) => a + (s * componentWeight(q, c)) ** 2, 0) / dot(d.s, d.s)));
    drawMap(ui, mj); drawFall(ui, mj, parts, score);
    renderViewer();
    tell(ui, mj, parts, score);
  }

  function paint(slot, value, on, isKnown) {
    setText(slot.node, fmt(value, 1));
    slot.cell.style.backgroundColor = heat(value);
    slot.cell.dataset.selected = String(on);
    if (isKnown) {
      slot.node.setAttribute('aria-pressed', String(on));
      slot.node.setAttribute('aria-label', `${slot.user}, ${slot.movie}, rated ${value}`);
    }
  }

  function drawMap(ui, mj) {
    const w2 = componentWeight(q, 1);
    axis2.setAttribute('stroke-opacity', .2 + .5 * w2);
    users.forEach((u, i) => {
      const [x, y] = px(userXY(i, q));
      setAttrs(u.dot, {cx: x, cy: y}); setAttrs(u.ring, {cx: x, cy: y, opacity: i === ui ? 1 : 0});
      setAttrs(u.label, {x: x + USER_LABEL[i][0], y: y + USER_LABEL[i][1]});
    });
    movies.forEach((m, j) => {
      const [x, y] = px(movieXY(j, q));
      setAttrs(m.gem, {transform: `translate(${x} ${y})`}); setAttrs(m.ring, {cx: x, cy: y, opacity: j === mj ? 1 : 0});
      setAttrs(m.label, {x: x + MOVIE_LABEL[j][0], y: y + MOVIE_LABEL[j][1]});
    });
    const p = userXY(ui, q), m = movieXY(mj, q), mm = dot(m, m);
    const [ux, uy] = px(p), [mx, my] = px(m);
    setAttrs(userArrow, {x1: OX, y1: OY, x2: ux, y2: uy}); setAttrs(movieArrow, {x1: OX, y1: OY, x2: mx, y2: my});
    const show = mm > 1e-6 && dot(p, p) > 1e-6;
    const foot = show ? m.map(v => v * dot(p, m) / mm) : [0, 0], [fx, fy] = px(foot);
    setAttrs(proj, {x1: OX, y1: OY, x2: fx, y2: fy, opacity: show ? .85 : 0, stroke: dot(p, m) >= 0 ? C.pos : C.neg});
    setAttrs(perp, {x1: ux, y1: uy, x2: fx, y2: fy, opacity: show ? 1 : 0});
    [userArrow, movieArrow].forEach(a => a.setAttribute('opacity', show ? 1 : 0));
    setText(caption, `${d.users[ui]} × ${d.movies[mj]} on this map, 3 + p·q = ${fmt(3 + dot(p, m))}`);
  }

  function drawFall(ui, mj, parts, score) {
    let run = 3;
    fallRows.forEach((r, idx) => {
      if (idx === 0) {
        setAttrs(r.bar, {x: star(3) - 3, width: 6, fill: C.dim}); setText(r.note, '3 stars to start');
        setAttrs(r.link, {x1: star(3), x2: star(3)});
        return;
      }
      if (idx === fallRows.length - 1) {
        setAttrs(r.bar, {x: star(score) - 5, width: 10, fill: C.x}); setText(r.note, `= ${fmt(score)} stars`);
        setAttrs(r.label, {fill: C.x}); r.link.setAttribute('opacity', 0);
        return;
      }
      const c = idx - 1, w = componentWeight(q, c), next = run + parts[c];
      const a = star(Math.min(run, next)), b = star(Math.max(run, next));
      setAttrs(r.bar, {x: a, width: Math.max(1.5, b - a), fill: parts[c] >= 0 ? C.pos : C.neg, opacity: w > 0 ? .35 + .65 * w : .12});
      setAttrs(r.link, {x1: star(next), x2: star(next), opacity: w > 0 ? 1 : .2});
      r.label.setAttribute('opacity', w > 0 ? 1 : .4);
      setText(r.note, w > 0 ? `${fmt(d.u[ui][c])} × ${fmt(d.s[c])} × ${fmt(d.vt[c][mj])} = ${parts[c] >= 0 ? '+' : '−'}${fmt(Math.abs(parts[c]))}` : 'not used yet');
      r.note.setAttribute('opacity', w > 0 ? 1 : .55);
      run = next;
    });
    setAttrs(truth, {transform: `translate(${star(d.ratings[ui][mj])} 0)`});
    setText(truthText, `known ${d.ratings[ui][mj]}★`);
  }

  // ---- narration for the table and the map ----
  function tell(ui, mj, parts, score) {
    const kk = Math.ceil(q - 1e-9), whole = Math.abs(q - Math.round(q)) < 1e-9, user = d.users[ui], movie = d.movies[mj];
    let step, text, moving, still, math;
    const sum = `r̂(${user}, ${movie}) = 3 + Σ wᵢ · u[${user}, i] · σᵢ · v[${movie}, i]\n= 3 ${parts.slice(0, Math.max(1, Math.ceil(q - 1e-9))).map(p => (p >= 0 ? '+ ' : '− ') + fmt(Math.abs(p))).join(' ')} = ${fmt(score)} stars   (known ${d.ratings[ui][mj]})`;
    if (focus === 'cell') {
      const p = userXY(ui, q), m = movieXY(mj, q), cos = dot(p, m) / (Math.hypot(...p) * Math.hypot(...m) || 1);
      const way = q < 1e-9 ? 'With no components there are no arrows yet, so the guess is just the baseline.'
        : cos > .6 ? `On the map their arrows point the same way, so ${user} reaches a long way along ${movie}'s arrow and the rating comes out high.`
        : cos < -.6 ? `On the map their arrows point in opposite directions, so the reach along ${movie}'s arrow is negative and the rating comes out low.`
        : `On the map their arrows are close to a right angle, so ${user} barely reaches along ${movie}'s arrow and the rating stays near 3.`;
      step = `How ${user}'s rating of ${movie} gets rebuilt`;
      text = `Start from 3 stars. Each component then adds its own nudge, which is how much ${user} cares about that taste pattern, times how strong the pattern is (σ), times how much ${movie} has it. ${sym('pos', 'Orange')} nudges push the rating up, ${sym('neg', 'grey')} ones pull it down. ${way}`;
      moving = []; still = ['the known ratings', 'the movie and people positions'];
    } else if (kk === 0) {
      step = 'No components yet';
      text = 'With no components the model knows nothing about anyone, so it guesses the baseline, 3 stars, for every person and every movie. On the map everybody is piled up in the middle.';
      moving = []; still = ['every guess is 3'];
    } else if (kk === 1) {
      step = whole ? 'Component 1, the biggest shared pattern' : 'Adding component 1';
      text = `The first component is the strongest pattern of taste in this table. In this little dataset it happens to split the Orbit and Signal fans from the Starlit and Letters fans, so the map stretches out along one line, and people on the left like the movies on the left. That one number per person and per movie already gets most ratings roughly right.`;
      moving = ['every rebuilt rating', 'positions along the horizontal axis']; still = ['the known ratings', 'the 3 star baseline'];
    } else if (kk === 2) {
      step = whole ? 'Component 2, a second direction' : 'Adding component 2';
      text = 'The second component adds an up and down direction. Here it lifts Punchline and Daytrip, and Emi and Finn who like them, above the line, so the map becomes a proper plane and the comedy fans stop being guessed as lukewarm.';
      moving = ['positions along the vertical axis', 'the rebuilt ratings']; still = ['positions along the horizontal axis', 'the known ratings'];
    } else if (kk < nC) {
      step = whole ? `${kk} components kept` : `Adding component ${kk}`;
      text = `Components after the first two are smaller fixes (this one is σ${'₀₁₂₃₄₅₆'[kk]} = ${fmt(d.s[kk - 1])} against σ₁ = ${fmt(d.s[0])}). They nudge single ratings the big patterns got slightly wrong, so the table changes a little and the map does not move at all.`;
      moving = ['a few rebuilt ratings']; still = ['the taste map', 'the known ratings'];
    } else {
      step = whole ? 'All six components, the table is back' : 'Adding the last component';
      text = 'With all six components the rebuilt table matches the known ratings exactly, give or take rounding. That only proves the factors can store this table, it says nothing about how well the model would guess a rating it has never seen.';
      moving = []; still = ['every rating matches the known one'];
    }
    math = sum;
    say({step, text, moving, still, math});
  }

  // ---- the new viewer ----
  let lastViewerKey = '';
  function renderViewer() {
    const ratings = [{movie: 0, value: shown[0]}, {movie: 2, value: shown[1]}];
    const fit = recommend(d, q, ratings), map2 = recommend(d, Math.min(q, 2), ratings).user.slice(0, 2);
    const [x, y] = px(map2);
    setAttrs(youDot, {cx: x, cy: y}); setAttrs(youLine, {x2: x, y2: y, opacity: Math.hypot(...map2) > .05 ? .8 : 0});
    setAttrs(youLabel, {x: x - 11, y: y - 9});
    const scores = UNSEEN.map(j => fit.scores[j]);
    const best = Math.max(...scores), worst = Math.min(...scores);
    card.forEach((c, n) => {
      const v = scores[n], isTop = q > 1e-9 && Math.abs(v - best) < 1e-9;
      setText(c.score, fmt(v));
      c.fill.style.width = pct(clamp((v - .5) / 5, 0, 1));
      c.fill.style.background = heat(v);
      c.c.dataset.top = String(isTop);
      setText(c.badge, q < 1e-9 ? 'tied at 3' : isTop ? 'top pick' : v > 5 || v < 1 ? 'outside 1 to 5' : '');
    });
    tellViewer(scores, best, worst, map2, fit);
  }

  function tellViewer(scores, best, worst, p2, fit) {
    const [o, s] = [Number(orbit.input.value), Number(starlit.input.value)];
    const key = `${viewerEvent}|${o}|${s}|${Math.ceil(q - 1e-9)}`;
    const top = UNSEEN[scores.indexOf(best)], low = UNSEEN[scores.indexOf(worst)];
    const near = j => {
      const m = movieXY(j, 2), cosTo = r => dot(m, movieXY(r, 2)) / (Math.hypot(...m) * Math.hypot(...movieXY(r, 2)));
      return cosTo(0) > .9 ? 'right next to Orbit' : cosTo(0) > .75 ? 'close to Orbit' : cosTo(2) > .9 ? 'right next to Starlit' : cosTo(2) > .75 ? 'close to Starlit' : 'off to the side, away from both';
    };
    let text;
    if (q < 1e-9) text = 'With no components the model has no way to use your ratings, so every guess is 3 stars.';
    else if (Math.abs(o - 3) < 1e-9 && Math.abs(s - 3) < 1e-9) text = 'You rated both movies 3 stars, which is exactly the baseline, so the fit has nothing to push on. Your dot sits in the middle and every guess is 3.';
    else if (Math.abs(o - s) < 1e-9) text = `You rated Orbit and Starlit the same. They point in opposite directions on the map, so their pulls mostly cancel, your dot stays near the middle and the guesses stay close to ${o > 3 ? 'a bit above' : 'a bit below'} 3.`;
    else {
      const liked = o > s ? 'Orbit' : 'Starlit', other = o > s ? 'Starlit' : 'Orbit';
      text = `${viewerEvent === 'swap' ? 'You swapped the two ratings, so your dot jumped to the other side of the centre and the ranking turned upside down. ' : ''}` +
        `You liked ${liked} more than ${other}, so the fit pulls your dot towards ${liked} and away from ${other}. ` +
        `${d.movies[top]} sits ${near(top)} on the map and points roughly the same way as your dot, so it gets the top guess. ${d.movies[low]} points the other way, so it gets the lowest.` +
        (q < 2 - 1e-9 ? ' With fewer than two components the guesses only listen to the left to right direction.' : '');
    }
    const y = [o - 3, s - 3];
    const math = `fit only what you rated, y = (Orbit − 3, Starlit − 3) = (${fmt(y[0], 1)}, ${fmt(y[1], 1)})\n(QₒᵀQₒ + 0.3 I) p = Qₒᵀ y   →   p = (${fit.user.slice(0, Math.max(1, Math.ceil(q - 1e-9))).map(v => fmt(v)).join(', ')})\nguess(movie) = 3 + p · q_movie, the map shows the first two parts of p`;
    sayViewer({step: q < 1e-9 ? 'Your guesses' : `Your guesses, using k = ${fmt(q, Number.isInteger(q) ? 0 : 2)}`, text,
      moving: viewerEvent === 'start' ? [] : ['your dot', 'the four guesses'], still: ['every movie on the map', 'the six training viewers'], math});
    lastViewerKey = key;
  }

  const glide = target => {
    tween('rec-viewer', shown.slice(), target, 450, v => { shown = v; renderViewer(); });
  };
  for (const [sl, idx] of [[orbit, 0], [starlit, 1]]) sl.input.addEventListener('input', () => {
    viewerEvent = 'rate';
    const target = shown.slice(); target[idx] = Number(sl.input.value);
    target[1 - idx] = Number((idx ? orbit : starlit).input.value);
    glide(target);
  });
  swap.addEventListener('click', () => {
    const o = orbit.input.value; orbit.input.value = starlit.input.value; starlit.input.value = o;
    orbit.update(); starlit.update(); viewerEvent = 'swap';
    glide([Number(orbit.input.value), Number(starlit.input.value)]);
  });

  const controls = transport(section, {input: k.input, render, secondsPerUnit: 2.2, dwell: .3,
    chapters: ['k = 0', '1', '2', '3', '4', '5', '6'], section});
  // playback controls sit right above the slider and the map
  k.wrap.before(section.querySelector('.lab-transport'), section.querySelector('.lab-chapters'));
  controls.refresh();
}
