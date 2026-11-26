// Empaqueta la Edge Function "pedidosya" en un solo archivo (para pegar en Supabase o desplegar con la CLI).
// Uso: npm run funcion:pedidosya   (baja esbuild con npx la primera vez)
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const salida = 'supabase/functions/pedidosya/index.ts'
execFileSync('npx', ['-y', 'esbuild@0.24.2', 'src/server/funcionPedidosYa.ts', '--bundle', '--format=esm', '--platform=neutral',
  '--target=es2022', '--external:@supabase/supabase-js', `--outfile=${salida}`, '--legal-comments=none', '--log-level=warning'], { stdio: 'inherit' })
const codigo = readFileSync(salida, 'utf8').replace(/from ["']@supabase\/supabase-js["']/g, 'from "npm:@supabase/supabase-js@2"')
writeFileSync(salida, `// Edge Function "pedidosya": importa en el servidor los pedidos de PedidosYa.
// ARCHIVO GENERADO desde src/server/ con \`npm run funcion:pedidosya\`: no editar a mano.
// Deploy: Supabase → Edge Functions → pedidosya → pegar este archivo → Deploy,
//         con "Verify JWT" desactivado (la llama la base, sin usuario).
${codigo}`)
console.log('Listo:', salida, (codigo.length / 1024).toFixed(0), 'KB')
