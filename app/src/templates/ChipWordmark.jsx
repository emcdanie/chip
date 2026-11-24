// CHIP's wordmark A (Elleta, 24 Nov 2026, 18:08: "put the new logos in"): C, H, I and P in one ink line with the pink
// full stop, from her approved file docs/reference/screens/2026-11-24-stacked-icons/chip-wordmark-A-no-chip.svg.
// Colours are Chip tokens, so light and dark follow the theme: the ink is content/default, the full stop the same
// accent-1 pink as the logotype it replaces.
// Gap, for after the demo: the asset rule puts brand marks in BELLA (BrandWordmark word="CHIP" variant="wordmark-a");
// it lives here until that part exists, unchanged from her file but for the colours.
const LINE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', stroke: 'var(--color-content-default)', strokeWidth: 2.8 };

export default function ChipWordmark() {
  return (
    // 4 to the left: the art keeps 8 of room before the C where the logotype kept 4, so the C lands on the menu icons'
    // left edge (measured: ink at 27, icons at 28) in the box the logotype used
    <svg viewBox="8 8 84 48" role="img" aria-label="CHIP" style={{ display: 'block', inlineSize: '100%', blockSize: 'auto', marginInlineStart: 'calc(-1 * var(--spacing-4))' }}>
      <g style={LINE}>
        <path d="M38.88 23.29 A13 13 0 1 0 38.88 40.71" />
        <path d="M46 14V50 M46 32H57V20 M57 32V44H63.5V20H76A6.48 6.48 0 0 1 76 32.96H70 M70 20V44" />
      </g>
      <circle cx="86" cy="42.4" r="2.6" style={{ fill: 'var(--color-background-accent-1)' }} />
    </svg>
  );
}
