// simpleDiff.ts — diff baris sederhana untuk pratinjau "Terapkan" (A-6).
//
// Bukan unified diff lengkap: yang dibutuhkan hanya daftar baris ber-tanda
// (sama / tambah / hapus) untuk diwarnai hijau-merah di UI. LCS penuh mahal,
// jadi di atas ambang baris dipakai pembandingan posisi-per-posisi.

export type DiffKind = 'same' | 'add' | 'del';

export interface DiffRow {
  kind: DiffKind;
  text: string;
  /** nomor baris di sisi lama (null untuk baris tambahan) */
  a: number | null;
  /** nomor baris di sisi baru (null untuk baris yang dihapus) */
  b: number | null;
}

const AMBANG = 4000;

export function barisDiff(lama: string, baru: string): DiffRow[] {
  const a = lama.split('\n');
  const b = baru.split('\n');
  const out: DiffRow[] = [];

  if (a.length > AMBANG || b.length > AMBANG) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] === b[i]) out.push({ kind: 'same', text: a[i] ?? '', a: i + 1, b: i + 1 });
      else {
        if (a[i] !== undefined) out.push({ kind: 'del', text: a[i], a: i + 1, b: null });
        if (b[i] !== undefined) out.push({ kind: 'add', text: b[i], a: null, b: i + 1 });
      }
    }
    return out;
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: a[i], a: i + 1, b: null });
      i++;
    } else {
      out.push({ kind: 'add', text: b[j], a: null, b: j + 1 });
      j++;
    }
  }
  while (i < m) out.push({ kind: 'del', text: a[i], a: i + 1, b: null }), i++;
  while (j < n) out.push({ kind: 'add', text: b[j], a: null, b: j + 1 }), j++;
  return out;
}

/** Ringkasan jumlah baris berubah; dipakai untuk label tombol pratinjau. */
export function ringkasDiff(rows: DiffRow[]): { tambah: number; hapus: number } {
  let tambah = 0;
  let hapus = 0;
  for (const r of rows) {
    if (r.kind === 'add') tambah++;
    else if (r.kind === 'del') hapus++;
  }
  return { tambah, hapus };
}
