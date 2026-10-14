/**
 * Satu-satunya definisi awalan nama tool.
 *
 * Dulu dua berkas mendefinisikan pola ini sendiri-sendiri - `catalog.ts` dan
 * `deskripsiTool.ts` - dengan isi yang identik. Setiap kali daftar awalan
 * berubah, dua tempat harus diubah bersamaan, dan yang terlupa tidak
 * menimbulkan error: hasilnya cuma nama tool yang tampil mentah di satu panel
 * sementara panel lain bersih. Itu sudah pernah terjadi.
 *
 * Berkas ini SENGAJA tidak mengimpor apa pun. `catalog.ts` mengimpor
 * `deskripsiTool.ts`, jadi `deskripsiTool.ts` tidak boleh mengimpor balik ke
 * `catalog.ts`; satu berkas daun yang tidak bergantung pada apa pun memutus
 * lingkaran itu.
 */

/**
 * Awalan internal tool MCP - konvensi protokol, bukan bagian dari nama yang
 * dibaca siapa pun. Dispatcher dan prompt model bergantung padanya, jadi tool
 * MCP tetap menyusun namanya dengan awalan ini; yang dilepas hanya di lapisan
 * tampilan (lihat `namaPolos` di `labelAksi.ts`).
 */
export const AWALAN_MCP = 'mcp__zephyr__';

/**
 * Pola pelepasan awalan nama tool MCP.
 *
 * Satu-satunya awalan yang sah adalah `mcp__zephyr__` (sama dengan
 * `AWALAN_MCP` di atas). Pola ini dipakai di dua tempat: pembacaan (nama dari
 * giliran tersimpan tetap dipetakan ke tool yang sama) dan tampilan (awalan
 * dilepas sebelum dibaca user).
 */
export const POLA_AWALAN_MCP = /^mcp__zephyr__/;
