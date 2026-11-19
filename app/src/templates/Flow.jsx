// Layout primitive for page content (coordinator, 19 Nov 2026: "layout only
// through the template's layout primitives and tokens"). A page arranges
// BELLA parts with Flow; it never writes its own CSS. Gaps are the 4-point
// spacing tokens only.
import './Screen.css';

const GAPS = new Set([4, 8, 12, 16, 24]);

/**
 * direction: 'column' (stack) or 'row'; gap: 4, 8, 12, 16 or 24;
 * wrap: rows wrap onto the next line; fill: children grow to fill it (cards
 * in a row the same height, guideline 15); justify: 'between' puts the last
 * group at the right end (control bars: what you look at left, filters and
 * switchers right), 'end' pushes everything right; align: 'center' centres
 * a row's items; span: 12-column cells it takes when it
 * sits in the template's content grid (12, 6 or 4).
 */
export default function Flow({ as: Tag = 'div', direction = 'column', gap = 16, wrap = false, fill = false, justify = 'start', align, span = 12, children, ...rest }) {
  if (!GAPS.has(gap)) throw new Error(`Flow: gap ${gap} is not on the spacing scale (4, 8, 12, 16, 24)`);
  const cls = ['chip-flow', `chip-flow--${direction}`, `chip-flow--gap-${gap}`, wrap ? 'chip-flow--wrap' : '', fill ? 'chip-flow--fill' : '', justify !== 'start' ? `chip-flow--${justify}` : '', align === 'center' ? 'chip-flow--center-items' : '', `chip-span-${span}`]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
