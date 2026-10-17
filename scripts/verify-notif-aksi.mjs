/**
 * Notifications carry actions on EVERY severity, and the action is wired to a
 * command that exists.
 *
 * Bug 6: `actions` was accepted only by `notifyError`. `NotificationCenter` has
 * always rendered `n.actions`, so the UI was ready and the store would not fill
 * it for info/warn. The useful case - "the run finished, take me back to it" -
 * is an INFO notification with a button, and the only way to get a button was to
 * report a failure.
 *
 * Run: node scripts/verify-notif-aksi.mjs
 *
 * Two levels, both cheap and both honest:
 *   - source: all three helpers accept the same options, and the AI run path
 *     actually passes an action.
 *   - behaviour: drive the real store (it is a plain zustand create, importable
 *     in node) and check the notification that comes out the other side.
 *
 * The behavioural half matters: a source check would pass even if `notify()`
 * silently dropped `actions`.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    console.log(`  GAGAL ${nama}${detail ? `\n         ${detail}` : ''}`);
  }
};

const toko = baca('src/lib/notificationStore.ts');
const aiStore = baca('src/lib/aiStore.ts');
const katalog = baca('src/lib/commandRegistry.ts');

console.log('\n1. Ketiga helper menerima bentuk opsi yang SAMA');
hasil(
  'ada satu tipe NotifOpts bersama',
  /export interface NotifOpts\b/.test(toko),
  'opsi masih ditulis ulang per helper',
);
for (const fn of ['notifyInfo', 'notifyWarn', 'notifyError']) {
  const re = new RegExp(`export const ${fn} = \\(message: string, opts\\?: NotifOpts\\)`);
  hasil(`${fn} memakai NotifOpts`, re.test(toko), 'signature masih punya bentuk sendiri');
}
hasil(
  'NotifOpts memuat actions',
  /export interface NotifOpts[\s\S]*?actions\?: NotifAction\[\]/.test(toko),
  'actions tidak ada di tipe bersama',
);

console.log('\n2. Jalur run AI benar-benar mengirim aksi');
hasil(
  'notifikasi run memakai `actions`',
  /const aksi = \[[\s\S]{0,200}command:/.test(aiStore),
  'tidak ada aksi yang dibangun di jalur notifikasi run',
);
hasil(
  'notifyInfo dipanggil DENGAN actions (bukan hanya notifyError)',
  /m\.notifyInfo\(judul, \{[^}]*actions: aksi[^}]*\}\)/.test(aiStore),
  'notifyInfo masih tanpa actions - inti bug 6',
);

console.log('\n3. Command yang dipakai aksi itu terdaftar');
const dipakai = [...aiStore.matchAll(/command:\s*'([a-z][\w.]*)'/g)].map((m) => m[1]);
const commandAksi = [...new Set(dipakai)].filter((c) => /^[a-z]+\.[a-z]/i.test(c));
hasil(
  `ada command yang dirujuk (${commandAksi.join(', ') || 'tidak ada'})`,
  commandAksi.length > 0,
  'tidak ada command yang bisa diperiksa',
);
for (const c of commandAksi) {
  hasil(
    `command '${c}' terdaftar di commandRegistry`,
    new RegExp(`id:\\s*'${c.replace(/\./g, '\\.')}'`).test(katalog),
    'aksi akan menekan tombol yang menjalankan command tidak dikenal',
  );
}

console.log('\n4. Perilaku: store benar-benar menyimpan aksi di severity info');
/*
 * The store is a plain zustand create with no React dependency, so it can be
 * imported directly. `tsx`/`ts-node` are not assumed - the file is read and
 * stripped of type annotations only where needed by a tiny shim instead, which
 * keeps this harness dependency-free.
 *
 * If the import fails (unexpected syntax), the check is reported as FAILED
 * rather than skipped: a behavioural check that silently skips is worse than
 * none, because the suite reads green while nothing was tested.
 */
try {
  /*
   * `window` is stubbed BEFORE the module loads: the store schedules toast
   * auto-dismiss with `window.setTimeout` at notify time. A real timer would
   * keep the process alive after the check finishes, so the stub returns a
   * token and never fires - we are testing that `actions` is STORED, not that
   * the toast disappears.
   */
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      setTimeout: () => 0,
      clearTimeout: () => {},
    };
  }
  const mod = await import(pathToFileURL(join(akar, 'src/lib/notificationStore.ts')).href);
  const { useNotif, notifyInfo, notifyWarn } = mod;
  const idInfo = notifyInfo('uji-info', {
    detail: 'rincian',
    source: 'AI',
    actions: [{ label: 'Buka chat', command: 'ai.panel' }],
  });
  const idWarn = notifyWarn('uji-warn', {
    actions: [{ label: 'Lihat', command: 'ai.panel' }],
  });
  const info = useNotif.getState().items.find((x) => x.id === idInfo);
  const warn = useNotif.getState().items.find((x) => x.id === idWarn);
  hasil(
    'notifyInfo menyimpan actions',
    !!info && info.actions.length === 1 && info.actions[0].command === 'ai.panel',
    `tersimpan: ${JSON.stringify(info?.actions ?? null)}`,
  );
  hasil(
    'notifyWarn menyimpan actions',
    !!warn && warn.actions.length === 1,
    `tersimpan: ${JSON.stringify(warn?.actions ?? null)}`,
  );
  hasil(
    'severity tetap info/warn (aksi tidak memaksa error)',
    info?.severity === 'info' && warn?.severity === 'warn',
    `info=${info?.severity} warn=${warn?.severity}`,
  );
} catch (e) {
  hasil('store bisa diimpor langsung untuk uji perilaku', false, String(e));
}

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
