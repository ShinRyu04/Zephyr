/*
 * `ingat` - memori lintas sesi milik Zeph AI sendiri.
 *
 * Item backlog `ai-ingat-sesi` (Ryu, 2026-10-13): "AI Zephyr BELUM punya memori
 * antar sesi - tiap sesi mulai dari nol". Modul memori (`aiMemori.ts`) dan
 * penyambungannya ke prompt sudah ada, tapi TANPA tool ini AI hanya bisa
 * MENERIMA memori: ia tidak punya cara menuliskan keputusan/preferensi/hasil
 * kerja yang baru disepakati, jadi memori hanya tumbuh kalau ada yang
 * menuliskannya dari luar. Tool ini menutup lingkaran itu.
 *
 * Isinya tipis dengan sengaja: SELURUH logika (urai, tulis atomik, pangkas
 * anggaran, penyaring lapis proyek, heuristik `layakDiingat`) tetap tinggal di
 * `aiMemori.ts` - modul yang sudah diuji 94/94 oleh `uji-memori-sesi.mjs`.
 * Kalau tool ini menyalin logikanya, dua salinan itu akan berbeda cepat atau
 * lambat, dan yang membuktikan perilaku di harness bukan yang dipakai di app.
 *
 * Aturan yang dipegang di sini:
 *
 *   - Lapis `proyek` hanya bisa ditulis kalau ada folder yang terbuka; tanpa
 *     folder, permintaan lapis proyek DITURUNKAN ke `global` dengan alasan yang
 *     terbaca, bukan gagal diam-diam atau menulis entri yang tak akan pernah
 *     muncul lagi.
 *   - Penolakan heuristik `layakDiingat()` dikembalikan APA ADANYA (teks +
 *     alasan), supaya model bisa memutuskan: ubah teksnya, atau paksa dengan
 *     `paksa: true` kalau ia tahu ini memang harus disimpan.
 *   - Semua keluaran berbentuk teks deterministik dan menyebut jumlah, id, dan
 *     alasan - bukan "berhasil" tanpa bukti.
 */
import type { AgentToolSpec } from '../types';
import {
  blokMemoriTersimpan,
  catatanMemori,
  cari as cariMemori,
  dokumenTersimpan,
  hapus as hapusMemori,
  muatLengkap,
  tambah as tambahMemori,
} from '../aiMemori';

export const AKSI_INGAT: readonly string[] = ['lihat', 'cari', 'tambah', 'hapus'];

/** Ambil string dari argumen tool; `''` untuk apa pun yang bukan string. */
function bacaTeks(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function bacaAngka(v: unknown, bawaan: number): number {
  const n = typeof v === 'number' ? v : Number(bacaTeks(v));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : bawaan;
}

/** Root proyek yang sedang terbuka, dibaca dari store - tanpa asumsi. */
async function rootAktif(): Promise<string | null> {
  try {
    const st = await import('../store');
    return st.useStore.getState().workspace ?? null;
  } catch {
    return null;
  }
}

export const SPEC_INGAT: AgentToolSpec = {
  name: 'ingat',
  description:
    'Memori lintas sesi ZEPH AI sendiri (bukan berkas user): simpan keputusan/preferensi/hasil kerja yang berlaku terus, cari apa yang sudah pernah disimpan, lihat isinya, atau hapus satu entri. aksi=lihat (bawaan) menampilkan yang tersimpan sekarang; cari menelusuri dengan kueri; tambah menyimpan entri baru (lapis=global lintas proyek, lapis=proyek hanya untuk folder yang sedang terbuka); hapus membuang satu entri lewat id. Entri bertahan antar sesi dan ikut disuntik ke prompt tiap giliran.',
  parameters: {
    type: 'object',
    properties: {
      aksi: {
        type: 'string',
        enum: [...AKSI_INGAT],
        description: 'Tindakan: lihat (bawaan), cari, tambah, atau hapus.',
      },
      teks: {
        type: 'string',
        description: 'Isi entri baru (aksi=tambah). Tulis sebagai fakta yang berdiri sendiri, bukan potongan percakapan.',
      },
      kueri: { type: 'string', description: 'Kata kunci pencarian (aksi=cari).' },
      id: { type: 'string', description: 'Id entri - boleh awalan id yang unik (aksi=hapus).' },
      jenis: {
        type: 'string',
        enum: ['keputusan', 'preferensi', 'kerja', 'lain'],
        description: 'Jenis entri (aksi=tambah). Kosong = tebak dari isi teks.',
      },
      lapis: {
        type: 'string',
        enum: ['global', 'proyek'],
        description: 'Lapis penyimpanan (aksi=tambah). global = lintas proyek; proyek = hanya untuk folder yang sedang terbuka.',
      },
      paksa: {
        type: ['boolean', 'string'],
        description: 'aksi=tambah: simpan walau heuristik kelayakan menolak (dipakai kalau teksnya memang harus ada).',
      },
      batas: { type: ['number', 'string'], description: 'Jumlah maksimum entri yang ditampilkan (bawaan 20).' },
    },
    required: ['aksi'],
  },
};

/** Satu baris ringkas untuk satu entri: id, lapis, jenis, tanggal, teks. */
function barisEntri(e: { id: string; lapis: string; proyek: string | null; jenis: string; tanggal: string; teks: string }): string {
  const asal = e.lapis === 'global' ? 'global' : `proyek ${e.proyek ?? '-'}`;
  return `#${e.id} [${e.tanggal}] ${asal}/${e.jenis}: ${e.teks}`;
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export async function jalankanIngat(args: Record<string, unknown> = {}): Promise<string> {
  const aksi = bacaTeks(args.aksi) || 'lihat';
  const batas = Math.max(1, Math.min(100, bacaAngka(args.batas, 20)));

  if (!AKSI_INGAT.includes(aksi)) {
    return `aksi tidak dikenal: "${aksi}". Aksi yang tersedia: ${AKSI_INGAT.join('|')}. Tidak ada yang diubah.`;
  }

  if (aksi === 'lihat') {
    const { dok, catatan } = await muatLengkap();
    const root = await rootAktif();
    /*
     * Dokumen yang dimuat SUDAH terbatas pada lapis global + proyek root yang
     * sedang terbuka (jalur berkasnya pun per root), jadi tidak ada penyaring
     * kedua di sini: menambahkannya hanya akan menciptakan aturan tandingan
     * yang bisa berbeda dari aturan modul memori.
     */
    const terpilih = dok.entri
      .slice()
      .sort((a, b) => (b.waktu || '').localeCompare(a.waktu || ''))
      .slice(0, batas);
    const kepala = `MEMORI ZEPH AI - ${dok.entri.length} entri tersimpan (${terpilih.length} ditampilkan, batas ${batas})`;
    const isi = terpilih.length ? terpilih.map(barisEntri).join('\n') : '(belum ada entri)';
    const blok = blokMemoriTersimpan(undefined, { root });
    const disuntik = blok ? `${blok.split('\n').length - 1} entri ikut di prompt sekarang` : 'tidak ada entri yang ikut di prompt (folder terbuka: ' + (root ?? 'tidak ada') + ')';
    const catat = catatan.length ? `\ncatatan: ${catatan.join('; ')}` : '';
    return `${kepala}\n${isi}\n${disuntik}${catat}`;
  }

  if (aksi === 'cari') {
    const kueri = bacaTeks(args.kueri);
    if (!kueri) return 'aksi=cari butuh "kueri". Tidak ada yang dicari.';
    const hasil = await cariMemori(kueri, { batas });
    if (!hasil.length) return `tidak ada entri memori yang cocok dengan "${kueri}" (0 hasil).`;
    return `cari("${kueri}") -> ${hasil.length} entri:\n${hasil.map(barisEntri).join('\n')}`;
  }

  if (aksi === 'tambah') {
    const teks = bacaTeks(args.teks);
    if (!teks) return 'aksi=tambah butuh "teks". Tidak ada yang disimpan.';
    const root = await rootAktif();
    const lapisDiminta = bacaTeks(args.lapis);
    let lapis: 'global' | 'proyek' | null =
      lapisDiminta === 'global' ? 'global' : lapisDiminta === 'proyek' ? 'proyek' : null;
    let catatanLapis = '';
    if (lapis === 'proyek' && !root) {
      lapis = 'global';
      catatanLapis =
        ' (lapis diminta "proyek" tapi tidak ada folder yang terbuka: entri lapis proyek hanya boleh muncul di folder tempat ia ditulis, jadi disimpan sebagai global)';
    }
    const jenisDiminta = bacaTeks(args.jenis);
    const jenis = ['keputusan', 'preferensi', 'kerja', 'lain'].includes(jenisDiminta)
      ? (jenisDiminta as 'keputusan' | 'preferensi' | 'kerja' | 'lain')
      : undefined;
    const paksa = args.paksa === true || bacaTeks(args.paksa).toLowerCase() === 'true';
    try {
      const entri = await tambahMemori(
        {
          teks,
          ...(jenis ? { jenis } : {}),
          ...(lapis ? { lapis } : {}),
        },
        { paksa, root },
      );
      return `tersimpan: #${entri.id} [${entri.tanggal}] ${entri.lapis === 'global' ? 'global' : `proyek ${entri.proyek}`}/${entri.jenis}${catatanLapis}\n${entri.teks}${
        paksa ? '\n(catatan: disimpan dengan paksa=true, jadi heuristik kelayakan tidak dipakai)' : ''
      }`;
    } catch (e) {
      const pesan = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
      return `DITOLAK: ${pesan}\nUbah teksnya supaya berisi keputusan/preferensi/hasil kerja yang berdiri sendiri, atau kirim ulang dengan paksa=true kalau ini memang harus disimpan.`;
    }
  }

  /* hapus */
  const id = bacaTeks(args.id);
  if (!id) return 'aksi=hapus butuh "id". Tidak ada yang dihapus.';
  const dok = dokumenTersimpan();
  const sekarangAda = dok ? dok.entri.filter((e) => e.id.startsWith(id)) : [];
  const ok = await hapusMemori(id);
  if (!ok) {
    const isi = sekarangAda.length ? ` entri yang cocok awalan itu: ${sekarangAda.map((e) => e.id).join(', ')}` : '';
    return `tidak ada entri dengan id "${id}" - tidak ada yang dihapus.${isi}`;
  }
  const sisa = catatanMemori().length ? `\ncatatan: ${catatanMemori().join('; ')}` : '';
  return `terhapus: #${id} (atau entri dengan awalan id itu)${sisa}`;
}

/** Entri tool untuk `AGENT_TOOLS` (dipasang dari `agentTools.ts`). */
export const TOOL_INGAT: {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
} = {
  spec: SPEC_INGAT,
  run: jalankanIngat,
};
