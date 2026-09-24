// cek-hapus-key.mjs — who removes the user's key?
//
// The user's `custom` key kept disappearing while verify09 ran. All of the
// harness's setKey('') calls only touch gemini/anthropic, so something else
// rewrites the file. This watches the secrets file around each candidate
// call and reports which one drops the entry.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const SECRETS = path.join(process.env.APPDATA ?? '', 'zephyr', 'secrets.json');

const baca = () => {
  try {
    const d = JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
    return Object.keys(d).sort().join(',');
  } catch (e) {
    return `<gagal baca: ${e.message}>`;
  }
};

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  const langkah = [];
  const catat = (nama) => {
    const isi = baca();
    langkah.push({ nama, isi });
    console.log(`  ${nama.padEnd(34)} -> ${isi}`);
  };

  catat('awal');

  // 1) setKey('gemini', '')
  await cdp.runAsync(`await SET.setKey('gemini', ''); return 'ok';`);
  catat("setKey('gemini','')");

  // 2) setKey('gemini', 'MOCK...')
  await cdp.runAsync(`await SET.setKey('gemini', 'MOCK-KEY-GEMINI-1234'); return 'ok';`);
  catat("setKey('gemini', mock)");

  // 3) loadKeys
  await cdp.runAsync(`await X.store.getState().loadKeys(); return 'ok';`);
  catat('loadKeys()');

  // 4) setModel('gemini-3.8-flash')
  await cdp.runAsync(`await X.store.getState().setModel('gemini-3.8-flash'); return 'ok';`);
  catat("setModel('gemini-3.8-flash')");

  // 5) resetAll (reset_settings)
  await cdp.runAsync(`await SET.resetAll(); return 'ok';`);
  catat('resetAll()');

  // 6) setKey('anthropic', '')
  await cdp.runAsync(`await SET.setKey('anthropic', ''); return 'ok';`);
  catat("setKey('anthropic','')");

  // 7) applySettings (baseUrl mock)
  await cdp.runAsync(`
    await s.applySettings({ models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } } });
    return 'ok';
  `);
  catat('applySettings(baseUrl mock)');

  // 8) reloadSettings
  await cdp.runAsync(`await s.reloadSettings(); return 'ok';`);
  catat('reloadSettings()');

  console.log('');
  const hilang = [];
  for (let i = 1; i < langkah.length; i++) {
    const a = new Set(langkah[i - 1].isi.split(','));
    const b = new Set(langkah[i].isi.split(','));
    for (const k of a) {
      if (k && !b.has(k)) hilang.push(`${k}  <- hilang di langkah "${langkah[i].nama}"`);
    }
  }
  console.log(hilang.length ? 'YANG HILANG:\n  ' + hilang.join('\n  ') : 'tidak ada yang hilang');
  cdp.close();
};

main().catch((e) => {
  console.error('cek-hapus-key error:', e.message ?? e);
  process.exitCode = 2;
});
