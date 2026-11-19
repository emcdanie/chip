// The one place CHIP finds BELLA (19 Nov 2026, build review: half the entry
// points fell back to ~/DEV/bella, an old feat/chip-components checkout with
// old tokens and no Lexend). Every build, script and the server resolve BELLA
// here: BELLA_DIR when set, else ~/DEV/bella-chip-theme. It must exist and
// sit on a chip/* branch (the BELLA line CHIP builds against), or this throws
// with the reason. The first call prints which BELLA was used.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DEFAULT_BELLA = join(homedir(), 'DEV', 'bella-chip-theme');
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
  if (!said && !quiet) {
    console.log(`CHIP: using BELLA ${dir} (${branch}, ${from})`);
    said = true;
  }
  return dir;
}
