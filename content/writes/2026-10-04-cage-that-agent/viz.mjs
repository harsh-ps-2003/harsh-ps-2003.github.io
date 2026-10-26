// Turns every <figure class="sd-viz" data-viz="name"> into its animated version.
// The figure starts with the static image inside it, so without JavaScript, or
// if a module fails, the reader still gets the old figure.
const here = path => new URL(path, import.meta.url).href;
const css = href => new Promise(resolve => {
  const link = Object.assign(document.createElement('link'), {rel: 'stylesheet', href});
  link.onload = link.onerror = () => resolve();
  document.head.append(link);
});

const figures = [...document.querySelectorAll('figure.sd-viz[data-viz]')];
const shared = figures.length ? css(here('./viz.css')) : null;
const styles = new Map();

for (const figure of figures) {
  const name = figure.dataset.viz;
  if (!styles.has(name)) styles.set(name, shared.then(() => css(here(`./viz-${name}.css`))));
  Promise.all([import(`./viz-${name}.mjs`), styles.get(name)]).then(([viz]) => {
    const fallback = [...figure.childNodes];
    try {
      figure.replaceChildren();
      figure.classList.remove('diagram');
      figure.classList.add('sd-ready');
      viz.mount(figure, figure.dataset);
    } catch (error) {
      console.error(`viz ${name} failed`, error);
      figure.classList.remove('sd-ready');
      figure.classList.add('diagram');
      figure.replaceChildren(...fallback);
    }
  }).catch(error => console.error(`viz ${name} did not load`, error));
}
