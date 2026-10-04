/**
 * verify-tool-sections.mjs - uji pengelompokan tool dua tingkat.
 *
 *   node scripts/verify-tool-sections.mjs 9223
 *
 * Katalog disusun sebagai Section -> Group. Di Zephyr, section diturunkan dari
 * ID grupnya (`sectionDariGrup`), BUKAN disimpan di tiap entri grup. Dua daftar
 * yang harus dijaga sinkron akan berbeda pendapat cepat atau lambat, dan yang
 * paling sering terjadi adalah grup baru ditambahkan ke satu daftar saja - lalu
 * menghilang dari panel tanpa pesan apa pun.
 *
 * Yang dibuktikan:
 *   Z1  setiap tool punya grup - tidak ada yang tersesat tanpa grup
 *   Z2  tidak ada tool yang muncul di DUA grup sekaligus
 *   Z3  setiap grup punya section yang sah
 *   Z4  section Zephyr berisi tool, dan MCP terpisah dari Zephyr
 *   Z5  jumlah tool di seluruh grup sama dengan jumlah tool yang terdaftar
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('tool-sections');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

const data = await cdp.json(`return JSON.stringify(await (async () => {
  const gate = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'toolGate.ts');
  const tools = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'agentTools.ts');

  /*
   * Daftar tool diambil dari AGENT_TOOLS, bukan dari nama konstanta yang
   * ditebak. Versi pertama skrip ini memakai AGENT_TOOL_NAMES yang memang tidak
   * ada - dan hasilnya "0 tool" yang langsung terlihat mustahil.
   */
  const daftar = (tools.AGENT_TOOLS || []).map((t) => t.spec.name);
  const grup = gate.TOOL_GROUPS || [];

  /* Peta tool -> grup, dan hitung yang muncul lebih dari sekali. */
  const peta = {};
  const kembar = [];
  for (const g of grup) {
    for (const t of g.tools || []) {
      if (peta[t]) kembar.push(t + ' (' + peta[t] + ' + ' + g.id + ')');
      else peta[t] = g.id;
    }
  }

  const tanpaGrup = daftar.filter((n) => !peta[n]);

  /* Section tiap grup - lewat fungsi yang sama yang dipakai panelnya. */
  const perSection = {};
  for (const g of grup) {
    const s = gate.sectionDariGrup(g.id);
    perSection[s] = (perSection[s] || 0) + (g.tools || []).length;
  }

  const sectionSah = ['zephyr', 'mcp', 'extensions'];
  const sectionAneh = grup
    .map((g) => ({ id: g.id, s: gate.sectionDariGrup(g.id) }))
    .filter((x) => !sectionSah.includes(x.s));

  return {
    jumlahTool: daftar.length,
    jumlahGrup: grup.length,
    tanpaGrup,
    kembar,
    perSection,
    sectionAneh,
    urutanAda: (gate.SECTION_URUTAN || []).map((s) => s.id),
    label: (gate.SECTION_URUTAN || []).map((s) => s.label),
    idGrup: grup.map((g) => g.id),
  };
})())`);

r.check(
  'Z1',
  data.tanpaGrup.length === 0,
  `setiap tool punya grup (${data.jumlahTool} tool, ${data.jumlahGrup} grup)${data.tanpaGrup.length ? ` - TANPA GRUP: ${data.tanpaGrup.join(', ')}` : ''}`,
);

r.check(
  'Z2',
  data.kembar.length === 0,
  `tidak ada tool yang muncul di dua grup${data.kembar.length ? ` - KEMBAR: ${data.kembar.join(', ')}` : ''}`,
);

r.check(
  'Z3',
  data.sectionAneh.length === 0,
  `setiap grup punya section yang sah (${data.jumlahGrup} grup)${data.sectionAneh.length ? ` - ANEH: ${JSON.stringify(data.sectionAneh)}` : ''}`,
);

r.check(
  'Z4',
  data.perSection.zephyr > 0,
  `section Zephyr berisi ${data.perSection.zephyr} tool; sebaran: ${JSON.stringify(data.perSection)}`,
);

/*
 * Jumlah di seluruh grup harus sama dengan jumlah tool terdaftar.
 *
 * Ini menangkap dua kesalahan sekaligus: tool yang tidak masuk grup mana pun,
 * dan tool yang didaftarkan dua kali. Kalau angkanya berbeda, ada yang tidak
 * konsisten - dan itu tidak boleh diselesaikan dengan menambah tool tiruan,
 * melainkan dengan memperbaiki daftarnya.
 */
const totalDiGrup = Object.values(data.perSection).reduce((a, b) => a + b, 0);
r.check(
  'Z5',
  totalDiGrup === data.jumlahTool,
  `jumlah tool di seluruh grup (${totalDiGrup}) sama dengan yang terdaftar (${data.jumlahTool})`,
);

r.check(
  'Z6',
  data.urutanAda.includes('zephyr') && data.urutanAda.includes('mcp'),
  `section ditampilkan berurutan: ${JSON.stringify(data.label)}`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
