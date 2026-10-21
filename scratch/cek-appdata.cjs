const fs = require('fs');
const path = require('path');

const bases = [
  path.join(process.env.APPDATA || '', 'com.zephyr.app'),
  path.join(process.env.APPDATA || '', 'Zephyr'),
  path.join(process.env.LOCALAPPDATA || '', 'com.zephyr.app'),
  path.join(process.env.LOCALAPPDATA || '', 'Zephyr'),
];

const out = [];
for (const b of bases) {
  if (!fs.existsSync(b)) {
    out.push('tidak ada: ' + b);
    continue;
  }
  out.push('ADA: ' + b);
  const walk = (d, depth = 0) => {
    if (depth > 2) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push('   ' + p.replace(b, '.'));
      if (e.isDirectory()) walk(p, depth + 1);
    }
  };
  walk(b);
}
fs.writeFileSync('D:\\Zephyr\\scratch\\appdata.txt', out.join('\n'), 'utf8');
console.log('OK');
