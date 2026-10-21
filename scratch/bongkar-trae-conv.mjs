/*
 * Read TRAE's Conversations panel straight out of its own bundle.
 *
 * WHY THIS ROUTE: TRAE runs without a debug port, and REA's native-UI capture is
 * macOS-only (it reports `Native macOS utilities require macOS`). So the DOM is
 * unreachable. The bundle is not: `workbench.desktop.main.js` is the file the UI
 * is built from, and it contains the literal strings the panel renders.
 *
 * WHAT THIS CAN AND CANNOT TELL US:
 *   - It gives the exact LABELS, and the ORDER they appear in the code.
 *   - It does NOT give the layout. Order in a bundle is not order on screen.
 *   So this is used for wording and structure, and any layout claim is checked
 *   against the screenshot separately.
 */
import fs from 'node:fs';

const FILE = 'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js';
const src = fs.readFileSync(FILE, 'utf8');
console.log('bundle:', (src.length / 1024 / 1024).toFixed(1), 'MB');

/* Labels that would only exist inside the Conversations panel. */
const KUNCI = [
  'Conversation',
  'conversation',
  'Delete All',
  'Delete all',
  'No conversation',
  'messages',
  'Search conversation',
  'search conversation',
  'View Details',
  'Open',
  'Export',
  'Auto-run',
];

for (const k of KUNCI) {
  let n = 0;
  let i = -1;
  while ((i = src.indexOf(k, i + 1)) !== -1 && n < 3) {
    n++;
    const sekitar = src.slice(Math.max(0, i - 90), i + 110).replace(/\s+/g, ' ');
    console.log(`\n[${k}] #${n}: ...${sekitar}...`);
  }
  if (n === 0) console.log(`\n[${k}] TIDAK ADA`);
}
