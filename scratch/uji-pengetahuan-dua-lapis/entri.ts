import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';
import { FAKTA_INDEKS, FAKTA_VERSI } from '../../src/lib/zephyrIndeks';
import {
  AMBANG_TOKEN_INTI,
  blokKondisional,
  blokLarangan,
  faktaInti,
  faktaOnDemand,
  kelasKondisional,
  kelasKondisionalTersedia,
  kepalaPotret,
  kodeBahasaPrompt,
} from '../../src/lib/systemPrompt';
import {
  BATAS_HASIL_SUNTIK,
  BATAS_KARAKTER_SUNTIK,
  suntikanIndeks,
} from '../../src/lib/zephyrCari';

const keluar = process.env.DUA_LAPIS_KELUAR || '';
const offTopik: string[] = JSON.parse(process.env.DUA_LAPIS_OFF || '[]');
const kosong = process.env.DUA_LAPIS_KOSONG || '';
const kelas = kelasKondisionalTersedia();
const kandidat = FAKTA_INDEKS.map((e) => e[1])
  .filter((k) => /^[a-z][a-z0-9._-]{4,}$/.test(k))
  .slice(0, 60);

const data = {
  lang: kodeBahasaPrompt(),
  ambang: AMBANG_TOKEN_INTI,
  batasKarakterSuntik: BATAS_KARAKTER_SUNTIK,
  batasHasilSuntik: BATAS_HASIL_SUNTIK,
  fakta: FAKTA_ZEPHYR,
  inti: faktaInti(),
  intiUlang: faktaInti(),
  larangan: blokLarangan(),
  laranganUlang: blokLarangan(),
  kepala: kepalaPotret(),
  kelas,
  kelasUlang: kelasKondisionalTersedia(),
  onDemand: kelas.map((k) => [k, faktaOnDemand(k)]),
  pemicu: ["berapa provider dan model aktif sekarang","buat tabel perbandingan","bagaimana tata letak panel bawah","kenapa error muncul di log","di mana API key disimpan","pakai subagent paralel untuk audit"],
  kelasTerpicu: ["berapa provider dan model aktif sekarang","buat tabel perbandingan","bagaimana tata letak panel bawah","kenapa error muncul di log","di mana API key disimpan","pakai subagent paralel untuk audit"].map((p) => kelasKondisional(p)),
  blokTerpicu: ["berapa provider dan model aktif sekarang","buat tabel perbandingan","bagaimana tata letak panel bawah","kenapa error muncul di log","di mana API key disimpan","pakai subagent paralel untuk audit"].map((p) => blokKondisional(p)),
  offTopik: offTopik.map((q) => [q, suntikanIndeks(q)]),
  offTopikUlang: offTopik.map((q) => [q, suntikanIndeks(q)]),
  kosong: [kosong, suntikanIndeks(kosong)],
  kandidat: kandidat.map((k) => [k, suntikanIndeks(k)]),
  kandidatUlang: kandidat.slice(0, 5).map((k) => [k, suntikanIndeks(k)]),
  sempit: kandidat.slice(0, 3).map((k) => [k, suntikanIndeks(k, { batasKarakter: 300 })]),
  indeksJumlah: FAKTA_INDEKS.length,
  versi: FAKTA_VERSI,
  prefiks: FAKTA_INDEKS.map((e) => '[' + e[0] + '] ' + e[1] + ': '),
  pasangan: FAKTA_INDEKS.map((e) => e[0] + '\u0001' + e[1]),
};
writeFileSync(keluar, JSON.stringify(data));
