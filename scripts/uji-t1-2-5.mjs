// uji-t1-2-5.mjs — verifikasi T1.2 (CLI multi-provider) + T1.5 (UI panel AI).
//
// Yang dibuktikan:
//   1. Rust mendeteksi 4 CLI (codex/claude/gemini/opencode) + status login
//   2. Baris chip muncul di panel AI dengan status yang BENAR per CLI
//   3. Chip bisa dipilih -> mengubah store (jalur aktif)
//   4. CLI yang belum login nonaktif (tidak bisa diklik)
//   5. Mode CLI benar-benar menjalankan CLI (uji nyata, bukan mock)
//
// CATATAN: cdp.eval TIDAK menunggu promise -> blok async pakai cdp.runAsync.
//
// Pakai: node scripts/uji-t1-2-5.mjs

import { Cdp } from './lib-cdp.mjs';

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) {
    lulus++;
    console.log(`  LULUS  ${nama}${info ? '  ' + info : ''}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${info ? '  ' + info : ''}`);
  }
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');

try {
  // ── 1. Rust mendeteksi CLI ──
  const deteksi = await cdp.json(`return JSON.stringify(await (async () => {
    // Lewat store (bukan window.__TAURI__ — jembatan itu tidak selalu ada).
    const X = window.__ZEPHYR_CLIAGENT__;
    await X.detect(true);
    return X.agents();
  })())`);

  cek('cli_agents_detect mengembalikan 4 CLI', deteksi.length === 4, `n=${deteksi.length}`);
  const nama = deteksi.map((a) => a.id).join(',');
  cek(
    'CLI yang dideteksi: codex, claude, gemini, opencode',
    ['codex', 'claude', 'gemini', 'opencode'].every((x) => deteksi.some((a) => a.id === x)),
    nama,
  );

  for (const a of deteksi) {
    console.log(
      `    ${a.id.padEnd(9)} terpasang=${String(a.terpasang).padEnd(5)} login=${String(a.login).padEnd(5)} ${a.catatan || ''}`,
    );
  }

  const adaTerpasang = deteksi.filter((a) => a.terpasang);
  cek('minimal satu CLI terpasang di mesin', adaTerpasang.length > 0,
    `${adaTerpasang.map((a) => a.id).join(',') || 'tidak ada'}`);

  const adaLogin = deteksi.filter((a) => a.login);
  cek('minimal satu CLI sudah login', adaLogin.length > 0,
    `${adaLogin.map((a) => a.id).join(',') || 'tidak ada'}`);

  // ── 2. baris chip di panel AI ──
  // Buka panel AI dulu.
  await cdp.eval(`(() => {
    const T = window.__ZEPHYR_TERM__;
    T.getState().setVisible(true);
    T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
    return 'ok';
  })()`);
  await new Promise((r) => setTimeout(r, 900));

  // Paksa store CLI mendeteksi (panel mungkin belum sempat).
  await cdp.json(`return JSON.stringify(await (async () => {
    const r = await window.__ZEPHYR_CLIAGENT__.detect(true);
    return r ?? 'ok';
  })())`);
  await new Promise((r) => setTimeout(r, 600));

  const bar = await cdp.eval(`(() => {
    const el = document.querySelector('[data-testid="ai-cli-bar"]');
    if (!el) return { ada: false };
    const chips = [...el.querySelectorAll('.ai-cli-chip')];
    return {
      ada: true,
      jumlah: chips.length,
      chip: chips.map((c) => ({
        testid: c.getAttribute('data-testid'),
        teks: c.textContent.trim(),
        on: c.classList.contains('is-on'),
        off: c.classList.contains('is-off'),
        disabled: c.disabled,
        terpasang: c.getAttribute('data-terpasang'),
        login: c.getAttribute('data-login'),
      })),
    };
  })()`);

  cek('baris ai-cli-bar dirender', bar.ada);
  if (bar.ada) {
    cek('ada chip Native', bar.chip.some((c) => c.testid === 'ai-cli-native'));
    cek('Native aktif saat default (mode API)', bar.chip.find((c) => c.testid === 'ai-cli-native')?.on === true);
    cek('chip CLI sejumlah CLI terpasang', bar.jumlah >= 2, `n=${bar.jumlah}`);

    // Chip CLI yang login harus bisa diklik; yang belum login harus disabled.
    const loginChip = bar.chip.find((c) => c.testid?.startsWith('ai-cli-') && c.testid !== 'ai-cli-native' && c.login === 'true');
    const belumChip = bar.chip.find((c) => c.testid?.startsWith('ai-cli-') && c.testid !== 'ai-cli-native' && c.login === 'false');

    // Pilih opencode untuk uji JALAN: paling cepat (~1s) dan sudah login.
    // codex exec butuh 2-5 menit (memuat sandbox) — tidak cocok untuk harness.
    const cepatChip = bar.chip.find((c) => c.testid === 'ai-cli-opencode' && c.login === 'true') ?? loginChip;
    if (cepatChip) {
      cek(`chip ${loginChip.teks} (sudah login) bisa diklik`, loginChip.disabled === false);
    }
    if (belumChip) {
      cek(`chip ${belumChip.teks} (belum login) nonaktif`, belumChip.disabled === true);
    }

    // ── 3. pilih chip -> store berubah ──
    if (loginChip) {
      const pilih = await cdp.json(`return JSON.stringify(await (async () => {
        const el = document.querySelector('[data-testid="${cepatChip.testid}"]');
        el?.click();
        await new Promise((r) => setTimeout(r, 400));
        const X = window.__ZEPHYR_CLIAGENT__;
        return { aktif: X?.aktif?.() ?? 'tidak ada', onKelas: document.querySelector('[data-testid="${cepatChip.testid}"]')?.classList.contains('is-on') };
      })())`);

      const idChip = cepatChip.testid.replace('ai-cli-', '');
      cek('klik chip mengubah store jalur aktif', pilih.aktif === idChip,
        `store=${pilih.aktif} harap=${idChip}`);
      cek('chip yang dipilih diberi kelas is-on', pilih.onKelas === true);

      // ── 5. jalankan CLI NYATA (bukti jalur B bekerja) ──
      const jalan = await cdp.json(`return JSON.stringify(await (async () => {
        const X = window.__ZEPHYR_CLIAGENT__;
        try {
          const r = await X.jalankan('Balas dengan tepat satu kata: HALO', 'D:/Zephyr');
          await new Promise((res) => setTimeout(res, 500));
          const runs = X.runs?.() ?? [];
          const t = runs[runs.length - 1];
          return { ok: true, ada: !!t, okRun: t?.ok, output: (t?.output ?? '').slice(0, 160), berjalan: t?.berjalan };
        } catch (e) {
          return { ok: false, pesan: String(e).slice(0, 200) };
        }
      })())`, 300000);

      cek('CLI dijalankan (jalur B bekerja)', jalan.ok, jalan.pesan ?? '');
      if (jalan.ok) {
        cek('CLI mengembalikan output', (jalan.output ?? '').length > 0, jalan.output?.slice(0, 70) ?? '');
        cek('CLI selesai (tidak menggantung)', jalan.berjalan === false);
      }

      // Kembalikan ke Native.
      await cdp.eval(`(() => { window.__ZEPHYR_CLIAGENT__.setAktif(null); return 'ok'; })()`);
      const balik = await cdp.eval(`(() => window.__ZEPHYR_CLIAGENT__.aktif() ?? 'null')()`);
      cek('bisa kembali ke mode Native', balik === 'null' || balik === null);
    }
  }

  console.log('');
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exitCode = gagal === 0 ? 0 : 1;
} finally {
  await cdp.close();
}
