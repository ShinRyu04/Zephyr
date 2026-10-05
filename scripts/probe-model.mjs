/*
 * Model mana yang benar-benar tersedia di router?
 *
 * Chat gagal dengan 404 "Model not found" untuk "mr-vip", sementara koneksi
 * /v1/models menjawab 200. Jadi daftar modelnya bisa dibaca - dan itu jawaban
 * yang pasti, bukan tebakan nama.
 *
 * Dijalankan lewat Rust (test_model_connection tidak mengembalikan daftarnya),
 * jadi memakai fetch langsung dengan key yang SUDAH DIDERKIPSI oleh aplikasi.
 *
 * MASIH DIPAKAI: jalankan untuk melihat model apa saja yang benar-benar ada di
 * router. Ini yang membuktikan "mr-vip" ada, sementara "custom-model" tidak.
 *
 *   node scripts/probe-model.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/*
 * Key harus didekripsi dengan cara yang sama seperti Rust: XOR dengan keystream
 * BLAKE3-XOF dari SALT|MachineGuid|hostname|username. Daripada meniru BLAKE3 di
 * Node, pakai biner Rust kecil di verifikasi-rilis yang memakai blake3 crate
 * yang sama seperti aplikasi.
 */
const ap = path.join(process.env.APPDATA, 'zephyr');
const secrets = JSON.parse(fs.readFileSync(path.join(ap, 'secrets.json'), 'utf8'));
const tersandi = secrets.custom;

const dekrip = execFileSync('./verifikasi-rilis/target/release/dekrip.exe', [tersandi], { encoding: 'utf8' }).trim();
console.log(`key terderkipsi: panjang ${dekrip.length}, awalan ${dekrip.slice(0, 5)}..., akhir ...${dekrip.slice(-3)}`);

for (const base of ['https://modelrouter.web.id/v1', 'https://modelrouter.id/v1']) {
  console.log(`\n===== ${base}/models =====`);
  try {
    const r = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${dekrip}` }, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const daftar = j.data ?? j.models ?? j;
    if (Array.isArray(daftar)) {
      console.log(`  ${daftar.length} model tersedia:`);
      daftar.slice(0, 40).forEach((m) => console.log('   -', typeof m === 'string' ? m : m.id ?? m.name));
      if (daftar.length > 40) console.log(`   ... dan ${daftar.length - 40} lagi`);
    } else {
      console.log('  bentuk tak dikenal:', JSON.stringify(j).slice(0, 300));
    }
  } catch (e) {
    console.log('  GALAT', String(e.message).slice(0, 120));
  }
}
