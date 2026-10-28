import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build:demo` genera un único index.html (modo demo, sin Supabase)
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  build: mode === 'demo' ? { outDir: 'dist-demo' } : undefined,
}))
