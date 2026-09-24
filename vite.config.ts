import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
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
    rollupOptions: {
      output: {
        // Pisahkan vendor besar agar tidak ada chunk > 500kB dan
        // parse awal lebih ringan (target startup < 3 detik).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // @codemirror/language, state, view dan lezer core WAJIB satu chunk
          // dengan paket bahasa (lang-*, legacy-modes).
          //
          // Sebelumnya paket bahasa dikembalikan `undefined` supaya pecah jadi
          // chunk sendiri, sementara @codemirror/* masuk chunk 'codemirror'.
          // Rollup lalu membundel salinan @codemirror/language KEDUA di dalam
          // chunk bahasa (build output membuktikan: dua "class Language" di
          // satu file). Dua instance berarti dua facet id, jadi LanguageSupport
          // dari lang-javascript tidak dikenal state view: syntax tree selalu
          // kosong dan editor tidak mewarnai satu token pun.
          //
          // Aturan di bawah mengelompokkan SEMUA paket CodeMirror + lezer jadi
          // satu chunk, jadi hanya ada satu instance per modul. Paket bahasa
          // tetap terpisah per bahasa supaya tetap diunduh saat dipakai saja.
          if (id.includes('@codemirror/lang-') || id.includes('legacy-modes')) {
            const m = id.match(/lang-([a-z0-9]+)|legacy-modes[\\/]mode[\\/]([a-z0-9]+)/)
            return `cm-lang-${(m?.[1] ?? m?.[2] ?? 'misc')}`
          }
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror'
          if (id.includes('react-markdown') || id.includes('remark') || id.includes('micromark')) {
            return 'markdown'
          }
          if (id.includes('xterm')) return 'xterm'
          return 'vendor'
        },
      },
    },
  },
})
