// Atlas · Spec and Figma lint (Lint & Spec lock, 2026-10-03). Spec comes
// from code: the props, their values and defaults from BELLA's own docgen
// manifest (built by its gate), the contract and bella.json. Figma lint
// reads Figma through the official Figma MCP (read only) and compares it
// with code; when Figma can't be read, it says so and shows no score.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BELLA } from './bella-work.mjs';
import * as host from '../host/registry.js';

const MANIFEST = join(BELLA, 'storybook-static/manifests/components.json');

/** GET /bella-spec/:id -> { props: [{ name, values, default, required, description }] } */
export function specOf(c) {
  if (!existsSync(MANIFEST)) return { props: null, note: "BELLA's Storybook manifest isn't built yet (it comes with BELLA's gate)." };
  const all = JSON.parse(readFileSync(MANIFEST, 'utf8')).components;
  const entry = (Array.isArray(all) ? all : Object.values(all)).find((x) => x.name === c.name);
  const props = entry?.reactDocgen?.props;
  if (!props) return { props: null, note: `No docgen props for ${c.name} in BELLA's manifest.` };
  return {
    props: Object.entries(props).map(([name, p]) => ({
      name,
      values: p.tsType?.raw ?? p.tsType?.name ?? 'unknown',
      default: p.defaultValue?.value ?? null,
      required: Boolean(p.required),
      description: (p.description ?? '').split('\n')[0],
    })),
  };
}
