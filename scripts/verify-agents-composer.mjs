/**
 * Fase 1 — the Agents window gets its OWN composer, and the notification
 * centre is reachable in every window.
 *
 * Two defects, both of the same shape: the plumbing existed, the last joint was
 * missing, and the result was silent. Nothing threw. The panel mounted and drew
 * an empty transcript; the notification was recorded and never shown.
 *
 * Run: node scripts/verify-agents-composer.mjs
 *
 * Source-level checks on purpose. The defects are STRUCTURAL — a prop not
 * passed, a component not mounted — so reading the source is the honest proof.
 * A CDP run would prove it end to end too, but only while an app is up, and
 * these two must stay checkable on a clean checkout.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(akar, rel), 'utf8');

let lulus = 0;
let gagal = 0;
const hasil = (nama, ok, detail) => {
  if (ok) {
    lulus++;
    console.log(`  ok    ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? ` - ${detail}` : ''}`);
  }
};

const aiHost = baca('src/components/ai/AiHost.tsx');
const layout = baca('src/components/agents/AgentsLayout.tsx');
const store = baca('src/lib/aiStore.ts');
const agentsWin = baca('src/AgentsWindow.tsx');
const aiWin = baca('src/AiWindow.tsx');
const titlebar = baca('src/components/agents/AgentsTitlebar.tsx');

console.log('\n1. AiHost menerima composerId');
hasil(
  'AiHost punya parameter composerId',
  /export default function AiHost\(\{\s*composerId/.test(aiHost),
  'deklarasi AiHost tidak menerima composerId',
);
hasil(
  'AiHost meneruskan composerId ke AiPanel',
  /<AiPanel composerId=\{composerId\}/.test(aiHost),
  'AiPanel masih dirender tanpa composerId',
);

console.log('\n2. Agents window memakai id sendiri');
hasil(
  'AgentsLayout mengirim composerId="agents"',
  /<AiHost composerId="agents"/.test(layout),
  'AgentsLayout masih <AiHost /> tanpa id',
);
/*
 * The primary surface must KEEP ''. AiWindow is a separate WebView with its own
 * store, so there `''` really is the primary - changing it would make that
 * window lose the chat it was showing.
 */
hasil(
  'AiWindow tetap tanpa composerId (primary surface-nya sendiri)',
  /<AiPanel \/>/.test(aiWin),
  'AiWindow tiba-tiba memberi composerId - jendela pop-out punya store sendiri',
);

console.log('\n3. Store menyediakan kunci untuk kedua surface');
hasil(
  "loadSessions menyemai activeIds[''] DAN activeIds.agents",
  /const activeIds: Record<string, string \| null> = \{ '': activeId, agents: activeId \}/.test(
    store,
  ),
  'kunci agents tidak disemai saat muat - transkrip Agents akan kosong di run pertama',
);
hasil(
  'ikutiWorkspace mengarahkan SEMUA surface ke chat baru',
  /Set\(\[\.\.\.Object\.keys\(s\.activeIds\), 'agents'\]\)/.test(store),
  'chat baru untuk folder hanya mengarahkan surface yang sudah punya kunci',
);

console.log('\n4. NotificationCenter ter-mount di setiap window');
for (const [nama, isi] of [
  ['AgentsWindow', agentsWin],
  ['AiWindow', aiWin],
]) {
  hasil(
    `${nama} merender <NotificationCenter />`,
    /<NotificationCenter \/>/.test(isi),
    'panel notifikasi tidak pernah dirender di window ini',
  );
  hasil(
    `${nama} mengimpornya secara lazy`,
    /const NotificationCenter = lazy\(\(\) => import\('\.\/components\/notifications\/NotificationCenter'\)\)/.test(
      isi,
    ),
    'import NotificationCenter tidak ditemukan / tidak lazy',
  );
}

console.log('\n5. Loceng bisa membuka panel di Agents window');
hasil(
  'AgentsTitlebar merender <NotifBell />',
  /<NotifBell \/>/.test(titlebar),
  'tanpa loceng, centerOpen tidak pernah true di window ini',
);
hasil(
  'NotifBell diimpor dari NotificationCenter',
  /import \{ NotifBell \} from '\.\.\/notifications\/NotificationCenter'/.test(titlebar),
  'import NotifBell tidak ditemukan',
);

console.log('\n6. /browser terdaftar sebagai slash command');
const lib = baca('src/lib/promptLibrary.ts');
const ikon = baca('src/lib/promptIcons.ts');
const panel = baca('src/components/ai/AiPanel.tsx');
hasil(
  "aksi 'browser' ada di tipe PromptItem",
  /\|\s*'browser'/.test(lib),
  'tipe aksi belum memuat browser',
);
hasil(
  "entri { cmd: 'browser', aksi: 'browser' } ada",
  /cmd: 'browser',[\s\S]{0,120}aksi: 'browser'/.test(lib),
  'entri slash /browser tidak ada',
);
hasil(
  'ikon browser punya path DAN warna',
  /browser: 'M/.test(ikon) && /browser: 'var\(/.test(ikon),
  'ikon browser belum lengkap - tipe Record<IkonCmd> akan menolak',
);
hasil(
  "case 'browser' ditangani di pakaiPrompt",
  /case 'browser':/.test(panel),
  'aksi browser tidak punya penanganan - memilih /browser tidak melakukan apa pun',
);
hasil(
  '/browser memakai jalur yang sudah ada (shortcut + perintah)',
  /dispatchEvent\([\s\S]{0,200}KeyboardEvent/.test(panel) &&
    /terminal\.splitBrowser/.test(panel),
  'jalur buka-browser tidak memakai shortcut kolom kanan / perintah terdaftar',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
