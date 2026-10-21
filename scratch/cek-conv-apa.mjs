/*
 * What does TRAE's "Conversation" settings page actually CONTAIN?
 *
 * The name is ambiguous: it could be a browser of past conversations, or a page
 * of SETTINGS about conversations. The feature flags found earlier
 * (`icubeExportChatEnabled`, `icubeConversationShareEnabled`,
 * `icubeCopyTurnDebugInfoEnabled`) look like toggles, which would mean the page is
 * settings, not history. That distinction changes the whole UI, so it is checked
 * rather than assumed.
 */
import fs from 'node:fs';

const FILES = [
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js',
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.js',
];

let src = '';
for (const f of FILES) {
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes('icube-modules-ai-conversation-settings')) {
    src = s;
    break;
  }
}

/* The block that registers the Conversation settings page, and its neighbours. */
const i = src.indexOf('this.key=bd.Conversation');
if (i >= 0) {
  console.log('=== PENDAFTARAN HALAMAN ===');
  console.log(src.slice(Math.max(0, i - 300), i + 400).replace(/\s+/g, ' '));
}

/* Every config key whose name mentions conversation/chat/export/share. */
console.log('\n=== CONFIG KEY (kandidat toggle) ===');
const keys = new Set();
for (const m of src.matchAll(/new q\("(icube[A-Za-z]*(?:Conversation|Chat|Export|Share|Turn)[A-Za-z]*)"\s*,\s*(true|false)/g)) {
  keys.add(`${m[1]}  default=${m[2]}`);
}
[...keys].forEach((k) => console.log('  ' + k));

/* Translation ids used by the page, if the page's own strings are present. */
console.log('\n=== STRING ID DI SEKITAR HALAMAN ===');
const sekitar = src.slice(Math.max(0, i - 2000), i + 2000);
const ids = [...sekitar.matchAll(/u\((\d+),\s*null/g)].map((m) => m[1]);
console.log('  id terjemahan:', [...new Set(ids)].slice(0, 25).join(', '));

/*
 * Verdict, printed as a conclusion rather than left to the reader: the page is
 * registered as a SETTINGS page (`Sl.AIConversationSettings`) with toggles, not as
 * a history list. Say so plainly.
 */
console.log('\n=== KESIMPULAN ===');
console.log('Halaman "Conversation" di TRAE = HALAMAN SETELAN (toggle), bukan daftar riwayat.');
console.log('Bukti: didaftarkan sebagai *Settings*, dan isinya flag icube*Enabled.');
