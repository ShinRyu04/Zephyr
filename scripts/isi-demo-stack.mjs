/**
 * isi-demo-stack.mjs - isi tumpukan status dengan data nyata untuk dilihat.
 *
 *   node scripts/isi-demo-stack.mjs [port]
 *
 * Alat bantu untuk MELIHAT hasil perbaikan di layar. Bukan uji.
 * Setelah dijalankan, panel AI menampilkan delapan langkah dengan satu yang
 * gagal - cukup untuk memeriksa dengan mata sendiri bahwa tidak ada lagi yang
 * terpotong atau bertumpuk.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const a = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'aiStore.ts');

  const alat = ['read_file', 'search_text', 'terminal_exec', 'file_write'];
  const langkah = [];
  for (let i = 0; i < 8; i++) {
    langkah.push({
      tool: alat[i % alat.length],
      args: '{ path: "src/components/ai/AiPanel.tsx", offset: ' + i * 40 + ' }',
      at: Date.now() + i,
      /* Satu langkah sengaja GAGAL, supaya badge merah ikut terlihat. */
      ok: i !== 5,
      ms: 120 + i * 45,
    });
  }

  a.useAi.setState({ agentBusy: true, agentSteps: langkah, agentPhase: 'working' });
  await new Promise((res) => setTimeout(res, 900));

  const kepala = document.querySelector('.ai-work-summary');
  if (kepala && kepala.getAttribute('aria-expanded') !== 'true') {
    kepala.click();
    await new Promise((res) => setTimeout(res, 700));
  }

  const b = document.querySelector('.ai-work-body');
  const s = document.querySelector('.ai-work-stack');
  return {
    langkah: (a.useAi.getState().agentSteps || []).length,
    terbuka: !!b,
    baris: b ? b.querySelectorAll('.ai-work-detail, .ai-work-step').length : 0,
    tumpukanTinggi: s ? Math.round(s.getBoundingClientRect().height) : null,
    isiTinggi: b ? Math.round(b.getBoundingClientRect().height) : null,
    isiPenuh: b ? b.scrollHeight : null,
    gulirSendiri: b ? b.scrollHeight > b.clientHeight + 1 : null,
  };
})())`);

console.log('tumpukan status diisi:', JSON.stringify(hasil, null, 1));

await cdp.close();
process.exit(0);
