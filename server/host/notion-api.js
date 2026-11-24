// Notion over its REST API: the read path CHIP can use on its own. Notion's
// hosted MCP signs in through a browser, which a local server can't do; an
// internal integration token can sit in server/.env like Figma's. The same
// token npm run sync:notion uses. It reads only the pages shared with that
// integration. Read only: no tool here writes.
import { Client, isFullPage } from '@notionhq/client';

const TIMEOUT_MS = 15000;

export const MISSING = 'Add NOTION_API_TOKEN=<token> to server/.env (notion.so/profile/integrations › New integration, Internal, read content only), share your pages with it, then restart CHIP.';

const titleOf = (page) => {
  const prop = Object.values(page.properties ?? {}).find((p) => p.type === 'title');
  return (prop ? prop.title.map((t) => t.plain_text).join('') : '').trim() || 'Untitled';
};
const plain = (rich = []) => rich.map((r) => r.plain_text ?? '').join('');

export class NotionApiServer {
  /** cfg: { name, kind: 'notion', env: { NOTION_API_TOKEN }, allow } */
  constructor(cfg) {
    this.cfg = cfg;
    this.detail = null;
  }

  get client() {
    const auth = this.cfg.env?.NOTION_API_TOKEN || process.env.NOTION_TOKEN || '';
    if (!auth) throw new Error(MISSING);
    this._client ??= new Client({ auth, timeoutMs: TIMEOUT_MS });
    return this._client;
  }

  async guard(p) {
    try {
      return await p;
    } catch (e) {
      if (e.code === 'unauthorized') throw new Error('Notion refused the token (401). Copy the integration’s secret again into NOTION_API_TOKEN in server/.env, then restart CHIP.');
      if (e.code === 'rate_limited') throw new Error('Notion is rate limiting this token. Try again in a minute.');
      throw e;
    }
  }

  // the test: the token works, and how many pages it can see
  async listTools() {
    const me = await this.guard(this.client.users.me({}));
    const found = await this.guard(this.client.search({ filter: { property: 'object', value: 'page' }, page_size: 100 }));
    const n = found.results.length;
    this.detail = n
      ? `${me.name ?? 'The integration'} sees ${n}${found.has_more ? '+' : ''} page${n === 1 ? '' : 's'}.`
      : `${me.name ?? 'The integration'} answers but sees no pages: share pages with it in Notion (••• › Connections).`;
    const tool = (name, description) => ({ server: this.cfg.name, name, description, kind: 'read', inputSchema: { type: 'object' } });
    return [tool('search', 'Pages shared with the integration whose title matches { query }.'), tool('get_page', 'One page as text: { id }.')];
  }

  async call(name, args = {}) {
    if (name === 'search') {
      const r = await this.guard(this.client.search({ query: String(args.query ?? ''), filter: { property: 'object', value: 'page' }, page_size: 20 }));
      return JSON.stringify(r.results.filter(isFullPage).map((p) => ({ id: p.id, title: titleOf(p), url: p.url, edited: p.last_edited_time })));
    }
    if (name === 'get_page') {
      const id = String(args.id ?? '');
      const page = await this.guard(this.client.pages.retrieve({ page_id: id }));
      const blocks = await this.guard(this.client.blocks.children.list({ block_id: id, page_size: 100 }));
      const lines = blocks.results.map((b) => plain(b[b.type]?.rich_text)).filter(Boolean);
      return `# ${titleOf(page)}\n${page.url}\n\n${lines.join('\n')}`;
    }
    throw new Error(`${this.cfg.name} has no tool called "${name}"`);
  }

  async close() {}
}
