// Local provider: any model installed in Ollama. Nothing leaves the laptop.
// Interface (every provider): { id, kind: 'text' | 'decider', label, place,
// list(), ask({ system, messages, model }) -> async iterable of text pieces }.
import { chatStream, listModels } from '../lib/llm.js';
import { CHIP_MODEL, CHIP_EMBED_MODEL } from '../lib/config.mjs';

export const local = {
  id: 'local',
  kind: 'text',
  label: 'On this machine · free',
  place: 'local',

  /** Installed chat models (embedding models left out), from Ollama's /api/tags. */
  async list() {
    const names = (await listModels()) ?? [];
    const chat = names.filter((n) => !n.startsWith(CHIP_EMBED_MODEL));
    return chat.map((n) => ({
      id: `local:${n}`,
      label: n,
      group: 'On this machine',
      place: 'local',
      available: true,
      note: 'free · nothing leaves this machine',
      isDefault: n === CHIP_MODEL || n === `${CHIP_MODEL}:latest`,
    }));
  },

  ask({ system, messages, model, stats }) {
    return chatStream([{ role: 'system', content: system }, ...messages], model || CHIP_MODEL, stats);
  },
};
