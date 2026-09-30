import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * The agent trace shape: seed a few steps of each kind and read the rows back.
 * Confirms one line per action, the per-kind accent rail, and that the target
 * truncates instead of wrapping.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  await wait(1400);

  const zzAI = X.store;
  // args adalah STRING JSON (diparse sasaranAksi), bukan objek.
  const zzLangkah = [
    { kind: 'tool', name: 'file_read', args: '{"path":"D:/Zephyr/src/components/ai/AiPanel.tsx"}', result: 'ok', ok: true, at: Date.now() },
    { kind: 'tool', name: 'file_edit', args: '{"path":"D:/Zephyr/src/styles/ai-trace.css"}', result: 'saved', ok: true, at: Date.now() },
    { kind: 'tool', name: 'terminal_exec', args: '{"command":"npx tsc --noEmit"}', result: 'exit 0', ok: true, at: Date.now() },
    { kind: 'tool', name: 'file_list', args: '{"path":"D:/Zephyr/src/lib"}', result: '42 files', ok: true, at: Date.now() },
    { kind: 'tool', name: 'memory_read', args: '{}', result: 'ok', ok: true, at: Date.now() },
    { kind: 'mulai', at: Date.now() },
    { kind: 'selesai', at: Date.now() },
  ];

  zzAI.setState({ agentSteps: zzLangkah });
  await wait(1200);

  const zzBaris = qa('.ai-agent-step');
  const zzOut = {
    jumlahBaris: zzBaris.length,
    tinggiTiapBaris: zzBaris.map((b) => b.offsetHeight),
    satuBaris: zzBaris.every((b) => b.offsetHeight <= 34),
    railWarna: zzBaris.map((b) => getComputedStyle(b).borderLeftColor),
    label: qa('.ai-agent-tool').map((e) => e.textContent),
    sasaran: qa('.ai-agent-sasaran').map((e) => ({
      teks: e.textContent.slice(0, 40),
      mono: getComputedStyle(e).fontFamily.includes('mono') || getComputedStyle(e).fontFamily.includes('Consolas'),
      ellipsis: getComputedStyle(e).textOverflow,
      tinggi: e.offsetHeight,
    })),
    disclosure: qa('.ai-agent-hasil').length,
    traceH: q('.ai-agent')?.offsetHeight ?? -1,
  };

  // Bersihkan supaya panel kembali kosong.
  zzAI.setState({ agentSteps: [] });
  return zzOut;
`, 40000);

console.log(JSON.stringify(r, null, 2));

const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh?.result?.data) {
  writeFileSync('D:/Zephyr/shot-ai-trace.png', Buffer.from(sh.result.data, 'base64'));
  console.log('  shot-ai-trace.png');
}

cdp.close();
