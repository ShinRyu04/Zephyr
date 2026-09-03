// pathKey.ts — satu-satunya definisi "dua path ini file yang sama".
//
// KENAPA ADA FILE SENDIRI:
// Path file di Zephyr datang dari tiga sumber dengan bentuk BERBEDA untuk file
// yang sama:
//   1. Rust/fs & Explorer  → `D:\Zephyr\src\a.ts`   (backslash, drive besar)
//   2. openWorkspace/harness → `D:/Zephyr/src/a.ts`  (forward slash)
//   3. Language server       → `file:///d%3A/Zephyr/src/a.ts` → `d:\Zephyr\src\a.ts`
//      (tsserver menormalkan drive-nya jadi HURUF KECIL)
//
// Membandingkan dengan `===` membuat file yang sama dianggap tiga file berbeda.
// Bug yang sudah terbukti karenanya (fase 21): mengklik baris di panel Problems
// membuka TAB DUPLIKAT — satu tab `D:/…` hasil klik Explorer, satu lagi
// `d:\…` hasil klik diagnostik.
//
// Modul ini sengaja TIDAK ada di problemsStore/store supaya tidak ada arah
// import yang melingkar: store.ts, problemsStore.ts, dan komponen sama-sama
// boleh mengimpornya.
//
// Windows tidak peka besar-kecil huruf, jadi kunci di-lowercase. Ini KUNCI
// PERBANDINGAN saja — untuk ditampilkan atau dikirim ke Rust, selalu pakai
// path aslinya, jangan hasil fungsi ini.

/** Kunci kanonik sebuah path untuk perbandingan & kunci Map. */
export const kunciPath = (p: string) => p.replace(/\//g, '\\').toLowerCase();

/** `true` bila dua path menunjuk file yang sama walau bentuknya beda. */
export const pathSama = (a: string, b: string) => kunciPath(a) === kunciPath(b);
