export interface PromptItem {

  cmd: string;
  label: string;

  body: string;
}

export const BUILTIN_PROMPTS: PromptItem[] = [
  {
    cmd: 'explain',
    label: 'Jelaskan kode yang dipilih',
    body: 'Jelaskan kode berikut baris per baris: apa yang dilakukannya, alur datanya, dan bagian yang mudah disalahpahami.\n\n{sel}',
  },
  {
    cmd: 'fix',
    label: 'Perbaiki bug',
    body: 'Cari dan perbaiki bug pada kode berikut. Sebutkan akar masalahnya dulu, lalu berikan versi perbaikannya.\n\n{sel}',
  },
  {
    cmd: 'refactor',
    label: 'Refactor tanpa ubah perilaku',
    body: 'Refactor kode berikut agar lebih ringkas dan mudah dibaca tanpa mengubah perilakunya. Jelaskan tiap perubahan.\n\n{sel}',
  },
  {
    cmd: 'doc',
    label: 'Tulis dokumentasi',
    body: 'Tulis dokumentasi untuk kode berikut: ringkasan satu paragraf, parameter, nilai balik, dan contoh pemakaian.\n\n{sel}',
  },
  {
    cmd: 'test',
    label: 'Buat unit test',
    body: 'Buat unit test untuk kode berikut. Pakai framework yang sudah dipakai proyek ini dan tutup kasus tepi yang penting.\n\n{sel}',
  },
  {
    cmd: 'review',
    label: 'Review kode',
    body: 'Review kode berikut: bug, masalah keamanan, masalah performa, dan pelanggaran konvensi. Urutkan temuan dari yang paling penting.\n\n{sel}',
  },
  {
    cmd: 'commit',
    label: 'Tulis pesan commit',
    body: 'Tulis pesan commit (judul + isi) untuk perubahan berikut, mengikuti konvensi repo ini.\n\n{sel}',
  },
];

const LS_KEY = 'zephyr.ai.prompts.v1';

export function loadUserPrompts(): PromptItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is PromptItem => {
        const o = x as Partial<PromptItem>;
        return !!o && typeof o.cmd === 'string' && typeof o.body === 'string';
      })
      .map((x) => ({ cmd: x.cmd.toLowerCase().replace(/\s+/g, '-'), label: x.label || x.cmd, body: x.body }));
  } catch {
    return [];
  }
}

export function saveUserPrompts(items: PromptItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // Kuota penuh / mode privat: snippet hanya tidak tersimpan, tidak fatal.
  }
}

export function allPrompts(): PromptItem[] {
  const user = loadUserPrompts();
  const userCmd = new Set(user.map((u) => u.cmd));
  return [...user, ...BUILTIN_PROMPTS.filter((b) => !userCmd.has(b.cmd))];
}

export function matchPrompts(draft: string): { query: string; items: PromptItem[] } {
  const m = /^\/([\w-]*)$/.exec(draft);
  if (!m) return { query: '', items: [] };
  const q = m[1].toLowerCase();
  return { query: q, items: allPrompts().filter((p) => p.cmd.startsWith(q)) };
}

export function matchSnippets(draft: string): { query: string; items: PromptItem[] } {

  const m = /(^|\s)>([\w-]*)$/.exec(draft);
  if (!m) return { query: '', items: [] };
  const q = m[2].toLowerCase();
  return { query: q, items: allPrompts().filter((p) => p.cmd.startsWith(q)) };
}

export function expandSnippet(draft: string, sel: string): string {
  const m = /(^|\s)>([\w-]+)/.exec(draft);
  if (!m) return draft;
  const item = allPrompts().find((p) => p.cmd === m[2].toLowerCase());
  if (!item) return draft;
  const sebelum = draft.slice(0, m.index + m[1].length);
  const sesudah = draft.slice(m.index + m[0].length);
  return `${sebelum}${item.body}${sesudah || (sel ? '' : '')}`;
}

export function expandPrompt(draft: string, sel: string): string {
  const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(draft);
  if (!m) return draft;
  const item = allPrompts().find((p) => p.cmd === m[1].toLowerCase());
  if (!item) return draft;
  const sisa = m[2].trim();
  if (item.body.includes('{sel}')) {
    return item.body.replace('{sel}', sisa || sel || '');
  }
  return sisa ? `${item.body}\n\n${sisa}` : item.body;
}
