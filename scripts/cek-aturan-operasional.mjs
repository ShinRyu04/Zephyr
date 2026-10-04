/*
 * Aturan operasional tidak boleh hilang gara-gara persona mengisi caraKerja.
 *
 * Bug yang dikunci: aturan 1-6 dan blok "which tool for which job"_tool ada di
 * blok caraKerja bawaan, yang sebelumnya dikirim lewat lapisan(). lapisan()
 * membuang blok bawaan begitu persona (atau custom instructions) mengisi slot
 * itu. Persona aktif "Zeph" mengisi 636 karakter, jadi 3568 karakter aturan
 * bawaan hilang di setiap request: tidak ada aturan hemat tool, tidak ada
 * panduan tool mana untuk pekerjaan apa, tidak ada satu langkah satu tool.
 *
 * Gejalanya yang pernah dilihat user: pertanyaan "ini di folder apa" dijawab
 * dengan delapan tool call berurutan dan menunggu semenit lebih, karena model
 * tidak punya panduan untuk memakai konteks yang sudah ada.
 *
 * Uji ini sengaja memakai persona nyata milik user: justru persona itulah yang
 * menutupi blok itu. Persona netral akan membuat blok ini lulus sebelum dan
 * sesudah perbaikan, jadi tidak membuktikan apa pun.
 */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

/* Rules that must survive whatever the persona says. Short distinctive
 * phrases, so rewording the prompt cannot silently flip the test. */
const WAJIB = [
  ['todoWrite', 'plan 2 to 5 steps in todo_write'],
  ['satuLangkahSatuTool', 'One step, one tool'],
  ['buktiBukanBukti', 'A claim is not proof'],
  ['hematTool', 'Spend a tool call only when it brings something new'],
  ['blokTool', '# Which tool for which job'],
  ['headerCaraKerja', '# How you work'],
];

const expr = `(async () => {
  const m = await import('/src/lib/systemPrompt.ts');
  const ps = await import('/src/lib/personaStore.ts');
  const per = ps.blokPersona();
  const p = m.systemPromptFor('en', '', '', '', '', 'santai');
  const cek = ${JSON.stringify(WAJIB)}.map(([nama, jarum]) => [nama, p.includes(jarum)]);
  return JSON.stringify({ persona: ps.personaAktif().nama, per, cek });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
ws.close();
const st = JSON.parse(r.result?.result?.value ?? '{}');

console.log(`persona aktif: ${st.persona}`);
console.log(`caraKerja persona: ${st.per?.caraKerja?.length ?? 0} karakter`);

/* Precondition: this test is only meaningful when a persona actually fills
 * caraKerja. Without that, it would pass before and after the fix. */
if (!st.per?.caraKerja) {
  console.log('\nTIDAK BERLAKU: persona tidak mengisi caraKerja, jadi blok bawaan tidak pernah tergantikan.');
  process.exit(1);
}

let lulus = 0;
for (const [nama, ok] of st.cek ?? []) {
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  aturan "${nama}" masih ada di prompt`);
  if (ok) lulus++;
}
console.log(`\n== ${lulus}/${WAJIB.length} lulus ==`);
process.exit(lulus === WAJIB.length ? 0 : 1);