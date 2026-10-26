// Starts each figure on the page on its own, so one failing figure never takes the others down.
// A section opts in with data-lab="name" and gets lab-name.mjs. The measured data is fetched once.
const data = fetch(new URL('./data.json', import.meta.url)).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});
data.catch(() => {});

for (const section of document.querySelectorAll('.mac-lab[data-lab]')) {
  const name = section.dataset.lab;
  section.classList.add('lab-loading');
  import(`./lab-${name}.mjs`)
    .then(lab => lab.mount(section, {data}))
    .catch(error => {
      console.error(`figure "${name}" failed to start:`, error);
      const note = document.createElement('p');
      note.className = 'lab-failure';
      note.textContent = 'This figure could not load. Reloading the page usually fixes it.';
      section.append(note);
    })
    .finally(() => section.classList.remove('lab-loading'));
}
