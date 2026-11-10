// Edge Function "usuarios": alta, contraseña y baja de usuarios.
// Usa la service role key (solo en el servidor).
//
// Deploy: supabase functions deploy usuarios
//   (o en Supabase → Edge Functions → usuarios → Code: pegar este archivo y Deploy)
//
// Quién puede:
//   * Administrador general (tabla superadmins): cualquier cuenta. Además crea cuentas.
//   * Administrador de una cuenta (Principal / PRO): solo usuarios de sus locales.
//
// POST { accion: 'crear', usuario, password, sucursal_id?, cuenta_id?, rol?, nombre? }
//      rol 'admin' (sin local) solo lo crea el administrador general
// POST { accion: 'crear_cuenta', cuenta, local, usuario, password, plan?, vence? }   (administrador general)
// POST { accion: 'password', user_id, password }
// POST { accion: 'eliminar', user_id }
//
// Los usuarios entran con "usuario" + contraseña. Por dentro,
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
const fechaValida = (f: unknown) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Quién llama
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: quien } = await admin.auth.getUser(jwt)
  if (!quien.user) return json({ error: 'Sesión inválida' }, 401)

  const { data: sa } = await admin.from('superadmins').select('user_id').eq('user_id', quien.user.id).maybeSingle()
  const esSuper = !!sa
  const { data: perfil } = await admin.from('perfiles').select('cuenta_id, rol').eq('user_id', quien.user.id).maybeSingle()
  if (!esSuper && (!perfil || perfil.rol !== 'admin')) return json({ error: 'Solo un administrador puede gestionar usuarios' }, 403)

  let body: Record<string, string>
  try { body = await req.json() } catch { return json({ error: 'Pedido inválido' }, 400) }

  // El usuario objetivo: de la misma cuenta, o de cualquiera si es el administrador general
  const perfilDe = async (userId: string) => {
    const { data } = await admin.from('perfiles').select('cuenta_id, rol').eq('user_id', userId).maybeSingle()
    return data && (esSuper || data.cuenta_id === perfil?.cuenta_id) ? data : null
  }

  // Crea el usuario de Auth; devuelve su id o un error listo para responder
  const crearAuth = async (usuario: string, password: string): Promise<string | Response> => {
    if (!usuarioValido(usuario)) return json({ error: 'El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.' }, 400)
    if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400)
    const { data: existe } = await admin.from('perfiles').select('user_id').eq('usuario', usuario).maybeSingle()
    if (existe) return json({ error: `El usuario "${usuario}" ya existe. Probá con otro nombre.` }, 409)
    const { data: creado, error } = await admin.auth.admin.createUser({ email: `${usuario}@${DOMINIO}`, password, email_confirm: true })
    if (error || !creado.user) {
      const msg = error?.message ?? 'No se pudo crear el usuario'
      return json({ error: msg.includes('already') ? `El usuario "${usuario}" ya existe. Probá con otro nombre.` : msg }, 400)
    }
    return creado.user.id
  }

  if (body.accion === 'crear_cuenta') {
    if (!esSuper) return json({ error: 'Solo el administrador de CloudTicket da de alta cuentas.' }, 403)
    const cuenta = (body.cuenta ?? '').trim()
    const local = (body.local ?? '').trim() || `${cuenta} Principal`
    const usuario = (body.usuario ?? '').trim().toLowerCase()
    const plan = body.plan === 'pro' ? 'pro' : 'principal'
    if (!cuenta) return json({ error: 'Poné el nombre de la cuenta.' }, 400)
    if (body.vence && !fechaValida(body.vence)) return json({ error: 'Fecha de vencimiento inválida.' }, 400)

    const id = await crearAuth(usuario, body.password ?? '')
    if (typeof id !== 'string') return id
    const deshacer = async (cuentaId?: string) => {
      if (cuentaId) await admin.from('cuentas').delete().eq('id', cuentaId)
      await admin.auth.admin.deleteUser(id)
    }
    const { data: c, error: e1 } = await admin.from('cuentas').insert({ nombre: cuenta, plan }).select('id').single()
    if (e1 || !c) { await deshacer(); return json({ error: e1?.message ?? 'No se pudo crear la cuenta' }, 400) }
    const { data: s, error: e2 } = await admin.from('sucursales')
      .insert({ cuenta_id: c.id, nombre: local, es_principal: true, vence: body.vence || null }).select('id').single()
    if (e2 || !s) { await deshacer(c.id); return json({ error: e2?.message ?? 'No se pudo crear el local' }, 400) }
    await admin.from('impresoras').insert({ sucursal_id: s.id, nombre: 'Cocina' })
    const { error: e3 } = await admin.from('perfiles').insert({ user_id: id, cuenta_id: c.id, rol: 'admin', usuario, nombre: body.nombre ?? null })
    if (e3) { await deshacer(c.id); return json({ error: e3.message }, 400) }
    return json({ ok: true, cuenta_id: c.id, user_id: id })
  }

  if (body.accion === 'crear') {
    const usuario = (body.usuario ?? '').trim().toLowerCase()
    const rol = body.rol === 'admin' ? 'admin' : 'local'
    let cuentaId: string
    let sucursalId: string | null = null
    if (rol === 'admin') {
      if (!esSuper) return json({ error: 'Solo el administrador de CloudTicket crea administradores.' }, 403)
      const { data: c } = await admin.from('cuentas').select('id').eq('id', body.cuenta_id).maybeSingle()
      if (!c) return json({ error: 'Cuenta no encontrada.' }, 400)
      cuentaId = c.id
    } else {
      const { data: suc } = await admin.from('sucursales').select('cuenta_id').eq('id', body.sucursal_id).maybeSingle()
      if (!suc || (!esSuper && suc.cuenta_id !== perfil?.cuenta_id)) return json({ error: 'Ese local no es de tu cuenta.' }, 400)
      cuentaId = suc.cuenta_id
      sucursalId = body.sucursal_id
    }
    const id = await crearAuth(usuario, body.password ?? '')
    if (typeof id !== 'string') return id
    const { error: e2 } = await admin.from('perfiles').insert({
      user_id: id, cuenta_id: cuentaId, rol, sucursal_id: sucursalId, usuario, nombre: body.nombre ?? null,
    })
    if (e2) { await admin.auth.admin.deleteUser(id); return json({ error: e2.message }, 400) }
    return json({ ok: true, user_id: id })
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
    if (body.user_id === quien.user.id) return json({ error: 'No podés borrar tu propio usuario.' }, 400)
    if (p.rol === 'admin' && !esSuper) return json({ error: 'No se puede borrar un administrador desde acá.' }, 400)
    const { error } = await admin.auth.admin.deleteUser(body.user_id)  // el perfil se borra en cascada
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Acción desconocida' }, 400)
})
