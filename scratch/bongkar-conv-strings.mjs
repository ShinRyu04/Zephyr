/*
 * Extract the Conversation settings UI's own strings from TRAE's bundle.
 *
 * WHY THE STRINGS AND NOT THE LAYOUT: the layout is not in the bundle in a form
 * that can be read reliably — it is React components with CSS modules, and
 * reconstructing geometry from that is guesswork. The STRINGS are exact, and they
 * tell us what the panel offers and in what order the code declares it, which is
 * most of what "make it look like TRAE" needs.
 *
 * The component id is `icube-modules-ai-conversation-settings`; the UI for it
 * lives near that id in the bundle. Everything within a window around it is
 * printed, then the human-readable labels are picked out.
 */
import fs from 'node:fs';

const FILES = [
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js',
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.js',
];

const ID = 'icube-modules-ai-conversation-settings';

let src = '';
for (const f of FILES) {
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes(ID)) {
    src = s;
    console.log('bundle:', f.split('/').pop(), (s.length / 1048576).toFixed(1), 'MB');
    break;
  }
}

/* Every place the component id appears, with its surroundings. */
let i = -1;
let n = 0;
while ((i = src.indexOf(ID, i + 1)) !== -1 && n < 5) {
  n++;
  console.log(`\n=== kejadian #${n} (pos ${i}) ===`);
  console.log(src.slice(Math.max(0, i - 700), i + 700).replace(/\s+/g, ' '));
}

/*
 * Candidate labels: quoted strings near "conversation" that read like UI copy
 * rather than identifiers or CSS. Kept deliberately narrow — a broad regex over
 * 15 MB returns thousands of hits and no signal.
 */
console.log('\n=== KANDIDAT LABEL UI ===');
const label = new Set();
for (const m of src.matchAll(/["'`]([A-Z][A-Za-z][^"'`\n]{3,60})["'`]/g)) {
  const t = m[1];
  if (/conversation|Conversation|history|History|delete|Delete|clear|Clear|export|Export|search|Search|share|Share/.test(t)) {
    if (!/^[A-Za-z]+$/.test(t) || t.length > 8) label.add(t);
  }
}
[...label].slice(0, 60).forEach((t) => console.log('  ' + t));
console.log('total kandidat:', label.size);
