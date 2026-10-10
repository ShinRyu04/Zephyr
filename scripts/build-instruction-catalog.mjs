// Build the instruction catalog from the awesome-copilot corpus.
//
// `applyTo` is normalised the same way the Rust reader does it, so the pattern
// stored here is the one the matcher will see. The body is stored WITHOUT the
// frontmatter, because that is what the agent should be told — the metadata is
// already separate fields on this entry.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error('usage: node build-instruction-catalog.mjs <instructions-dir>');
  process.exit(1);
}

/** Strip quotes and unwrap a single-line YAML list. */
function bersih(v) {
  let t = v.trim();
  if (t.startsWith('[') && t.endsWith(']')) t = t.slice(1, -1).trim();
  t = t.replace(/^['"]|['"]$/g, '');
  return t.trim();
}

const keluar = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.instructions.md')) continue;
  const teks = readFileSync(join(dir, f), 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(teks);
  let description = '';
  let applyTo = '';
  if (m) {
    const baris = m[1].split(/\r?\n/);
    for (let i = 0; i < baris.length; i += 1) {
      const l = baris[i];
      const kp = l.indexOf(':');
      if (kp < 0) continue;
      const k = l.slice(0, kp).trim();
      let v = l.slice(kp + 1).trim();
      // YAML block scalar: the value is on the following indented lines.
      if (v === '>' || v === '|' || v === '>-' || v === '|-') {
        const kumpul = [];
        let j = i + 1;
        for (; j < baris.length; j += 1) {
          const x = baris[j];
          if (!x.trim()) {
            kumpul.push('');
            continue;
          }
          if (!/^\s/.test(x)) break;
          kumpul.push(x.trim());
        }
        i = j - 1;
        v = v.startsWith('>') ? kumpul.join(' ').replace(/\s+/g, ' ').trim() : kumpul.join('\n').trim();
      } else {
        v = bersih(v);
      }
      if (k === 'description') description = v;
      if (k === 'applyTo') applyTo = bersih(v);
    }
  }
  const body = m ? teks.slice(m[0].length).trim() : teks.trim();
  const name = f.replace('.instructions.md', '');
  keluar.push({
    id: `instruction:${name}`,
    name,
    description,
    applyTo,
    source: 'github/awesome-copilot',
    body,
  });
}

keluar.sort((a, b) => a.name.localeCompare(b.name));
const dest = join(process.cwd(), 'src-tauri', 'assets', 'instruction-catalog.json');
writeFileSync(dest, JSON.stringify(keluar));
const kb = (statSync(dest).size / 1024).toFixed(0);
const tanpaApply = keluar.filter((x) => !x.applyTo).length;
const tanpaDesc = keluar.filter((x) => !x.description).length;
console.log(`wrote ${keluar.length} instructions -> ${dest}`);
console.log(`size: ${kb} KB | tanpa applyTo: ${tanpaApply} | tanpa description: ${tanpaDesc}`);
