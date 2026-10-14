/*
 * konteksZephyr.ts — aturan berkas `.zephyr-context.md` sebagai fungsi murni.
 *
 * Berkas ini ditulis oleh APLIKASI (bukan oleh model) di akar workspace, supaya
 * run berikutnya - chat baru, subagen, agen lain - tidak mulai dari nol: repo apa
 * ini, tugas apa yang sedang jalan, keputusan apa yang sudah diambil, berkas mana
 * yang penting.
 *
 * Masalah yang file ini selesaikan, semuanya nyata:
 *   1. ditulis di mana-mana  -> di sini hanya SATU nama berkas yang diizinkan, di
 *      dalam akar workspace, dan jalur yang keluar (mis. `../..`) DITOLAK;
 *   2. timpa-menimpa        -> bagian milik aplikasi selalu DITIMPA ulang, catatan
 *      milik model selalu DITAMBAH/dipertahankan; user tidak kehilangan catatannya
 *      hanya karena tugasnya berubah;
 *   3. tumbuh tanpa batas    -> berkas dipotong di batas baris dengan penanda
 *      eksplisit, bukan dipotong di tengah kalimat tanpa jejak;
 *   4. RAHASIA ikut tertulis -> daftar blokir di bawah menolak berkas rahasia dan
 *      pola kunci; kalau ketemu, berkas TIDAK ditulis sama sekali.
 *
 * Modul ini sengaja TANPA impor `node:fs` / Tauri: seluruh isi berkas dihitung di
 * sini sebagai STRING, dan yang menulis ke disk adalah lapisan aplikasi lewat
 * `jalurKonteks()` (satu-satunya jalur yang diizinkan). Dengan begitu aturannya
 * bisa diuji habis tanpa app hidup dan tanpa filesystem.
 */

/** Satu-satunya nama berkas yang dikelola modul ini. */
export const NAMA_KONTEKS = '.zephyr-context.md';

/** Batas ukuran berkas. 16 KB cukup untuk konteks; lebih dari itu hanya jadi sampah prompt. */
export const BATAS_BYTE = 16 * 1024;

/** Judul bagian milik APLIKASI (selalu ditimpa ulang). */
export const JUDUL_APLIKASI = '## Konteks aplikasi (dikelola Zephyr)';

/** Judul bagian milik MODEL (dipertahankan apa adanya, ditambahkan di bawah). */
export const JUDUL_AGEN = '## Catatan agen';

/** Penanda yang ditulis saat isi dipotong karena batas ukuran. */
export const PENANDA_POTONG = '> [!catatan] Isi dipotong aplikasi:';

/** Data minimal yang harus ada supaya berkas layak ditulis. */
export interface DataKonteks {
  /** Akar workspace (dipakai sebagai judul & baris `Repo:`). */
  repo: string;
  cabang?: string | null;
  /** Tugas yang sedang/pernah berjalan. */
  tugasBerjalan?: string | null;
  /** Keputusan penting yang sudah diambil di workspace ini. */
  keputusanPenting?: readonly string[];
  /** Berkas yang penting untuk tugas ini. */
  berkasPenting?: readonly string[];
  /** Ringkas hasil run terakhir. */
  hasilTerakhir?: string | null;
  /** ISO timestamp; dipakai baris "Diperbarui". */
  waktu?: string | null;
}

export interface TemuanRahasia {
  /** Nama aturan yang cocok, mis. `kunci-provider` - bukan nilainya. */
  aturan: string;
  /** Cuplikan yang sudah DISENSOR; nilai aslinya tidak pernah ikut. */
  contoh: string;
}

export interface HasilSaring {
  ok: boolean;
  /** Teks dengan nilai rahasia diganti `«disensor»`. */
  teks: string;
  temuan: TemuanRahasia[];
}

/*
 * ── DAFTAR BLOKIR ────────────────────────────────────────────────────────────
 *
 * Dua lapis, dan keduanya perlu:
 *   (a) NAMA BERKAS rahasia - `.env`, `id_rsa`, `credentials.json`, ... Ini yang
 *       sering bocor sebagai "berkas penting" hasil penelusuran direktori;
 *   (b) POLA NILAI - kunci/token yang tertulis di dalam teks (kalimat tugas, isi
 *       berkas yang diringkas, catatan agen). Nama berkas saja tidak menolong
 *       kalau nilainya sudah dikutip di dalam catatan.
 */
export const BERKAS_DIBLOKIR: readonly string[] = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.npmrc',
  '.netrc',
  '.pgpass',
  '.htpasswd',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'credentials.yml',
  'service-account.json',
  'secrets.json',
  'secrets.yaml',
  'keystore.jks',
  '.pem',
  '.key',
  '.pfx',
  '.p12',
];

interface AturanRahasia {
  nama: string;
  pola: RegExp;
}

/*
 * Pola tanpa flag `g`: `test()` pada regex global menyimpan `lastIndex`, sehingga
 * pemanggilan kedua pada teks yang sama bisa melaporkan "tidak ketemu" - bug klasik
 * yang membuat penyaring rahasia lulus sekali lalu diam. Pencarian semua kecocokan
 * memakai salinan baru ber-flag `g` di `cariRahasia()`.
 */
export const ATURAN_RAHASIA: readonly AturanRahasia[] = [
  { nama: 'kunci-anthropic', pola: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  /* `(?!ant-)`: tanpa ini kunci Anthropic juga cocok di aturan OpenAI, dan satu
     kunci yang sama dilaporkan dua kali - pesan penolakan jadi membingungkan. */
  { nama: 'kunci-openai', pola: /\bsk-(?!ant-)[A-Za-z0-9_-]{16,}/ },
  { nama: 'kunci-github', pola: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/ },
  { nama: 'token-github-pat', pola: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { nama: 'kunci-aws', pola: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { nama: 'kunci-google', pola: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { nama: 'token-slack', pola: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { nama: 'jwt', pola: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { nama: 'kunci-privat-ssh', pola: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nama: 'kunci-privat-pg', pola: /-----BEGIN PGP PRIVATE KEY BLOCK-----/ },
  {
    nama: 'penugasan-kunci',
    pola:
      /\b(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|password|passwd|pwd)\b\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{12,})/i,
  },
  { nama: 'berkas-env', pola: /(?:^|[\s"'`/\\])\.env(?:\.[A-Za-z0-9]+)?\b/ },
  { nama: 'berkas-kunci', pola: /[\w./\\-]+\.(?:pem|pfx|p12|key|keystore)\b/i },
  { nama: 'berkas-kredensial', pola: /[\w./\\-]*(?:credentials|service-account|secrets)\.(?:json|ya?ml)\b/i },
  { nama: 'ssh-privat', pola: /\bid_(?:rsa|dsa|ecdsa|ed25519)\b/ },
];

/** Sensor nilai: panjangnya tetap terlihat, isinya tidak. */
const SENSOR = '«disensor»';

function salinanGlobal(pola: RegExp): RegExp {
  return new RegExp(pola.source, pola.flags.includes('g') ? pola.flags : `${pola.flags}g`);
}

/**
 * Cari jejak rahasia di dalam teks.
 *
 * Mengembalikan SATU temuan per aturan (cukup untuk pesan penolakan), dengan
 * cuplikan yang sudah disensor sehingga nilai rahasianya tidak ikut tercatat di
 * log kegagalan - itu justru kebocoran kedua.
 */
export function cariRahasia(teks: string): TemuanRahasia[] {
  const temuan: TemuanRahasia[] = [];
  for (const aturan of ATURAN_RAHASIA) {
    const cocok = salinanGlobal(aturan.pola).exec(teks);
    if (!cocok) continue;
    const asli = cocok[0];
    const kepala = asli.slice(0, Math.min(6, asli.length));
    temuan.push({ aturan: aturan.nama, contoh: `${kepala}${SENSOR}` });
  }
  return temuan;
}

/** Ganti semua nilai rahasia dengan `«disensor»`, sisanya utuh. */
export function redaksi(teks: string): string {
  let keluar = teks;
  for (const aturan of ATURAN_RAHASIA) {
    keluar = keluar.replace(salinanGlobal(aturan.pola), (cocok, ...sisa) => {
      /*
       * Aturan "penugasan-kunci" punya grup tangkap: hanya NILAI yang disensor,
       * supaya kalimatnya tetap terbaca (`api_key=«disensor»`). Tanpa ini,
       * seluruh penugasan ikut hilang dan catatan jadi tidak bisa dipakai.
       */
      const grup = sisa.filter((x) => typeof x === 'string') as string[];
      const nilai = grup.length > 0 ? grup[0] : null;
      if (nilai && nilai.length > 0 && cocok.includes(nilai)) {
        return cocok.replace(nilai, SENSOR);
      }
      return SENSOR;
    });
  }
  return keluar;
}

/**
 * Saring satu blok teks sebelum masuk berkas.
 *
 * `ok: false` berarti teks itu MEMUAT rahasia. Teks yang dikembalikan sudah
 * disensor supaya pemanggil masih bisa menampilkan/mengganti kalimatnya, tapi
 * berkasnya sendiri tidak boleh ditulis (lihat `rencanaTulis`).
 */
export function saring(teks: string): HasilSaring {
  const temuan = cariRahasia(teks);
  return { ok: temuan.length === 0, teks: temuan.length === 0 ? teks : redaksi(teks), temuan };
}

/** Apakah nama berkas ada di daftar blokir (untuk penelusuran direktori). */
export function berkasDiblokir(namaBerkas: string): boolean {
  const nama = (namaBerkas.replace(/\\/g, '/').split('/').pop() ?? '').toLowerCase();
  if (nama.length === 0) return false;
  if (nama === '.env' || nama.startsWith('.env.') || nama.endsWith('.env')) return true;
  if (BERKAS_DIBLOKIR.includes(nama)) return true;
  return /\.(pem|key|pfx|p12|jks)$/.test(nama);
}

export interface HasilJalur {
  ok: boolean;
  /** Jalur lengkap (memakai `/`) kalau `ok`. */
  jalur?: string;
  alasan?: 'di-luar-akar' | 'nama-berkas-salah';
  pesan?: string;
}

/*
 * Normalisasi jalur tanpa filesystem: `..` diselesaikan sendiri, jadi bentuk
 * seperti `akar/../luar` tidak bisa dipakai untuk lolos dari pemeriksaan.
 */
function normalkan(jalur: string): string {
  const dipisah = jalur.replace(/\\/g, '/').split('/');
  const keluar: string[] = [];
  for (const bagian of dipisah) {
    if (bagian === '' || bagian === '.') continue;
    if (bagian === '..') {
      keluar.pop();
      continue;
    }
    keluar.push(bagian);
  }
  return keluar.join('/');
}

/**
 * Apakah `jalur` benar-benar berada DI DALAM `akar`.
 *
 * Dipakai sebagai penjaga terakhir sebelum menyentuh disk. Perbandingan dilakukan
 * pada jalur yang sudah dinormalkan (`..` diselesaikan), jadi `D:/Repo/../Luar`
 * tidak bisa menyamar sebagai isi `D:/Repo`.
 */
export function diDalamAkar(akar: string, jalur: string): boolean {
  const a = normalkan(akar).toLowerCase();
  if (a.length === 0) return false;
  const j = normalkan(jalur).toLowerCase();
  return j === a || j.startsWith(`${a}/`);
}

/**
 * Satu-satunya jalur tulis yang diizinkan: `<akar>/<NAMA_KONTEKS>`.
 *
 * Ditolak: nama berkas selain NAMA_KONTEKS, subfolder, akar kosong, dan akar yang
 * memuat `..` - yang terakhir itu penting karena `..` di bagian AKAR adalah cara
 * paling mudah keluar dari workspace tanpa terlihat: jalur hasilnya tetap terlihat
 * "normal" sesudah dinormalkan. Lapisan aplikasi WAJIB memakai fungsi ini sebelum
 * menyentuh disk.
 */
export function jalurKonteks(akar: string, namaBerkas: string = NAMA_KONTEKS): HasilJalur {
  if (namaBerkas !== NAMA_KONTEKS || namaBerkas.includes('/') || namaBerkas.includes('\\')) {
    return {
      ok: false,
      alasan: 'nama-berkas-salah',
      pesan: `Hanya ${NAMA_KONTEKS} yang dikelola aplikasi (diminta: ${namaBerkas}).`,
    };
  }
  const akarBersih = normalkan(akar);
  if (akarBersih.length === 0) {
    return { ok: false, alasan: 'di-luar-akar', pesan: 'Akar workspace kosong - tidak ada tempat menulis.' };
  }
  const menanjak = akar.replace(/\\/g, '/').split('/').some((b) => b === '..');
  if (menanjak) {
    return {
      ok: false,
      alasan: 'di-luar-akar',
      pesan: `Akar workspace memuat ".." - jalur ini bisa keluar dari workspace: ${akar}`,
    };
  }
  const jalur = `${akarBersih}/${NAMA_KONTEKS}`;
  if (!diDalamAkar(akarBersih, jalur)) {
    return { ok: false, alasan: 'di-luar-akar', pesan: `Jalur keluar dari akar workspace: ${jalur}` };
  }
  return { ok: true, jalur };
}

export interface BagianKonteks {
  aplikasi: string;
  agen: string;
}

/** Pecah isi berkas lama jadi bagian aplikasi dan bagian catatan agen. */
export function pecahBagian(teksLama: string | null | undefined): BagianKonteks {
  const teks = teksLama ?? '';
  /*
   * Judul dicari SEBAGAI AWAL BARIS, bukan sekadar substring: bagian aplikasi
   * menyebut judul itu di baris petunjuknya sendiri, dan pencarian substring akan
   * memotong berkas di tempat yang salah - akibatnya bagian aplikasi yang sudah
   * benar dianggap berbeda, berkas ditulis ulang tiap run, dan catatan agen
   * diduplikasi. Karena itu pola `(^|\n)` dipakai, dan judulnya dikembalikan utuh.
   */
  const cocok = new RegExp(`(?:^|\\n)(${JUDUL_AGEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).exec(teks);
  if (!cocok) return { aplikasi: teks, agen: '' };
  const pos = cocok.index + cocok[0].length - JUDUL_AGEN.length;
  return { aplikasi: teks.slice(0, pos), agen: teks.slice(pos) };
}

function daftarAtau(judul: string, isi: readonly string[] | undefined, kosong: string): string[] {
  const baris = (isi ?? []).map((x) => x.trim()).filter((x) => x.length > 0);
  if (baris.length === 0) return [`${judul}`, `- ${kosong}`];
  return [`${judul}`, ...baris.map((x) => `- ${x}`)];
}

/** Bagian milik aplikasi: repo, tugas, keputusan penting, berkas penting. */
export function bagianAplikasi(data: DataKonteks): string {
  const baris: string[] = [];
  baris.push(JUDUL_APLIKASI);
  baris.push('');
  baris.push('> Berkas ini dikelola aplikasi Zephyr; bagian ini ditimpa ulang tiap run.');
  baris.push('> Bagian catatan milik agen di bagian bawah berkas dipertahankan apa adanya - tulis catatanmu di sana.');
  baris.push('');
  baris.push('### Repo');
  baris.push(`- Repo: ${data.repo.trim()}`);
  if (data.cabang && data.cabang.trim().length > 0) baris.push(`- Cabang: ${data.cabang.trim()}`);
  baris.push('');
  baris.push('### Tugas berjalan');
  const tugas = (data.tugasBerjalan ?? '').trim();
  baris.push(tugas.length > 0 ? `- ${tugas}` : '- (belum ada tugas berjalan)');
  baris.push('');
  baris.push(...daftarAtau('### Keputusan penting', data.keputusanPenting, '(belum ada keputusan tercatat)'));
  baris.push('');
  baris.push(...daftarAtau('### Berkas penting', data.berkasPenting, '(belum ada berkas yang ditandai)'));
  const hasil = (data.hasilTerakhir ?? '').trim();
  if (hasil.length > 0) {
    baris.push('');
    baris.push('### Hasil run terakhir');
    baris.push(`- ${hasil}`);
  }
  if (data.waktu && data.waktu.trim().length > 0) {
    baris.push('');
    baris.push(`_Diperbarui: ${data.waktu.trim()}_`);
  }
  return baris.join('\n');
}

export interface RencanaTulis {
  /** `buat` | `timpa` | `tambah` | `lewati` - lihat catatan di bawah. */
  aksi: 'buat' | 'timpa' | 'tambah' | 'lewati';
  ok: boolean;
  /** Isi berkas yang harus ditulis (kosong kalau `lewati` / ditolak). */
  teks: string;
  temuan: TemuanRahasia[];
  /** Data minimal yang kurang, mis. repo kosong. */
  kurang: string[];
  terpotong: boolean;
  pesan?: string;
}

export interface OpsiRencana {
  /** Catatan tambahan dari agen yang mau DITAMBAHKAN ke bagian model. */
  catatanAgenBaru?: readonly string[];
}

/**
 * Putuskan apa yang harus dilakukan pada `.zephyr-context.md`.
 *
 * Aturan tulisnya, dan alasannya:
 *   * `buat`   - berkas belum ada. Dibuat saat run pertama di sebuah workspace.
 *   * `timpa`  - bagian APLIKASI berubah (repo/tugas/keputusan/berkas). Bagian
 *                milik aplikasi diganti utuh supaya tidak menumpuk versi lama;
 *                catatan agen di bawahnya DIBAWA serta apa adanya.
 *   * `tambah` - bagian aplikasi tidak berubah, tapi ada catatan agen baru.
 *                Berkas yang sudah benar tidak ditulis ulang hanya demi catatan:
 *                yang ditambahkan hanya bagian model.
 *   * `lewati` - tidak ada yang baru. Menulis ulang berkas identik berarti mtime
 *                berubah tiap run dan setiap agen lain ikut memproses ulang.
 *
 * Kalau ada rahasia di data ATAU di catatan agen: `ok: false`, `teks: ''`, dan
 * berkasnya TIDAK boleh ditulis. Isi yang sudah ada tidak diubah.
 */
export function rencanaTulis(
  teksLama: string | null | undefined,
  data: DataKonteks,
  opsi: OpsiRencana = {},
): RencanaTulis {
  const kurang: string[] = [];
  if (!data.repo || data.repo.trim().length === 0) kurang.push('repo');
  if (kurang.length > 0) {
    return {
      aksi: 'lewati',
      ok: false,
      teks: '',
      temuan: [],
      kurang,
      terpotong: false,
      pesan: `Konteks tidak ditulis: ${kurang.join(', ')} belum diketahui.`,
    };
  }

  const lama = pecahBagian(teksLama);
  const baru = bagianAplikasi(data);
  const catatanBaru = (opsi.catatanAgenBaru ?? []).map((x) => x.trim()).filter((x) => x.length > 0);

  /*
   * Bagian model: apa yang sudah ada dipertahankan apa adanya, catatan baru
   * ditambahkan DI BAWAHNYA. Kalau belum ada sama sekali, judulnya tetap dipasang
   * bersama satu baris petunjuk supaya model tahu di mana harus menulis.
   */
  const sebelumnya =
    lama.agen.trim().length > 0
      ? lama.agen.trimEnd()
      : `${JUDUL_AGEN}\n- (kosong - tulis catatanmu sendiri di bawah judul ini)`;
  const bagianAgen =
    catatanBaru.length > 0
      ? `${sebelumnya}\n${catatanBaru.map((x) => `- ${x}`).join('\n')}`
      : sebelumnya;

  const isiBaru = `${baru}\n\n${bagianAgen}\n`;
  const bagianAplikasiSama = lama.aplikasi.trim() === baru.trim();

  const aksi: RencanaTulis['aksi'] =
    (teksLama ?? '').trim().length === 0
      ? 'buat'
      : bagianAplikasiSama && catatanBaru.length === 0
        ? 'lewati'
        : bagianAplikasiSama
          ? 'tambah'
          : 'timpa';

  if (aksi === 'lewati') {
    return { aksi, ok: true, teks: '', temuan: [], kurang: [], terpotong: false };
  }

  /*
   * Saring SEBELUM dipotong: pemotongan bisa menyembunyikan ekor berkas, tapi
   * rahasia di kepala akan tetap lolos. Jadi seluruh teks diperiksa dulu.
   */
  const saringHasil = saring(isiBaru);
  if (!saringHasil.ok) {
    return {
      aksi: 'lewati',
      ok: false,
      teks: '',
      temuan: saringHasil.temuan,
      kurang: [],
      terpotong: false,
      pesan:
        `Konteks TIDAK ditulis: terdeteksi ${saringHasil.temuan.length} rahasia ` +
        `(${saringHasil.temuan.map((t) => t.aturan).join(', ')}). ` +
        'Buang rahasianya dulu, atau biarkan catatan lama apa adanya.',
    };
  }

  const dipotong = batasiUkuran(saringHasil.teks);
  return {
    aksi,
    ok: true,
    teks: dipotong.teks,
    temuan: [],
    kurang: [],
    terpotong: dipotong.terpotong,
  };
}

export interface HasilPotong {
  teks: string;
  terpotong: boolean;
  barisDibuang: number;
}

/**
 * Batasi ukuran berkas (byte UTF-8) DI BATAS BARIS.
 *
 * Memotong di tengah baris merusak penanda markdown dan bisa membelah sebuah
 * rahasia jadi dua bagian yang tidak lagi dikenali penyaring berikutnya. Karena
 * itu: ambil baris utuh sampai batas, lalu tandai sisanya secara eksplisit -
 * pemotongan yang tidak terlihat adalah pemotongan yang akan dicari user berjam-jam.
 */
export function batasiUkuran(teks: string, batas: number = BATAS_BYTE): HasilPotong {
  const panjang = (s: string) => new TextEncoder().encode(s).length;
  if (panjang(teks) <= batas) return { teks, terpotong: false, barisDibuang: 0 };

  const baris = teks.split('\n');
  const ambil: string[] = [];
  let dipakai = 0;
  for (const b of baris) {
    const tambahan = panjang(b) + 1;
    if (dipakai + tambahan > batas) break;
    ambil.push(b);
    dipakai += tambahan;
  }
  const dibuang = baris.length - ambil.length;
  const penutup = `${PENANDA_POTONG} ${dibuang} baris terakhir tidak dimuat (batas berkas ${Math.round(
    batas / 1024,
  )} KB). Bagian yang penting saja yang ditulis; sisanya bisa dibaca dari berkasnya sendiri.`;
  return { teks: `${ambil.join('\n')}\n\n${penutup}\n`, terpotong: true, barisDibuang: dibuang };
}
