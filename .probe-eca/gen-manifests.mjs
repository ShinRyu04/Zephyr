import fs from 'node:fs';
import path from 'node:path';
const root = 'src-tauri/assets/plugins';
const mk = JSON.parse(fs.readFileSync(path.join(root, 'marketplace.json'), 'utf8'));
const byName = Object.fromEntries(mk.plugins.map((p) => [p.name, p]));
const listMd = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')) : [];
const listSkills = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).map((e) => e.name) : [];
const hookNames = (dir) => {
  const f = path.join(dir, 'hooks.json');
  if (!fs.existsSync(f)) return [];
  try { return Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { return []; }
};
const mcpNames = (p) => {
  const f = path.join(p, '.mcp.json');
  if (!fs.existsSync(f)) return [];
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Object.keys(j.mcpServers || {}); } catch { return []; }
};
let n = 0;
for (const name of fs.readdirSync(root)) {
  const dir = path.join(root, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const meta = byName[name] || {};
  const manifest = {
    name,
    description: meta.description || '',
    version: '1.0.0',
    author: meta.author || 'unknown',
    category: meta.category || 'Development',
    tags: meta.tags || [],
    icon: meta.icon || '',
    provides: {
      skills: listSkills(path.join(dir, 'skills')),
      agents: listMd(path.join(dir, 'agents')),
      rules: listMd(path.join(dir, 'rules')),
      hooks: hookNames(path.join(dir, 'hooks')),
      mcp: mcpNames(dir),
    },
  };
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  n++;
}
console.log('wrote', n, 'manifests');
