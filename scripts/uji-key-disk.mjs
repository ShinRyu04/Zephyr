/**
 * Verifikasi bug "agent jalan tanpa API key" sudah beres:
 * fsRead secrets.json dari appInfo.dataDir tidak lagi ditolak guard tulis,
 * dan apiKeyDisk.keyDiDisk (jalur produksi) mendeteksi slot yang berisi key.
 * Read-only — tidak menulis apa pun.
 */
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.env.ZEPHYR_CDP_PORT ?? '9223');
const info = await cdp.runAsync(`
  const zUrl = (frag) => performance.getEntriesByType('resource').map((e) => e.name)
    .filter((n) => n.includes(frag)).sort().pop();
  const mod = await import(zUrl('/src/lib/commands.ts') ?? '/src/lib/commands.ts');
  const disk = await import(zUrl('/src/lib/apiKeyDisk.ts') ?? '/src/lib/apiKeyDisk.ts');
  const appInfo = await mod.getAppInfo();
  const dasar = (appInfo.dataDir ?? '').replace(/[\\\\/]+$/, '');
  const p = dasar + '\\\\secrets.json';
  let baca = null;
  try {
    const isi = await mod.fsRead(p);
    baca = Object.entries(JSON.parse(isi.content) ?? {})
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k]) => k);
  } catch (e) {
    baca = { gagal: String(e && e.message ? e.message : e).slice(0, 160) };
  }
  const viaDisk = [...(await disk.keyDiDisk())];
  return { dataDir: appInfo.dataDir, pathDibaca: p, slotTerbaca: baca, viaApiKeyDisk: viaDisk };
`);
console.log(JSON.stringify(info, null, 2));
await cdp.close();
