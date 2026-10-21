/*
 * Find the REAL chat-history UI strings, not the settings page.
 *
 * The earlier search looked for a "Conversation" page and found the SETTINGS page
 * of that name — a page of toggles. The reader pointed out that what they showed
 * was not that, and they were right: TRAE's chat history is a different surface,
 * registered as the command `workbench.action.chat.history` with the title
 * "Show Chats...". This file reads the strings around that command.
 */
import fs from 'node:fs';

const src = fs.readFileSync(
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js',
  'utf8',
);

const i = src.indexOf('workbench.action.chat.history');
console.log('=== KOMAND RIWAYAT CHAT ===');
console.log(src.slice(Math.max(0, i - 120), i + 1200).replace(/\s+/g, ' '));

/*
 * The view that lists sessions. `ChatViewSessionsEnabled` gates whether sessions
 * live inside the chat view; when it is off they get their own view. Either way
 * the view id is the thing to look for.
 */
for (const kunci of ['ChatViewSessionsEnabled', 'chatSessions', 'chat-sessions', 'sessionsView']) {
  let p = -1;
  let n = 0;
  while ((p = src.indexOf(kunci, p + 1)) !== -1 && n < 2) {
    n++;
    console.log(`\n[${kunci}] #${n}`);
    console.log(src.slice(Math.max(0, p - 260), p + 260).replace(/\s+/g, ' '));
  }
  if (n === 0) console.log(`\n[${kunci}] TIDAK ADA`);
}

/* Titles the history list would show. */
console.log('\n=== JUDUL TERJEMAHAN DI SEKITAR RIWAYAT ===');
const sekitar = src.slice(Math.max(0, i - 4000), i + 4000);
const t = [...sekitar.matchAll(/L\((\d+),\s*"([^"]{3,45})"\)/g)].map((m) => `${m[1]}: ${m[2]}`);
console.log([...new Set(t)].slice(0, 40).join('\n'));
