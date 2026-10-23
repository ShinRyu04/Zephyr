/**
 * My Artifacts — berkas hasil karya di halaman `My Artifacts` jendela Agents.
 *
 * ## Kenapa folder, bukan daftar di localStorage
 *
 * Automation menyimpan definisinya di localStorage karena ia *definisi*, bukan
 * berkas. Artifact sebaliknya adalah berkas sungguhan: user harus bisa membuka,
 * memindahkan, dan menghapusnya dengan Explorer. Kalau daftarnya disimpan
 * terpisah, cepat atau lambat daftar dan disk berbeda. Jadi sumber kebenaran di
 * sini adalah folder `<workspace>/artifacts` — halaman ini hanya membacanya.
 *
 * ## Kategori
 *
 * Kategori mengikuti tab TRAE (HTML · PPT · Document · Sheet · Video · Image)
 * dan ditentukan dari ekstensi. Yang bisa DIBUAT Zephyr hanya HTML, dokumen
 * (Markdown), dan sheet (CSV) — PPT dan video tidak bisa ditulis sebagai berkas
 * kosong yang sah, jadi keduanya hanya muncul kalau berkasnya memang ada.
 */
import { create } from 'zustand';
import { fsCreateDir, fsCreateFile, fsDelete, fsStat, scanDir } from './commands';

export type JenisArtifact = 'html' | 'ppt' | 'doc' | 'sheet' | 'video' | 'image';

/** Jenis yang benar-benar bisa dibuat dari halaman ini. */
export type JenisDibuat = 'html' | 'doc' | 'sheet';

export interface Artifact {
  path: string;
  /** Nama tanpa ekstensi — yang ditampilkan di kartu. */
  nama: string;
  ekstensi: string;
  jenis: JenisArtifact;
  ukuran: number;
  /** Waktu ubah berkas (epoch ms). */
  mtime: number;
}

export const NAMA_FOLDER = 'artifacts';

const PETA_EKSTENSI: Record<string, JenisArtifact> = {
  html: 'html',
  htm: 'html',
  pptx: 'ppt',
  ppt: 'ppt',
  key: 'ppt',
  md: 'doc',
  markdown: 'doc',
  txt: 'doc',
  doc: 'doc',
  docx: 'doc',
  pdf: 'doc',
  csv: 'sheet',
  tsv: 'sheet',
  xlsx: 'sheet',
  xls: 'sheet',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
};

export function jenisDariNama(nama: string): JenisArtifact {
  const titik = nama.lastIndexOf('.');
  const ext = titik >= 0 ? nama.slice(titik + 1).toLowerCase() : '';
  /* Berkas tanpa ekstensi dianggap dokumen: ia tetap harus bisa dilihat,
     hanya tidak masuk kategori HTML/gambar yang punya aksi khusus. */
  return PETA_EKSTENSI[ext] ?? 'doc';
}

/** Pemisah path yang dipakai workspace ini (Windows vs POSIX). */
function pemisah(workspace: string): string {
  return workspace.includes('\\') ? '\\' : '/';
}

export function folderArtifact(workspace: string): string {
  return `${workspace.replace(/[\\/]+$/, '')}${pemisah(workspace)}${NAMA_FOLDER}`;
}

/** Nama berkas yang aman dan belum dipakai di folder artifact. */
function namaBerkas(nama: string, ext: string, ada: Set<string>): string {
  const bersih =
    nama
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._ -]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') || 'artifact';
  let dasar = bersih;
  let n = 2;
  while (ada.has(`${dasar}.${ext}`)) {
    dasar = `${bersih}-${n}`;
    n += 1;
  }
  return `${dasar}.${ext}`;
}

function isiAwal(nama: string, jenis: JenisDibuat): { ext: string; isi: string } {
  if (jenis === 'html') {
    return {
      ext: 'html',
      isi: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${nama}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
             font: 16px/1.6 system-ui, sans-serif; background: #0f1115; color: #e8eaed; }
      h1 { font-size: 28px; margin: 0 0 8px; }
      p  { margin: 0; color: #9aa0a6; }
    </style>
  </head>
  <body>
    <main>
      <h1>${nama}</h1>
      <p>Edit this file to build your page.</p>
    </main>
  </body>
</html>
`,
    };
  }
  if (jenis === 'sheet') {
    return {
      ext: 'csv',
      isi: `Item,Quantity,Notes\n${nama},1,\n`,
    };
  }
  return { ext: 'md', isi: `# ${nama}\n\n` };
}

interface ArtifactState {
  /** Isi folder artifact, terbaru dulu. */
  daftar: Artifact[];
  memuat: boolean;
  /** Folder yang terakhir dibaca — null kalau tidak ada workspace. */
  folder: string | null;
  /** Pesan kegagalan baca/tulis; ditampilkan halaman supaya tidak senyap. */
  galat: string | null;

  muat: (workspace: string | null) => Promise<void>;
  buat: (workspace: string, nama: string, jenis: JenisDibuat) => Promise<string>;
  hapus: (artifact: Artifact) => Promise<void>;
}

export const useArtifacts = create<ArtifactState>()((set, get) => ({
  daftar: [],
  memuat: false,
  folder: null,
  galat: null,

  muat: async (workspace) => {
    if (!workspace) {
      set({ daftar: [], memuat: false, folder: null, galat: null });
      return;
    }
    const folder = folderArtifact(workspace);
    set({ memuat: true, folder, galat: null });
    try {
      const isi = await scanDir(folder);
      const berkas = isi.filter((n) => !n.isDir);
      const denganStat = await Promise.all(
        berkas.map(async (n) => {
          try {
            const st = await fsStat(n.path);
            if (st.isDir) return null;
            const titik = n.name.lastIndexOf('.');
            return {
              path: n.path,
              nama: titik > 0 ? n.name.slice(0, titik) : n.name,
              ekstensi: titik > 0 ? n.name.slice(titik + 1).toLowerCase() : '',
              jenis: jenisDariNama(n.name),
              ukuran: st.size,
              mtime: st.mtime,
            } satisfies Artifact;
          } catch {
            /* Berkas hilang di antara scan dan stat: lewati, jangan gagalkan
               seluruh daftar. */
            return null;
          }
        }),
      );
      const daftar = denganStat
        .filter((a): a is Artifact => a !== null)
        .sort((a, b) => b.mtime - a.mtime);
      set({ daftar, memuat: false });
    } catch {
      /* Folder belum ada = belum ada artifact, bukan error yang perlu ditakuti
         user. Folder dibuat saat Create pertama. */
      set({ daftar: [], memuat: false });
    }
  },

  buat: async (workspace, nama, jenis) => {
    const folder = folderArtifact(workspace);
    try {
      await fsCreateDir(folder);
    } catch {
      /* Sudah ada — fs_create_dir menolak folder yang ada, dan itu normal. */
    }
    const { ext, isi } = isiAwal(nama.trim() || 'Artifact', jenis);
    const ada = new Set(get().daftar.map((a) => `${a.nama}.${a.ekstensi}`));
    const berkas = namaBerkas(nama, ext, ada);
    const path = `${folder}${pemisah(workspace)}${berkas}`;
    await fsCreateFile(path, isi);
    await get().muat(workspace);
    return path;
  },

  hapus: async (artifact) => {
    await fsDelete([artifact.path], false);
    set({ daftar: get().daftar.filter((a) => a.path !== artifact.path) });
  },
}));
