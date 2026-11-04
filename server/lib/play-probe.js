// Injected into each site page by CHIP's Playground proxy (play.mjs). It only
// reads: it measures the page and posts the numbers to CHIP, which judges
// them against BELLA's rules. It answers only CHIP's own origins.
(() => {
  if (window.parent === window) return;
  const ORIGINS = __CHIP_ORIGINS__;
  let parentOrigin = null;
  const post = (m) => parentOrigin && window.parent.postMessage(m, parentOrigin);

  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  };
  const sectionOf = (el, ids) => {
    for (let n = el; n; n = n.parentElement) if (n.id && ids.has(n.id)) return n.id;
    return null;
  };
  const selectorOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 4; n = n.parentElement) {
      if (n.id) {
        parts.unshift(`#${n.id}`);
        break;
      }
      const cls = [...n.classList].find((c) => !/^(dot-3d|sr-only)$/.test(c));
      parts.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
    }
    return parts.join(' > ');
  };
  // child elements' text kept apart ("01 The path", not "01The path")
  const textOf = (el) => ([...el.childNodes].map((n) => n.innerText ?? n.textContent).join(' ') || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  // the first ancestor with a solid background
  const groundOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const a = c.match(/rgba?\(([^)]+)\)/);
      if (a && (a[1].split(/[\s,/]+/).filter(Boolean)[3] ?? '1') !== '0') return c;
    }
    return getComputedStyle(document.documentElement).backgroundColor || 'rgb(255, 255, 255)';
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"], [inert]');
  };

  let sectionIds = new Set();
  function measure() {
    const sections = [...document.querySelectorAll('main [id]')].filter((el) => sectionIds.has(el.id)).map((el) => ({ id: el.id, ...box(el) }));
    const targets = [...document.querySelectorAll('main a[href], main button, main [role="button"], main input, main select, main summary')]
      .filter(visible)
      .map((el) => ({ selector: selectorOf(el), text: textOf(el), section: sectionOf(el, sectionIds), primary: el.matches('.btn-key--primary, [data-variant="primary"]'), inline: el.tagName === 'A' && getComputedStyle(el).display === 'inline', ...box(el) }));
    const texts = [];
    for (const el of document.querySelectorAll('main h1, main h2, main h3, main p, main li, main dt, main dd, main a, main button, main span, main b')) {
      if (!visible(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const s = getComputedStyle(el);
      // body: a sentence in p, li or dd, not a short label
      const body = /^(p|li|dd)$/.test(el.tagName.toLowerCase()) && el.textContent.trim().length >= 60;
      texts.push({ selector: selectorOf(el), text: textOf(el), section: sectionOf(el, sectionIds), tag: el.tagName.toLowerCase(), size: parseFloat(s.fontSize), color: s.color, ground: groundOf(el), body, ...box(el) });
    }
    post({ type: 'chip:probe', url: location.pathname, width: innerWidth, height: document.documentElement.scrollHeight, scrollY, sections, targets, texts, theme: document.documentElement.dataset.theme ?? null });
  }

  let t = 0;
  const soon = () => {
    clearTimeout(t);
    t = setTimeout(measure, 250);
  };
  addEventListener('scroll', () => post({ type: 'chip:scroll', scrollY }), { passive: true });
  addEventListener('resize', soon);
  new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-theme'] });

  addEventListener('message', (e) => {
    if (!ORIGINS.includes(e.origin)) return;
    const m = e.data || {};
    if (m.type === 'chip:hello') {
      parentOrigin = e.origin;
      sectionIds = new Set(m.sections ?? []);
      measure();
    } else if (m.type === 'chip:scrollby') {
      scrollBy({ top: m.dy, behavior: 'instant' });
    } else if (m.type === 'chip:scrollto') {
      const el = document.getElementById(m.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (m.type === 'chip:pick') {
      // the elements under a box drawn in page px
      const { x, y, w, h, id } = m;
      const seen = new Set();
      const picked = [];
      for (const el of document.querySelectorAll('main *')) {
        if (!visible(el) || picked.length >= 6) continue;
        const b = box(el);
        const inside = b.x >= x - 4 && b.y >= y - 4 && b.x + b.w <= x + w + 4 && b.y + b.h <= y + h + 4;
        // the outermost elements with words of their own; no screen-reader-only bits
        if (!inside || b.w < 4 || b.h < 4 || !textOf(el).replace(/\W/g, '') || [...seen].some((s) => s.contains(el))) continue;
        seen.add(el);
        picked.push({ selector: selectorOf(el), text: textOf(el) });
      }
      post({ type: 'chip:picked', id, picked, section: sectionOf(document.elementFromPoint(x + w / 2 - scrollX, y + h / 2 - scrollY) ?? document.body, sectionIds) });
    }
  });
})();
