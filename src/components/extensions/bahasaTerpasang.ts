/*
 * bahasaTerpasang.ts - catatan jujur untuk kontribusi bahasa SEBUAH PAKET
 * TERPASANG, dihitung dari manifest yang benar-benar ada di direktori ekstensi.
 *
 * Kenapa modul ini ada: `src/lib/labelPaket.ts` menulis catatan "sudah
 * didukung bawaan" / "NO-OP" untuk 7 id paket bahasa bawaan - sebuah tabel
 * tangan. Katalog bawaan mengirim 88 paket bahasa (`PAKET_BAHASA` di
 * `src-tauri/src/ext_bundled.rs`) dan paket dari luar boleh mengklaim akhiran
 * apa pun, jadi tabel tangan tidak menutup kartunya: paket ke-8 yang mengklaim
 * akhiran yang sudah dipegang bahasa bawaan tetap muncul sebagai "terpasang"
 * tanpa satu pun perubahan yang bisa dilihat pengguna.
 *
 * Modul ini menghitung catatan itu dari data manifest: untuk setiap baris
 * `languages` di `contributes`, akhiran yang sudah dipegang bahasa bawaan
 * dipisahkan dari akhiran sisa yang benar-benar ditambahkan. Pemiliknya dibaca
 * dari `detectLang()` di `src/lib/lang.ts` - fungsi yang sama yang dipakai
 * `extLangUntuk()` untuk memutuskan berkas mana yang memakai bahasa terkontribusi
 * ("bawaan menang; paket hanya mengisi ekstensi yang belum diklaim"). Jadi
 * catatan ini tidak bisa menjanjikan lebih daripada yang bisa diberikan
 * `lang.ts`, dan tidak bisa menjanjikan kurang juga.
 *
 * Murni: tanpa React, tanpa impor selain `../../lib/lang`. Itu disengaja supaya
 * bisa diuji tanpa aplikasi - `scripts/uji-ekstensi-jenis.mjs` membundel modul
 * ini apa adanya, lalu membandingkan catatannya dengan perubahan nyata di state
 * editor (label berkas sebelum/sesudah paket dipasang).
 */
import { detectLang, LANG_LABEL } from '../../lib/lang';

export interface CatatanBahasa {
  /** Label baris bahasa seperti tertulis di manifest. */
  readonly label: string;
  /** Akhiran berkas yang benar-benar BARU (belum dipegang bahasa bawaan). */
  readonly ditambah: string[];
  /** Akhiran berkas yang diklaim, tetapi sudah dipegang bahasa bawaan. */
  readonly tidakEfek: string[];
  /** Label bahasa bawaan yang memegang akhiran `tidakEfek`, urut dan unik. */
  readonly pemilikBawaan: string[];
  /** True kalau memasang paket ini tidak mengubah pemilik satu berkas pun. */
  readonly noEfek: boolean;
  /**
   * `null` kalau tidak diperiksa (pemanggil tidak menyerahkan penilai grammar).
   * `false` berarti mode/grammar baris ini TIDAK bisa dimuat Zephyr, jadi
   * memasang paket ini tidak mengubah bahasa berkas mana pun.
   */
  readonly grammarBisaDimuat: boolean | null;
  /** Teks siap tampil - satu kalimat, tanpa markup. */
  readonly teks: string;
}

/** Bagian baris `languages` yang menentukan bisa-tidaknya grammar dimuat. */
export interface BarisGrammar {
  readonly cmLang?: string;
  readonly legacyMode?: string;
}

/**
 * Penilai "grammar baris ini benar-benar bisa dimuat" - diserahkan pemanggil
 * supaya modul ini tetap tanpa impor (bisa diuji tanpa aplikasi). Aplikasi
 * menyerahkan `grammarTersedia()` dari `src/lib/extLoader.ts`, fungsi yang
 * SAMA yang dipakai loader sebelum mendaftarkan ekstensi; kalau berbeda, catatan
 * di panel detail akan menjanjikan hal yang tidak dilakukan loader.
 */
export type CekGrammar = (l: BarisGrammar) => boolean;

function daftar(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function norm(e: unknown): string {
  return String(e ?? '')
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase();
}

function bertitik(ext: readonly string[]): string {
  return ext.map((e) => `.${e}`).join(', ');
}

/**
 * Catatan per baris bahasa untuk satu `contributes`. `contributes` boleh objek
 * manifest apa adanya (termasuk paket VS Code) atau `undefined`; entri yang
 * tidak dimengerti diabaikan, bukan ditebak.
 */
export function catatanBahasaTerpasang(contributes: unknown, cekGrammar?: CekGrammar): CatatanBahasa[] {
  const c = (contributes ?? {}) as {
    languages?: unknown;
  };
  const keluar: CatatanBahasa[] = [];

  for (const l of daftar(c.languages)) {
    const label = String(l?.label ?? '').trim() || String(l?.id ?? '').trim() || 'language';
    const unik = Array.from(new Set(daftar(l?.extensions).map(norm).filter(Boolean)));
    const ditambah = unik.filter((e) => detectLang(`berkas.${e}`) === 'plain');
    const tidakEfek = unik.filter((e) => detectLang(`berkas.${e}`) !== 'plain');
    const pemilikBawaan = Array.from(
      new Set(tidakEfek.map((e) => LANG_LABEL[detectLang(`berkas.${e}`)] ?? 'bahasa bawaan')),
    );
    const cm = String(l?.cmLang ?? l?.legacyMode ?? '').trim();
    const legacy = String(l?.legacyMode ?? '').trim();

    /* Grammar: `null` = tidak diperiksa. Kalau diperiksa dan hasilnya false,
       loader tidak mendaftarkan ekstensi baris ini sama sekali (lihat
       `grammarTersedia` yang dipanggil sebelum pendaftaran di extLoader.ts),
       jadi janji "menambah akhiran baru" tidak boleh ditulis. */
    const grammarBisaDimuat = cm === '' || !cekGrammar ? null : cekGrammar({ cmLang: cm, legacyMode: legacy });
    const mati = grammarBisaDimuat === false;

    let teks: string;
    if (mati && unik.length === 0) {
      teks =
        `tidak mengklaim akhiran berkas, dan mode bahasa '${cm}' tidak bisa dimuat Zephyr ` +
        `(grammarnya bukan paket bahasa yang diizinkan), jadi memasang paket ini tidak mengubah apa pun`;
    } else if (mati) {
      teks =
        `tidak mengubah bahasa berkas mana pun: mode bahasa '${cm}' tidak bisa dimuat Zephyr ` +
        `(grammarnya bukan paket bahasa yang diizinkan), jadi akhiran ${bertitik(unik)} tidak didaftarkan; ` +
        `tetap bisa dipasang/dilepas`;
    } else if (unik.length === 0) {
      teks = cm
        ? `tidak mengklaim akhiran berkas - yang ditambahkan hanya mode bahasa '${cm}'`
        : 'tidak mengklaim akhiran berkas dan tidak menambah mode bahasa apa pun';
    } else if (ditambah.length === 0) {
      teks =
        `sudah didukung bawaan - ${bertitik(tidakEfek)} sudah dipegang ${pemilikBawaan.join(', ')} di Zephyr, ` +
        `jadi memasang paket ini tidak mengubah bahasa berkas mana pun; tetap bisa dipasang/dilepas`;
    } else if (tidakEfek.length > 0) {
      teks =
        `sudah didukung bawaan - ${pemilikBawaan.join(', ')} sudah ada di Zephyr; paket ini hanya menambah ` +
        `akhiran sisa ${bertitik(ditambah)}`;
    } else {
      teks =
        `menambah akhiran baru ${bertitik(ditambah)}${cm ? ` dengan mode bahasa '${cm}'` : ''}` +
        `${cm ? ' (mode hanya aktif kalau grammarnya bisa dimuat)' : ''}`;
    }

    keluar.push({
      label,
      ditambah,
      tidakEfek,
      pemilikBawaan,
      noEfek: mati || (unik.length > 0 && ditambah.length === 0),
      grammarBisaDimuat,
      teks,
    });
  }

  return keluar;
}

/** True kalau paket mengklaim bahasa tetapi tidak ada satu pun akhiran baru. */
export function bahasaTanpaEfek(contributes: unknown, cekGrammar?: CekGrammar): boolean {
  const n = catatanBahasaTerpasang(contributes, cekGrammar);
  return n.length > 0 && n.every((x) => x.noEfek);
}
