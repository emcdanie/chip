#!/usr/bin/env node
// sync-notion: pulls every page shared with the Notion integration into
// data/notion/<slug>.md with front matter (id, title, url, last_edited).
// Incremental: a page whose last_edited_time matches the file on disk is
// skipped. Pages no longer shared are removed. data/notion/ is gitignored:
// Notion content never gets committed.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, collectPaginatedAPI, isFullPage, isFullBlock } from '@notionhq/client';
import { NOTION_API_TOKEN, NOTION_DIR } from '../server/lib/config.mjs';

const MAX_DEPTH = 3;

const text = (rich = []) => rich.map((r) => {
  let t = r.plain_text;
  if (!t) return '';
  if (r.annotations?.code) t = '`' + t + '`';
  if (r.annotations?.bold) t = '**' + t + '**';
  if (r.annotations?.italic) t = '_' + t + '_';
  if (r.href) t = `[${t}](${r.href})`;
  return t;
}).join('');

function pageTitle(page) {
  const prop = Object.values(page.properties || {}).find((p) => p.type === 'title');
  return (prop ? prop.title.map((t) => t.plain_text).join('') : '').trim() || 'Untitled';
}

const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'untitled';

function blockLine(b, indent) {
  const v = b[b.type] || {};
  const pad = '  '.repeat(indent);
  switch (b.type) {
    case 'paragraph': return pad + text(v.rich_text);
    case 'heading_1': return '# ' + text(v.rich_text);
    case 'heading_2': return '## ' + text(v.rich_text);
    case 'heading_3': return '### ' + text(v.rich_text);
    case 'bulleted_list_item': return pad + '- ' + text(v.rich_text);
    case 'numbered_list_item': return pad + '1. ' + text(v.rich_text);
    case 'to_do': return pad + `- [${v.checked ? 'x' : ' '}] ` + text(v.rich_text);
    case 'toggle': return pad + '- ' + text(v.rich_text);
    case 'quote': return pad + '> ' + text(v.rich_text);
    case 'callout': return pad + '> ' + text(v.rich_text);
    case 'code': return '```' + (v.language || '') + '\n' + text(v.rich_text) + '\n```';
    case 'divider': return '---';
    case 'child_page': return pad + `- (subpage) ${v.title}`;
    case 'child_database': return pad + `- (database) ${v.title}`;
    case 'bookmark': case 'embed': case 'link_preview': return v.url ? pad + `- <${v.url}>` : '';
    case 'table_row': return pad + '| ' + (v.cells || []).map(text).join(' | ') + ' |';
    default: return '';
  }
}

async function blocksToMd(notion, blockId, depth = 0) {
  const blocks = await collectPaginatedAPI(notion.blocks.children.list, { block_id: blockId });
  const lines = [];
  for (const b of blocks.filter(isFullBlock)) {
    const line = blockLine(b, depth);
    if (line) lines.push(line);
    // subpages are synced as their own files; don't inline them
    if (b.has_children && depth < MAX_DEPTH && !['child_page', 'child_database'].includes(b.type)) {
      const inner = await blocksToMd(notion, b.id, depth + 1);
      if (inner) lines.push(inner);
    }
  }
  return lines.join('\n');
}

function existingById() {
  const map = new Map();
  if (!existsSync(NOTION_DIR)) return map;
  for (const f of readdirSync(NOTION_DIR).filter((f) => f.endsWith('.md'))) {
    const head = readFileSync(join(NOTION_DIR, f), 'utf8').slice(0, 600);
    const id = head.match(/^id: (.+)$/m)?.[1];
    const edited = head.match(/^last_edited: (.+)$/m)?.[1];
    if (id) map.set(id, { file: f, edited });
  }
  return map;
}

export async function syncNotion({ log = console.log } = {}) {
  if (!NOTION_API_TOKEN) throw new Error('NOTION_API_TOKEN not set in server/.env');
  const notion = new Client({ auth: NOTION_API_TOKEN });
  mkdirSync(NOTION_DIR, { recursive: true });

  const pages = (await collectPaginatedAPI(notion.search, { filter: { property: 'object', value: 'page' } })).filter(isFullPage);
  const existing = existingById();
  let written = 0, skipped = 0, removed = 0, failed = 0;

  for (const page of pages) {
    const prev = existing.get(page.id);
    existing.delete(page.id);
    if (prev && prev.edited === page.last_edited_time) { skipped++; continue; }
    const title = pageTitle(page);
    const file = `${slugify(title)}-${page.id.replace(/-/g, '').slice(-10)}.md`;
    try {
      const body = await blocksToMd(notion, page.id);
      const fm = ['---', `id: ${page.id}`, `title: ${JSON.stringify(title)}`, `url: ${page.url}`, `last_edited: ${page.last_edited_time}`, '---', ''].join('\n');
      writeFileSync(join(NOTION_DIR, file), fm + `# ${title}\n\n` + body + '\n');
      if (prev && prev.file !== file) unlinkSync(join(NOTION_DIR, prev.file));
      written++;
    } catch (err) {
      failed++;
      log(`  notion: failed "${title}": ${err.message}`);
    }
  }
  for (const { file } of existing.values()) { unlinkSync(join(NOTION_DIR, file)); removed++; }

  log(`notion: ${pages.length} pages shared · ${written} written · ${skipped} unchanged (skipped) · ${removed} removed${failed ? ` · ${failed} failed` : ''}`);
  return { pages: pages.length, written, skipped, removed, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncNotion().catch((err) => { console.error('sync-notion:', err.message); process.exit(1); });
}
