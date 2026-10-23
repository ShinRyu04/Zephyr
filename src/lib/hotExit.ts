import { fsExists } from './commands';
import { useStore } from './store';
import { useNotif } from './notificationStore';
import type { Encoding, LineEnding } from './types';

/*
 * Hot exit.
 *
 * WHY: a closed window must not be the same thing as a discarded edit. Every
 * other editor keeps unsaved buffers across a restart, and without it the only
 * safe way to use Zephyr is to save constantly — which is exactly the habit a
 * crash should not depend on.
 *
 * WHERE it lives: `localStorage`, not the Rust data folder. Unsaved text is
 * user data that exists nowhere else, so it must not go through the write guard
 * (which refuses paths outside the workspace) and it must not need a command
 * that could fail at shutdown. WebView2 keeps localStorage per data directory,
 * so it survives a restart, a reload and a crash alike.
 *
 * SIZE: capped. A 20 MB buffer would blow the localStorage quota and, worse,
 * fail silently at exactly the moment the content matters. Files above the cap
 * are skipped and the skip is reported, because "your 30 MB log was not
 * restored" is information the reader needs.
 */

const KEY = 'zephyr.hotexit.v1';

/*
 * Selama pemulihan belum selesai, snapshot KOSONG tidak boleh menghapus data.
 *
 * Urutannya di dunia nyata: halaman dimuat, store mulai kosong, langganan
 * `tabs` menyala (sesi dipulihkan), debounce menulis snapshot "tidak ada tab
 * dirty", dan data yang baru saja mau dipulihkan terhapus oleh snapshot itu
 * sendiri. Flag ini membuat penghapusan hanya boleh terjadi setelah pemulihan
 * benar-benar dijalankan.
 */
let pemulihanSelesai = false;

/** Total budget for all buffers together. */
const MAX_BYTES = 2_000_000;
/** More than this and restore would look like a session, not like recovery. */
const MAX_TABS = 20;

export interface SnapshotBaris {
  path: string;
  name: string;
  content: string;
  encoding?: Encoding;
  lineEnding?: LineEnding;
  atMs: number;
}

interface Amplop {
  v: 1;
  atMs: number;
  tabs: SnapshotBaris[];
}

function bacaAmplop(): Amplop | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Amplop;
    if (!o || o.v !== 1 || !Array.isArray(o.tabs)) return null;
    return o;
  } catch {
    /* Isi yang rusak lebih baik dibuang daripada membuat app tidak bisa dibuka. */
    return null;
  }
}

/**
 * Ambil buffer yang belum disimpan dari store saat ini.
 *
 * Hanya tab BERKAS: tab tampilan (AI chat, Chat Settings) tidak punya isi yang
 * bisa hilang, dan tab untitled belum punya nama untuk dipulihkan. Batas ukuran
 * dihitung atas teks UTF-16 perkiraan (`length * 2`).
 */
export function ambilSnapshot(): { tabs: SnapshotBaris[]; dilewati: number } {
  const semua = useStore.getState().tabs.filter(
    (t) => t.unsaved && !!t.path && !t.view && t.loaded !== false,
  );
  const out: SnapshotBaris[] = [];
  let bytes = 0;
  let dilewati = 0;
  const now = Date.now();
  for (const t of semua) {
    if (out.length >= MAX_TABS || bytes + t.content.length * 2 > MAX_BYTES) {
      dilewati += 1;
      continue;
    }
    bytes += t.content.length * 2;
    out.push({
      path: t.path as string,
      name: t.name,
      content: t.content,
      encoding: t.encoding,
      lineEnding: t.lineEnding,
      atMs: now,
    });
  }
  return { tabs: out, dilewati };
}

/** Tulis snapshot sekarang. Dipanggil terjadwal dan saat window akan ditutup. */
export function simpanHotExit(): void {
  try {
    const { tabs } = ambilSnapshot();
    if (tabs.length === 0) {
      if (pemulihanSelesai) localStorage.removeItem(KEY);
      return;
    }
    const amplop: Amplop = { v: 1, atMs: Date.now(), tabs };
    localStorage.setItem(KEY, JSON.stringify(amplop));
  } catch {
    /* Kuota penuh / localStorage diblokir: hot exit mati, tetapi penyuntingan
       tetap berjalan. Tidak ada toast di sini — kegagalan ini akan terulang di
       setiap ketukan dan bukan hal yang bisa ditindaklanjuti saat mengetik. */
  }
}

/**
 * Pasang autosave hot exit.
 *
 * Ditunda 900 ms: menulis seluruh buffer ke localStorage di setiap ketukan
 * akan membuat mengetik terasa berat di berkas besar, dan yang perlu diselamatkan
 * adalah keadaan TERAKHIR, bukan setiap keadaan di antaranya.
 */
export function mulaiHotExit(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useStore.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return;
    if (s.settings?.general?.hotExit === false) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      simpanHotExit();
    }, 900);
  });

  /* Jaring terakhir: tab yang ditutup tepat setelah mengetik tidak melewati
     debounce kalau window langsung ditutup. */
  const onHide = () => simpanHotExit();
  window.addEventListener('beforeunload', onHide);

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
    window.removeEventListener('beforeunload', onHide);
  };
}

/**
 * Pulihkan buffer dari penyimpanan hot exit.
 *
 * Mengembalikan jumlah tab yang benar-benar dipulihkan. Isi yang sudah sama
 * dengan disk tidak disentuh: memulihkan buffer yang tidak berbeda hanya
 * menandai tab dirty tanpa alasan, dan pembaca akan menyimpan berkas yang
 * sebenarnya tidak berubah.
 */
export async function pulihkanHotExit(): Promise<number> {
  if (useStore.getState().settings?.general?.hotExit === false) {
    pemulihanSelesai = true;
    return 0;
  }
  const amplop = bacaAmplop();
  if (!amplop) {
    pemulihanSelesai = true;
    return 0;
  }

  let pulih = 0;
  const gagal: string[] = [];
  for (const b of amplop.tabs) {
    try {
      const ada = await fsExists(b.path);
      if (!ada) {
        gagal.push(b.name);
        continue;
      }
      const s = useStore.getState();
      await s.openPath(b.path, { preview: false });
      const tab = useStore
        .getState()
        .tabs.find((t: { path: string | null }) => t.path === b.path);
      if (!tab) {
        gagal.push(b.name);
        continue;
      }
      if (tab.content === b.content) continue;

      useStore.getState().updateTabContent(tab.id, b.content);
      /* Encoding dan line ending ikut dipulihkan: menulis kembali buffer
         dengan CRLF padahal aslinya LF akan mengubah setiap baris berkas. */
      useStore.setState((st) => ({
        tabs: st.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                ...(b.encoding ? { encoding: b.encoding } : {}),
                ...(b.lineEnding ? { lineEnding: b.lineEnding } : {}),
              }
            : t,
        ),
      }));
      pulih += 1;
    } catch {
      gagal.push(b.name);
    }
  }

  if (pulih > 0) {
    useNotif.getState().notify({
      severity: 'info',
      message: `${pulih} unsaved file${pulih === 1 ? '' : 's'} restored`,
      detail: 'These buffers were open but not saved when Zephyr last closed.',
      source: 'Hot exit',
    });
  }
  pemulihanSelesai = true;

  if (gagal.length > 0) {
    useNotif.getState().notify({
      severity: 'warn',
      message: `${gagal.length} unsaved file${gagal.length === 1 ? '' : 's'} could not be restored`,
      detail: `The file is gone from disk: ${gagal.slice(0, 6).join(', ')}`,
      source: 'Hot exit',
    });
  }

  /* Entri TIDAK dihapus di sini. Pemulihan bisa berjalan lebih awal daripada
     restore sesi, dan sesi yang membuka berkas yang sama akan memuat isi dari
     disk — menimpa yang baru dipulihkan. Snapshot berikutnya yang menulis
     keadaan sebenarnya; menghapus sekarang berarti kehilangan satu-satunya
     salinan bila hal itu terjadi. */
  return pulih;
}
