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
  },
})
