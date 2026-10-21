const fs = require('fs');
const t = fs.readFileSync('src/components/ai/AiPanel.tsx', 'utf8');
const L = t.split('\n');
L.forEach((l, i) => {
  if (/ai-head|ai-top|ai-panel-head|className="ai-/.test(l) && i > 900 && i < 1300) {
    console.log(i + 1 + ': ' + l.trim().slice(0, 120));
  }
});
console.log('--- semua kelas ai- head ---');
const m = [...t.matchAll(/className="(ai-[a-z0-9-]*)"/g)].map((x) => x[1]);
console.log([...new Set(m)].filter((n) => /head|top|bar/.test(n)).join(' '));
