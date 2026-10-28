// Edge Function "usuarios": el admin de una cuenta crea, edita y borra
// los usuarios de sus locales. Usa la service role key (solo en el servidor).
//
// Deploy: supabase functions deploy usuarios
//
// POST { accion: 'crear', usuario, password, sucursal_id, nombre? }
// POST { accion: 'password', user_id, password }
// POST { accion: 'eliminar', user_id }
//
// Los usuarios de local entran con "usuario" + contraseña. Por dentro,
// Supabase Auth necesita un email: se usa <usuario>@comandas.local.

import { createClient } from 'npm:@supabase/supabase-js@2'

const DOMINIO = 'comandas.local'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const usuarioValido = (u: string) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Quién llama
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: quien } = await admin.auth.getUser(jwt)
  if (!quien.user) return json({ error: 'Sesión inválida' }, 401)

  const { data: perfil } = await admin.from('perfiles').select('cuenta_id, rol').eq('user_id', quien.user.id).single()
  if (!perfil || perfil.rol !== 'admin') return json({ error: 'Solo un administrador puede gestionar usuarios' }, 403)

  let body: Record<string, string>
  try { body = await req.json() } catch { return json({ error: 'Pedido inválido' }, 400) }

  // El usuario objetivo tiene que ser de la misma cuenta
  const perfilDe = async (userId: string) => {
    const { data } = await admin.from('perfiles').select('cuenta_id, rol').eq('user_id', userId).single()
    return data && data.cuenta_id === perfil.cuenta_id ? data : null
  }

  if (body.accion === 'crear') {
    const usuario = (body.usuario ?? '').trim().toLowerCase()
    const password = body.password ?? ''
    if (!usuarioValido(usuario)) return json({ error: 'El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.' }, 400)
    if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400)

    const { data: suc } = await admin.from('sucursales').select('cuenta_id').eq('id', body.sucursal_id).single()
    if (!suc || suc.cuenta_id !== perfil.cuenta_id) return json({ error: 'Ese local no es de tu cuenta.' }, 400)

    const { data: existe } = await admin.from('perfiles').select('user_id').eq('usuario', usuario).maybeSingle()
    if (existe) return json({ error: `El usuario "${usuario}" ya existe. Probá con otro nombre.` }, 409)

    const { data: creado, error } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`, password, email_confirm: true,
    })
    if (error || !creado.user) return json({ error: error?.message ?? 'No se pudo crear el usuario' }, 400)

    const { error: e2 } = await admin.from('perfiles').insert({
      user_id: creado.user.id, cuenta_id: perfil.cuenta_id, rol: 'local',
      sucursal_id: body.sucursal_id, usuario, nombre: body.nombre ?? null,
    })
    if (e2) { await admin.auth.admin.deleteUser(creado.user.id); return json({ error: e2.message }, 400) }
    return json({ ok: true, user_id: creado.user.id })
  }

  if (body.accion === 'password') {
    if ((body.password ?? '').length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400)
    if (!await perfilDe(body.user_id)) return json({ error: 'Ese usuario no es de tu cuenta.' }, 404)
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (body.accion === 'eliminar') {
    const p = await perfilDe(body.user_id)
    if (!p) return json({ error: 'Ese usuario no es de tu cuenta.' }, 404)
    if (p.rol === 'admin') return json({ error: 'No se puede borrar un administrador desde acá.' }, 400)
    const { error } = await admin.auth.admin.deleteUser(body.user_id)  // el perfil se borra en cascada
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Acción desconocida' }, 400)
})
