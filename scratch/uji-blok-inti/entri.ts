import { writeFileSync } from 'node:fs';
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';
import {
  blokKeadaanPrompt,
  blokKondisional,
  blokLarangan,
  faktaInti,
  faktaOnDemand,
  kelasKondisional,
  kelasKondisionalTersedia,
  kepalaPotret,
  kodeBahasaPrompt,
} from '../../src/lib/systemPrompt';

const pesan: string[] = JSON.parse(process.env.BLOK_UJI_PESAN ?? '[]');
const keluar = process.env.BLOK_UJI_KELUAR ?? '';
const sampel = pesan.map((p) => ({ pesan: p, kelas: kelasKondisional(p), teks: blokKondisional(p) }));
const data = {
  lang: kodeBahasaPrompt(),
  fakta: FAKTA_ZEPHYR,
  inti: faktaInti(),
  larangan: blokLarangan(),
  kepala: kepalaPotret(),
  keadaan: blokKeadaanPrompt(),
  kelasTersedia: kelasKondisionalTersedia(),
  onDemandModel: faktaOnDemand('model'),
  onDemandGalat: faktaOnDemand('galat'),
  sampel,
};
writeFileSync(keluar, JSON.stringify(data));
