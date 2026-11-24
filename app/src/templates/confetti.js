// A short confetti burst when a run lands and passes (her review, 24 Nov: "throw a short confetti burst"). BELLA has
// no confetti part yet (a BELLA gap, named in the hand-over): a small canvas over the window for about a second, its
// colours read from BELLA's tokens at the moment it runs, never typed. Nothing under reduced motion; it takes no
// clicks and leaves nothing behind.
const TOKENS = ['--color-border-utility-success', '--color-border-utility-info', '--color-border-utility-warning', '--color-border-focus'];

export function confetti({ count = 80, ms = 1100 } = {}) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const css = getComputedStyle(document.documentElement);
  const colours = TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean);
  if (!colours.length) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', inlineSize: '100vw', blockSize: '100vh', pointerEvents: 'none', zIndex: '60' });
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  // from the bottom centre, where the toast sits, up and outward
  const x0 = window.innerWidth / 2;
  const y0 = window.innerHeight - 96;
  const bits = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const v = 6 + Math.random() * 7;
    return { x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, w: 6 + Math.random() * 4, h: 3 + Math.random() * 3, c: colours[Math.floor(Math.random() * colours.length)] };
  });
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - t / ms);
    for (const b of bits) {
      b.vy += 0.25;
      b.x += b.vx;
      b.y += b.vy;
      b.r += 0.2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (t < ms) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
