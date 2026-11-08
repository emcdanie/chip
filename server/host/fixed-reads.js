// Fixed reads: the only plugin code CHIP may run in Figma without a Confirm.
//
// The Desktop Bridge's read tools read whichever file is active in Figma,
// which can be a client file. Only figma_execute can name its file, so CHIP
// pins every Figma read to a file key with it. figma_execute runs plugin
// code, so the guard treats it as a write, except for the scripts below,
// matched character for character, on the file keys in server/.env. Any
// other code, file or argument goes through Confirm like every write.
//
// The scripts only read. Changing one changes what CHIP may run unasked, so
// it is a reviewed change to this file, never an argument from a caller.

export const FIXED_SCRIPTS = {
  // every component set and lone component outside the archive pages: its
  // name, page, id, variant names and property names
  components: `await figma.loadAllPagesAsync();
const out = [];
for (const page of figma.root.children) {
  if (/archive|changelog/i.test(page.name)) continue;
  for (const n of page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) {
    if (n.type === 'COMPONENT' && n.parent && n.parent.type === 'COMPONENT_SET') continue;
    out.push({
      page: page.name, name: n.name, id: n.id, type: n.type,
      variants: n.type === 'COMPONENT_SET' ? n.children.map((k) => k.name) : [],
      props: n.type === 'COMPONENT_SET' ? Object.keys(n.componentPropertyDefinitions || {}).map((k) => k.split('#')[0]) : [],
    });
  }
}
return { file: figma.root.name, comps: out };`,
  // every local variable collection: its name, modes, and each variable's name and type
  variables: `const cols = await figma.variables.getLocalVariableCollectionsAsync();
const out = [];
for (const c of cols) {
  const names = [];
  for (const id of c.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); if (v) names.push({ name: v.name, type: v.resolvedType }); }
  out.push({ name: c.name, modes: c.modes.map((m) => m.name), names });
}
return { file: figma.root.name, collections: out };`,
};

/** The file keys CHIP may read: BellaComponents and Foundations, from server/.env. */
export const allowedFiles = () =>
  ({ components: process.env.FIGMA_FILE_KEY || '', variables: process.env.FIGMA_FOUNDATIONS_KEY || '' });

/** True only for a fixed script, on the file key it belongs to, with nothing else added. */
export function isFixedRead(serverName, toolName, args) {
  if (serverName !== 'figma-console' || toolName !== 'figma_execute' || !args || typeof args !== 'object') return false;
  const kind = Object.keys(FIXED_SCRIPTS).find((k) => FIXED_SCRIPTS[k] === args.code);
  if (!kind) return false;
  const key = allowedFiles()[kind];
  if (!key || args.fileKey !== key) return false;
  const extra = Object.keys(args).filter((k) => !['code', 'fileKey', 'timeout'].includes(k));
  if (extra.length) return false;
  if (args.timeout !== undefined && !(Number.isInteger(args.timeout) && args.timeout > 0 && args.timeout <= 30000)) return false;
  return true;
}
