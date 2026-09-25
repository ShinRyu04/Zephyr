import * as cmd from './commands';
import { notifyInfo, notifyWarn, notifyError } from './notificationStore';
import { translate } from './i18n';

const URL_ANNOUNCEMENTS =
  'https://raw.githubusercontent.com/ShinRyu04/Zephyr/main/announcements.json';

// Teks pengumuman bisa berupa string biasa (dipakai apa adanya) ATAU objek
// per-bahasa { en, id, ja, ... }. Kalau objek, dipilih sesuai bahasa aktif;
// kalau bahasa itu tidak ada, jatuh ke 'en', lalu ke nilai pertama yang ada.
type Teks = string | Record<string, string>;
interface AnnItem {
  id: string;
  severity?: 'info' | 'warn' | 'error';
  title: Teks;
  detail?: Teks;
}

function pilihTeks(t: Teks | undefined, lang: string): string | undefined {
  if (t == null) return undefined;
  if (typeof t === 'string') return translate(lang, t);
  return t[lang] ?? t.en ?? Object.values(t)[0];
}

let fetched = false;

export async function cekPengumuman(): Promise<void> {
  if (fetched) return;
  fetched = true;

  let s;
  try {
    s = await cmd.getSettings();
  } catch {
    return;
  }
  const upd = s.update;
  if (!upd || !s.general?.checkUpdates) return;
  const lang = s.general?.uiLang ?? 'en';

  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 8000);
  let data: { announcements?: AnnItem[] } | null = null;
  try {
    const res = await fetch(URL_ANNOUNCEMENTS, { signal: ctrl.signal });
    if (res.ok) data = (await res.json()) as { announcements?: AnnItem[] };
  } catch {
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
    const title = pilihTeks(a.title, lang) ?? a.id;
    const detail = pilihTeks(a.detail, lang);
    if (a.severity === 'warn') notifyWarn(title, { detail, source: 'update' });
    else if (a.severity === 'error') notifyError(title, { detail });
    else notifyInfo(title, { detail, source: 'update' });
  }
  if (baru.length > 0) {
    void cmd
      .setSettings({ update: { seenAnnouncements: [...seen] } })
      .catch(() => {});
  }
}
