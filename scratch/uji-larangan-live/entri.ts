import { writeFileSync } from 'node:fs';
import {
  AMBANG_TOKEN_INTI,
  blokLarangan,
  faktaInti,
  kepalaPotret,
  systemPromptFor,
} from '../../src/lib/systemPrompt';

/*
 * Jam dibekukan SEBELUM prompt dirakit. Satu-satunya bagian prompt yang
 * berubah sendiri dari giliran ke giliran adalah cap waktu potret runtime
 * ("potret <ISO> dari aplikasi ini") - diukur, bukan diduga: dua panggilan
 * tanpa pembekuan beda persis di cap waktu itu. Bekukan jam supaya yang
 * dibandingkan benar-benar TEKS ATURANNYA, bukan jam dinding.
 */
const DateAsli = Date;
const WAKTU_BEKUMEN = 1760000000000;
class DateBeku extends DateAsli {
  constructor(...a) {
    if (a.length === 0) super(WAKTU_BEKUMEN);
    else super(...a);
  }
  static now() {
    return WAKTU_BEKUMEN;
  }
}
globalThis.Date = DateBeku as unknown as DateConstructor;

const keluar = process.env.UJI_LARANGAN_KELUAR ?? '';
const kueri = process.env.UJI_LARANGAN_KUERI ?? '';
const konteks = [
  '# Konteks giliran ini',
  '- Berkas aktif: src/lib/systemPrompt.ts',
  '- Folder terbuka: D:/Zephyr',
  '- Terminal: 0 pane, tidak ada yang gagal',
].join('\\n');
const aturanProyek = '- Jalankan node scripts/uji-larangan-live.mjs sebelum bilang selesai.';

const rakit = () => systemPromptFor('follow', konteks, aturanProyek, 'mr-vip', 'custom', 'short', kueri);
const prompt = rakit();
const promptUlang = rakit();

const kep = kepalaPotret();
const larangan = blokLarangan();
const inti = faktaInti();
const intiCore = inti.length + larangan.length + kep.length;

writeFileSync(
  keluar,
  JSON.stringify({
    lang: process.env.UI_LANG || 'en',
    ambangToken: AMBANG_TOKEN_INTI,
    ambangChar: AMBANG_TOKEN_INTI * 4,
    prompt,
    promptUlang,
    larangan,
    laranganUlang: blokLarangan(),
    intiChar: inti.length,
    kepalaChar: kep.length,
    intiCoreChar: intiCore,
    intiCoreToken: Math.ceil(intiCore / 4),
  })
);
