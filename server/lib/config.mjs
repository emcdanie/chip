// The one config. Secrets and model names come from server/.env; the port
// default lives here and nowhere else (the bridge talks to the server it was
// served from, so it never needs to know the port).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import dotenv from 'dotenv';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, 'server', '.env'), quiet: true });

const env = process.env;
// 3100, not 3000: the portfolio's Next dev server owns 3000 (2026-10-03)
export const PORT = Number(env.PORT || 3100);
export const OLLAMA_URL = (env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
export const CHIP_MODEL = env.CHIP_MODEL || 'qwen3:8b';
export const CHIP_EMBED_MODEL = env.CHIP_EMBED_MODEL || 'nomic-embed-text';
// Speed: keep the model resident, cap the context window, cap retrieved words.
// Prompt evaluation runs ~210 tokens/s on an M1 Max with qwen3:8b, so time to
// first word grows with the context sent; CHIP_CONTEXT_WORDS is the main knob.
export const CHIP_KEEP_ALIVE = env.CHIP_KEEP_ALIVE || '30m';
export const CHIP_NUM_CTX = Number(env.CHIP_NUM_CTX || 4096);
export const CHIP_CONTEXT_WORDS = Number(env.CHIP_CONTEXT_WORDS || 450);
export const NOTION_API_TOKEN = env.NOTION_API_TOKEN || '';
export const BELLA_DIR = env.BELLA_DIR || join(homedir(), 'DEV', 'bella');

export const DATA_DIR = join(ROOT, 'data');
export const NOTION_DIR = join(DATA_DIR, 'notion');
export const INDEX_FILE = join(DATA_DIR, 'index', 'chunks.json');
export const BELLA_JSON = join(DATA_DIR, 'bella.json');
