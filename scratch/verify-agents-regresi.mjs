/*
 * Regression checks for the changes made alongside the Agents window.
 *
 * The main window has to be untouched: its AI column, its title-bar button, its
 * shortcut handling. The one deliberate removal is the ActivityBar's "AI Chat"
 * robot, which now has no entry in the rail.
 */
import CDP from 'chrome-remote-interface';

const PORT = Number(process.argv[2] || 9223);
const hasil = [];
const check = (nama, lulus, detail = '') => {
  hasil.push({ nama, lulus });
  console.log(`${lulus ? 'PASS' : 'FAIL'}  ${nama}${detail ? ` — ${detail}` : ''}`);
};

async function runAsync(Runtime, expr, timeoutMs = 8000) {
  const key = `__r_${Math.random().toString(36).slice(2)}`;
  await Runtime.evaluate({
    expression:
      `window.${key} = undefined;(async () => {\n${expr}\n})().then(` +
      `function(v){ window.${key} = JSON.stringify({__ok: v}); },` +
      `function(e){ window.${key} = JSON.stringify({__err: String((e && e.stack) || e)}); });`,
    returnByValue: true,
  });
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await Runtime.evaluate({ expression: `window.${key}`, returnByValue: true });
    const v = r.result?.value;
    if (typeof v === 'string') {
      await Runtime.evaluate({ expression: `delete window.${key}` });
      try {
        const p = JSON.parse(v);
        return p.__err !== undefined ? { __err: p.__err } : p.__ok;
      } catch {
        return { __err: v.slice(0, 200) };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { __err: 'timeout' };
}

const targets = await CDP.List({ port: PORT });
const utama = targets.find((t) => t.type === 'page' && !t.url.includes('#a'));
const c = await CDP({ port: PORT, target: utama });
const { Runtime } = c;
await Runtime.enable();

const rail = await runAsync(Runtime, `
  const btn = Array.from(document.querySelectorAll('.activitybar .ab-btn'));
  return {
    jumlah: btn.length,
    ids: btn.map((b) => b.getAttribute('data-activity')),
    adaAi: !!document.querySelector('[data-testid="ab-ai"]'),
  };
`);
check('ikon "AI Chat" hilang dari ActivityBar', rail?.adaAi === false, `ids=${(rail?.ids ?? []).join(',')}`);
check('ikon ActivityBar lain tetap ada', (rail?.jumlah ?? 0) >= 7, `${rail?.jumlah} tombol`);

const pill = await runAsync(Runtime, `
  const el = document.querySelector('[data-testid="mb-ai-pill"]');
  const cc = document.querySelector('[data-testid="mb-command-center"]');
  if (!el || !cc) return { ada: false };
  const a = el.getBoundingClientRect();
  const b = cc.getBoundingClientRect();
  return {
    ada: true,
    label: el.textContent,
    gapDariSearch: Math.round(a.left - b.right),
    sebaris: Math.abs(a.top - b.top) < 6,
  };
`);
check('tombol "Open in Agents" ada di titlebar', pill?.ada === true, JSON.stringify(pill));
check('tombol dempet di kanan kotak search', (pill?.gapDariSearch ?? 999) < 20, `jarak=${pill?.gapDariSearch}px`);
check('tombol sebaris dengan kotak search', pill?.sebaris === true);

/* The chord must fire the AGENTS window, not the old chat window. */
const chord = await runAsync(Runtime, `
  const kb = window.__ZEPHYR_KB__;
  return {
    agents: kb.chordFor('agents.openWindow'),
    aiChat: kb.chordFor('ai.openWindow'),
    aiPanel: kb.chordFor('ai.panel'),
  };
`);
check('Ctrl+Shift+A -> agents.openWindow', chord?.agents === 'Ctrl+Shift+A', `= ${chord?.agents}`);
check('ai.openWindow pindah ke Ctrl+Alt+O', chord?.aiChat === 'Ctrl+Alt+O', `= ${chord?.aiChat}`);
check('ai.panel tidak lagi memegang Ctrl+Shift+A', chord?.aiPanel !== 'Ctrl+Shift+A', `= ${chord?.aiPanel}`);

/* The old floating chat window must still be reachable and distinct. */
const duaWindow = await runAsync(Runtime, `
  const m = await import('/src/lib/aiWindow.ts');
  const aw = await import('/src/lib/agentsWindow.ts');
  return { labelAi: m.AI_WINDOW_LABEL, labelAgents: aw.AGENTS_WINDOW_LABEL, beda: m.AI_WINDOW_LABEL !== aw.AGENTS_WINDOW_LABEL };
`);
check('window chat lama dan window Agents punya label berbeda', duaWindow?.beda === true, JSON.stringify(duaWindow));

await c.close();

const lulus = hasil.filter((h) => h.lulus).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
process.exit(lulus === hasil.length ? 0 : 1);
