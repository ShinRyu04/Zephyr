// verify-model-provider-gate.mjs — a provider is only offered when it can
// actually send: an API key is stored AND there is a base URL to send to.
//
// The bug this guards: `custom` has an empty base URL on purpose, but it used
// to be listed (and badged "key saved for this provider") as soon as any key
// was stored, so the picker advertised a setup that could not send. The same
// `freeText` bypass also listed `custom` before anything was configured.
//
// Usage: node scripts/verify-model-provider-gate.mjs [port]
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const { cdp } = await Cdp.attach(PORT);

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

// A configured provider must appear; an unconfigured one must not.
const configured = await cdp.runAsync(
  `
  const store = s;
  TS().setVisible(true);
  window.__ZEPHYR_PANEL__.focusTab('ai');
  await wait(900);
  const btn = document.querySelector('[data-testid="ai-model-btn"]');
  if (!btn) return JSON.stringify({ err: 'no ai-model-btn' });
  btn.click();
  await wait(900);
  const providers = [...document.querySelectorAll('[data-provider-item]')].map((e) =>
    e.getAttribute('data-provider-item'));
  const catatan = document.querySelector('[data-testid="ai-mp-note"]')?.textContent?.trim() || '';
  window.__ZEPHYR_AI__.store.getState().setModelMenuOpen(false);
  await wait(300);
  const ks = document.querySelector('[data-testid="ai-keystate"]');
  return JSON.stringify({
    providers,
    catatan,
    keystate: ks ? ks.getAttribute('data-haskey') : null,
    overrides: store.settings.models.providers ?? {},
  });
`,
  40000,
);
const c = JSON.parse(configured);

if (c.err) {
  check('PROV-V1', false, c.err);
} else {
  const pub = await cdp.runAsync(`return JSON.stringify(window.__ZEPHYR_AI__.store.getState().keys)`);
  const keys = JSON.parse(pub);
  const keysPunya = (id) => keys.some((k) => k.provider === id && k.hasKey);
  const baseUrlAda = (id) => {
    const ov = (c.overrides ?? {})[id]?.baseUrl;
    if (typeof ov === 'string' && ov.trim()) return true;
    return ['gemini', 'openai', 'anthropic', 'deepseek', 'xai', 'local'].includes(id);
  };
  const semua = ['gemini', 'openai', 'anthropic', 'deepseek', 'xai', 'local', 'custom'];
  const harusnya = semua.filter((p) => keysPunya(p) && baseUrlAda(p));
  const salahTampil = semua.filter((p) => !harusnya.includes(p) && c.providers.includes(p));
  const hilang = harusnya.filter((p) => !c.providers.includes(p));

  check(
    'PROV-V1',
    salahTampil.length === 0 && hilang.length === 0,
    `ditawarkan: [${c.providers.join(', ')}] | seharusnya: [${harusnya.join(', ')}]` +
      (salahTampil.length ? ` |不该 tampil: ${salahTampil.join(', ')}` : '') +
      (hilang.length ? ` | hilang: ${hilang.join(', ')}` : ''),
  );

  // The badge must not claim "saved" for a provider that has nowhere to send.
  const aktif = await cdp.runAsync(
    `return JSON.stringify(window.__ZEPHYR_AI__.store.getState().provider)`,
  );
  const prov = JSON.parse(aktif);
  const badgeBohong = keysPunya(prov) && !baseUrlAda(prov) && c.keystate === '1';
  check(
    'PROV-V2',
    !badgeBohong,
    `provider aktif=${prov}, key=${keysPunya(prov) ? 'ada' : 'tidak'}, baseUrl=${baseUrlAda(prov) ? 'ada' : 'tidak'}, badge=${c.keystate}`,
  );
}

const lulus = hasil.filter((x) => x.ok).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
await cdp.close();
process.exitCode = lulus === hasil.length ? 0 : 1;
