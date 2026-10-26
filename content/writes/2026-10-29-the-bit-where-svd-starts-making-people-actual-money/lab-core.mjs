// Shared building blocks for every lab on the page: DOM helpers, colours,
// a plain-language narrator, smooth playback and tweening.

export const NS = 'http://www.w3.org/2000/svg';
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// One colour per idea, used the same way in every lab. They are CSS variables
// from lab.css, so drawings follow the light or dark theme like the text does.
export const C = {
  bg: 'var(--v-bg)', ink: 'var(--v-ink)', dim: 'var(--v-dim)', faint: 'var(--v-faint)', grid: 'var(--v-grid)',
  light: 'var(--v-light)', accent: 'var(--v-accent)', tint: 'var(--v-tint)', panel: 'var(--v-panel)',
  s1: 'var(--v-s1)',   // first singular direction, its stretch σ₁
  s2: 'var(--v-s2)',   // second singular direction, its stretch σ₂
  x: 'var(--v-x)',     // the vector or item the reader is following
  i: 'var(--v-i)',     // where e₁ goes (first column)
  j: 'var(--v-j)',     // where e₂ goes (second column)
  pos: 'var(--v-pos)', neg: 'var(--v-neg)', purple: 'var(--v-purple)',
};
C.stage = C.bg;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  inOut: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  out: t => 1 - (1 - t) ** 3,
};
// Numerical inverse of ease.inOut, used to resume playback mid-segment without a jump.
const unEase = y => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; ease.inOut(m) < y ? lo = m : hi = m; } return (lo + hi) / 2; };

export const fmt = (x, n = 2) => {
  const v = Math.abs(x) < 0.5 * 10 ** -n ? 0 : x;
  return v.toFixed(n).replace('-', '−');
};
export const pct = (x, n = 1) => `${(100 * x).toFixed(n)}%`;
// A coloured symbol for narration and equations, e.g. sym('s1', 'σ₁').
export const sym = (cls, s) => `<b class="c-${cls}">${s}</b>`;

export function html(parent, tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}
// Paint goes in style, where var() always resolves, the rest stays an attribute.
const PAINT = new Set(['fill', 'stroke', 'stop-color']);
export function setAttrs(e, attrs) {
  for (const [k, v] of Object.entries(attrs)) PAINT.has(k) ? e.style.setProperty(k, v) : e.setAttribute(k, v);
  return e;
}
export function svg(parent, tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  setAttrs(e, attrs);
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}
export function setText(e, v) { v = String(v); if (e.textContent !== v) e.textContent = v; }
export function setHTML(e, v) { if (e.__html !== v) { e.__html = v; e.innerHTML = v; } }
export function button(parent, label, cls = '', aria) {
  const b = html(parent, 'button', cls, label); b.type = 'button';
  if (aria) b.setAttribute('aria-label', aria);
  return b;
}

// The drawing surface for a lab.
export function stage(parent, w, h, label, cls = '') {
  return svg(parent, 'svg', {class: `lab-stage ${cls}`.trim(), viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label});
}
export function arrowMarker(svgEl, id, color) {
  const defs = svgEl.querySelector('defs') || svg(svgEl, 'defs');
  const m = svg(defs, 'marker', {id, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse'});
  svg(m, 'path', {d: 'M0 0 L10 5 L0 10 z', fill: color});
  return `url(#${id})`;
}

// Labelled inputs. Every control returns {input, output, wrap}.
export function slider(parent, {label, min, max, step = 'any', value, show = v => v, disabled = false}) {
  const wrap = html(parent, 'label', 'lab-field');
  const top = html(wrap, 'span', 'lab-field-label');
  html(top, 'span', '', label);
  const output = html(top, 'output', 'lab-field-value');
  const input = html(wrap, 'input');
  Object.assign(input, {type: 'range', min, max, step, value, disabled});
  const update = () => setText(output, show(Number(input.value)));
  input.addEventListener('input', update); input.addEventListener('lab-sync', update); update();
  return {input, output, wrap, update};
}
export function choice(parent, {label, options, value}) {
  const wrap = html(parent, 'label', 'lab-field');
  html(html(wrap, 'span', 'lab-field-label'), 'span', '', label);
  const input = html(wrap, 'select');
  for (const [v, text] of options) { const o = html(input, 'option', '', text); o.value = v; }
  if (value !== undefined) input.value = value;
  return {input, wrap};
}
export function row(parent, cls = '') { return html(parent, 'div', `lab-row ${cls}`.trim()); }

// Big numbers under a lab. readouts(parent, [{label, cls}]) -> setters.
export function readouts(parent, items) {
  const box = html(parent, 'div', 'lab-readouts');
  return items.map(({label, cls}) => {
    const cell = html(box, 'div', cls ? `c-${cls}` : '');
    const value = html(cell, 'strong', '', '—');
    html(cell, 'span', '', label);
    return v => setText(value, v);
  });
}

// A colour key, legend(parent, [['s1', 'first direction'], ...]).
export function legend(parent, items) {
  const box = html(parent, 'p', 'lab-legend');
  for (const [cls, text] of items) {
    const item = html(box, 'span', 'lab-key');
    html(item, 'i', `dot-${cls}`);
    item.append(text);
  }
  return box;
}

// The narrator explains, in plain words, what the reader is looking at right
// now. step: short heading. text: a sentence or two (HTML allowed for coloured
// symbols). moving / still: short phrases. math: the exact statement, optional.
export function narrator(parent, title = 'What is happening') {
  const box = html(parent, 'div', 'lab-narrator');
  const head = html(box, 'p', 'lab-narrator-step', title);
  const body = html(box, 'p', 'lab-narrator-text');
  body.setAttribute('aria-live', 'polite');
  const moving = html(box, 'p', 'lab-chips lab-moving');
  const still = html(box, 'p', 'lab-chips lab-still');
  const math = html(box, 'div', 'lab-narrator-math');
  const chips = (label, list) => list && list.length
    ? `<span class="lab-chip-label">${label}</span>` + list.map(x => `<span class="lab-chip">${x}</span>`).join('') : '';
  return ({step, text, moving: m, still: s, math: eq}) => {
    if (step !== undefined) setText(head, step);
    if (text !== undefined && body.__html !== text) {
      setHTML(body, text);
      if (!reducedMotion.matches) { box.classList.remove('lab-pulse'); void box.offsetWidth; box.classList.add('lab-pulse'); }
    }
    setHTML(moving, chips('Moving', m));
    setHTML(still, chips('Staying put', s));
    setHTML(math, eq || '');
  };
}

// Pixel canvases. 'gray' maps [0,1] to black..white, for photos. 'signed' is a
// diverging map in the theme's colours, ink for negative, the page background
// for zero and the accent for positive, scaled by max |v|.
const buffers = new WeakMap();
const signedCanvases = new Map(); // canvas -> what it last showed, to repaint on a theme change
let palette = null;
const rgb = colour => {
  const ctx = Object.assign(document.createElement('canvas'), {width: 1, height: 1}).getContext('2d');
  ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1);
  return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
};
const signedPalette = () => {
  if (!palette) {
    const css = getComputedStyle(document.documentElement), get = name => rgb(css.getPropertyValue(name).trim());
    palette = {neg: get('--text-color'), zero: get('--background-color'), pos: get('--main-color')};
  }
  return palette;
};
export function drawPixels(canvas, values, mode = 'gray', scale) {
  let b = buffers.get(canvas);
  if (!b) { const ctx = canvas.getContext('2d'); b = {ctx, img: ctx.createImageData(canvas.width, canvas.height)}; buffers.set(canvas, b); }
  const d = b.img.data;
  if (mode === 'signed') signedCanvases.set(canvas, {values: Float32Array.from(values), scale});
  const {neg: NEG, zero: ZERO, pos: POS} = mode === 'signed' ? signedPalette() : {};
  if (mode === 'signed' && !scale) { scale = 1e-12; for (const v of values) scale = Math.max(scale, Math.abs(v)); }
  for (let i = 0; i < values.length; i++) {
    if (mode === 'signed') {
      const t = clamp(values[i] / scale, -1, 1), end = t < 0 ? NEG : POS, a = Math.abs(t) ** .8;
      d[i * 4] = lerp(ZERO[0], end[0], a); d[i * 4 + 1] = lerp(ZERO[1], end[1], a); d[i * 4 + 2] = lerp(ZERO[2], end[2], a);
    } else {
      const g = 255 * clamp(values[i], 0, 1); d[i * 4] = g; d[i * 4 + 1] = g; d[i * 4 + 2] = g;
    }
    d[i * 4 + 3] = 255;
  }
  b.ctx.putImageData(b.img, 0, 0);
}

// Run cb whenever the reader flips between light and dark. Signed canvases
// repaint themselves, anything else drawn from computed colours can hook in here.
const themeListeners = new Set();
export const onTheme = cb => themeListeners.add(cb);
const themeChanged = () => {
  palette = null;
  for (const [canvas, last] of signedCanvases) drawPixels(canvas, last.values, 'signed', last.scale);
  for (const cb of themeListeners) cb();
};
new MutationObserver(themeChanged).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);

// Smoothly animate a number or an array of numbers. A new tween with the same
// key cancels the old one.
const tweens = new Map();
export function tween(key, from, to, ms, onFrame, done) {
  cancelAnimationFrame(tweens.get(key));
  if (reducedMotion.matches || ms <= 0) { onFrame(to, 1); done?.(); return; }
  const start = performance.now();
  const step = now => {
    const t = clamp((now - start) / ms, 0, 1), e = ease.inOut(t);
    onFrame(Array.isArray(from) ? from.map((a, i) => lerp(a, to[i], e)) : lerp(from, to, e), t);
    if (t < 1) tweens.set(key, requestAnimationFrame(step)); else { tweens.delete(key); done?.(); }
  };
  tweens.set(key, requestAnimationFrame(step));
}

// Playback for a lab. The slider holds the "position" (a step number, a rank,
// an iteration...). Playing eases from one whole number to the next and rests
// briefly on each whole number, so the reader can see every checkpoint.
let active = null; // only one lab plays at a time
export function transport(parent, opts) {
  const {input, render, secondsPerUnit = 2, dwell = .25, direction = 1, chapters, section} = opts;
  const min = Number(input.min), max = Number(input.max);
  const unitSeconds = typeof secondsPerUnit === 'function' ? secondsPerUnit : () => secondsPerUnit;
  const bar = html(parent, 'div', 'lab-transport');
  const play = button(bar, '▶ Play', 'lab-play');
  const back = button(bar, '◀', '', 'Previous step');
  const next = button(bar, '▶', '', 'Next step');
  const reset = button(bar, '↺', '', 'Reset');
  const speedWrap = html(bar, 'label', 'lab-speed', 'speed ');
  const speed = html(speedWrap, 'select');
  for (const v of [.5, 1, 2]) { const o = html(speed, 'option', '', `${v}×`); o.value = v; o.selected = v === 1; }

  let chapterButtons = [];
  if (chapters) {
    const strip = html(parent, 'div', 'lab-chapters');
    strip.style.setProperty('--n', chapters.length);
    chapterButtons = chapters.map((label, i) => {
      const b = button(strip, label);
      b.addEventListener('click', () => { pause(); seek(direction > 0 ? min + i : max - i); });
      return b;
    });
  }

  const start = direction > 0 ? min : max;
  let position = Number(input.value), clock = 0, playing = false, last = null, frame = 0;
  // progress u counts whole units from the start, whatever the direction
  const toU = p => direction > 0 ? p - min : max - p;
  const fromU = u => direction > 0 ? min + u : max - u;
  const shaped = u => {
    const k = Math.floor(u), f = u - k;
    if (u >= toU(direction > 0 ? max : min)) return u;
    return f < dwell ? k : k + ease.inOut((f - dwell) / (1 - dwell));
  };
  const unshape = u => { const k = Math.floor(u), f = u - k; return f === 0 ? u : k + dwell + (1 - dwell) * unEase(f); };
  const atEnd = () => toU(position) >= toU(direction > 0 ? max : min) - 1e-9;
  const update = () => {
    play.textContent = playing ? '❚❚ Pause' : atEnd() ? '↺ Replay' : '▶ Play';
    play.setAttribute('aria-pressed', String(playing));
    play.disabled = reducedMotion.matches;
    play.title = reducedMotion.matches ? 'Reduced motion is on, so use the step buttons or drag the slider.' : '';
    back.disabled = toU(position) <= 1e-9; next.disabled = atEnd();
    if (chapterButtons.length) {
      const u = toU(position), current = u <= 1e-9 ? 0 : Math.min(chapterButtons.length - 1, Math.ceil(u - 1e-9));
      chapterButtons.forEach((b, i) => {
        b.dataset.state = i < current ? 'done' : i === current ? 'now' : 'todo';
        b.style.setProperty('--p', i === current && i > 0 ? clamp(u - (i - 1), 0, 1) : i < current ? 1 : 0);
        b.setAttribute('aria-pressed', String(Math.abs(u - i) < 1e-6));
      });
    }
  };
  function seek(value) {
    position = clamp(value, min, max);
    input.value = position; input.dispatchEvent(new Event('lab-sync'));
    render(position); update();
  }
  function pause() { playing = false; last = null; cancelAnimationFrame(frame); if (active === pause) active = null; update(); }
  function tick(now) {
    if (!playing) return;
    const dt = last === null ? 0 : Math.min(now - last, 60); last = now;
    const u = clock;
    clock += dt / (unitSeconds(Math.floor(u)) * 1000) * Number(speed.value);
    const end = toU(direction > 0 ? max : min);
    if (clock >= end) { clock = end; seek(fromU(end)); pause(); return; }
    seek(fromU(shaped(clock)));
    frame = requestAnimationFrame(tick);
  }
  function startPlaying() {
    if (reducedMotion.matches) return;
    if (playing) return pause();
    if (active) active();
    if (atEnd()) seek(start);
    clock = unshape(toU(position));
    playing = true; active = pause; last = null; update();
    frame = requestAnimationFrame(tick);
  }
  const step = d => {
    pause();
    const u = toU(position);
    seek(fromU(d > 0 ? Math.floor(u + 1e-6) + 1 : Math.ceil(u - 1e-6) - 1));
  };
  play.addEventListener('click', startPlaying);
  back.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  reset.addEventListener('click', () => { pause(); seek(start); });
  input.addEventListener('input', () => { pause(); seek(Number(input.value)); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  reducedMotion.addEventListener('change', pause);
  if (section) new IntersectionObserver(e => { if (!e[0].isIntersecting) pause(); }).observe(section);
  render(position); update();
  return {pause, seek, play: startPlaying, refresh: () => render(position), get position() { return position; }};
}
