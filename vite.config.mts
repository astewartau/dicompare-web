import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from different paths: '/' on Vercel,
// '/dicompare-web/' on GitHub Pages. Set VITE_BASE at build time for a subpath.
const base = process.env.VITE_BASE || '/'

// index.html has <base href="/"> so relative URLs resolve from the site root on
// deep routes; Vite doesn't rewrite it, so point it at the configured base.
function baseHrefPlugin() {
  return {
    name: 'base-href',
    transformIndexHtml(html: string) {
      return html.replace('<base href="/" />', `<base href="${base}" />`)
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [react(), baseHrefPlugin()],
  server: {
    port: 3001,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@niivue/dcm2niix'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
