/*
 * verify-fakta-zephyr.mjs - uji blok pengetahuan Zeph tentang Zephyr
 *
 * Yang diuji, dan kenapa:
 *  1. src/lib/zephyrFakta.ts SINKRON dengan sumbernya. Kalau tidak, Zeph akan
 *     menjelaskan aplikasi versi lama dengan yakin - persis jenis kesalahan yang
 *     blok ini dibuat untuk mencegah.
 *  2. TIAP kunci setelan yang ada di settings.rs muncul di teks fakta. Satu kunci
 *     yang terlewat berarti Zeph bilang "tidak ada setelan itu" pada user yang
 *     sedang melihatnya di layar.
 *  3. Prompt benar-benar memuat blok itu (import DAN dipakai di komposisi).
 *     Berkas yang digenerate tapi tidak dipakai tidak mengubah apa pun.
 *  4. Beberapa fakta yang gampang basi (port, halaman nav, pintasan) ada isinya.
 *
 * Jalankan: node scripts/verify-fakta-zephyr.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(akar, p), 'utf8');
const node = process.execPath;
let gagal = 0;
const keluhan = [];
function periksa(nama, benar, detail = '') {
  if (benar) console.log(`  ok   ${nama}`);
  else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? ` - ${detail}` : ''}`);
    keluhan.push(nama);
  }
}

console.log('1. sinkron dengan sumber');
let checkKeluar = '';
try {
  checkKeluar = execFileSync(node, ['scripts/gen-fakta-zephyr.mjs', '--check'], {
    cwd: akar,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  periksa('gen-fakta-zephyr --check', true);
} catch (e) {
  periksa('gen-fakta-zephyr --check', false, String(e.stderr || e.message).trim().split('\n')[0]);
}

const fakta = baca('src/lib/zephyrFakta.ts');
const kunci = JSON.parse(
  execFileSync(node, ['scripts/gen-fakta-zephyr.mjs', '--print-keys'], { cwd: akar, encoding: 'utf8' }),
);

const indeks = baca('src/lib/zephyrIndeks.ts');

console.log(`\n2. tiap kunci setelan bisa DIJAWAB - blok inti ATAU indeks (${kunci.length} kunci)`);
/* Aturan dua lapis (keputusan `ai-tahu-100-7(a)`): blok inti diikat angka 2.000
   token, jadi sebagian default memang pindah ke indeks. Yang TIDAK boleh terjadi
   adalah kunci yang tidak punya rumah sama sekali - pertanyaan "ada setelan X?"
   harus bisa dijawab, entah dari blok inti (`kunci=`) atau dari indeks
   (`["setelan","grup.kunci"`, yang dicari `zephyr_self`). Pemeriksaan ini DULU
   menuntut semua kunci ada di blok inti, dan itulah yang membuat blok inti
   menggelembung sampai 2.843 token. Sekarang jumlahnya dilaporkan per lapis,
   supaya pergeseran diam-diam tetap kelihatan angkanya. */
const hilang = [];
const diInti = [];
const diIndeks = [];
for (const k of kunci) {
  const segmen = k.split('.').pop();
  if (new RegExp(`(^|[\\s,])${segmen}=`).test(fakta)) {
    diInti.push(k);
    continue;
  }
  if (indeks.includes(`"setelan","${k}"`)) {
    diIndeks.push(k);
    continue;
  }
  hilang.push(k);
}
periksa(
  `kunci setelan terjawab (${kunci.length - hilang.length}/${kunci.length}: ${diInti.length} di inti, ${diIndeks.length} di indeks)`,
  hilang.length === 0,
  hilang.slice(0, 6).join(', '),
);

console.log('\n3. prompt memakai blok itu');
const prompt = baca('src/lib/systemPrompt.ts');
periksa('systemPrompt.ts mengimpor FAKTA_ZEPHYR', /import\s*\{\s*FAKTA_ZEPHYR\s*\}\s*from\s*'\.\/zephyrFakta'/.test(prompt));
/* Sejak blok inti dipecah dua lapis, yang masuk komposisi prompt BUKAN lagi
   FAKTA_ZEPHYR mentah: `faktaInti()` (blok generated minus bullet on-demand)
   + `blokLarangan()` (larangan padat). Yang diperiksa di sini: rakitannya masih
   mengambil fakta generated lewat jalur itu, bukan menggantinya dengan teks
   tulis-tangan (teks tulis-tangan = fakta yang bisa basi tanpa suara). */
periksa(
  'faktaInti() masuk ke komposisi bagian[]',
  /^\s{4}faktaInti\(\),\s*$/m.test(prompt),
);
periksa(
  'blokLarangan() masuk ke komposisi bagian[]',
  /^\s{4}blokLarangan\(\),\s*$/m.test(prompt),
);
periksa(
  'blok kondisional dipilih dari pesan user',
  /^\s{4}blokKondisional\(kueri\),\s*$/m.test(prompt),
);
periksa(
  'blok inti masih membaca blok generated (bukan salinan teks)',
  /export function faktaInti\(\)[\s\S]{0,200}FAKTA_ZEPHYR/.test(prompt),
);

console.log('\n4. fakta yang gampang basi');
periksa('blok fakta tidak kosong (>5000 karakter)', fakta.length > 5000, `${fakta.length} byte`);
/* Catatan: jarak 9223 -> 'CDP' TIDAK boleh ditulis [^0-9] - kata 'WebView2' di
   tengahnya mengandung digit, jadi pola itu gagal walau teksnya benar. */
periksa('port MCP bawaan 9222 + 9223 dicadangkan untuk CDP', /mcp\.port=9222/.test(fakta) && /9223.{0,80}(CDP|debug)/i.test(fakta));
periksa('port dev UI dari vite.config.ts', /port 5173/.test(fakta));
periksa('berkas setelan global %APPDATA%\\zephyr\\settings.json', /%APPDATA%[^]{1,4}zephyr[^]{1,4}settings\.json/.test(fakta));
periksa('jalur log zephyr-YYYY-MM-DD.log', /zephyr-YYYY-MM-DD\.log/.test(fakta));
periksa('daftar halaman nav (SECTION_ORDER) ada', /Pages in the nav, in order: general, editor, theme/.test(fakta));
periksa('halaman yang TIDAK di nav disebut', /NOT in that nav: .*rules.*subagent.*permissions.*mcp/.test(fakta));
/* "AI Models" dulu seksi Settings, lalu disebut seksi Chat Settings - dua-duanya
   tempat yang salah sekarang. Yang benar: pop-up berdiri sendiri, dan pintu
   masuknya disebut satu per satu supaya Zeph tidak mengirim user ke nav Setelan
   atau ke Chat Settings untuk setelan provider/kunci. */
periksa(
  '"AI Models" disebut pop-up berdiri sendiri, bukan halaman Settings',
  /"AI Models" \(Settings group/.test(fakta) &&
    /is NOT a Settings page and has no row in the nav/.test(fakta) &&
    /pop-up of its own, opened by/.test(fakta) &&
    /the same section component the editor-area Settings page used to show/.test(fakta),
);
/*
 * Jumlah pintu TIDAK dikunci ke angka: `PINTU_POPUP` di generator bertambah
 * setiap kali sebuah tombol baru membuka pop-up ini, dan dulu asersi "4 ways in"
 * membuat gate merah hanya karena pintunya bertambah - padahal produknya benar.
 * Yang diuji: kalimatnya menyebut jumlah yang ADA, dan pintu-pintu yang wajib
 * selalu bisa dicapai dari chat ikut disebut.
 */
periksa(
  'pintu masuk pop-up AI Models disebut',
  /\d+ ways in, all without leaving the chat:/.test(fakta) &&
    /the "Open AI Models" button on the 401/.test(fakta) &&
    /"AI Models" row in the chat panel/.test(fakta) &&
    /the command palette command "AI: Configure Models & API Keys" \(id ai\.models\)/.test(fakta),
);
periksa('"models" tidak lagi diklaim halaman Settings / seksi Chat Settings', (() => {
  const baris = fakta.split('\n');
  const nav = baris.find((b) => b.includes('Pages in the nav, in order:')) ?? '';
  const luar = baris.find((b) => b.includes('NOT in that nav:')) ?? '';
  const popup = baris.find((b) => b.includes('is NOT a Settings page')) ?? '';
  return (
    /\bmodels\b/.test(nav) === false &&
    /\bmodels\b/.test(luar) === false &&
    popup.length > 0 &&
    !/not Settings pages at all any more/.test(fakta)
  );
})());
/* Daftar seksi dibaca dari ChatSettingsPage.tsx; "Konten web" tidak ada di sana
   (itu label lain), jadi asersi lama menuntut seksi yang tidak pernah ada. */
periksa(
  'seksi Chat Settings ada',
  /Chat Settings .*sections: Mode, Agent, Context, Sub-agents, Tools, Rules, Models, Appearance, Session, Advanced/.test(fakta),
);
periksa('pintasan Command Palette Ctrl+Shift+P ada', /Ctrl\+Shift\+P = Command Palette/.test(fakta));
periksa('aturan anti-ngarang ada di blok', /## Never invent/.test(fakta) && /never invent|not in this block/i.test(fakta));

console.log('\n5. fakta cwd shell cocok dengan kode');
const builtins = baca('src/lib/zephyrTools/builtins.ts');
periksa('akarCwd() ada di builtins.ts', /function akarCwd\(\)/.test(builtins));
periksa('bash_run memakai akarCwd()', /agentExec\(aman, bacaAngka\(a\.timeout\), akarCwd\(\) \?\? undefined\)/.test(builtins));
periksa('shell memakai akarCwd()', /akarCwd\(\) \?\? undefined/.test(builtins));
periksa('akarCwd() mendahulukan path tab yang aktif', /t\.id === s\.activeTabId/.test(builtins) && /return s\.workspace;/.test(builtins));
periksa('tool yang butuh folder tidak lagi menuntut workspace', !/Minta user membuka folder dulu \(File -> Open Folder\)/.test(builtins));
periksa('blok fakta menyebut aturan cwd shell', /start in the folder of the file that is open/.test(fakta));

/* Tanpa folder terbuka, tool ber-scope folder tidak dikirim ke provider.
   Dua hal diperiksa: kodenya (modul + pemanggil) dan kalimat prompt-nya. */
console.log('\n6. tanpa folder, tool ber-scope folder tidak ditawarkan');
const subset = baca('src/lib/subsetAlat.ts');
const aiStore = baca('src/lib/aiStore.ts');
const bridge = baca('src/lib/devBridge.ts');
const promptSrc = baca('src/lib/systemPrompt.ts');
periksa('ALAT_BUTUH_FOLDER = list_directory/glob/grep', /ALAT_BUTUH_FOLDER = \['list_directory', 'glob', 'grep'\]/.test(subset));
periksa('alatUntukTugas menerima keadaan folder', /adaFolder = true,\n\): string\[\] \{/.test(subset));
periksa('penyaringan folder dipakai saat menyusun daftar', /if \(!adaFolder\) hasil = hasil\.filter\(\(n\) => !butuhFolder\(n\)\)/.test(subset));
periksa('gerbang rencana ikut aturan folder', /gerbangRencanaSiap\(alatAktif, adaFolderRun\)/.test(aiStore));
periksa('run nyata membaca keadaan workspace', /const adaFolderRun = useStore\.getState\(\)\.workspace !== null/.test(aiStore));
periksa('dev bridge meneruskan keadaan folder', /adaFolder === undefined \? useStore\.getState\(\)\.workspace !== null : adaFolder/.test(bridge));
periksa('prompt: pertanyaan soal Zephyr dijawab dari blok fakta', /answered from the Zephyr facts block above, not by searching/.test(promptSrc) && /dijawab dari blok fakta Zephyr di atas/.test(promptSrc));
periksa('prompt: tool folder tidak ditawarkan tanpa folder', /Folder-scoped tools \(list_directory, glob, grep\) are not offered/.test(promptSrc));
periksa('blok fakta memuat bagian menjawab soal Zephyr', /## Answering questions about Zephyr itself/.test(fakta));

console.log(
  `\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${kunci.length} kunci setelan, ${gagal} masalah` +
    (keluhan.length ? `\n  ${keluhan.join('\n  ')}` : ''),
);
process.exit(gagal === 0 ? 0 : 1);
