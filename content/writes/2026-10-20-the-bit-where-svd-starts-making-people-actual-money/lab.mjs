// Loads each lab on the page on its own, so one failing lab never takes the
// others down. A section opts in with data-lab="name" and gets lab-name.mjs
// plus lab-name.css. The shared example data is fetched once.
const data = fetch(new URL('./svd-data.json', import.meta.url)).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});
data.catch(() => {});

const css = name => new Promise(resolve => {
  const href = new URL(`./lab-${name}.css`, import.meta.url).href;
  const link = Object.assign(document.createElement('link'), {rel: 'stylesheet', href});
  link.onload = link.onerror = () => resolve();
  document.head.append(link);
});

for (const section of document.querySelectorAll('.svd-lab[data-lab]')) {
  const name = section.dataset.lab;
  section.classList.add('lab-loading');
  Promise.all([import(`./lab-${name}.mjs`), css(name)])
    .then(([lab]) => lab.mount(section, {data}))
    .catch(error => {
      console.error(`SVD lab "${name}" failed to start:`, error);
      const note = document.createElement('p');
      note.className = 'lab-failure';
      note.textContent = 'This visual could not load. Reloading the page usually fixes it.';
      section.append(note);
    })
    .finally(() => section.classList.remove('lab-loading'));
}
