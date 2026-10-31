import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// El programa de impresión de Windows baja de la web la URL de Supabase y la anon key
// (las dos son públicas, ya están en el JS de la web) desde /spool-config.json
function spoolConfig(env: Record<string, string>): Plugin {
  return {
    name: 'spool-config',
    generateBundle() {
      if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return
      this.emitFile({
        type: 'asset', fileName: 'spool-config.json',
        source: JSON.stringify({ supabaseUrl: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }),
      })
    },
  }
}

// `npm run build:demo` genera un único index.html (modo demo, sin Supabase)
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), spoolConfig(loadEnv(mode, process.cwd(), 'VITE_')), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  build: mode === 'demo' ? { outDir: 'dist-demo' } : undefined,
}))
