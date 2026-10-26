/*
 * uji-sesi-unread.mjs - phase 3: unread + background markers on the session
 * lists.
 *
 * What is proved here, and what deliberately is not:
 *
 *   U1-U4  THE RULES, through the living store. `tandaiSesiBelumDibaca` is the
 *          exported cross-store marking call; the dot that appears in the
 *          session panel comes from the same `ringkasSesi` rule the Agents
 *          sidebar uses. Faking the DOM would prove nothing.
 *   U4     THE DOT CLEARS. A badge that never clears is ignored within a day.
 *   U5-U8  THE AGENTS WINDOW. It is a SEPARATE WebView with its own store
 *          (`zephyr.ai.sessions.v1.agents`), so it is checked in its own
 *          target. Reading the main window's DOM and calling it "the sidebar"
 *          is the phase-08 V4b false pass.
 *   U8     THE FILTER FILTERS. All/Local used to set a value nothing read;
 *          clicking Unread must actually shorten the list and leak nothing.
 *   U9     THE ROW SHAPE. No button inside a button - the old markup was
 *          invalid and the browser silently un-nested it.
 *
 * Requires the app running with the dev bridge on CDP 9223.
 *
 * NOTE: `cdp.eval` does NOT await promises (it returns the pending object as
 * `{}`). Anything async goes through `runAsync`, which stores the promise in a
 * window slot and polls it - the same workaround the rest of the suite uses.
 */
import { Cdp, pilihJendelaUtama } from './lib-cdp.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';

let lulus = 0;
let gagal = 0;
const hasil = [];

function cek(nama, ok, ket) {
  if (ok) {
    lulus += 1;
    hasil.push(`  ok   ${nama}`);
  } else {
    gagal += 1;
    hasil.push(`  FAIL ${nama}${ket ? ` - ${ket}` : ''}`);
  }
}

/* The Agents window shares title and origin with the main window, so it is
   picked by URL hash, not by title. */
async function sambungAgents() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page =
    targets.find((t) => t.type === 'page' && (t.url ?? '').includes('#agents')) ??
    targets.find(
      (t) => t.type === 'page' && /agent/i.test(t.title ?? '') && !/code editor/i.test(t.title ?? ''),
    ) ??
    null;
  if (!page) return null;
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  cdp.snapshot = null;
  return { cdp, page };
}

async function main() {
  const { cdp, page } = await Cdp.attach(PORT, 'Zephyr');
  hasil.push(`  ..   target: ${page.title} (${page.url})`);

  const adaBridge = await cdp.eval('typeof window.__ZEPHYR_AI__');
  cek('U0 bridge AI tersedia', adaBridge === 'object', String(adaBridge));
  if (adaBridge !== 'object') {
    cdp.close();
    return;
  }

  /* Pick a session that is NOT active: marking the active one fights the rule
     that selecting a chat clears the badge. */
  const info = await cdp.json(`
    const st = X.store.getState();
    const aktif = st.activeIds ? (st.activeIds.main ?? st.activeIds[Object.keys(st.activeIds)[0]] ?? null) : null;
    const kandidat = (st.sessions || []).find(s => s.id !== aktif) || (st.sessions || [])[0] || null;
    return JSON.stringify({ id: kandidat ? kandidat.id : null, aktif, total: (st.sessions || []).length });
  `);

  if (!info.id) {
    cek('U1 ada sesi untuk diuji', false, 'store tidak punya sesi sama sekali');
  } else {
    cek('U1 ada sesi untuk diuji', true);

    /* U2: the exported helper must set the flag on the session it is given. */
    const tandai = await cdp.runAsync(`
      X.tandaiSesiBelumDibaca(${JSON.stringify(info.id)});
      await wait(150);
      const sesiA = X.store.getState().sessions.find(x => x.id === ${JSON.stringify(info.id)});
      return String(!!(sesiA && sesiA.unread));
    `);
    cek('U2 tandaiSesiBelumDibaca menyetel unread', tandai === 'true', String(tandai));

    /* U3: the rule must reach the screen. The sessions column only exists when
       the AI panel is maximized - and `aiMax` lives on the APP store (`S`), not
       on the AI store, which is why `X.store.getState().setAiMax` was
       undefined and the check silently skipped. */
    let panelAda = await cdp.eval(`!!document.querySelector('[data-testid="ai-sessions-panel"]')`);
    if (!panelAda) {
      await cdp.runAsync(`
        S.getState().setAiMax(true);
        await wait(600);
        return 'ok';
      `);
      panelAda = await cdp.eval(`!!document.querySelector('[data-testid="ai-sessions-panel"]')`);
    }
    if (!panelAda) {
      hasil.push('  skip U3 panel sesi tidak bisa dibuka (setAiMax tidak ada)');
    } else {
      const titik = await cdp.eval(
        `document.querySelectorAll('[data-testid^="ai-sessions-unread-"]').length`,
      );
      cek('U3 titik belum-dibaca muncul di panel sesi', Number(titik) >= 1, `jumlah=${titik}`);
    }

    /* U4: opening the chat clears it. */
    const bersih = await cdp.runAsync(`
      X.store.getState().selectChat(${JSON.stringify(info.id)});
      await wait(200);
      const sesiA = X.store.getState().sessions.find(x => x.id === ${JSON.stringify(info.id)});
      return String(!!(sesiA && sesiA.unread));
    `);
    cek('U4 membuka sesi menghapus tanda belum-dibaca', bersih === 'false', String(bersih));

    /* And the dot must be GONE from the DOM, not merely from the store. */
    const sisaDot = await cdp.eval(
      `document.querySelectorAll('[data-testid="ai-sessions-unread-${info.id}"]').length`,
    );
    cek('U4b titik hilang dari DOM setelah dibuka', Number(sisaDot) === 0, `jumlah=${sisaDot}`);
  }

  /* U9 on the main window, while the panel is open. */
  const bersarang = await cdp.eval(`(() => {
    const panel = document.querySelector('[data-testid="ai-sessions-list"]');
    if (!panel) return 'SKIP';
    return String(panel.querySelectorAll('button button').length);
  })()`);
  if (bersarang === 'SKIP') hasil.push('  skip U9 panel sesi tidak terbuka');
  else cek('U9 tidak ada tombol bersarang di panel sesi', bersarang === '0', `jumlah=${bersarang}`);

  cdp.close();

  /* ---------------------------- Agents window ---------------------------- */
  const a = await sambungAgents();
  if (!a) {
    cek('U5 jendela Agents terbuka', false, 'buka jendela Agents dulu - sidebar tidak bisa diperiksa tanpa itu');
  } else {
    const { cdp: cdpa } = a;
    cek('U5 jendela Agents terbuka', true);

    const adaSidebar = await cdpa.eval(`!!document.querySelector('[data-testid="agx-sidebar"]')`);
    cek('U6 sidebar Agents ter-render', adaSidebar === true, String(adaSidebar));

    if (adaSidebar) {
      /* U7: mark a session in the AGENTS store (its own localStorage key) and
         read the row back. */
      const seed = await cdpa.runAsync(`
        const st = X.store.getState();
        const aktif = st.activeIds ? (st.activeIds[Object.keys(st.activeIds)[0]] ?? null) : null;
        const kandidat = (st.sessions || []).find(x => x.id !== aktif) || (st.sessions || [])[0];
        if (!kandidat) return 'NO-SESSION';
        X.tandaiSesiBelumDibaca(kandidat.id);
        await wait(250);
        const kini = X.store.getState().sessions.find(x => x.id === kandidat.id);
        return JSON.stringify({ id: kandidat.id, unread: !!(kini && kini.unread) });
      `);
      if (seed === 'NO-SESSION') {
        cek('U7 baris Agents menandai belum-dibaca', false, 'jendela Agents belum punya sesi');
      } else {
        const infoA = JSON.parse(seed);
        cek('U7a store Agents menerima tanda unread', infoA.unread === true, seed);
        const dot = await cdpa.eval(
          `document.querySelectorAll('[data-testid="agx-sesi-belum-dibaca"]').length`,
        );
        cek('U7b baris Agents menampilkan titik belum-dibaca', Number(dot) >= 1, `jumlah=${dot}`);

        /* U8: the Unread filter must match the store exactly. */
        const sebelum = await cdpa.eval(`document.querySelectorAll('[data-testid="agx-baris-sesi"]').length`);
        const perlu = await cdpa.eval(`(() => {
          const st = window.__ZEPHYR_AI__.store.getState();
          return String((st.sessions || []).filter(s => s.unread === true || (s.latar || []).some(l => l.belumDibaca)).length);
        })()`);
        await cdpa.runAsync(`
          document.querySelector('[data-testid="agx-view-options"]')?.click();
          await wait(200);
          document.querySelector('[data-testid="agx-filter-unread"]')?.click();
          await wait(350);
          return 'ok';
        `);
        const sesudah = await cdpa.eval(`document.querySelectorAll('[data-testid="agx-baris-sesi"]').length`);
        cek(
          'U8 filter Unread menyaring daftar',
          Number(sesudah) === Number(perlu) &&
            Number(sesudah) >= 1 &&
            Number(sesudah) <= Number(sebelum),
          `sebelum=${sebelum} sesudah=${sesudah} seharusnya=${perlu}`,
        );

        /* U8b: going back to All must restore the full list - a filter you
           cannot leave is a trap, and it also proves the filter is a filter
           rather than a destructive hide. */
        await cdpa.runAsync(`
          document.querySelector('[data-testid="agx-view-options"]')?.click();
          await wait(200);
          document.querySelector('[data-testid="agx-filter-all"]')?.click();
          await wait(350);
          return 'ok';
        `);
        const semua = await cdpa.eval(`document.querySelectorAll('[data-testid="agx-baris-sesi"]').length`);
        cek('U8b filter All memulihkan daftar penuh', Number(semua) === Number(sebelum), `semua=${semua} sebelum=${sebelum}`);
      }
    }
    cdpa.close();
  }
}

try {
  await main();
} catch (e) {
  gagal += 1;
  hasil.push(`  FAIL jalankan harness - ${e && e.message ? e.message : e}`);
}

console.log(hasil.join('\n'));
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
