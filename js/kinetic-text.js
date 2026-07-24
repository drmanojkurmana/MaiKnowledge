// kinetic-text.js — headings "jump" in word-by-word as they scroll into view.
// Only processes plain-text headings (childElementCount === 0) so gradient/wordmark
// markup is never destroyed. No-op under reduced motion.
export function initKineticText() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const style = document.createElement('style');
  style.textContent =
    '.k-word{display:inline-block;transform:translateY(1.05em) rotate(5deg);opacity:0;' +
    'transition:transform .6s cubic-bezier(.2,1.35,.3,1),opacity .5s ease}' +
    '.k-in .k-word{transform:none;opacity:1}';
  document.head.appendChild(style);

  const heads = document.querySelectorAll('#mk-root h1, #mk-root h2, #mk-root h3');
  const targets = [];
  heads.forEach((h) => {
    if (h.childElementCount !== 0) return;              // skip complex headings
    const text = h.textContent;
    if (!text.trim()) return;
    h.textContent = '';
    for (const tok of text.split(/(\s+)/)) {
      if (/^\s+$/.test(tok)) { h.appendChild(document.createTextNode(tok)); continue; }
      const span = document.createElement('span');
      span.className = 'k-word';
      span.textContent = tok;
      h.appendChild(span);
    }
    targets.push(h);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.querySelectorAll('.k-word').forEach((w, i) => { w.style.transitionDelay = (i * 0.05) + 's'; });
      e.target.classList.add('k-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.35 });
  targets.forEach((t) => io.observe(t));
}
