// announcements.ts — fase 33: pengumuman dari GitHub (info bug/berita).
//
// Sumber: `announcements.json` di repo publik ShinRyu04/Zephyr. Di-fetch
// SEKALI per proses, SENYAP (offline/gagal = diam, jangan ganggu startup),
// dan hanya kalau user menyalakan "Cek pembaruan otomatis" di Settings →
// General (setting yang sama mengontrol cek versi rilis).
//
// Yang sudah dilihat user dicatat di settings.update.seenAnnouncements
// (array id), jadi pengumuman lama tidak muncul dua kali.

import * as cmd from './commands';
import { notifyInfo, notifyWarn, notifyError } from './notificationStore';

const URL_ANNOUNCEMENTS =
  'https://raw.githubusercontent.com/ShinRyu04/Zephyr/main/announcements.json';

interface AnnItem {
  id: string;
  severity?: 'info' | 'warn' | 'error';
  title: string;
  detail?: string;
}

let fetched = false;

/** Ambil pengumuman baru dan tampilkan sebagai toast/Notification Center. */
export async function cekPengumuman(): Promise<void> {
  if (fetched) return;
  fetched = true;

  let s;
  try {
    s = await cmd.getSettings();
  } catch {
    return; // Rust tidak tersedia (mode browser) — biarkan
  }
  const upd = s.update;
  if (!upd || !s.general?.checkUpdates) return;

  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 8000);
  let data: { announcements?: AnnItem[] } | null = null;
  try {
    const res = await fetch(URL_ANNOUNCEMENTS, { signal: ctrl.signal });
    if (res.ok) data = (await res.json()) as { announcements?: AnnItem[] };
  } catch {
    /* offline / CORS / rusak — diam */
  } finally {
    window.clearTimeout(t);
  }
  if (!data?.announcements?.length) return;

  const seen = new Set(upd.seenAnnouncements ?? []);
  const baru: string[] = [];
  for (const a of data.announcements) {
    if (!a?.id || seen.has(a.id)) continue;
    seen.add(a.id);
    baru.push(a.id);
    if (a.severity === 'warn') notifyWarn(a.title, { detail: a.detail, source: 'update' });
    else if (a.severity === 'error') notifyError(a.title, { detail: a.detail });
    else notifyInfo(a.title, { detail: a.detail, source: 'update' });
  }
  if (baru.length > 0) {
    void cmd
      .setSettings({ update: { seenAnnouncements: [...seen] } })
      .catch(() => {});
  }
}
