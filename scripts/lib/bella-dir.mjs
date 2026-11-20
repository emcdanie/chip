// The one place CHIP finds BELLA (19 Nov 2026, build review: half the entry
// points fell back to ~/DEV/bella, an old feat/chip-components checkout with
// old tokens and no Lexend). Every build, script and the server resolve BELLA
// here: BELLA_DIR when set, else ~/DEV/bella-chip-theme. It must exist and
// sit on a chip/* branch (the BELLA line CHIP builds against), or this throws
// with the reason. The first call prints which BELLA was used.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DEFAULT_BELLA = join(homedir(), 'DEV', 'bella-chip-theme');
// parts and props CHIP's pages need, checked on every resolve: [file, a word it must hold]
const NEEDS = [
  ['src/components/NavItem/NavItem.tsx'],
  ['src/components/ListRow/ListRow.tsx', 'statusBar'],
  ['src/components/TaskCard/TaskCard.tsx', 'onOpen'],
];
let said = false;

export function bellaDir({ quiet = false } = {}) {
  const dir = resolve(process.env.BELLA_DIR || DEFAULT_BELLA);
  const from = process.env.BELLA_DIR ? 'BELLA_DIR' : 'default';
  if (!existsSync(join(dir, 'tokens', 'bella.css'))) {
    throw new Error(`CHIP: no BELLA at ${dir} (${from}): tokens/bella.css missing. Set BELLA_DIR to a BELLA checkout on a chip/* branch.`);
  }
  let branch = '';
  try {
    branch = execFileSync('git', ['-C', dir, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(`CHIP: BELLA at ${dir} is not a git checkout, so its branch cannot be checked.`);
  }
  if (!branch.startsWith('chip/')) {
    throw new Error(`CHIP: BELLA at ${dir} is on "${branch || 'a detached HEAD'}", not a chip/* branch. CHIP builds against the chip line of BELLA (default ${DEFAULT_BELLA}).`);
  }
  // the parts CHIP's pages use must be there, or the build looks right and renders old parts
  // (audit 21 Nov: the default checkout has an old ListRow): stop with the reason and the fix
  const missing = NEEDS.filter(([file, word]) => !existsSync(join(dir, file)) || (word && !readFileSync(join(dir, file), 'utf8').includes(word))).map(([file, word]) => (word ? `${file} without ${word}` : file));
  if (missing.length) {
    throw new Error(`CHIP: BELLA at ${dir} (${from}) lacks parts CHIP's pages use: ${missing.join('; ')}. Set BELLA_DIR to the BELLA with them (today ${join(homedir(), 'DEV', 'bella-parts')}).`);
  }
  if (!said && !quiet) {
    console.log(`CHIP: using BELLA ${dir} (${branch}, ${from})`);
    said = true;
  }
  return dir;
}
