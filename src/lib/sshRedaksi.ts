/*
 * sshRedaksi — penyaring rahasia untuk keluaran SSH dan catatan log.
 *
 * ## Kenapa berkas ini ada
 *
 * `src-tauri/src/logging.rs:49` menulis baris apa adanya (tidak ada `redact`),
 * dan `src-tauri/src/sftp.rs:137-140` menyalurkan skrip SFTP ke stdin lalu
 * mengembalikan stdout-nya utuh. Keluaran `ssh`/`sftp` bisa memuat kunci privat
 * (mis. `cat ~/.ssh/id_ed25519`) atau kata sandi yang tercetak oleh skrip
 * remote. Yang belum ada: satu daftar pola + satu fungsi yang bisa dipanggil
 * sebelum menulis.
 *
 * Ada dua penyaring di repo ini dan keduanya TIDAK saling menggantikan:
 *   - `src/lib/konteksZephyr.ts:168` `redaksi()` — untuk teks yang masuk ke
 *     KONTEKS model (API key, .env, nama berkas kunci).
 *   - berkas ini — untuk KELUARAN PROSES SSH: blok kunci privat (banyak baris),
 *     flag kata sandi CLI (`sshpass -p`, `-pw`), kredensial di URL, dan
 *     potongan argv yang dibawa ke log.
 *
 * Aturan yang sama untuk keduanya: yang diganti hanya NILAI, bentuk kalimatnya
 * tetap terbaca, dan rahasianya TIDAK PERNAH dikembalikan ke pemanggil.
 */

/** Penanda umum. */
export const PENANDA = '«disensor»';

/** Penanda kunci privat (menyebut jenisnya supaya log tetap bisa didiagnosis). */
export const PENANDA_KUNCI_PRIVAT = '«disensor:kunci-privat»';

export interface AturanRedaksi {
  nama: string;
  pola: RegExp;
  /** Bila ada: hanya grup-grup ini yang dipertahankan, sisanya jadi penanda. */
  rakit?: (grup: string[]) => string;
}

/*
 * Urutan PENTING: blok kunci privat lebih dulu, karena di dalamnya ada
 * baris-baris base64 yang bisa saja cocok dengan pola lain dan membuat
 * penggantian berikutnya berantakan.
 */
export const ATURAN_REDAKSI: readonly AturanRedaksi[] = [
  {
    /* Blok utuh: BEGIN ... END. `[\s\S]*?` (bukan `.`) supaya baris baru ikut. */
    nama: 'kunci-privat-blok',
    pola: /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    rakit: (g) => `${PENANDA_KUNCI_PRIVAT}(${g[0]})`,
  },
  {
    /* Hanya kepala kuncinya: log bisa terpotong rotasi 2 MiB di tengah blok,
     * dan kepala itu sendiri sudah menandai bahwa sisa barisnya rahasia. */
    nama: 'kunci-privat-tepuk',
    pola: /-----BEGIN[ \t]*([A-Z0-9 ]*PRIVATE KEY)-----/g,
    rakit: (g) => `${PENANDA_KUNCI_PRIVAT}(${g[0]})`,
  },
  {
    /* Penugasan bergaya `KEY=value` / `"key": "value"`. `\b` membuat
     * `PasswordAuthentication=no` TIDAK ikut (huruf setelah "Password" masih
     * satu kata), jadi opsi ssh yang sah tidak mengotori log. */
    nama: 'penugasan-rahasia',
    pola:
      /\b(password|passwd|passphrase|pwd|passwordEnc|password_enc|privateKey|private_key|client_secret|secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|bearer)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    rakit: (g) => `${g[0]}${g[1]}${PENANDA}`,
  },
  {
    /* Kata sandi yang ditaruh di baris perintah alat lain. Inilah bentuk yang
     * paling mungkin muncul di log karena argv ikut tercatat. */
    nama: 'sandi-di-argv',
    pola: /(sshpass\s+-p\s*|--password(?:\s+|=)\s*|-pw(?:=|\s+)\s*)(\S+)/gi,
    rakit: (g) => `${g[0]}${PENANDA}`,
  },
  {
    /* Header Authorization. Ditulis terpisah dari aturan penugasan karena di sini
     * tidak ada `=`/`:` setelah skema — bentuknya `Authorization: Bearer <token>`,
     * dan tanpa aturan ini tokennya lolos (ketahuan saat harness dijalankan). */
    nama: 'header-authorization',
    pola: /\b(authorization\s*:\s*)(basic|bearer|digest|token)\s+(\S+)/gi,
    /* Spasi setelah nama skema dipertahankan: `Bearer«disensor»` menyatu jadi
     * satu kata dan sulit dibaca saat memeriksa log. */
    rakit: (g) => `${g[0]}${g[1]} ${PENANDA}`,
  },
  {
    /* Kredensial di dalam URL: scheme://user:rahasia@host */
    nama: 'url-dengan-kredensial',
    pola: /([a-z][a-z0-9+.-]*:\/\/[^\s/:@]+):([^\s/@]+)@/gi,
    rakit: (g) => `${g[0]}:${PENANDA}@`,
  },
  {
    nama: 'token-api-populer',
    pola:
      /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{12,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  },
  {
    nama: 'jwt',
    pola: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g,
  },
];

/**
 * Yang TIDAK BOLEH masuk log — daftar ini yang harus dibaca sebelum menambah
 * satu `write_line()` baru, dan sebelum memutuskan sebuah keluaran boleh
 * ditampilkan ke model.
 */
export const DILARANG_LOG: readonly string[] = [
  'kata sandi SSH (apa pun isinya, termasuk yang tersimpan di ssh.json)',
  'passphrase kunci privat',
  'isi berkas kunci privat (PEM/OPENSSH), termasuk satu baris body base64-nya',
  'nilai password_enc / passwordEnc dari ssh.json',
  'nilai yang diawali "password=", "passwd=", "passphrase=", "-pw ", "sshpass -p"',
  'header Authorization (Bearer/Basic) dan token sesi',
  'token API pihak ketiga (gh*_, skip-, sk-, AKIA, xox*)',
  'argv apa pun yang memuat kata sandi — argv bisa dibaca proses lain',
  'isi mentah .env / secrets.json / credentials.json',
  'perintah remote yang memuat rahasia (mis. export TOKEN=…): sensor dulu, baru log',
  'isian variabel lingkungan proses ssh',
  'body base64 kunci privat yang muncul TANPA baris BEGIN/END (tidak bisa dikenali pasti — karena itu jangan sampai masuk log)',
];

/**
 * Yang BOLEH masuk log (supaya aturannya tidak jadi larangan selebar mungkin).
 * Fingerprint host key itu data PUBLIK — justru harus dicatat supaya perubahan
 * host key bisa terlihat.
 */
export const BOLEH_LOG: readonly string[] = [
  'fingerprint host key (SHA256:…)',
  'user@host dan port',
  'path berkas kunci (metadata, bukan isinya)',
  'kode keluar, durasi, jumlah baris keluaran',
  'pesan galat ssh yang sudah disensor',
];

function terapkan(aturan: AturanRedaksi, teks: string): string {
  return teks.replace(aturan.pola, (...args: unknown[]) => {
    const grup = args
      .slice(1, args.length - 2)
      .map((x) => (typeof x === 'string' ? x : ''));
    if (aturan.rakit) return aturan.rakit(grup);
    return PENANDA;
  });
}

/** Ganti semua rahasia yang dikenali dengan penanda; sisanya utuh. */
export function sensorRahasia(teks: string): string {
  let keluar = teks;
  for (const aturan of ATURAN_REDAKSI) keluar = terapkan(aturan, keluar);
  return keluar;
}

/** Nama aturan yang cocok (untuk audit). Nilai rahasianya tidak dikembalikan. */
export function namaAturanCocok(teks: string): string[] {
  const nama: string[] = [];
  for (const aturan of ATURAN_REDAKSI) {
    /* `g` di regex itu stateful (`lastIndex`); pakai salinan baru tiap kali. */
    const uji = new RegExp(aturan.pola.source, aturan.pola.flags);
    if (uji.test(teks)) nama.push(aturan.nama);
  }
  return nama;
}

/** true kalau teks memuat salah satu rahasia yang dikenali. */
export function adaRahasia(teks: string): boolean {
  return namaAturanCocok(teks).length > 0;
}

/** Sensor potongan argv sebelum dibawa ke log.
 *
 *  Di argv, rahasia sering datang sebagai token BERIKUTNYA (`sshpass` `-p`
 *  `rahasia`), jadi penyensoran per-token saja tidak cukup: siapa pun yang
 *  membaca log akan melihat kata sandinya. `-P` (port scp) sengaja TIDAK
 *  dianggap flag kata sandi. */
export function sensorArgv(argv: readonly string[]): string[] {
  let menunggu = false;
  let sesudahSshpass = false;
  return argv.map((a) => {
    if (menunggu) {
      menunggu = false;
      sesudahSshpass = false;
      return `${PENANDA}(${a.length} karakter)`;
    }
    if (sesudahSshpass && /^-p\S+$/.test(a)) {
      /* Bentuk menempel: `sshpass -prahasia`. */
      sesudahSshpass = false;
      return `${PENANDA}(${a.length} karakter)`;
    }
    if (sesudahSshpass) {
      if (a === '-p') {
        menunggu = true;
        return a;
      }
      sesudahSshpass = false;
    }
    if (/^sshpass$/i.test(a)) {
      sesudahSshpass = true;
      return a;
    }
    menunggu = /^(-pw|--password|--passphrase)$/i.test(a);
    return sensorRahasia(a);
  });
}

/**
 * Siapkan teks untuk log: potong dulu (log 2 MiB dengan rotasi 3 berkas tetap
 * bisa penuh oleh keluaran panjang), lalu sensor.
 */
export function sensorUntukLog(teks: string, batas = 8000): string {
  if (teks.length <= batas) return sensorRahasia(teks);
  const kepala = teks.slice(0, Math.floor(batas / 2));
  const ekor = teks.slice(teks.length - Math.ceil(batas / 2));
  return `${sensorRahasia(kepala)}\n… [${teks.length - batas} karakter dipotong] …\n${sensorRahasia(ekor)}`;
}
