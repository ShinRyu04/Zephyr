import ExtMarketplace from '../extensions/ExtMarketplace';
/* Gaya `.xmkt`/`.xmg` milik Marketplace tidak dimuat jendela ini secara
   otomatis: `ext-marketplace.css` diimpor `App.tsx`, dan jendela Agents adalah
   entry point lain. Tanpa impor di sini halaman tampil tanpa tab, baris, atau
   penghitung. */
import '../../styles/ext-marketplace.css';
/*
 * Marketplace di jendela Agents.
 *
 * Halaman ini memakai komponen yang SAMA dengan Marketplace jendela utama
 * (`components/extensions/ExtMarketplace.tsx`) — delapan tab, pencarian, chip
 * kategori, status terpasang, dan tombol install semuanya membaca store yang
 * sama. Menyalinnya ke sini berarti dua daftar yang akan berbeda isinya begitu
 * salah satunya diperbaiki, dan dua tempat yang memasang barang dengan cara
 * berbeda.
 *
 * Bedanya cuma dua, dan keduanya soal bingkai:
 *
 *   1. `manageSebagaiHalaman` — `Manage` membuka halaman penuh di kanvas
 *      (Plugins · Skills · MCP · Extensions, lengkap dengan penghitung dan
 *      sakelar), bukan modal kecil seperti di jendela utama. Jendela ini
 *      selebar tiga kolom; modal di tengahnya hanya memakai sepertiga layar.
 *   2. `.agx-mkt` di agents2.css memberi padding kanvas dan lebar grid, dan
 *      di-scope ke kelas itu supaya Marketplace jendela utama tidak ikut
 *      bergeser.
 *
 * Dibuka seperti Automation — satu halaman penuh di kanvas, bukan pop-up —
 * karena Marketplace adalah tempat berpindah tab dan membaca.
 */
export default function AgentsMarketplace() {
  return (
    <div className="agx-mkt" data-testid="agx-marketplace-page">
      <ExtMarketplace
        manageSebagaiHalaman
        /* Hanya yang bisa dipakai AGEN. Themes, Icon Themes, Keymaps,
           Languages dan Snippets mengubah tampilan editor di jendela utama —
           tidak ada editornya di sini, jadi tab itu hanya akan jadi halaman
           yang tidak berefek. */
        tabTampil={['plugins', 'skills', 'mcp']}
      />
    </div>
  );
}
