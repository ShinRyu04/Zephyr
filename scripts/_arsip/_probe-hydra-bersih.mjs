/* probe d1: apakah turn chat hydra benar-benar selesai kalau state awal bersih
   (dan apa yang tersisa kalau tidak) */
import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223');
const out = await cdp.json(`
  /* 1. laporan keadaan awal */
  const awal = (() => { const s3 = X.store.getState(); return {
    pending: s3.pending, pendings: JSON.stringify(s3.pendings), agentBusys: JSON.stringify(s3.agentBusys) }; })();

  /* 2. bersihkan sisa run (bukan bagian aplikasi: harness yang harus mulai bersih) */
  X.store.setState({ pending: null, pendings: { '': null }, agentBusys: { '': false }, hydraTahap: null });

  /* 3. hydra ON dengan tier Auto supaya jalurnya memakai model pembaca */
  const set0 = S.getState().settings.hydrafusion ?? {};
  await S.getState().applySettings({ hydrafusion: { enabled: true, maxRequests: 1,
    tiers: { cheap: '', mid: '', strong: '' } } });
  const modeLama = X.store.getState().agentMode;
  X.store.getState().setAgentMode('chat');

  const jejak = [];
  const catat = () => {
    const s2 = X.store.getState();
    const sibuk = Object.values(s2.pendings ?? {}).some(Boolean) || Object.values(s2.agentBusys ?? {}).some(Boolean);
    const tahap = s2.hydraTahap ? (s2.hydraTahap.request + '/' + s2.hydraTahap.total + ' ' + s2.hydraTahap.peran) : null;
    const baris = { t: Date.now(), sibuk, pending: s2.pending, pendings: JSON.stringify(s2.pendings), tahap };
    const last = jejak[jejak.length - 1];
    if (!last || last.sibuk !== baris.sibuk || last.tahap !== baris.tahap || last.pendings !== baris.pendings) jejak.push(baris);
  };
  const un = X.store.subscribe(catat);

  const idUji = X.store.getState().newChat();
  const mulai = Date.now();
  await X.store.getState().send('Jawab satu kata: siap.');
  while (Date.now() - mulai < 90000) {
    const s2 = X.store.getState();
    if (!Object.values(s2.pendings ?? {}).some(Boolean) && !Object.values(s2.agentBusys ?? {}).some(Boolean)) break;
    await wait(200);
  }
  await wait(600);
  un();
  catat();
  const st = X.store.getState();
  const sesi = (st.sessions ?? []).find((x) => x.id === idUji);
  const jawab = sesi ? sesi.messages.filter((m) => m.role === 'assistant').map((m) => String(m.content ?? '').slice(0, 120) + (m.error ? ' [err:' + m.error + ']' : '')) : null;
  const hasil = {
    awal,
    ms: Date.now() - mulai,
    jejak,
    hydraTerakhir: st.hydraTerakhir ? JSON.stringify(st.hydraTerakhir) : null,
    jawab,
    sisa: { pending: st.pending, pendings: JSON.stringify(st.pendings), agentBusys: JSON.stringify(st.agentBusys) },
  };
  /* 4. pulihkan */
  const tutup = q('[data-testid="cset-close"]'); if (tutup) { tutup.click(); await wait(200); }
  X.store.getState().setAgentMode(modeLama);
  await S.getState().applySettings({ hydrafusion: { enabled: set0.enabled === true,
    maxRequests: set0.maxRequests ?? 3, tiers: set0.tiers ?? { cheap: '', mid: '', strong: '' } } });
  if (idUji && X.store.getState().deleteChat) X.store.getState().deleteChat(idUji);
  X.store.setState({ pending: null, pendings: { '': null }, agentBusys: { '': false } });
  return JSON.stringify(hasil);
`, 180000);
console.log(JSON.stringify(out, null, 2));
await cdp.close();
