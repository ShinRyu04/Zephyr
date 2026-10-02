/**
 * abadikan-stack.mjs - tangkap HANYA tumpukan status, diperbesar.
 *
 *   node scripts/abadikan-stack.mjs [port] [nama-berkas]
 *
 * Alat bantu. Menangkap tepat kotak tumpukan status (loop/todo/background)
 * beserta sedikit ruang di sekitarnya, supaya keluhan "melayang" dan "ketimbun"
 * bisa dinilai dengan mata - bukan dari angka tinggi dan nilai overflow.
 *
 * Wilayahnya dihitung dari posisi elemen yang SEBENARNYA di layar, lalu
 * dilebarkan ke atas dan ke bawah sedikit supaya batasnya ikut terlihat. Batas
 * itulah yang penting: kalau kotaknya melayang, ia akan tampak terpisah dari
 * percakapan di atasnya.
 */
import { Cdp } from './lib-cdp.mjs';
import fs from 'node:fs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const NAMA = process.argv[3] || 'stack.png';

const { cdp } = await Cdp.attach(PORT);

const ukuran = await cdp.json(`return JSON.stringify((() => {
  const s = document.querySelector('.ai-work-stack');
  const c = document.querySelector('.ai-chat');
  const t = document.querySelector('.todo-dock');
  if (!s) return { ada: false };

  const r = s.getBoundingClientRect();
  const chat = c ? c.getBoundingClientRect() : null;
  const todo = t ? t.getBoundingClientRect() : null;

  /* Dilebarkan 60px ke atas dan ke bawah: batas atas menunjukkan apakah
     tumpukan menempel pada percakapan atau terpisah darinya, dan batas bawah
     menunjukkan hubungannya dengan kotak ketik. */
  const atas = Math.max(0, r.top - 60);
  const bawah = Math.min(window.innerHeight, (todo ? todo.bottom : r.bottom) + 20);

  return {
    ada: true,
    clip: {
      x: Math.max(0, Math.round(r.left - 12)),
      y: Math.round(atas),
      width: Math.round(r.width + 24),
      height: Math.round(bawah - atas),
    },
    tumpukan: { atas: Math.round(r.top), bawah: Math.round(r.bottom), tinggi: Math.round(r.height) },
    percakapan: chat ? { atas: Math.round(chat.top), bawah: Math.round(chat.bottom), tinggi: Math.round(chat.height) } : null,
    todo: todo ? { atas: Math.round(todo.top), bawah: Math.round(todo.bottom) } : null,
    /* Selisih antara bawah percakapan dan atas tumpukan: nol berarti keduanya
       benar-benar bersambung, dan angka positif berarti ada celah - yang bisa
       berarti kotaknya melayang. */
    celah: chat ? Math.round(r.top - chat.bottom) : null,
  };
})())`);

if (!ukuran || ukuran.ada === false) {
  console.log('tumpukan status tidak ada di layar - jalankan isi-demo-stack dulu');
  await cdp.close();
  process.exit(1);
}

console.log('posisi:', JSON.stringify(ukuran, null, 1));

const data = await cdp.screenshot(ukuran.clip);
fs.writeFileSync(NAMA, Buffer.from(data, 'base64'));
console.log('tersimpan:', NAMA, fs.statSync(NAMA).size, 'byte');

await cdp.close();
process.exit(0);
