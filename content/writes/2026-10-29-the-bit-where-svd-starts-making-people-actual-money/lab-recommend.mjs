// Taste as a direction: people and movies on a two component taste map, and a new
// viewer fitted from just two ratings, whose dot moves as they rate.
import {recommend} from './math.mjs';
import {C, html, svg, setAttrs, setText, setHTML, button, stage, arrowMarker, slider, row, tween, fmt, sym} from './lab-core.mjs';

const K = 2, UNSEEN = [1, 3, 4, 5];
const MW = 640, MH = 336, OX = 320, OY = 228, SCALE = 130;
// label placement on the taste map, tuned to this data so neighbours do not collide
const USER_LABEL = [[-11, 5, 'end'], [-11, 15, 'end'], [11, 5, 'start'], [11, 16, 'start'], [11, 5, 'start'], [-11, 5, 'end']];
const MOVIE_LABEL = [[11, -5, 'start'], [11, 15, 'start'], [11, 5, 'start'], [11, -7, 'start'], [-11, 5, 'end'], [11, 14, 'start']];

export async function mount(section, {data}) {
  const d = (await data).recommendations;

  // ---- layout, ratings on top, then the map, then one line ----
  const rr = row(section, 'rec-rate');
  const orbit = slider(rr, {label: 'You rate Orbit', min: 1, max: 5, step: .5, value: 5, show: v => `${fmt(v, 1)} ★`});
  const starlit = slider(rr, {label: 'You rate Starlit', min: 1, max: 5, step: .5, value: 1, show: v => `${fmt(v, 1)} ★`});
  const swap = button(rr, '⇄ Swap', 'rec-swap', 'Swap the two ratings');
  const map = stage(section, MW, MH, 'Taste map, people and movies placed by the first two SVD components, with your dot');
  const caption = html(section, 'p', 'rec-caption');
  caption.setAttribute('aria-live', 'polite');

  // ---- taste map drawing ----
  const youHead = arrowMarker(map, 'rec-ax', C.x);
  const gridG = svg(map, 'g', {stroke: C.faint});
  for (let t = -2; t <= 2.01; t += .5) {
    const x = OX + t * SCALE, y = OY - t * SCALE;
    if (x > 8 && x < MW - 8) svg(gridG, 'line', {x1: x, y1: 10, x2: x, y2: MH - 10});
    if (y > 8 && y < MH - 8) svg(gridG, 'line', {x1: 10, y1: y, x2: MW - 10, y2: y});
  }
  svg(map, 'line', {x1: 10, y1: OY, x2: MW - 10, y2: OY, stroke: C.s1, 'stroke-opacity': .7, 'stroke-width': 1.4});
  svg(map, 'line', {x1: OX, y1: 10, x2: OX, y2: MH - 10, stroke: C.s2, 'stroke-opacity': .7, 'stroke-width': 1.4});
  svg(map, 'text', {x: MW - 14, y: OY + 18, 'text-anchor': 'end', fill: C.s1, 'font-size': 11}, 'component 1 →');
  svg(map, 'text', {x: OX - 8, y: 22, 'text-anchor': 'end', fill: C.s2, 'font-size': 11}, '↑ component 2');

  const coord = (v, c) => v * Math.sqrt(d.s[c]);
  const px = ([a, b]) => [OX + a * SCALE, OY - b * SCALE];
  const movieXY = j => [coord(d.vt[0][j], 0), coord(d.vt[1][j], 1)];
  d.users.forEach((name, i) => {
    const [x, y] = px([coord(d.u[i][0], 0), coord(d.u[i][1], 1)]);
    svg(map, 'circle', {cx: x, cy: y, r: 5, fill: C.ink, opacity: .75});
    svg(map, 'text', {x: x + USER_LABEL[i][0], y: y + USER_LABEL[i][1], 'font-size': 12, fill: C.ink, opacity: .8,
      'text-anchor': USER_LABEL[i][2]}, name);
  });
  const movies = d.movies.map((name, j) => {
    const [x, y] = px(movieXY(j));
    const ring = svg(map, 'circle', {cx: x, cy: y, r: 11, fill: 'none', stroke: C.x, 'stroke-width': 1.8, opacity: 0});
    svg(map, 'path', {d: 'M0 -7 L7 0 L0 7 L-7 0 Z', fill: C.purple, transform: `translate(${x} ${y})`});
    const label = svg(map, 'text', {x: x + MOVIE_LABEL[j][0], y: y + MOVIE_LABEL[j][1], 'font-size': 12, fill: C.purple,
      'font-weight': 700, 'text-anchor': MOVIE_LABEL[j][2]}, name);
    const score = svg(label, 'tspan', {fill: C.x});
    return {ring, score};
  });
  const youLine = svg(map, 'line', {x1: OX, y1: OY, stroke: C.x, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', 'marker-end': youHead});
  const youDot = svg(map, 'circle', {r: 7, fill: C.x, stroke: C.bg, 'stroke-width': 2});
  const youLabel = svg(map, 'text', {'font-size': 12, fill: C.x, 'font-weight': 700, 'text-anchor': 'end'}, 'you');

  // ---- the new viewer ----
  let shown = [Number(orbit.input.value), Number(starlit.input.value)];
  function render() {
    const fit = recommend(d, K, [{movie: 0, value: shown[0]}, {movie: 2, value: shown[1]}]);
    const p = fit.user.slice(0, 2), [x, y] = px(p);
    setAttrs(youDot, {cx: x, cy: y});
    setAttrs(youLine, {x2: x, y2: y, opacity: Math.hypot(...p) > .05 ? .8 : 0});
    // above the dot on the upper side of the map, below it on the lower side, clear of the movie labels
    setAttrs(youLabel, p[1] >= 0 ? {x: x - 11, y: y - 9, 'text-anchor': 'end'} : {x, y: y + 24, 'text-anchor': 'middle'});
    const scores = UNSEEN.map(j => fit.scores[j]), best = Math.max(...scores);
    const spread = best - Math.min(...scores) > .05;
    UNSEEN.forEach((j, n) => {
      setText(movies[j].score, ` ${fmt(scores[n], 1)}★`);
      movies[j].ring.setAttribute('opacity', spread && scores[n] === best ? 1 : 0);
    });
    const top = UNSEEN[scores.indexOf(best)];
    const [o, s] = [Number(orbit.input.value), Number(starlit.input.value)];
    setHTML(caption, Math.abs(o - s) < 1e-9
      ? `Orbit and Starlit point opposite ways, so equal ratings cancel and every ${sym('x', 'guess')} stays close to 3.`
      : `You liked ${o > s ? 'Orbit' : 'Starlit'} more, so your dot is pulled towards it, and ${d.movies[top]}, pointing the same way, gets the top ${sym('x', 'guess')}.`);
  }

  const glide = target => tween('rec-viewer', shown.slice(), target, 450, v => { shown = v; render(); });
  const ratings = () => [Number(orbit.input.value), Number(starlit.input.value)];
  for (const sl of [orbit, starlit]) sl.input.addEventListener('input', () => glide(ratings()));
  swap.addEventListener('click', () => {
    const o = orbit.input.value; orbit.input.value = starlit.input.value; starlit.input.value = o;
    orbit.update(); starlit.update(); glide(ratings());
  });
  render();
}
