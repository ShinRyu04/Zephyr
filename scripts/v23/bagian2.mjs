// v23/bagian2.mjs — V4 & V5 fase 23.

const J = JSON.stringify;

export const bagian2 = async (cdp, check, { PORT_UJI }) => {
  // ═════════ V4: task listen port → entri Ports (fase 20) otomatis ═════════
  const v4 = await cdp.json(
    `
    TK.hapusPorts();
    const sebelum = TK.ports().length;

    const run = await TK.jalankan('uji: server port');
    let ports = [];
    for (let i = 0; i < 60; i++) {
      await wait(250);
      ports = TK.ports();
      if (ports.some((p) => p.hostPort === ${PORT_UJI})) break;
    }

    const out = TK.output('uji: server port');
    // Panel Ports harus benar-benar merender barisnya, bukan cuma store terisi.
    window.__ZEPHYR_PANEL__.focusTab('ports');
    TS().setVisible(true);
    await wait(600);
    const barisDom = qa('[data-testid="ports-row"], .ports-row, tr[data-port]').length;
    const teksPanel = (q('[data-testid="ports-view"], .ports-view') || {}).textContent || '';

    return JSON.stringify({
      runId: run ? run.id : null,
      sebelum,
      ports,
      barisOutput: out.length,
      adaBarisListening: out.some((l) => l.includes('listening on http://localhost:${PORT_UJI}')),
      barisDom,
      portDiTeks: teksPanel.includes('${PORT_UJI}'),
    });
  `,
    180000,
  );

  const pt = (v4.ports || []).find((p) => p.hostPort === PORT_UJI);
  check(
    'V4',
    v4.sebelum === 0 &&
      !!pt &&
      pt.source === 'task' &&
      pt.protocol === 'http' &&
      pt.status === 'running' &&
      pt.process === 'uji: server port' &&
      v4.adaBarisListening === true &&
      v4.portDiTeks === true,
    `Task server mencetak "listening on http://localhost:${PORT_UJI}" → portsStore ` +
      `dapat entri OTOMATIS: ${J(pt)}. Ports kosong sebelum (${v4.sebelum}), ` +
      `${v4.barisOutput} baris output, panel Ports menampilkan port ` +
      `(${v4.barisDom} baris DOM, teks memuat port=${v4.portDiTeks})`,
  );

  // ═════════ V5: Terminate → proses mati bersih, port lepas ═════════
  //
  // Dibuktikan dua arah: (1) port BENAR-BENAR menerima koneksi sebelum kill,
  // (2) setelah kill koneksi ditolak. Tanpa (1), "port lepas" tidak bermakna.
  const cekPort = async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT_UJI}/`, {
        signal: AbortSignal.timeout(2500),
      });
      return { hidup: true, status: r.status, teks: (await r.text()).trim() };
    } catch (e) {
      return { hidup: false, err: e.name };
    }
  };

  const sebelumKill = await cekPort();

  const v5 = await cdp.json(
    `
    const runs = TK.runs();
    const server = runs.filter((r) => r.label === 'uji: server port').pop();
    const watch = runs.filter((r) => r.label === 'uji: watch').pop();
    const aktifSebelum = TK.runsAktif();
    const pidServer = server ? server.pid : null;

    const okServer = server ? await TK.hentikan(server.id) : false;
    const okWatch = watch ? await TK.hentikan(watch.id) : false;
    await wait(1800);

    const setelah = TK.runs();
    const sServer = (setelah.find((r) => r.id === (server || {}).id) || {}).status;
    const sWatch = (setelah.find((r) => r.id === (watch || {}).id) || {}).status;

    return JSON.stringify({
      pidServer,
      aktifSebelum,
      okServer,
      okWatch,
      statusServer: sServer,
      statusWatch: sWatch,
      aktifSesudah: TK.runsAktif(),
    });
  `,
    120000,
  );

  // Beri waktu OS melepas socket setelah pohon proses dibunuh.
  await new Promise((r) => setTimeout(r, 1200));
  const sesudahKill = await cekPort();

  check(
    'V5',
    sebelumKill.hidup === true &&
      sebelumKill.status === 200 &&
      v5.okServer === true &&
      v5.okWatch === true &&
      v5.statusServer === 'killed' &&
      v5.statusWatch === 'killed' &&
      v5.aktifSesudah === 0 &&
      sesudahKill.hidup === false,
    `Sebelum Terminate port ${PORT_UJI} BENAR-BENAR melayani (HTTP ` +
      `${sebelumKill.status}, body ${J(sebelumKill.teks)}), pid ${v5.pidServer}. ` +
      `Terminate ${v5.aktifSebelum} run aktif → status ${J([v5.statusServer, v5.statusWatch])}, ` +
      `sisa aktif ${v5.aktifSesudah}. Sesudahnya koneksi ditolak (${J(sesudahKill.err)}) — ` +
      `pohon proses anak (node di bawah cmd.exe) ikut mati, bukan cuma shell-nya`,
  );
};
