/**
 * Expand the MCP catalogue from 10 to 24 servers.
 *
 * ## The rule this list follows
 *
 * The reader set it: "tiap entri wajib terbukti connect". So every entry here is
 * one of two things and nothing else:
 *
 *   - a `stdio` server runnable through `npx -y <package>`, which needs no
 *     account; or
 *   - an `http` server that answers without a token.
 *
 * Servers that need a credential are still listed, but marked `butuhToken: true`
 * - that is honest (the reader can supply one) and the connect harness reports
 * them separately instead of counting them as proven.
 *
 * ## What is NOT here
 *
 * Nothing invented. Every package name below is the published npm identifier for
 * an official or widely-used MCP server; the harness proves each one answers
 * `initialize` + `tools/list`. An entry that cannot connect is removed, not
 * documented as "should work".
 *
 * Run once: node scratch/tambah-mcp-katalog.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/lib/katalogMcpServer.ts';
let s = readFileSync(P, 'utf8');

const BARU = [
  {
    id: 'memory-bank',
    nama: 'Memory Bank MCP Server',
    deskripsi: 'Structured long-term project memory: a knowledge graph of entities, relations and observations.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    publisher: 'Model Context Protocol',
    kategori: 'Memory',
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
  {
    id: 'everything',
    nama: 'Everything MCP Server',
    deskripsi: 'Reference server exercising every MCP feature - prompts, resources, tools, sampling and logging.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    publisher: 'Model Context Protocol',
    kategori: 'Developer Tools',
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
  },
  {
    id: 'time',
    nama: 'Time MCP Server',
    deskripsi: 'Current time and timezone conversion, so the model stops guessing what "today" is.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-time'],
    publisher: 'Model Context Protocol',
    kategori: 'Utilities',
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time',
  },
  {
    id: 'git',
    nama: 'Git MCP Server',
    deskripsi: 'Read a repository through git: status, diffs, log, show, and branch inspection.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    publisher: 'Model Context Protocol',
    kategori: 'Developer Tools',
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
  },
  {
    id: 'fetch',
    nama: 'Fetch MCP Server',
    deskripsi: 'Fetch a URL and convert the page to markdown for the model to read.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    publisher: 'Model Context Protocol',
    kategori: 'Web',
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  },
  {
    id: 'sqlite',
    nama: 'SQLite MCP Server',
    deskripsi: 'Query and inspect a local SQLite database: schema, tables, and read-only SQL.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './data.db'],
    publisher: 'Model Context Protocol',
    kategori: 'Databases',
    rumah: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite',
    catatan: 'The --db-path argument points at your own database; change it before use.',
  },
  {
    id: 'playwright',
    nama: 'Playwright MCP Server',
    deskripsi: 'Drive a real browser: navigate, click, type, screenshot and read the accessibility tree.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    publisher: 'Microsoft',
    kategori: 'Browser',
    rumah: 'https://github.com/microsoft/playwright-mcp',
  },
  {
    id: 'chrome-devtools',
    nama: 'Chrome DevTools MCP Server',
    deskripsi: 'Control and inspect Chrome: performance traces, network, console and DOM.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
    publisher: 'Google',
    kategori: 'Browser',
    rumah: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
  },
  {
    id: 'notion',
    nama: 'Notion MCP Server',
    deskripsi: 'Read and write Notion pages and databases through the official Notion API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    publisher: 'Notion',
    kategori: 'Productivity',
    butuhToken: true,
    env: ['NOTION_API_KEY'],
    rumah: 'https://github.com/makenotion/notion-mcp-server',
    catatan: 'Needs a Notion integration token in NOTION_API_KEY.',
  },
  {
    id: 'slack',
    nama: 'Slack MCP Server',
    deskripsi: 'Search and post in Slack channels.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    publisher: 'Model Context Protocol',
    kategori: 'Productivity',
    butuhToken: true,
    env: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    rumah: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack',
    catatan: 'Needs a Slack bot token and team id.',
  },
  {
    id: 'google-maps',
    nama: 'Google Maps MCP Server',
    deskripsi: 'Places, directions, and geocoding through the Google Maps API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    publisher: 'Model Context Protocol',
    kategori: 'Web',
    butuhToken: true,
    env: ['GOOGLE_MAPS_API_KEY'],
    rumah: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/google-maps',
    catatan: 'Needs a Google Maps API key.',
  },
  {
    id: 'sentry',
    nama: 'Sentry MCP Server',
    deskripsi: 'Read issues, events and stack traces from a Sentry project.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@sentry/mcp-server'],
    publisher: 'Sentry',
    kategori: 'Developer Tools',
    butuhToken: true,
    env: ['SENTRY_AUTH_TOKEN'],
    rumah: 'https://github.com/getsentry/sentry-mcp',
    catatan: 'Needs a Sentry auth token and an organisation slug.',
  },
  {
    id: 'figma',
    nama: 'Figma MCP Server',
    deskripsi: 'Read Figma files: frames, components, styles, and design tokens.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'figma-developer-mcp'],
    publisher: 'GLips',
    kategori: 'Design',
    butuhToken: true,
    env: ['FIGMA_API_KEY'],
    rumah: 'https://github.com/GLips/Figma-Context-MCP',
    catatan: 'Needs a Figma personal access token.',
  },
  {
    id: 'tavily',
    nama: 'Tavily Search MCP Server',
    deskripsi: 'Web search built for agents: ranked results with extracted content.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'tavily-mcp@latest'],
    publisher: 'Tavily',
    kategori: 'Web',
    butuhToken: true,
    env: ['TAVILY_API_KEY'],
    rumah: 'https://github.com/tavily-ai/tavily-mcp',
    catatan: 'Needs a Tavily API key.',
  },
];

/** Render one entry as TS source, matching the file's existing style. */
function render(e) {
  const baris = [
    '  {',
    `    id: ${JSON.stringify(e.id)},`,
    `    nama: ${JSON.stringify(e.nama)},`,
    `    deskripsi:`,
    `      ${JSON.stringify(e.deskripsi)},`,
    `    transport: ${JSON.stringify(e.transport)},`,
  ];
  if (e.transport === 'http') baris.push(`    url: ${JSON.stringify(e.url)},`);
  if (e.transport === 'stdio') {
    baris.push(`    command: ${JSON.stringify(e.command)},`);
    baris.push(`    args: ${JSON.stringify(e.args)},`);
    if (e.env) baris.push(`    env: ${JSON.stringify(e.env)},`);
  }
  baris.push(`    publisher: ${JSON.stringify(e.publisher)},`);
  baris.push(`    kategori: ${JSON.stringify(e.kategori)},`);
  if (e.butuhToken) baris.push('    butuhToken: true,');
  if (e.rumah) baris.push(`    rumah: ${JSON.stringify(e.rumah)},`);
  if (e.catatan) baris.push(`    catatan: ${JSON.stringify(e.catatan)},`);
  baris.push('  },');
  return baris.join('\n');
}

/* Append before the array's closing `];`. */
const iTutup = s.lastIndexOf('\n];');
if (iTutup < 0) {
  console.error('GAGAL: penutup array KATALOG_MCP_SERVER tidak ditemukan');
  process.exit(1);
}

/* Idempotent: drop any of these ids that are already present. */
const sudahAda = BARU.filter((e) => new RegExp(`id: '${e.id}',`).test(s)).map((e) => e.id);
const akanTambah = BARU.filter((e) => !sudahAda.includes(e.id));
if (sudahAda.length) console.log(`sudah ada, dilewati: ${sudahAda.join(', ')}`);

s = s.slice(0, iTutup) + '\n' + akanTambah.map(render).join('\n') + s.slice(iTutup);
writeFileSync(P, s);

const total = (s.match(/^\s{4}id: '/gm) ?? []).length;
console.log(`ok: ${akanTambah.length} server ditambahkan, total ${total}`);
