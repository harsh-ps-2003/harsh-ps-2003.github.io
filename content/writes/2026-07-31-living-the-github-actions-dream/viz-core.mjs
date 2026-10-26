// Small shared toolkit for the figures: element builders, easing, tweens that
// can be cancelled, a story runner for autoplay, and SVG drawn at real pixel size.

export const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const SVG = 'http://www.w3.org/2000/svg';

// el('div', {class: 'x', onclick: fn}, child, 'text') for HTML, sv(...) for SVG.
function build(make, tag, props, kids) {
  const e = make(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== undefined && kid !== null && kid !== false) e.append(kid);
  return e;
}
export const el = (tag, props, ...kids) => build(t => document.createElement(t), tag, props, kids);
export const sv = (tag, props, ...kids) => build(t => document.createElementNS(SVG, t), tag, props, kids);
export function attrs(e, props) {
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'text') { if (e.textContent !== String(v)) e.textContent = v; }
    else e.setAttribute(k, v);
  }
  return e;
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  inOut: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  out: t => 1 - (1 - t) ** 3,
  linear: t => t,
};
// numbers with a real minus sign
export const fmt = (x, n = 2) => {
  const v = Math.abs(x) < .5 * 10 ** -n ? 0 : x;
  return v.toFixed(n).replace('-', '−');
};
export const signed = (x, n = 2) => (x > .5 * 10 ** -n ? '+' : '') + fmt(x, n);

// One cancellable animation. animate(ms, t => ..., ease) resolves when done.
export function animate(ms, onFrame, curve = ease.inOut) {
  let raf = 0, stopped = false;
  const promise = new Promise(resolve => {
    if (reduced.matches || ms <= 0) { onFrame(1); resolve(true); return; }
    const start = performance.now();
    const step = now => {
      if (stopped) { resolve(false); return; }
      const t = clamp((now - start) / ms, 0, 1);
      onFrame(curve(t));
      if (t < 1) raf = requestAnimationFrame(step); else resolve(true);
    };
    raf = requestAnimationFrame(step);
  });
  promise.cancel = () => { stopped = true; cancelAnimationFrame(raf); };
  return promise;
}

// Story runner. story.run(async go => { await go.wait(400); await go.tween(600, t => ...); })
// A newer run, or story.stop(), ends the old one at its next await.
const STOP = Symbol('stop');
export function story() {
  let token = 0, current = null;
  const api = {
    get playing() { return current !== null; },
    stop() { token++; current?.cancel?.(); current = null; api.onchange?.(); },
    run(script) {
      api.stop();
      const mine = ++token;
      const alive = () => { if (mine !== token) throw STOP; };
      const go = {
        alive: () => mine === token,
        wait: ms => new Promise((resolve, reject) => {
          if (reduced.matches) { resolve(); return; }
          setTimeout(() => (mine === token ? resolve() : reject(STOP)), ms);
        }),
        tween: async (ms, onFrame, curve) => {
          alive();
          const a = animate(ms, onFrame, curve); current = a;
          await a; alive();
        },
      };
      current = {cancel() {}};
      api.onchange?.();
      return Promise.resolve().then(() => script(go)).catch(e => { if (e !== STOP) throw e; })
        .finally(() => { if (mine === token) { current = null; api.onchange?.(); } });
    },
  };
  return api;
}

// Calls cb the first time el is mostly on screen.
export function onceVisible(element, cb, threshold = .45) {
  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); cb(); }
  }, {threshold});
  io.observe(element);
}

// Pauses a story when its figure scrolls away, so nothing plays off screen.
export function pauseOffscreen(element, s) {
  new IntersectionObserver(entries => { if (!entries[0].isIntersecting) s.stop(); }).observe(element);
}

// An <svg> that is redrawn at its real width, so text stays at real pixel sizes
// on phones instead of shrinking with a viewBox. draw(svg, width) returns the height.
export function canvas(parent, draw, cls = '') {
  const svg = sv('svg', {class: `sd-svg ${cls}`.trim(), role: 'img'});
  parent.append(svg);
  let width = 0;
  const redraw = () => {
    if (!width) return;
    const height = draw(svg, width);
    attrs(svg, {viewBox: `0 0 ${width} ${height}`, width, height});
  };
  new ResizeObserver(entries => {
    const w = Math.round(entries[0].contentRect.width);
    if (w && w !== width) { width = w; redraw(); }
  }).observe(parent);
  return {svg, redraw, get width() { return width; }};
}

// Segmented control. Returns {set(value)}, calls onChange(value) on clicks.
export function segmented(parent, options, value, onChange, label) {
  const box = el('div', {class: 'sd-seg', role: 'group', 'aria-label': label});
  const buttons = options.map(([v, text]) => el('button', {type: 'button', 'data-value': v, text, onclick: () => onChange(v, true)}));
  box.append(...buttons);
  parent.append(box);
  const set = v => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
  set(value);
  return {box, set};
}

// A play / replay button bound to a story.
export function playButton(parent, s, start) {
  const icon = playing => playing
    ? '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9"/><rect x="7" y="1.5" width="3" height="9"/></svg>'
    : '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5 10.5 6 2.5 10.5z"/></svg>';
  const b = el('button', {type: 'button', class: 'sd-play'});
  let played = false;
  const update = () => {
    b.innerHTML = `${icon(s.playing)}<span>${s.playing ? 'pause' : played ? 'replay' : 'play'}</span>`;
    b.disabled = reduced.matches && !s.playing;
    b.setAttribute('aria-label', s.playing ? 'Pause the animation' : 'Play the animation');
  };
  s.onchange = update;
  b.addEventListener('click', () => { if (s.playing) s.stop(); else { played = true; start(); } });
  parent.append(b);
  update();
  return {button: b, markPlayed() { played = true; update(); }};
}

// Re-run cb when the reader flips the theme, for anything that bakes colours in.
export function onTheme(cb) {
  new MutationObserver(cb).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', cb);
}
