// The Needs you view's data: a review page from the progress board (:3123) read into cards, and the
// answers written back in the shape the board's own pages send (decide.js and markup.js), to the
// same POST /answers. No store of its own (Elleta, 23 Nov 2026: a card opens its review page inside CHIP).

/* one plain line: the first sentence, cut at 160 */
const oneLine = (t) => {
  const first = (t ?? '').split(/(?<=[.?!])\s/)[0];
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
};
const textOf = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/* The id decide.js gives a card, so an answer lands on the same card whichever page sent it. */
export const cardId = (src, title) =>
  'c' + [...`${src}|${title}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(36);

/* The options decide.js offers: the "A ·" terms, else by the kind tag. */
function optionsOf(sec, kind) {
  const dts = [...sec.querySelectorAll('dt')];
  const lettered = dts.map((d) => ({ label: textOf(d), why: textOf(d.nextElementSibling) })).filter((o) => /^[A-E] ·/.test(o.label));
  if (lettered.length) return lettered;
  const plain = /thumbs/i.test(kind) ? [] : /yes\s*\/\s*no/i.test(kind) ? ['Yes', 'No'] : /built|no part change/i.test(kind) ? ['Looks right', 'Change it'] : ['Yes', 'No'];
  return plain.map((label) => ({ label, why: '' }));
}

const termValue = (sec, re) => {
  const dt = [...sec.querySelectorAll('dt')].find((d) => re.test(textOf(d)));
  return dt ? textOf(dt.nextElementSibling) : null;
};

/**
 * Reads a review page's HTML into { title, lede, cards }. A card is a section.part that is not already
 * decided; a page with none becomes one card (its pictures and a Yes / No).
 */
export function parseReview(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const src = new URL(pageUrl).pathname;
  const title = textOf(doc.querySelector('h1')) || textOf(doc.querySelector('title')) || src;
  const lede = textOf(doc.querySelector('.lede, main > p'));
  const shotsOf = (root) =>
    [...root.querySelectorAll('img')].map((img) => ({
      src: new URL(img.getAttribute('src'), pageUrl).href,
      alt: img.getAttribute('alt') ?? '',
      caption: textOf(img.closest('figure')?.querySelector('figcaption')) || img.getAttribute('alt') || '',
    }));
  const sections = [...doc.querySelectorAll('section.part')].filter((s) => s.dataset.decided !== 'true' && s.querySelector('h2'));
  const cards = sections.map((sec) => {
    const h = sec.querySelector('h2');
    const name = [...h.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() || textOf(h);
    const kind = textOf(h.querySelector('.kind'));
    const options = optionsOf(sec, kind);
    const pickLetter = (termValue(sec, /my pick/i) ?? '').match(/^([A-E])\b/)?.[1] ?? null;
    return {
      id: cardId(sec.dataset.src || src, name),
      from: sec.dataset.src || src,
      title: name,
      line: oneLine(textOf(sec.querySelector('p.decide, p'))),
      shots: shotsOf(sec),
      options: options.map((o) => ({ ...o, pick: !!pickLetter && o.label.startsWith(`${pickLetter} `) })),
      change: termValue(sec, /^change\b/i),
    };
  });
  if (!cards.length) cards.push({ id: cardId(src, title), from: src, title, line: oneLine(lede), shots: shotsOf(doc), options: [{ label: 'Yes', why: '' }, { label: 'No', why: '' }], change: null });
  return { title, lede, src, cards };
}

/** A card whose link is a picture, not a page: the picture and a Yes / No. */
export const isPicture = (href) => /\.(png|jpe?g|gif|webp)$/i.test(new URL(href).pathname);
export function picturePage(href, title) {
  const src = new URL(href).pathname;
  return { title, lede: '', src, cards: [{ id: cardId(src, title), from: src, title, line: '', shots: [{ src: href, alt: title, caption: title }], options: [{ label: 'Yes', why: '' }, { label: 'No', why: '' }], change: null }] };
}

/** What POST /answers takes for one page's decisions, as decide.js sends it. */
export function decisionBody(page, state) {
  const { A = {}, T = {}, N = {} } = state;
  return {
    page: page.title,
    url: page.src,
    cards: page.cards.map((c) => ({ from: c.from, title: c.title, answer: A[c.id] ?? null, thumb: T[c.id] ?? null, note: (N[c.id] ?? '').trim() || null })),
  };
}

/** What POST /answers takes for one page's pins, as markup.js sends it. */
export function markupBody(page, pins, viewport) {
  return {
    type: 'markup',
    page: page.title,
    url: page.src,
    viewport,
    notes: pins.map((p, i) => ({ n: i + 1, note: p.note.trim(), on: p.on, section: p.section, x: p.x, y: p.y })),
  };
}

/** How many answers a page holds: an option, a thumb or a comment per card, and each pin with a note. */
export function countAnswers(state = {}) {
  const { A = {}, T = {}, N = {}, pins = [] } = state;
  const cards = new Set([...Object.keys(A), ...Object.keys(T), ...Object.keys(N).filter((k) => (N[k] ?? '').trim())]);
  return cards.size + pins.filter((p) => p.note.trim()).length;
}

/** The address the review page's server takes answers at: the same server the page came from. */
export const answersUrl = (pageUrl) => new URL('/answers', pageUrl).href;
