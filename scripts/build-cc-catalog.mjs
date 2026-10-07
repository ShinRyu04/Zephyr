// Build the bundled Claude Code catalog (subagents + skills) that Zephyr ships
// and can install into ~/.claude so the real `claude` CLI picks them up.
//
// Sources (downloaded + extracted under a dir passed as argv[2]):
//   - 0xfurai/claude-code-subagents          -> agents/*.md
//   - VoltAgent/awesome-claude-code-subagents -> categories/<cat>/*.md
//   - anthropics/skills                       -> skills/<name>/SKILL.md
//
// Output: src-tauri/assets/cc-catalog.json — one array of entries:
//   { id, kind:'agent'|'skill', name, title, description, source, category,
//     model?, tools?, body }   (body = the full markdown to write to disk)
//
// Run: node scripts/build-cc-catalog.mjs /tmp/cc-probe/dl
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node build-cc-catalog.mjs <extracted-dir>');
  process.exit(1);
}

/** Parse YAML-ish frontmatter (--- ... ---) from a markdown doc. */
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k) meta[k] = v;
  }
  return { meta, body: md };
}

/** Title-case a kebab/snake name: "bash-expert" -> "Bash Expert". */
function titleCase(name) {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function onlyDir(base) {
  // The tarball extracts to <repo>-<sha>/… ; return that single child.
  const kids = readdirSync(base).filter((d) => statSync(join(base, d)).isDirectory());
  return join(base, kids[0]);
}

const out = [];
const seen = new Set();
function push(e) {
  // De-dupe by id, preferring the first (0xfurai is more uniform).
  if (seen.has(e.id)) return;
  seen.add(e.id);
  out.push(e);
}

// --- 0xfurai subagents -----------------------------------------------------
{
  const dir = join(onlyDir(join(root, 'ex_furai')), 'agents');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const md = readFileSync(join(dir, f), 'utf8');
    const { meta, body } = frontmatter(md);
    const name = meta.name || f.replace(/\.md$/, '');
    push({
      id: `agent:${name}`,
      kind: 'agent',
      name,
      title: titleCase(name),
      description: meta.description || '',
      source: '0xfurai/claude-code-subagents',
      category: 'Experts',
      model: meta.model || '',
      tools: meta.tools || '',
      body,
    });
  }
}

// --- VoltAgent subagents (grouped by category folder) ----------------------
{
  const catsRoot = join(onlyDir(join(root, 'ex_volt')), 'categories');
  for (const cat of readdirSync(catsRoot)) {
    const catDir = join(catsRoot, cat);
    if (!statSync(catDir).isDirectory()) continue;
    const pretty = titleCase(cat.replace(/^\d+-/, ''));
    for (const f of readdirSync(catDir).filter((x) => x.endsWith('.md') && x !== 'README.md')) {
      const md = readFileSync(join(catDir, f), 'utf8');
      const { meta, body } = frontmatter(md);
      const name = meta.name || f.replace(/\.md$/, '');
      push({
        id: `agent:${name}`,
        kind: 'agent',
        name,
        title: titleCase(name),
        description: meta.description || '',
        source: 'VoltAgent/awesome-claude-code-subagents',
        category: pretty,
        model: meta.model || '',
        tools: meta.tools || '',
        body,
      });
    }
  }
}

// --- anthropics/skills ------------------------------------------------------
{
  const skillsRoot = join(onlyDir(join(root, 'ex_skills')), 'skills');
  for (const name of readdirSync(skillsRoot)) {
    const skDir = join(skillsRoot, name);
    const skFile = join(skDir, 'SKILL.md');
    if (!existsSync(skFile)) continue;
    const md = readFileSync(skFile, 'utf8');
    const { meta, body } = frontmatter(md);
    // Note extra resource files (templates/scripts) so the UI can hint them.
    const extras = [];
    const walk = (d, rel) => {
      for (const e of readdirSync(d)) {
        if (e === 'SKILL.md') continue;
        const p = join(d, e);
        const r = rel ? `${rel}/${e}` : e;
        if (statSync(p).isDirectory()) walk(p, r);
        else extras.push(r);
      }
    };
    walk(skDir, '');
    push({
      id: `skill:${name}`,
      kind: 'skill',
      name: meta.name || name,
      title: titleCase(meta.name || name),
      description: meta.description || '',
      source: 'anthropics/skills',
      category: 'Skills',
      extras: extras.slice(0, 40),
      body,
    });
  }
}

out.sort((a, b) => (a.kind + a.category + a.name).localeCompare(b.kind + b.category + b.name));
const dest = join(process.cwd(), 'src-tauri', 'assets', 'cc-catalog.json');
writeFileSync(dest, JSON.stringify(out));
const agents = out.filter((e) => e.kind === 'agent').length;
const skills = out.filter((e) => e.kind === 'skill').length;
console.log(`wrote ${out.length} entries (${agents} agents, ${skills} skills) -> ${dest}`);
console.log(`size: ${(JSON.stringify(out).length / 1024 / 1024).toFixed(2)} MB`);
