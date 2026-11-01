/**
 * UJI INVESTIGASI (sementara, tidak di-commit) — membuktikan cara daftar
 * to-dos "ketimbun sendiri" di store yang hidup, lewat CDP 9223.
 *
 * Hanya menyentuh `agentTodos` (state run global, BUKAN sesi chat user) dan
 * mengembalikannya kosong di akhir. Tidak ada panggilan provider.
 */
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.env.ZEPHYR_CDP_PORT ?? '9223');

const hasil = await cdp.runAsync(`
  const Xs = X.store; /* __ZEPHYR_AI__ membungkus store zustand */
  const isi = () => Xs.getState().agentTodos
    .map((t) => t.status === 'done' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]')
    .join('') + ' ' + Xs.getState().agentTodos.map((t) => t.content).join(' | ');

  /* S1 — rencana awal 5 item (apa yang model tulis saat mulai) */
  Xs.getState().setAgentTodos([
    { content: 'Riset kode notifikasi', status: 'pending' },
    { content: 'Susun rencana perbaikan', status: 'pending' },
    { content: 'Tulis perbaikan', status: 'pending' },
    { content: 'Jalankan tes', status: 'pending' },
    { content: 'Lapor hasil', status: 'pending' },
  ]);
  const s1 = isi();

  /* S2 — update PARSIAL ala model: tandai dua pertama selesai lewat nomor */
  Xs.getState().setAgentTodos([
    { id: '1', status: 'done' },
    { id: '2', status: 'done' },
  ]);
  const s2 = isi();

  /* S3 — model menyusun RENCANA FASE BARU: 3 item, teks berbeda.
     Daftar lama tidak disebut utuh -> yang tidak disebut "dipertahankan". */
  Xs.getState().setAgentTodos([
    { content: 'Implement fix in aiStore', status: 'in_progress' },
    { content: 'Run unit tests', status: 'pending' },
    { content: 'Write report', status: 'pending' },
  ]);
  const s3 = isi();

  /* S4 — satu panggilan dengan dua entri berteks identik (langkah serupa) */
  Xs.getState().setAgentTodos([
    { content: 'Cek ulang hasil', status: 'pending' },
    { content: 'Cek ulang hasil', status: 'pending' },
  ]);
  const s4 = isi();

  /* bersihkan state uji — kembalikan kosong, seperti semula */
  Xs.getState().kosongkanTodos();
  const s5 = Xs.getState().agentTodos.length;

  return { s1, s2, s3, s4, s5 };
`);

console.log('S1 rencana awal 5 item :', hasil.s1);
console.log('S2 update parsial 2 done:', hasil.s2);
console.log('S3 rencana fase baru   :', hasil.s3);
console.log('S4 entri dobel 1x kirim:', hasil.s4);
console.log('S5 setelah dibersihkan :', hasil.s5, 'item');
await cdp.close();
