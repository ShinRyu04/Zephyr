import fs from 'node:fs';
import path from 'node:path';
const root = 'src-tauri/assets/plugins';
const mk = JSON.parse(fs.readFileSync(path.join(root, 'marketplace.json'), 'utf8'));
const byName = Object.fromEntries(mk.plugins.map((p) => [p.name, p]));

/* Walk a plugin dir, collecting every file as { rel, content }. rel uses '/'. */
function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) walk(abs, rel, out);
    else if (e.isFile()) out.push({ rel, content: fs.readFileSync(abs, 'utf8') });
  }
}

const plugins = [];
for (const name of fs.readdirSync(root)) {
  const dir = path.join(root, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  const meta = byName[name] || {};
  const files = [];
  walk(dir, '', files);
  plugins.push({
    name,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    category: manifest.category,
    tags: manifest.tags || [],
    icon: manifest.icon || '',
    featured: !!meta.featured,
    provides: manifest.provides,
    files,
  });
}
plugins.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(root, '..', 'plugin-catalog.json'), JSON.stringify({ plugins }, null, 2) + '\n');
console.log('bundled', plugins.length, 'plugins,', plugins.reduce((n, p) => n + p.files.length, 0), 'files');
