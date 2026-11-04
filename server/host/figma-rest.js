// Figma over its REST API: the read path that needs no Figma app open and no
// MCP server running. A personal access token and the BELLA library's file
// key come from server/.env; with either missing, the test says exactly what
// to add and where. Read only: the REST API can't edit a design.
const API = 'https://api.figma.com/v1';
const TIMEOUT_MS = 15000;

export const MISSING = {
  FIGMA_ACCESS_TOKEN: 'Add FIGMA_ACCESS_TOKEN=<your token> to server/.env (Figma › Settings › Security › Personal access tokens, scopes: file content and file metadata, read only), then restart CHIP.',
  FIGMA_FILE_KEY: "Add FIGMA_FILE_KEY=<key> to server/.env: the part after /design/ in the BELLA library's Figma link. Then restart CHIP.",
};

export class FigmaRestServer {
  /** cfg: { name, kind: 'rest', env: { FIGMA_ACCESS_TOKEN, FIGMA_FILE_KEY }, allow } */
  constructor(cfg) {
    this.cfg = cfg;
  }

  get token() {
    return this.cfg.env?.FIGMA_ACCESS_TOKEN || '';
  }

  get fileKey() {
    return this.cfg.env?.FIGMA_FILE_KEY || '';
  }

  async get(path) {
    if (!this.token) throw new Error(MISSING.FIGMA_ACCESS_TOKEN);
    const r = await fetch(`${API}${path}`, { headers: { 'X-Figma-Token': this.token }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.status === 403) throw new Error('Figma refused the token (403). Make a new one with file content read access and replace FIGMA_ACCESS_TOKEN in server/.env.');
    if (r.status === 404) throw new Error(`Figma has no file ${this.fileKey} for this token (404). Check FIGMA_FILE_KEY in server/.env.`);
    if (r.status === 429) throw new Error('Figma is rate limiting this token (429). Try again in a minute.');
    if (!r.ok) throw new Error(`Figma answered ${r.status}.`);
    return r.json();
  }

  // the test: the token works and the file opens
  async listTools() {
    await this.get('/me');
    if (!this.fileKey) throw new Error(MISSING.FIGMA_FILE_KEY);
    const f = await this.get(`/files/${this.fileKey}?depth=1`);
    this.fileName = f.name;
    const tool = (name, description) => ({ server: this.cfg.name, name, description, kind: 'read', inputSchema: { type: 'object' } });
    return [tool('get_file', `The whole of "${f.name}" as JSON.`), tool('get_nodes', 'Nodes by id: { ids: "1:2,1:3" }.')];
  }

  async call(name, args = {}) {
    if (!this.fileKey) throw new Error(MISSING.FIGMA_FILE_KEY);
    if (name === 'get_file') return JSON.stringify(await this.get(`/files/${this.fileKey}`));
    if (name === 'get_nodes') return JSON.stringify(await this.get(`/files/${this.fileKey}/nodes?ids=${encodeURIComponent(args.ids ?? '')}`));
    throw new Error(`${this.cfg.name} has no tool called "${name}"`);
  }

  async close() {}
}
