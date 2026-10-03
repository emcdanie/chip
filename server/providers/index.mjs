// The providers OBI can pick from. Text providers answer; deciders choose.
import { local } from './local.js';
import { claude } from './claude.js';
import { jev } from './jev.js';

export const providers = { local, claude, jev };

/** 'local:qwen3:8b' -> { provider: local, model: 'qwen3:8b' }; 'claude' -> { provider: claude } */
export function resolve(id) {
  if (id?.startsWith('local:')) return { provider: local, model: id.slice('local:'.length) };
  if (id === 'claude') return { provider: claude };
  return { provider: local, model: undefined };
}

export async function listAll() {
  const out = [];
  for (const p of Object.values(providers)) out.push(...(await p.list().catch(() => [])));
  return out;
}
