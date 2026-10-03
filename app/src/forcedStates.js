// Show a specimen in a state it only has on interaction (hover, keyboard
// focus, press) while its anatomy part is selected. Script cannot set
// :hover or :focus-visible, so this copies BELLA's own rules for those
// pseudo-classes onto attributes: `[data-force-hover]`, `[data-force-focus]`
// and `[data-force-active]`. The specimen then wears BELLA's real styles; no
// value is written here.

const MAP = [
  [/:hover\b/g, '[data-force-hover]'],
  [/:focus-visible\b/g, '[data-force-focus]'],
  [/:focus\b(?!-)/g, '[data-force-focus]'],
  [/:active\b/g, '[data-force-active]'],
];
// :focus-within and the like are left alone
const PSEUDO = /:(hover|focus-visible|active)\b|:focus(?![-\w])/;

// split a selector list at its top-level commas (not inside :is(...) etc.)
function parts(list) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(list.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(list.slice(from).trim());
  return out;
}

let installed = null;

function cloneRules(list, out) {
  for (const rule of list) {
    if (rule.cssRules && rule.media) {
      // keep media conditions (reduced motion keeps its say)
      const inner = [];
      cloneRules(rule.cssRules, inner);
      if (inner.length) out.push(`@media ${rule.media.mediaText} {\n${inner.join('\n')}\n}`);
    } else if (rule.selectorText && PSEUDO.test(rule.selectorText)) {
      // only the selectors that name a forced state, so nothing at rest changes
      const sels = parts(rule.selectorText)
        .filter((sel) => PSEUDO.test(sel))
        .map((sel) => MAP.reduce((s, [re, to]) => s.replace(re, to), sel));
      if (sels.length) out.push(`${sels.join(', ')} { ${rule.style.cssText} }`);
    }
  }
}

/** Copies the interaction rules once the stylesheets are in. Safe to call again. */
export function installForcedStates() {
  const out = [];
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode?.id === 'chip-forced-states') continue;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // a cross-origin sheet (fonts): nothing of BELLA's in it
    }
    cloneRules(rules, out);
  }
  if (!installed) {
    installed = document.createElement('style');
    installed.id = 'chip-forced-states';
    document.head.append(installed);
  }
  installed.textContent = out.join('\n');
}

/** The attribute a part's trigger needs, or null for parts visible at rest.
 * "pressed" is a real ARIA state (FilterChip styles [aria-pressed="true"]),
 * so it is set as aria-pressed, not copied from a pseudo-class. */
export function forceAttr(trigger) {
  if (trigger === 'hover') return ['data-force-hover', ''];
  if (trigger === 'focus') return ['data-force-focus', ''];
  if (trigger === 'active') return ['data-force-active', ''];
  if (trigger === 'pressed') return ['aria-pressed', 'true'];
  return null;
}
