// Cek live: chord Ctrl+Alt+A -> ai.panel, dan bubble pesan user panjang memakai toggle.
import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const out = {};
  const kb = await import('/src/lib/keybindings.ts');
  const sc = await import('/src/lib/shortcuts.ts');
  const b = kb.mergeBindings([], []);
  out.chordAiPanel = kb.chordFor('ai.panel', b);
  out.chordAgents = kb.chordFor('agents.openWindow', b);
  const e = kb.entriChord('Ctrl+Alt+A', b);
  out.aliasAltA = e ? e.alias.map((a) => a.command) : [];
  out.konflikAltA = e ? e.konflik.map((k) => k.command) : [];
  out.bawaanAiPanel = sc.ACTION_BY_ID.get('ai.panel')?.default;
  out.bentrokCtrlShiftA = (kb.entriChord('Ctrl+Shift+A', b)?.konflik ?? []).map((k) => k.command);

  const mod = await import('/src/components/ai/ChatMessage.tsx');
  out.adaKomponen = !!mod.default;
  out.cssToggle = !!document.querySelector('style') || 'cek-terpisah';
  const t = await fetch('/src/styles/ai-streaming.css').then((r) => r.text());
  out.cssAdaToggle = /ai-pesan-user-toggle/.test(t);
  return out;
})())`,
  60000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
for (const [k, v] of Object.entries(d)) console.log(k + ':', JSON.stringify(v));
keluarBersih(0);
