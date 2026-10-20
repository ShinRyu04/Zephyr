/**
 * Placeholder sementara untuk jendela Agents.
 *
 * Seluruh isi jendela ini sudah dibongkar (dihapus) dan akan ditulis ulang dari
 * nol. File ini hanya menjaga satu hal: `AgentsWindow.tsx` meng-import modul ini
 * secara lazy, dan Vite menolak mentransformasi file dengan import yang tidak
 * bisa di-resolve. Karena `AgentsWindow` diimpor statis dari entry point, import
 * yang gagal itu ikut mematikan main window — layar berhenti di
 * "ZEPHYR Menyiapkan editor…".
 *
 * Jadi jangan hapus file ini selama isi jendela Agents belum ditulis ulang.
 */
export default function AgentsApp() {
  return (
    <div
      className="agents-window-root"
      data-testid="agents-placeholder"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '24px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        textAlign: 'center',
      }}
    >
      Jendela Agents sedang dibangun ulang.
    </div>
  );
}
