import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
    /*
     * HMR can be switched off for a session:  $env:ZEPHYR_NO_HMR='1'; npm run dev
     *
     * Why it is needed at all: every save under `src/**` makes Vite push an
     * update, the page re-evaluates, and every handle stored on `window`
     * (`__ZEPHYR__`, `__ZEPHYR_AI__`, …) is replaced. A CDP harness that
     * attached a moment earlier is left holding a dead object, so it reports
     * nonsense - or, worse, reads a half-updated page and reports a bug that
     * does not exist. That is a verification-tooling problem, not an app
     * problem, so the switch belongs here and stays OFF by default.
     *
     * `hmr: false` (not `watch: null`) is the right knob: the watcher keeps
     * running, so a manual reload still serves the new code - it simply stops
     * pushing updates into the open page.
     */
    hmr: process.env.ZEPHYR_NO_HMR ? false : undefined,
    watch: {
      // Vite menonton seluruh akar proyek; kalau `src-tauri` ikut, ia mencoba
      // `fs.watch` setiap berkas di dalam `target/debug/build/**` - termasuk
      // objek `.o` yang sedang dipegang linker Rust. Windows mengunci berkas
      // itu, `fs.watch` mengembalikan EBUSY, dan proses dev server MATI tepat
      // saat kode Rust sedang dikompilasi (persis saat paling dibutuhkan).
      // Aset frontend tidak pernah tinggal di sana, jadi dikecualikan.
      ignored: [
        '**/src-tauri/**',
        '**/target/**',
        '**/Referensi TRAE Agent Window/**',
        '**/testing zephyr/**',
      ],
    },
  },
  // Satu instance per paket CodeMirror.
  //
  // @codemirror/language mengekspor facet, dan facet dikenali dari identitas
  // objeknya. Kalau Vite menyajikan dua salinan modul itu (satu lewat
  // node_modules, satu lagi di dalam chunk paket bahasa), LanguageSupport dari
  // paket bahasa tidak dikenal state view: syntax tree selalu kosong dan editor
  // tidak mewarnai satu token pun. Dedupe memaksa satu salinan.
  resolve: {
    dedupe: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@lezer/common',
      '@lezer/highlight',
      '@lezer/lr',
    ],
  },
  optimizeDeps: {
    // Paket bahasa ikut di-pre-bundle bersama inti CodeMirror, jadi keduanya
    // memakai instance modul yang sama di dev.
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/lang-javascript',
      '@codemirror/lang-json',
      '@codemirror/lang-html',
      '@codemirror/lang-css',
      '@codemirror/lang-markdown',
      '@codemirror/lang-python',
      '@codemirror/lang-rust',
      '@codemirror/lang-go',
      '@codemirror/lang-sql',
      '@codemirror/lang-yaml',
      '@codemirror/lang-xml',
      '@codemirror/lang-java',
      '@codemirror/lang-cpp',
    ],
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
