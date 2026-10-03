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

// A tool counts as "read" when the server says it only reads (the MCP
// readOnlyHint annotation), or, when it says nothing, when its name starts
// with a reading verb. Everything else is "write" and goes through the guard.
const READ_NAME = /^(figma_)?(get|list|read|search|browse|capture|take|check|lint|audit|analyze|diagnose|whoami|export_tokens|generate_)/i;
export function kindOf(tool) {
  const a = tool.annotations ?? {};
  if (a.readOnlyHint === true) return 'read';
  if (a.readOnlyHint === false || a.destructiveHint === true) return 'write';
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

  async connect() {
    if (this.client) return this.client;
    const { transport, command, args = [], env = {}, url } = this.cfg;
    const client = new Client({ name: 'chip', version: '2.0.0' });
    if (transport === 'stdio') {
      // the child gets our PATH plus only the variables the config names
      await withTimeout(client.connect(new StdioClientTransport({ command, args, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stderr: 'ignore' })), CONNECT_MS, `${this.cfg.name} start`);
    } else {
      // newer servers speak "streamable HTTP"; older ones Server-Sent Events
      try {
        await withTimeout(client.connect(new StreamableHTTPClientTransport(new URL(url))), CONNECT_MS, `${this.cfg.name} connect`);
      } catch {
        const sse = new Client({ name: 'chip', version: '2.0.0' });
        await withTimeout(sse.connect(new SSEClientTransport(new URL(url.replace(/\/mcp$/, '/sse')))), CONNECT_MS, `${this.cfg.name} connect`);
        this.client = sse;
        return sse;
      }
    }
    this.client = client;
    return client;
  }

  /** [{ server, name, description, kind: 'read' | 'write', inputSchema }] */
  async listTools() {
    const client = await this.connect();
    const { tools } = await withTimeout(client.listTools(), CONNECT_MS, `${this.cfg.name} list tools`);
    this.tools = tools.map((t) => ({ server: this.cfg.name, name: t.name, description: (t.description ?? '').split('\n')[0].slice(0, 200), kind: kindOf(t), inputSchema: t.inputSchema }));
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
