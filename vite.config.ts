import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
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
          // Paket bahasa (lang-*, parser lezer per-bahasa, legacy-modes)
          // SENGAJA tidak dipetakan supaya dynamic import di lib/lang.ts
          // pecah jadi chunk sendiri dan hanya diunduh saat dipakai.
          if (id.includes('@codemirror/lang-') || id.includes('legacy-modes')) return
          if (/@lezer[\\/](?!common|highlight|lr)/.test(id)) return
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
