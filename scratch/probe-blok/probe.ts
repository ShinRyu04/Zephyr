/*
 * Probe (bukan bagian app): mengukur blok prompt yang SUNGGUH dirakit
 * systemPrompt.ts, untuk id dan en. Dijalankan lewat esbuild-bundle + node.
 */
import {
  systemPromptFor,
  bahasaPrompt,
  instruksiBahasa,
  instruksiGaya,
  AMBANG_TOKEN_INTI,
  blokKondisional,
  blokLarangan,
  faktaInti,
  kelasKondisional,
  kepalaPotret,
} from '../../src/lib/systemPrompt';
import { FAKTA_ZEPHYR } from '../../src/lib/zephyrFakta';
import { useStore } from './stub/commands.js';

const t4 = (n: number) => Math.ceil(n / 4);

const hasil: Record<string, unknown> = {};
for (const lang of ['en', 'id']) {
  try {
    const st = useStore.getState() as unknown as { settings: Record<string, unknown> };
    useStore.setState({ settings: { ...st.settings, general: { ...(st.settings.general as object), uiLang: lang } } } as never);
  } catch (e) {
    hasil[`galatSet_${lang}`] = String(e);
  }
  let prompt = '';
  try {
    prompt = systemPromptFor('follow', 'KONTEKS-UJI', '', 'mock-model', 'custom', 'short', 'apa itu panel bawah');
  } catch (e) {
    prompt = `GALAT: ${String(e)}`;
  }
  const b = bahasaPrompt();
  hasil[lang] = {
    identitas: b.identitas.length,
    editorFakta: b.editorFakta.length,
    caraKerja: b.caraKerja.length,
    aturan: b.aturan.length,
    tanpaWorkspace: (b.tanpaWorkspace ?? '').length,
    reminder: b.reminder('mock-model').length,
    bahasa: instruksiBahasa('follow', 'apa itu panel bawah').length,
    gaya: instruksiGaya('short').length,
    promptTotal: prompt.length,
  };
}
hasil.FAKTA_ZEPHYR = { char: FAKTA_ZEPHYR.length, token4: t4(FAKTA_ZEPHYR.length) };

/* ---- blok inti dua lapis (item 101) + blok kondisional (item 162) ---- */
const t4b = (n: number) => Math.ceil(n / 4);
const inti = faktaInti();
const larangan = blokLarangan();
const kepala = kepalaPotret();
const totalInti = inti.length + larangan.length + kepala.length;
hasil.INTI = {
  faktaInti: `${inti.length}char/${t4b(inti.length)}tok`,
  blokLarangan: `${larangan.length}char/${t4b(larangan.length)}tok`,
  kepalaPotret: `${kepala.length}char/${t4b(kepala.length)}tok`,
  total: `${totalInti}char/${t4b(totalInti)}tok`,
  ambang_token: AMBANG_TOKEN_INTI,
  sisa_char: 8000 - totalInti,
};
const pesanUji = [
  'apa itu panel bawah dan bagaimana membukanya',
  'tolong buat tabel perbandingan provider model',
  'kenapa ekstensiku tidak jalan, lihat log-nya',
  'di mana aku menyimpan API key ku',
  'apa isi berkas catatan-kerja.md',
  'ringkas apa yang kamu lakukan tadi',
  'pakai subagent paralel untuk audit berkas',
  'berapa token konteks model ini',
];
hasil.kondisional = pesanUji.map((p) => {
  const blok = blokKondisional(p);
  return `${kelasKondisional(p).join('+') || '(kosong)'} | ${blok.length}char | ${p.slice(0, 40)}`;
});
console.log(JSON.stringify(hasil, null, 1));
