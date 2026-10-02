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
export const PORT = Number(env.PORT || 3000);
export const OLLAMA_URL = (env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
export const CHIP_MODEL = env.CHIP_MODEL || 'qwen3:8b';
export const CHIP_EMBED_MODEL = env.CHIP_EMBED_MODEL || 'nomic-embed-text';
export const NOTION_API_TOKEN = env.NOTION_API_TOKEN || '';
export const BELLA_DIR = env.BELLA_DIR || join(homedir(), 'DEV', 'bella');

export const DATA_DIR = join(ROOT, 'data');
export const NOTION_DIR = join(DATA_DIR, 'notion');
export const INDEX_FILE = join(DATA_DIR, 'index', 'chunks.json');
export const BELLA_JSON = join(DATA_DIR, 'bella.json');
