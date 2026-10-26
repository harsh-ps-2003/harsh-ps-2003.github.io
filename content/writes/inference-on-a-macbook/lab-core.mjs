// Shared pieces for the figures: elements, controls, number formats and a drawing that keeps real pixel sizes.

export const NS = 'http://www.w3.org/2000/svg';
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function html(parent, tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}

export function svg(parent, tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}

export const fmt = (x, digits = 0) =>
  x.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});

// Speeds read as "22% above" or "40% faster", never as ratios.
export const pctMore = (a, b) => `${fmt(Math.abs(a / b - 1) * 100, 0)}%`;

export function controls(section) {
  return html(section, 'div', 'lab-controls');
}

// A row of buttons, one pressed. options: [[value, label], ...]
export function choice(parent, label, options, value, onchange) {
  const group = html(parent, 'div', 'lab-group');
  group.setAttribute('role', 'group');
  if (label) { html(group, 'span', '', label); group.setAttribute('aria-label', label); }
  const buttons = options.map(([v, text]) => {
    const b = html(group, 'button', 'lab-btn', text);
    b.type = 'button';
    b.addEventListener('click', () => { set(v); onchange(v); });
    return [v, b];
  });
  function set(v) { for (const [k, b] of buttons) b.setAttribute('aria-pressed', String(k === v)); }
  set(value);
  return {set};
}

// A range input over `steps` positions; `show(i)` gives the text beside it.
export function slider(parent, label, steps, index, show, oninput) {
  const wrap = html(parent, 'label', 'lab-slider');
  html(wrap, 'span', '', label);
  const input = html(wrap, 'input', 'lab-range');
  Object.assign(input, {type: 'range', min: 0, max: steps - 1, step: 1, value: index});
  const out = html(wrap, 'output');
  const update = () => { out.textContent = show(+input.value); oninput(+input.value); };
  input.addEventListener('input', update);
  out.textContent = show(index);
  return {input, set(i) { input.value = i; out.textContent = show(i); }, text(t) { out.textContent = t; }};
}

export function button(parent, text, onclick) {
  const b = html(parent, 'button', 'lab-btn', text);
  b.type = 'button';
  b.addEventListener('click', onclick);
  return b;
}

// An <svg> sized to its container in real pixels, redrawn by `draw(svgElement, width)` on resize,
// so text keeps a readable size on a phone instead of shrinking with a fixed viewBox.
export function canvas(section, height, draw, label) {
  const node = svg(null, 'svg', {class: 'lab-figure', role: 'img', 'aria-label': label});
  section.append(node);
  let seen = 0;
  const redraw = () => {
    seen = section.clientWidth;
    const style = getComputedStyle(section);
    const w = Math.max(280, Math.round(seen - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
    const h = typeof height === 'function' ? height(w) : height;
    node.setAttribute('viewBox', `0 0 ${w} ${h}`);
    node.setAttribute('width', w);
    node.setAttribute('height', h);
    node.replaceChildren();
    draw(node, w, h);
  };
  new ResizeObserver(() => { if (Math.abs(section.clientWidth - seen) > 4) redraw(); }).observe(section);
  return {redraw, node};
}

// Text that fits `maxW` pixels: the font shrinks to `min` px, then the text is cut with an ellipsis.
// The site's font is monospaced, about 0.6 em per character.
export function fitText(parent, x, y, maxW, text, {size = 11, min = 9, weight = 400, cls = '', anchor = 'start', fill = ''} = {}) {
  let s = size;
  while (s > min && text.length * 0.6 * s > maxW) s -= 0.5;
  let t = text;
  if (t.length * 0.6 * s > maxW) t = `${t.slice(0, Math.max(1, Math.floor(maxW / (0.6 * s)) - 1))}…`;
  return svg(parent, 'text', {x, y, 'text-anchor': anchor, class: cls,
    style: `font-size: ${s}px; font-weight: ${weight};${fill ? ` fill: ${fill};` : ''}`}, t);
}

export const log10 = Math.log10;
// A log axis from lo to hi onto [a, b] pixels.
export const logScale = (lo, hi, a, b) => v => a + (log10(v) - log10(lo)) / (log10(hi) - log10(lo)) * (b - a);
