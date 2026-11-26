// Fuente de la Edge Function "pedidosya" (se empaqueta en supabase/functions/pedidosya/index.ts
// con `npm run funcion:pedidosya`). La llama la base cuando llega un ticket de PedidosYa y
// cuando se abre una caja. No hace falta usuario: solo importa pedidos que ya están pendientes.
import { createClient } from '@supabase/supabase-js'
import { importarPendientes } from './importarPedidosYa'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void }

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('ok')
  let body: { id?: string; sucursal_id?: string } = {}
  try { body = await req.json() } catch { /* sin cuerpo */ }
  const uuid = /^[0-9a-f-]{36}$/i
  const id = body.id && uuid.test(body.id) ? body.id : undefined
  const sucursalId = body.sucursal_id && uuid.test(body.sucursal_id) ? body.sucursal_id : undefined
  if (!id && !sucursalId) return Response.json({ error: 'Falta id o sucursal_id' }, { status: 400 })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  try {
    const resultados = await importarPendientes(sb, { id, sucursalId })
    return Response.json({ resultados })
  } catch (e) {
    console.error(e)
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
})
