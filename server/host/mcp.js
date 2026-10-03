// MCP adapter: connects CHIP to one MCP server and lists or calls its tools.
// An MCP server is a program that offers "tools" (functions with a name, a
// description and an input schema) over a standard protocol. Two ways to reach
// one:
//   - stdio: CHIP starts the program and talks to it over stdin and stdout
//     (Figma Console MCP, from a local install);
//   - http: the server already runs somewhere and CHIP calls its URL
//     (the official Figma MCP in the Figma desktop app).
// We use the official SDK (@modelcontextprotocol/sdk) so the protocol details
// are not ours to get wrong.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const CONNECT_MS = 15000;

// A tool counts as "read" only when its name starts get_, list_, read_ or
// browse_, or when the config lists it in "readTools". Everything else,
// whatever the server's own hints say, is "write" and waits for Confirm.
const READ_NAME = /^(figma_)?(get|list|read|browse)_/i;
export function kindOf(tool, readTools = []) {
  if (readTools.includes(tool.name)) return 'read';
  return READ_NAME.test(tool.name) ? 'read' : 'write';
}

const withTimeout = (p, ms, what) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

export class McpServer {
  /** cfg: { name, kind: 'mcp', transport: 'stdio' | 'http', command?, args?, env?, url?, allow } */
  constructor(cfg) {
    this.cfg = cfg;
    this.client = null;
    this.tools = null;
  }

  // one connection at a time; a failed or closed one is forgotten, so the
  // next call reconnects (Figma closed and reopened, the child exited)
  connect() {
    if (this.client) return Promise.resolve(this.client);
    this.connecting ??= this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async attempt(transport, what) {
    const client = new Client({ name: 'chip', version: '2.0.0' });
    try {
      await withTimeout(client.connect(transport), CONNECT_MS, what);
    } catch (e) {
      await client.close().catch(() => {}); // stops a stdio child that hung
      throw e;
    }
    client.onclose = () => {
      if (this.client === client) {
        this.client = null;
        this.tools = null;
      }
    };
    this.client = client;
    return client;
  }

  async open() {
    const { transport, command, args = [], env = {}, url } = this.cfg;
    if (transport === 'stdio') {
      // the child gets our PATH plus only the variables the config names
      return this.attempt(new StdioClientTransport({ command, args, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stderr: 'ignore' }), `${this.cfg.name} start`);
    }
    // newer servers speak "streamable HTTP"; older ones Server-Sent Events
    try {
      return await this.attempt(new StreamableHTTPClientTransport(new URL(url)), `${this.cfg.name} connect`);
    } catch (first) {
      try {
        return await this.attempt(new SSEClientTransport(new URL(url.replace(/\/mcp$/, '/sse'))), `${this.cfg.name} connect`);
      } catch {
        throw first;
      }
    }
  }

  /** [{ server, name, description, kind: 'read' | 'write', inputSchema }] */
  async listTools() {
    const client = await this.connect();
    const { tools } = await withTimeout(client.listTools(), CONNECT_MS, `${this.cfg.name} list tools`);
    this.tools = tools.map((t) => ({ server: this.cfg.name, name: t.name, description: (t.description ?? '').split('\n')[0].slice(0, 200), kind: kindOf(t, this.cfg.readTools), inputSchema: t.inputSchema }));
    return this.tools;
  }

  /** Runs one tool; returns its text output (images are noted, not inlined). */
  async call(name, args = {}) {
    const client = await this.connect();
    const res = await withTimeout(client.callTool({ name, arguments: args }), 60000, `${this.cfg.name} ${name}`);
    const text = (res.content ?? [])
      .map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? `[image: ${c.mimeType}]` : `[${c.type}]`))
      .join('\n');
    if (res.isError) throw new Error(text || `${name} failed`);
    return text;
  }

  async close() {
    await this.client?.close().catch(() => {});
    this.client = null;
  }
}
