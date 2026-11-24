// Empty-state marks (CHIP rule, picked A 22 Nov): the eight with a Noto animation show it, with a still PNG for reduced
// motion and the emoji as the fallback; each file loads only when its state shows. Every other mark stays the emoji.
// Files in app/public/emoji (Noto Emoji Animation by Google, CC BY 4.0; see LICENSE-noto.txt there).
const NOTO = { '💡': '1f4a1', '📦': '1f4e6', '✅': '2705', '🚦': '1f6a6', '🍵': '1f375', '🍻': '1f37b', '🤫': '1f92b', '⏳': '23f3' };

/** Props for BELLA EmptyState: { mark, markSrc, markStill } for an animated mark, { mark } for any other. */
export function markOf(mark) {
  const code = NOTO[mark];
  return code ? { mark, markSrc: `/emoji/${code}.webp`, markStill: `/emoji/${code}.png` } : { mark };
}
