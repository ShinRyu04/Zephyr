/*
 * Find the actual strings behind the chat-history tooltip ids.
 *
 * `u(5729,null)` is an index into a translation table. In VS Code's build that
 * table is emitted into the same bundle as a huge object literal, usually keyed
 * without quotes and often far from the call site. This scans for the id in any
 * of the shapes that table can take and prints the surrounding text, so the label
 * is read rather than guessed.
 */
const fs = require('fs');

const FILES = [
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js',
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.js',
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite-slim.js',
];

const IDS = [5729, 5730, 5731, 5732, 5733, 5734, 5735];

for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  console.log('\n########', f.split('/').pop(), (s.length / 1048576).toFixed(1), 'MB');

  for (const id of IDS) {
    /* Every occurrence, so a table entry is distinguishable from a call site. */
    let i = -1;
    let n = 0;
    while ((i = s.indexOf(String(id), i + 1)) !== -1 && n < 6) {
      const jendela = s.slice(Math.max(0, i - 60), i + 60);
      /* A table entry looks like `5729:"Some Label"`; a call site looks like
         `u(5729,null)`. Only the former is printed. */
      if (new RegExp('\\b' + id + '\\s*:\\s*["`]').test(jendela)) {
        n++;
        console.log(`  ${id}: ${JSON.stringify(jendela)}`);
      }
    }
    if (n === 0) console.log(`  ${id}: tidak ada entri tabel`);
  }
}
