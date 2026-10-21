const fs = require("fs");
const P = "src/styles/agents-window.css";
let t = fs.readFileSync(P, "utf8");

const blok = `
/* ==========================================================================
   STARTING SCREEN + COMPOSER, jendela Agents.
   SEMUA aturan di-scope ke .ag-center: AiPanel dipakai bersama panel kanan
   jendela editor, dan itu tidak boleh ikut berubah.
   ==========================================================================

   Diukur pada 1.1.png (1917x1142, skala 1.25 => 1534x914 css):

     y 287-313   judul, 26px
     y 455-479   kotak 1: field ketik (24px)
     y 495-536   kotak 2: kontrol + baris Local (bg #1E1E1E, border #3F4046)
     y 576-605   kartu kategori, 4 sejajar, total 697px

   Urutannya: judul -> composer -> kartu. Kartu ada DI BAWAH composer.

   Cara mencapainya TANPA memindahkan JSX: saat .is-kosong, .ai-chat dan
   .ai-empty jadi display:contents sehingga judul / composer / kartu naik
   menjadi anak langsung .ai-panel dan bisa diurutkan dengan order.
   ========================================================================== */

/* Panel hitam, bukan biru. */
.ag-center .ai-panel {
  background: #171717;
}

/* ---- Layar kosong: satu grup di tengah -------------------------------- */

.ag-center .ai-panel.is-kosong {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.ag-center .ai-panel.is-kosong .ai-head,
.ag-center .ai-panel.is-kosong .ai-jump-wrap {
  display: none;
}

.ag-center .ai-panel.is-kosong .ai-chat,
.ag-center .ai-panel.is-kosong .ai-empty {
  display: contents;
}

.ag-center .ai-panel.is-kosong .ai-empty-judul {
  order: 1;
  width: 100%;
  max-width: 697px;
  margin: 0 auto 18px;
  padding: 0;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.25;
  color: #e5e5e5;
  text-align: center;
}

.ag-center .ai-panel.is-kosong .ai-input-row {
  order: 2;
}

.ag-center .ai-panel.is-kosong .ai-saran {
  order: 3;
}

/* ---- Composer: DUA kotak ---------------------------------------------- */

/* Kotak luar jadi pembungkus tanpa wujud: kotak 1 dan kotak 2 yang digambar. */
.ag-center .ai-input-row,
.ag-center .ai-input-row.ai-input-row {
  width: 100%;
  max-width: 697px;
  margin: 0 auto;
  padding: 0;
  gap: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

/* KOTAK 1: field ketik saja. 24px, radius 8, latar kanvas. */
.ag-center .ai-input-row .ai-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 24px;
  height: 24px;
  padding: 2px 12px;
  border: 1px solid #3f4046;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  overflow-y: auto;
}

.ag-center .ai-input-row .ai-input:focus {
  border-color: #5a5b63;
  box-shadow: none;
}

/* KOTAK 2: kontrol di atas, Local di bawah, satu kartu #1E1E1E. */
.ag-center .ai-input-row .ai-input-toolbar {
  margin: 8px 0 0;
  height: auto;
  min-height: 34px;
  box-sizing: border-box;
  padding: 3px 8px;
  gap: 4px;
  border: 1px solid #3f4046;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: #1e1e1e;
}

/* Tombol kontrol: 28px, radius 6. */
.ag-center .ai-input-row .ai-plus,
.ag-center .ai-input-row .ai-input-toolbar .mode-btn,
.ag-center .ai-input-row .ai-input-toolbar .ai-model-btn {
  height: 28px;
  border-radius: 6px;
}

.ag-center .ai-input-row .ai-plus {
  width: 28px;
}

.ag-center .ai-input-row .ai-input-toolbar .ai-round-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

/* Baris Local: penutup kotak 2. */
.ag-center .ai-local-row {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  height: 22px;
  padding: 0 8px 3px;
  border: 1px solid #3f4046;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: #1e1e1e;
  font-size: 12px;
  line-height: 1;
  color: #737373;
}

.ag-center .ai-local-label {
  flex-shrink: 0;
  color: #737373;
}

.ag-center .ai-local-pilih {
  max-width: 300px;
  padding: 1px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #a3a3a3;
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ag-center .ai-local-pilih:hover {
  background: rgba(229, 229, 229, 0.08);
  color: #e5e5e5;
}

/* ---- Kartu kategori: satu baris, di BAWAH composer -------------------- */

.ag-center .ai-saran {
  width: 100%;
  max-width: 697px;
  margin: 21px auto 0;
  padding: 0;
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 13px;
}

.ag-center .ai-saran-kartu {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 1 auto;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid #3f4046;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ag-center .ai-saran-kartu:hover {
  background: rgba(229, 229, 229, 0.06);
  border-color: #5a5b63;
}

.ag-center .ai-saran-ikon {
  flex-shrink: 0;
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: #a3a3a3;
}

.ag-center .ai-saran-teks {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ag-center .ai-saran-label {
  font-size: 12.5px;
  line-height: 1.3;
  color: #d4d4d4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ag-center .ai-saran-sub {
  display: none;
}

/* ---- Setelah ada chat: composer turun ke bawah ------------------------ */

.ag-center .ai-panel:not(.is-kosong) {
  display: flex;
  flex-direction: column;
}

.ag-center .ai-panel:not(.is-kosong) .ai-chat {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.ag-center .ai-panel:not(.is-kosong) .ai-input-row {
  flex: 0 0 auto;
  margin: 0 auto 14px;
}
`;

fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
console.log("blok bersih ditulis");
