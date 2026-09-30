const fs = require('fs');
const path = require('path');
const dir = 'src-tauri/src';
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.rs'))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const w = (s.match(/#\[cfg\(windows\)\]/g) || []).length;
  const nw = (s.match(/#\[cfg\(not\(windows\)\)\]/g) || []).length;
  const lx = (s.match(/#\[cfg\(target_os = "linux"\)\]/g) || []).length;
  if (w || nw || lx) console.log(f.padEnd(22), 'windows=' + w, 'not-windows=' + nw, 'linux=' + lx);
}
