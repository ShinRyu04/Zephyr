import { useCallback, useEffect, useState } from 'react';
import { aiSpeak, aiTtsVoices, type NeuralVoice } from './commands';
import { findModel } from './modelCatalog';
import { useStore } from './store';
import { useAi } from './aiStore';
import { teksUntukDibaca } from './useBicara';
import { useBicaraStore } from './bicaraStore';

export interface PakaiNeural {
  bisa: boolean;
  suara: NeuralVoice[];
  lagiBicara: string | null;
  bicarakan: (id: string, teks: string, saatKeyDitolak?: () => void) => void;
  hentikan: () => void;
  memuat: boolean;
  galat: string | null;
}

function providerAktif(): { provider: string; baseUrl?: string } {
  const st = useAi.getState();
  const override = useStore.getState().settings?.voice?.neuralProvider || '';
  const def = findModel(st.model, override || st.provider);
  const prov = override || def.provider;
  const baseUrl = useStore.getState().settings.models.providers[prov]?.baseUrl ?? undefined;
  return { provider: prov, baseUrl };
}

function modelSuara(): string | undefined {
  const s = useStore.getState().settings?.voice?.neuralModel || '';
  return s || undefined;
}

export function tebakBahasa(teks: string): string {
  const t = teks.slice(0, 2000);
  if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(t)) {
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(t)) return 'ja';
    return 'zh';
  }
  if (/[\uac00-\ud7af]/.test(t)) return 'ko';
  if (/[\u0600-\u06ff]/.test(t)) return 'ar';
  if (/[àâäéèêëîïôöùûüÿçæœ]/i.test(t)) return 'fr';
  if (/[äöüß]/i.test(t)) return 'de';
  if (/[áéíóúñ¿¡]/i.test(t)) return 'es';
  if (/[ãõçâêô]/i.test(t)) return 'pt';
  return 'id';
}

function pilihVoice(suara: NeuralVoice[], lang: string, favorit: string): string {
  if (favorit && suara.some((s) => s.id === favorit)) return favorit;
  const cocok = suara.find((s) => s.lang.toLowerCase().startsWith(lang));
  if (cocok) return cocok.id;
  const en = suara.find((s) => s.lang.toLowerCase().startsWith('en'));
  if (en) return en.id;
  return suara[0]?.id ?? 'alloy';
}

let audioAktif: HTMLAudioElement | null = null;
let idAktif: string | null = null;
const pendengar = new Set<(id: string | null) => void>();

function umumkan(id: string | null) {
  idAktif = id;
  try {
    useBicaraStore.setState(id === null ? { idBicara: null } : { idBicara: id });
  } catch { /* store belum mount */ }
  pendengar.forEach((fn) => { try { fn(id); } catch { /* abaikan */ } });
}

function hentikanAudio() {
  if (audioAktif) {
    try { audioAktif.pause(); } catch { /* sudah berhenti */ }
    try { audioAktif.src = ''; } catch { /* abaikan */ }
    audioAktif = null;
  }
  if (idAktif !== null) umumkan(null);
}

let cacheSuara: { provider: string; daftar: NeuralVoice[] } | null = null;

async function daftarSuara(provider: string, baseUrl?: string): Promise<NeuralVoice[]> {
  if (cacheSuara && cacheSuara.provider === provider) return cacheSuara.daftar;
  try {
    const daftar = await aiTtsVoices({ provider, baseUrl });
    cacheSuara = { provider, daftar };
    return daftar;
  } catch {
    return cacheSuara?.daftar ?? [];
  }
}

export function pesanGalatNeural(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/tidak berlaku untuk endpoint audio/i.test(m)) return 'key-audio';
  if (/No API key/i.test(m)) return 'tanpa-key';
  return 'gagal';
}

export async function putarNeural(id: string, teks: string): Promise<void> {
  const v = useStore.getState().settings?.voice;
  const bersih = teksUntukDibaca(teks, { lewatiKode: v?.skipCode !== false });
  if (!bersih.trim()) return;
  const { provider, baseUrl } = providerAktif();
  const suara = await daftarSuara(provider, baseUrl);
  const lang = v?.neuralFollowLang !== false ? tebakBahasa(bersih) : '';
  const voice = pilihVoice(suara, lang, v?.neuralVoiceId ?? '');
  const volume = v?.neuralVolume ?? 1;
  hentikanAudio();
  const url = await aiSpeak({ provider, baseUrl, model: modelSuara(), voice, teks: bersih.slice(0, 4000) });
  const a = new Audio(url);
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (volume !== 1 && Ctx) {
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(a);
      const gain = ctx.createGain();
      gain.gain.value = Math.min(2, Math.max(0, volume));
      src.connect(gain).connect(ctx.destination);
    } else {
      a.volume = Math.min(1, Math.max(0, volume));
    }
  } catch {
    a.volume = Math.min(1, Math.max(0, volume));
  }
  audioAktif = a;
  umumkan(id);
  a.onended = () => { if (idAktif === id) hentikanAudio(); };
  a.onerror = () => { if (idAktif === id) hentikanAudio(); };
  await a.play();
}

export function hentikanSemuaSuara() {
  hentikanAudio();
  try { useBicaraStore.getState().hentikan(); } catch { /* store belum mount */ }
}

export function useNeural(): PakaiNeural {
  const aktif = useStore((s) => s.settings?.voice?.neuralEnabled === true);
  const [suara, setSuara] = useState<NeuralVoice[]>([]);
  const [lagiBicara, setLagiBicara] = useState<string | null>(idAktif);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!aktif) return;
    let batal = false;
    const { provider, baseUrl } = providerAktif();
    void daftarSuara(provider, baseUrl).then((daftar) => { if (!batal) setSuara(daftar); });
    return () => { batal = true; };
  }, [aktif]);

  useEffect(() => {
    const fn = (id: string | null) => setLagiBicara(id);
    pendengar.add(fn);
    return () => { pendengar.delete(fn); };
  }, []);

  useEffect(() => () => { hentikanAudio(); }, []);

  const hentikan = useCallback(() => {
    hentikanAudio();
    setLagiBicara(null);
  }, []);

  const bicarakan = useCallback((id: string, teks: string, saatKeyDitolak?: () => void) => {
    if (idAktif === id) { hentikanAudio(); return; }
    setMemuat(true);
    setGalat(null);
    putarNeural(id, teks).then(
      () => setMemuat(false),
      (e) => {
        setMemuat(false);
        const kode = pesanGalatNeural(e);
        setGalat(kode);
        if (kode === 'key-audio') saatKeyDitolak?.();
      },
    );
  }, []);

  return { bisa: aktif, suara, lagiBicara, bicarakan, hentikan, memuat, galat };
}
