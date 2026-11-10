import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { unirReceta, errorIngredienteEnUso } from '../lib/menu'
import type { Repo, NuevoPrintJob, BusquedaCliente, EstadoSesion, MenuData } from './repo'
import type {
  AjusteLocal, Caja, Categoria, Cliente, Comanda, Impresora, Ingrediente, ItemComanda, NuevaComanda,
  Cupon, UsoCupon, MapeoExterno, PedidoExterno, IngresoMercaderia, MovimientoCaja, MovimientoReporte, Pago, PrintJob, StockItem, StockMovimiento, Producto, Repartidor, TipoGasto, Sucursal, Usuario, Zona, PedidoFabrica, SaCuenta } from '../types'
import { PREFIJO_PRODUCTO, productoDePlanilla } from './repo'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

/** Los usuarios de local entran con "usuario"; por dentro Supabase usa este email */
export const DOMINIO_USUARIOS = 'comandas.local'
export const emailDeUsuario = (u: string) => (u.includes('@') ? u.trim().toLowerCase() : `${u.trim().toLowerCase()}@${DOMINIO_USUARIOS}`)

const num = (v: unknown) => (v == null ? 0 : Number(v))
const numOpt = (v: unknown) => (v == null ? undefined : Number(v))
const opt = <T,>(v: T | null | undefined) => (v == null ? undefined : v)

const mapCaja = (r: Row): Caja => ({
  id: r.id, turno: r.turno, estado: r.estado, abiertaAt: r.abierta_at, cerradaAt: opt(r.cerrada_at),
  dineroInicial: num(r.dinero_inicial), abiertaPor: opt(r.abierta_por_usuario), cerradaPor: opt(r.cerrada_por_usuario),
  observaciones: opt(r.observaciones), dineroCierre: numOpt(r.dinero_cierre), diferencia: numOpt(r.diferencia),
  totales: r.estado === 'cerrada' && r.efectivo_teorico != null ? {
    cantComandas: r.cant_comandas ?? 0, cantAnuladas: r.cant_anuladas ?? 0, totalVentas: num(r.total_ventas),
    ventasEfectivo: num(r.ventas_efectivo), totalIngresos: num(r.total_ingresos), totalGastos: num(r.total_gastos),
    totalEgresos: num(r.total_egresos), totalSueldos: num(r.total_sueldos), efectivoTeorico: num(r.efectivo_teorico),
  } : undefined,
})
const mapSucursal = (r: Row): Sucursal => ({
  id: r.id, nombre: r.nombre, esPrincipal: r.es_principal, activa: r.activa,
  recargoDelivery: num(r.recargo_delivery), recargoDeliveryTipo: r.recargo_delivery_tipo ?? 'monto',
  cocinaActiva: !!r.cocina_activa, cocinaAmarillo: r.cocina_amarillo ?? 7, cocinaRojo: r.cocina_rojo ?? 15,
  vence: opt(r.vence),
  // Sin la migración 0020 no hay plan por local: se toma como PRO
  plan: r.plan === 'principal' ? 'principal' : 'pro',
})
const mapCupon = (c: Row): Cupon => ({
  id: c.id, codigo: c.codigo, descripcion: opt(c.descripcion), tipo: c.tipo, valor: num(c.valor),
  desde: opt(c.desde), hasta: opt(c.hasta), activo: c.activo, maxUsos: opt(c.max_usos), lote: opt(c.lote),
})
const mapZona = (z: Row): Zona => ({ id: z.id, nombre: z.nombre, costo: num(z.costo) })
const mapIngrediente = (r: Row): Ingrediente => ({ id: r.id, nombre: r.nombre, unidad: r.unidad, costo: num(r.costo), activo: r.activo })
const mapCategoria = (c: Row): Categoria => ({
  id: c.id, nombre: c.nombre, orden: c.orden, color: c.color, activa: c.activa, sucursalId: opt(c.sucursal_id),
})
const mapRepartidor = (r: Row): Repartidor => ({
  id: r.id, nombre: r.nombre, dni: opt(r.dni), telefono: opt(r.telefono), activo: r.activo,
})
const mapCliente = (c: Row): Cliente => ({
  id: c.id, nombre: c.nombre, telefono: opt(c.telefono), direccion: opt(c.direccion),
  entreCalles: opt(c.entre_calles), zonaId: opt(c.zona_id),
})

function mapProducto(p: Row): Producto {
  return {
    id: p.id,
    categoriaId: p.categoria_id,
    sucursalId: opt(p.sucursal_id),
    tipo: p.tipo,
    codigo: opt(p.codigo),
    nombre: p.nombre,
    descripcion: opt(p.descripcion),
    precio: num(p.precio),
    precioMitad: numOpt(p.precio_mitad),
    admiteCoccion: p.admite_coccion,
    incluyeEnvio: p.incluye_envio,
    orden: p.orden,
    activo: p.activo,
    receta: (p.recetas ?? []).map((r: Row) => ({ ingredienteId: r.ingrediente_id, cantidad: num(r.cantidad) })),
    fijos: (p.promo_fijos ?? []).map((f: Row) => ({ productoId: f.producto_id, cantidad: f.cantidad, variante: f.variante })),
    slots: (p.promo_slots ?? [])
      .sort((a: Row, b: Row) => a.orden - b.orden)
      .map((s: Row) => ({ id: s.id, nombre: s.nombre, categoriaId: s.categoria_id, cantidad: s.cantidad })),
  }
}

function mapComanda(r: Row): Comanda {
  return {
    id: r.id, cajaId: r.caja_id, numero: r.numero, tipo: r.tipo, estado: r.estado,
    clienteId: opt(r.cliente_id), clienteNombre: opt(r.cliente_nombre), clienteTel: opt(r.cliente_tel),
    direccion: opt(r.direccion), entreCalles: opt(r.entre_calles), zonaId: opt(r.zona_id),
    costoEnvio: num(r.costo_envio), subtotal: num(r.subtotal), descuento: num(r.descuento),
    adicional: num(r.adicional), total: num(r.total), observaciones: opt(r.observaciones),
    cuponId: opt(r.cupon_id), cuponCodigo: opt(r.cupon_codigo), descuentoCupon: num(r.descuento_cupon),
    canal: r.canal ?? 'propio', externoId: opt(r.externo_id),
    horaEntrega: opt(r.hora_entrega), cobrada: r.cobrada, createdAt: r.created_at, updatedAt: r.updated_at,
    repartidorId: opt(r.repartidor_id), repartidorNombre: opt(r.repartidores?.nombre),
    asignadaAt: opt(r.asignada_at), entregadaAt: opt(r.entregada_at), sucursalId: opt(r.sucursal_id),
    cocinaAt: opt(r.cocina_at), listoAt: opt(r.listo_at),
    pagos: (r.pagos ?? []).map((p: Row) => ({ forma: p.forma, monto: num(p.monto) })),
    items: (r.comanda_items ?? [])
      .sort((a: Row, b: Row) => a.orden - b.orden)
      .map((i: Row): ItemComanda => ({
        id: i.id, productoId: opt(i.producto_id), descripcion: i.descripcion, variante: opt(i.variante),
        coccion: opt(i.coccion), cantidad: num(i.cantidad), precioUnit: num(i.precio_unit),
        nota: opt(i.nota), componentes: i.componentes ?? [],
      })),
  }
}

const comandaRow = (d: NuevaComanda) => ({
  tipo: d.tipo, cliente_id: d.clienteId ?? null, cliente_nombre: d.clienteNombre ?? null,
  cliente_tel: d.clienteTel ?? null, direccion: d.direccion ?? null, entre_calles: d.entreCalles ?? null,
  zona_id: d.zonaId ?? null, costo_envio: d.costoEnvio, subtotal: d.subtotal, descuento: d.descuento,
  adicional: d.adicional, total: d.total, observaciones: d.observaciones ?? null,
  hora_entrega: d.horaEntrega ?? null, cobrada: d.cobrada,
  cupon_id: d.cuponId ?? null, descuento_cupon: d.descuentoCupon || 0,
})

const SELECT_COMANDA = '*, comanda_items(*), pagos(*), repartidores(nombre)'
const SELECT_PRODUCTO = '*, recetas(*), promo_fijos!promo_fijos_promo_id_fkey(*), promo_slots(*)'

export function crearSupabaseRepo(url: string, anonKey: string, opciones?: { headers?: Record<string, string>; storageKey?: string }): Repo & { client: SupabaseClient } {
  // storageKey: la app del celular guarda una sesión aparte por cada cuenta
  const sb = createClient(url, anonKey, {
    ...(opciones?.headers ? { global: { headers: opciones.headers } } : {}),
    ...(opciones?.storageKey ? { auth: { storageKey: opciones.storageKey } } : {}),
  })

  const ok = <T,>(res: { data: T; error: unknown }): T => {
    if (res.error) throw traducirError(res.error)
    return res.data
  }

  let perfilCache: Row | null = null
  async function perfil() {
    if (perfilCache) return perfilCache
    const { data: u } = await sb.auth.getUser()
    if (!u.user) return null
    let r = await sb.from('perfiles').select('*, cuentas(nombre, plan)').eq('user_id', u.user.id).maybeSingle()
    // Base sin la migración 0019 (no existe cuentas.plan): se entra igual, como PRO
    if (r.error) r = await sb.from('perfiles').select('*, cuentas(nombre)').eq('user_id', u.user.id).maybeSingle()
    perfilCache = ok(r) as Row | null
    return perfilCache
  }

  /** Trae todas las filas de a 1000 (límite de Supabase por consulta) */
  async function todas<T = Row>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
    const out: T[] = []
    for (let i = 0; ; i += 1000) {
      const r = ok(await armar(i, i + 999)) as T[]
      out.push(...r)
      if (r.length < 1000 || out.length >= 50000) return out
    }
  }

  async function getComanda(id: string) {
    return mapComanda(ok(await sb.from('comandas').select(SELECT_COMANDA).eq('id', id).single()) as Row)
  }

  async function reemplazarDetalle(comandaId: string, d: NuevaComanda) {
    ok(await sb.from('comanda_items').delete().eq('comanda_id', comandaId))
    ok(await sb.from('pagos').delete().eq('comanda_id', comandaId))
    if (d.items.length) ok(await sb.from('comanda_items').insert(d.items.map((i, orden) => ({
      comanda_id: comandaId, producto_id: i.productoId ?? null, descripcion: i.descripcion,
      variante: i.variante ?? null, coccion: i.coccion ?? null, cantidad: i.cantidad, precio_unit: i.precioUnit,
      subtotal: i.precioUnit * i.cantidad, nota: i.nota ?? null, componentes: i.componentes, orden,
    }))))
    if (d.pagos.length) ok(await sb.from('pagos').insert(d.pagos.map(p => ({ comanda_id: comandaId, forma: p.forma, monto: p.monto }))))
  }

  async function invocarUsuarios(body: Record<string, unknown>) {
    const { data, error } = await sb.functions.invoke('usuarios', { body })
    if (error) {
      // El mensaje útil viene en el cuerpo de la respuesta
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json().catch(() => null)
        if (j?.error) throw new Error(j.error)
      }
      throw new Error('No se pudo contactar al servidor de usuarios. ¿Está desplegada la función "usuarios"?')
    }
    if (data?.error) throw new Error(data.error)
    return data
  }

  const repo: Repo & { client: SupabaseClient } = {
    modo: 'supabase',
    client: sb,

    // ---- Sesión
    async estadoSesion(): Promise<EstadoSesion> {
      const { data } = await sb.auth.getSession()
      if (!data.session) return { estado: 'sin_login' }
      perfilCache = null
      // El administrador general no tiene cuenta propia: ve todas
      // Si la función no existe todavía (falta la 0019), sigue como usuario normal
      const sa = await sb.rpc('es_superadmin').then(x => x, () => ({ data: false }))
      if (sa.data === true) return { estado: 'superadmin', usuario: data.session.user.email ?? '' }
      const p = await perfil()
      if (!p) return { estado: 'sin_cuenta', email: data.session.user.email ?? '' }
      return {
        estado: 'ok',
        sesion: {
          userId: p.user_id, usuario: p.usuario, rol: p.rol, cuentaId: p.cuenta_id,
          cuentaNombre: p.cuentas?.nombre ?? '', plan: p.cuentas?.plan === 'principal' ? 'principal' : 'pro', sucursalId: opt(p.sucursal_id),
          puedeDescontar: p.rol === 'admin' || !!p.puede_descontar,
          esProduccion: p.rol !== 'admin' && !!p.es_produccion,
        },
      }
    },

    async login(usuario, password) {
      perfilCache = null
      const { error } = await sb.auth.signInWithPassword({ email: emailDeUsuario(usuario), password })
      if (error) throw new Error(error.message.includes('confirm') ? 'Falta confirmar el email: revisá tu casilla.' : 'Usuario o contraseña incorrectos')
    },

    async logout() { perfilCache = null; await sb.auth.signOut() },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => { perfilCache = null; cb() })
      return () => data.subscription.unsubscribe()
    },

    // ---- Locales y usuarios
    async listSucursales() {
      return (ok(await sb.from('sucursales').select('*').order('es_principal', { ascending: false }).order('created_at')) as Row[]).map(mapSucursal)
    },
    async configCocina(sucursalId, c) {
      ok(await sb.rpc('config_cocina', { p_sucursal: sucursalId, p_activa: c.activa, p_amarillo: c.amarillo, p_rojo: c.rojo }))
    },
    async horaServidor() {
      return ok(await sb.rpc('hora_servidor')) as unknown as string
    },
    async actualizarSucursal(id, data) {
      const row: Row = {}
      if (data.nombre !== undefined) row.nombre = data.nombre
      if (data.activa !== undefined) row.activa = data.activa
      if (data.recargoDelivery !== undefined) row.recargo_delivery = data.recargoDelivery
      if (data.recargoDeliveryTipo !== undefined) row.recargo_delivery_tipo = data.recargoDeliveryTipo
      ok(await sb.from('sucursales').update(row).eq('id', id))
    },

    // ---- Cupones
    async listCupones() {
      return (await todas(async (a, b) => sb.from('cupones').select('*').order('created_at', { ascending: false }).order('codigo').range(a, b))).map(mapCupon)
    },
    async guardarCupon(c) {
      const p = await perfil()
      const row = {
        cuenta_id: p?.cuenta_id, codigo: c.codigo, descripcion: c.descripcion || null, tipo: c.tipo, valor: c.valor,
        desde: c.desde || null, hasta: c.hasta || null, activo: c.activo,
        max_usos: c.maxUsos || null, lote: c.lote || null,
      }
      if (c.id) ok(await sb.from('cupones').update(row).eq('id', c.id))
      else ok(await sb.from('cupones').insert(row))
    },
    async eliminarCupon(id) {
      ok(await sb.from('cupones').delete().eq('id', id))
    },
    async crearCupones(lista) {
      const p = await perfil()
      const filas = lista.map(c => ({
        cuenta_id: p?.cuenta_id, codigo: c.codigo, descripcion: c.descripcion || null, tipo: c.tipo, valor: c.valor,
        desde: c.desde || null, hasta: c.hasta || null, activo: c.activo, max_usos: c.maxUsos || null, lote: c.lote || null,
      }))
      for (let i = 0; i < filas.length; i += 500) ok(await sb.from('cupones').insert(filas.slice(i, i + 500)))
      return filas.length
    },
    async eliminarCupones(ids) {
      for (let i = 0; i < ids.length; i += 200) ok(await sb.from('cupones').delete().in('id', ids.slice(i, i + 200)))
    },
    async activarCupones(ids, activo) {
      for (let i = 0; i < ids.length; i += 200) ok(await sb.from('cupones').update({ activo }).in('id', ids.slice(i, i + 200)))
    },
    async usoCupones() {
      const filas = await todas(async (a, b) => sb.from('comandas').select('cupon_id, descuento_cupon')
        .not('cupon_id', 'is', null).neq('estado', 'anulada').range(a, b))
      const out: Record<string, UsoCupon> = {}
      for (const f of filas) {
        const u = (out[f.cupon_id] ??= { usos: 0, descontado: 0 })
        u.usos++; u.descontado += num(f.descuento_cupon)
      }
      return out
    },
    async validarCupon(codigo) {
      const r = ok(await sb.rpc('validar_cupon', { p_codigo: codigo })) as Row[]
      const c = r?.[0]
      if (!c) throw new Error('Cupón inválido')
      return { id: c.id, codigo: c.codigo, descripcion: opt(c.descripcion), tipo: c.tipo, valor: num(c.valor) }
    },
    async listUsuarios() {
      return (ok(await sb.from('perfiles').select('*').order('created_at')) as Row[]).map((p): Usuario => ({
        userId: p.user_id, usuario: p.usuario, rol: p.rol, sucursalId: opt(p.sucursal_id), nombre: opt(p.nombre),
        puedeDescontar: !!p.puede_descontar, esProduccion: !!p.es_produccion,
      }))
    },
    async crearUsuario(d) {
      const r = await invocarUsuarios({ accion: 'crear', usuario: d.usuario, password: d.password, sucursal_id: d.sucursalId, nombre: d.nombre })
      const tipo = d.tipo ?? (d.puedeDescontar ? 'encargado' : 'comun')
      if (tipo !== 'comun' && r?.user_id) ok(await sb.rpc('set_tipo_usuario', { p_user: r.user_id, p_tipo: tipo }))
    },
    async setPuedeDescontar(userId, valor) {
      ok(await sb.rpc('set_puede_descontar', { p_user: userId, p_valor: valor }))
    },
    async setTipoUsuario(userId, tipo) {
      ok(await sb.rpc('set_tipo_usuario', { p_user: userId, p_tipo: tipo }))
    },
    async cambiarPassword(userId, password) { await invocarUsuarios({ accion: 'password', user_id: userId, password }) },
    async eliminarUsuario(userId) { await invocarUsuarios({ accion: 'eliminar', user_id: userId }) },

    // ---- Administrador general
    async saResumen() {
      const r = (ok(await sb.rpc('sa_resumen')) ?? []) as Row[]
      return r.map((c): SaCuenta => ({
        id: c.id, nombre: c.nombre, plan: c.plan, createdAt: c.created_at,
        locales: (c.locales ?? []).map((s: Row) => ({ id: s.id, nombre: s.nombre, vence: opt(s.vence), plan: s.plan ?? c.plan, activa: s.activa, esPrincipal: s.es_principal, createdAt: s.created_at })),
        usuarios: (c.usuarios ?? []).map((p: Row): Usuario => ({
          userId: p.user_id, usuario: p.usuario, rol: p.rol, sucursalId: opt(p.sucursal_id), nombre: opt(p.nombre),
          puedeDescontar: !!p.puede_descontar, esProduccion: !!p.es_produccion,
        })),
      }))
    },
    async saCrearCuenta(d) {
      await invocarUsuarios({ accion: 'crear_cuenta', cuenta: d.cuenta, local: d.local, usuario: d.usuario, password: d.password, plan: d.plan, vence: d.vence ?? '' })
    },
    async saRenombrarCuenta(cuentaId, nombre) { ok(await sb.rpc('sa_renombrar_cuenta', { p_cuenta: cuentaId, p_nombre: nombre })) },
    async saSetPlanLocal(sucursalId, plan) { ok(await sb.rpc('sa_set_plan_local', { p_sucursal: sucursalId, p_plan: plan })) },
    async saCrearLocal(cuentaId, nombre, vence, plan) { ok(await sb.rpc('sa_crear_local', { p_cuenta: cuentaId, p_nombre: nombre, p_vence: vence || null, p_plan: plan })) },
    async saEditarLocal(sucursalId, nombre, activa) { ok(await sb.rpc('sa_editar_local', { p_sucursal: sucursalId, p_nombre: nombre, p_activa: activa })) },
    async saSetVence(sucursalId, vence) { ok(await sb.rpc('sa_set_vence', { p_sucursal: sucursalId, p_vence: vence || null })) },
    async saCrearUsuario(d) {
      if (d.tipo === 'admin') {
        await invocarUsuarios({ accion: 'crear', rol: 'admin', cuenta_id: d.cuentaId, usuario: d.usuario, password: d.password })
        return
      }
      const r = await invocarUsuarios({ accion: 'crear', usuario: d.usuario, password: d.password, sucursal_id: d.sucursalId })
      if (d.tipo !== 'comun' && r?.user_id) ok(await sb.rpc('set_tipo_usuario', { p_user: r.user_id, p_tipo: d.tipo }))
    },

    // ---- Menú
    async getMenu(sucursalId): Promise<MenuData> {
      const filtroLocal = sucursalId ? `sucursal_id.is.null,sucursal_id.eq.${sucursalId}` : 'sucursal_id.is.null'
      const [cats, prods, ajustes, ings] = await Promise.all([
        sb.from('categorias').select('*').or(filtroLocal).order('orden'),
        sb.from('productos').select(SELECT_PRODUCTO).or(filtroLocal).order('orden'),
        sucursalId ? sb.from('producto_sucursal').select('*').eq('sucursal_id', sucursalId) : Promise.resolve({ data: [], error: null }),
        sb.from('ingredientes').select('*').order('nombre'),
      ])
      return {
        categorias: (ok(cats) as Row[]).map(mapCategoria),
        productos: (ok(prods) as Row[]).map(mapProducto),
        ajustes: (ok(ajustes) as Row[]).map((a): AjusteLocal => ({
          productoId: a.producto_id, precio: numOpt(a.precio), precioMitad: numOpt(a.precio_mitad), oculto: a.oculto, agotado: a.agotado,
        })),
        ingredientes: (ok(ings) as Row[]).map(mapIngrediente),
      }
    },

    async guardarCategoria(c) {
      const p = await perfil()
      const row = { cuenta_id: p!.cuenta_id, sucursal_id: c.sucursalId ?? null, nombre: c.nombre, orden: c.orden, color: c.color, activa: c.activa }
      const r = c.id
        ? ok(await sb.from('categorias').update(row).eq('id', c.id).select().single())
        : ok(await sb.from('categorias').insert(row).select().single())
      return mapCategoria(r as Row)
    },

    async eliminarCategoria(id) {
      ok(await sb.from('productos').delete().eq('categoria_id', id).select('id'))
      const r = ok(await sb.from('categorias').delete().eq('id', id).select('id')) as Row[]
      if (!r.length) throw new Error('No tenés permiso para borrar esta categoría')
    },

    async guardarProducto(prod) {
      const p = await perfil()
      const row = {
        cuenta_id: p!.cuenta_id, sucursal_id: prod.sucursalId ?? null, categoria_id: prod.categoriaId, tipo: prod.tipo,
        codigo: prod.codigo || null, nombre: prod.nombre, descripcion: prod.descripcion || null, precio: prod.precio,
        precio_mitad: prod.precioMitad ?? null, admite_coccion: prod.admiteCoccion, incluye_envio: prod.incluyeEnvio,
        orden: prod.orden, activo: prod.activo,
      }
      const r = (prod.id
        ? ok(await sb.from('productos').update(row).eq('id', prod.id).select('id').single())
        : ok(await sb.from('productos').insert(row).select('id').single())) as Row
      const id = r.id as string
      // Receta y armado de promo: se reemplazan completos
      ok(await sb.from('recetas').delete().eq('producto_id', id))
      ok(await sb.from('promo_fijos').delete().eq('promo_id', id))
      ok(await sb.from('promo_slots').delete().eq('promo_id', id))
      const receta = unirReceta(prod.receta)
      if (receta.length) ok(await sb.from('recetas').insert(receta.map(x => ({ producto_id: id, ingrediente_id: x.ingredienteId, cantidad: x.cantidad }))))
      if (prod.tipo === 'promo') {
        if (prod.fijos.length) ok(await sb.from('promo_fijos').insert(prod.fijos.map(f => ({ promo_id: id, producto_id: f.productoId, cantidad: f.cantidad, variante: f.variante }))))
        if (prod.slots.length) ok(await sb.from('promo_slots').insert(prod.slots.map((s, orden) => ({ promo_id: id, nombre: s.nombre, categoria_id: s.categoriaId, cantidad: s.cantidad, orden }))))
      }
      return mapProducto(ok(await sb.from('productos').select(SELECT_PRODUCTO).eq('id', id).single()) as Row)
    },

    async actualizarProductos(cambios) {
      // De a tandas para no saturar la conexión
      for (let i = 0; i < cambios.length; i += 10) {
        await Promise.all(cambios.slice(i, i + 10).map(async c => {
          ok(await sb.from('productos').update({ precio: c.precio, precio_mitad: c.precioMitad ?? null, activo: c.activo }).eq('id', c.id).select('id').single())
        }))
      }
    },

    async guardarAjuste(sucursalId, a) {
      ok(await sb.from('producto_sucursal').upsert({
        producto_id: a.productoId, sucursal_id: sucursalId, precio: a.precio ?? null,
        precio_mitad: a.precioMitad ?? null, oculto: a.oculto, agotado: a.agotado,
      }))
    },

    async quitarAjuste(sucursalId, productoId) {
      ok(await sb.from('producto_sucursal').delete().eq('sucursal_id', sucursalId).eq('producto_id', productoId))
    },

    async aumentarPrecios(categoriaId, porcentaje, sucursalId, redondeo) {
      return ok(await sb.rpc('aumentar_precios', { p_categoria: categoriaId, p_porcentaje: porcentaje, p_sucursal: sucursalId, p_redondeo: redondeo })) as unknown as number
    },

    async guardarIngrediente(i) {
      const p = await perfil()
      const row = { cuenta_id: p!.cuenta_id, nombre: i.nombre, unidad: i.unidad, costo: i.costo, activo: i.activo }
      const r = i.id
        ? ok(await sb.from('ingredientes').update(row).eq('id', i.id).select().single())
        : ok(await sb.from('ingredientes').insert(row).select().single())
      return mapIngrediente(r as Row)
    },

    async eliminarIngrediente(id) {
      // Primero se fija en todas las recetas de la cuenta (también productos propios de cada local)
      const usos = ok(await sb.from('recetas').select('productos(nombre)').eq('ingrediente_id', id)) as Row[]
      const nombres = usos.map(u => (u.productos as Row | null)?.nombre as string).filter(Boolean)
      if (nombres.length) throw new Error(errorIngredienteEnUso(nombres))
      ok(await sb.from('ingredientes').delete().eq('id', id).select('id').single())
    },

    // ---- Zonas e impresoras
    async listZonas(sucursalId) {
      return (ok(await sb.from('zonas_delivery').select('*').eq('sucursal_id', sucursalId).eq('activa', true).order('costo')) as Row[]).map(mapZona)
    },
    async guardarZona(sucursalId, z) {
      const row = { sucursal_id: sucursalId, nombre: z.nombre, costo: z.costo }
      if (z.id) ok(await sb.from('zonas_delivery').update(row).eq('id', z.id))
      else ok(await sb.from('zonas_delivery').insert(row))
    },
    async eliminarZona(id) {
      ok(await sb.from('zonas_delivery').update({ activa: false }).eq('id', id))
    },
    async listImpresoras(sucursalId) {
      const r = ok(await sb.from('impresoras').select('*').eq('sucursal_id', sucursalId).eq('activa', true).order('created_at'))
      return (r as Row[]).map((i): Impresora => ({
        id: i.id, nombre: i.nombre, imprimeMostrador: i.imprime_mostrador, imprimeDelivery: i.imprime_delivery,
        copias: i.copias, ancho: i.ancho, ultimoPing: opt(i.ultimo_ping), conToken: !!i.token_hash,
        formato: i.formato ?? 'normal', mostrarPrecios: i.mostrar_precios ?? true,
        impresoraWindows: opt(i.impresora_windows), pcNombre: opt(i.pc_nombre), versionPrograma: opt(i.version_programa),
        vinculadaAt: opt(i.vinculada_at),
      }))
    },
    async guardarImpresora(sucursalId, i) {
      if (!i.nombre.trim()) throw new Error('Poné un nombre para la comandera (ej: Cocina).')
      const row = {
        sucursal_id: sucursalId, nombre: i.nombre.trim(), imprime_mostrador: i.imprimeMostrador, imprime_delivery: i.imprimeDelivery,
        copias: Math.max(1, Math.min(5, i.copias || 1)), ancho: i.ancho === 32 ? 32 : 48,
        formato: i.formato ?? 'normal', mostrar_precios: i.mostrarPrecios ?? true,
      }
      if (i.id) ok(await sb.from('impresoras').update(row).eq('id', i.id))
      else ok(await sb.from('impresoras').insert(row))
    },
    async eliminarImpresora(id) {
      ok(await sb.from('impresoras').update({ activa: false, token_hash: null }).eq('id', id))
    },
    async generarTokenImpresora(id) {
      return ok(await sb.rpc('generar_token_impresora', { p_impresora: id })) as unknown as string
    },

    async listRepartidores(sucursalId) {
      return (ok(await sb.from('repartidores').select('*').eq('sucursal_id', sucursalId).order('nombre')) as Row[]).map(mapRepartidor)
    },
    async guardarRepartidor(sucursalId, r) {
      if (!r.nombre.trim()) throw new Error('Poné el nombre del repartidor.')
      const row = { sucursal_id: sucursalId, nombre: r.nombre.trim(), dni: r.dni || null, telefono: r.telefono || null, activo: r.activo }
      const x = r.id
        ? ok(await sb.from('repartidores').update(row).eq('id', r.id).select().single())
        : ok(await sb.from('repartidores').insert(row).select().single())
      return mapRepartidor(x as Row)
    },

    // ---- Operación
    async getCajaAbierta(sucursalId) {
      const r = ok(await sb.from('cajas').select('*').eq('sucursal_id', sucursalId).eq('estado', 'abierta').maybeSingle())
      return r ? mapCaja(r as Row) : null
    },
    async abrirCaja(sucursalId, turno, dineroInicial) {
      // quién la abre lo completa el trigger trg_usuario_caja()
      return mapCaja(ok(await sb.from('cajas').insert({ sucursal_id: sucursalId, turno, dinero_inicial: dineroInicial || 0 }).select().single()) as Row)
    },
    async cerrarCaja(id, dineroCierre, observaciones) {
      ok(await sb.rpc('cerrar_caja', { p_caja: id, p_dinero_cierre: dineroCierre, p_observaciones: observaciones ?? null }))
    },
    async reabrirCaja(id) {
      ok(await sb.rpc('reabrir_caja', { p_caja: id }))
    },
    async listCajas(sucursalId, limit = 60) {
      return (ok(await sb.from('cajas').select('*').eq('sucursal_id', sucursalId).order('abierta_at', { ascending: false }).limit(limit)) as Row[]).map(mapCaja)
    },
    async listMovimientos(cajaId) {
      const r = ok(await sb.from('caja_movimientos').select('*, tipos_gasto(nombre)').eq('caja_id', cajaId).order('created_at'))
      return (r as Row[]).map((m): MovimientoCaja => ({
        id: m.id, tipo: m.tipo, tipoGastoId: opt(m.tipo_gasto_id), tipoGastoNombre: opt(m.tipos_gasto?.nombre),
        concepto: m.concepto, monto: num(m.monto), creadoPor: opt(m.creado_por_usuario), createdAt: m.created_at,
      }))
    },
    async agregarMovimiento(cajaId, m) {
      if (!(m.monto > 0)) throw new Error('Poné un monto mayor a cero.')
      if (!m.concepto.trim()) throw new Error('Poné un concepto.')
      ok(await sb.from('caja_movimientos').insert({ caja_id: cajaId, tipo: m.tipo, tipo_gasto_id: m.tipoGastoId ?? null, concepto: m.concepto.trim(), monto: m.monto }))
    },
    async eliminarMovimiento(id) {
      const r = ok(await sb.from('caja_movimientos').delete().eq('id', id).select('id')) as Row[]
      if (!r.length) throw new Error('Solo se borran movimientos con la caja abierta.')
    },
    // ---- Stock
    async getStock(sucursalId) {
      return (ok(await sb.from('stock').select('*').eq('sucursal_id', sucursalId)) as Row[]).map((x): StockItem => ({
        ingredienteId: x.ingrediente_id, cantidad: num(x.cantidad), minimo: num(x.minimo),
      }))
    },
    // ---- Pedido a fábrica
    async getPlanillaFabrica() {
      return (ok(await sb.from('fabrica_planilla').select('*').order('orden')) as Row[]).map(r => ({
        clave: r.producto_id ? `${PREFIJO_PRODUCTO}${r.producto_id}` : r.ingrediente_id as string,
        presentacion: opt(r.presentacion), factor: r.factor == null ? 1 : num(r.factor),
      }))
    },
    async guardarPlanillaFabrica(ids) {
      const cuenta = (await perfil())?.cuenta_id as string
      ok(await sb.from('fabrica_planilla').delete().eq('cuenta_id', cuenta).select('cuenta_id'))
      if (ids.length) ok(await sb.from('fabrica_planilla').insert(ids.map((x, i) => {
        const prod = productoDePlanilla(x.clave)
        return {
          cuenta_id: cuenta, ingrediente_id: prod ? null : x.clave, producto_id: prod ?? null, orden: i,
          presentacion: x.presentacion?.trim() || null, factor: x.factor > 0 ? x.factor : 1,
        }
      })).select('cuenta_id'))
    },
    async listPedidosFabrica(sucursalIds, limite = 100) {
      let q = sb.from('pedidos_fabrica').select('*, pedidos_fabrica_items(*)').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(limite)
      if (sucursalIds) q = q.in('sucursal_id', sucursalIds)
      return (ok(await q) as Row[]).map((p): PedidoFabrica => ({
        id: p.id, sucursalId: p.sucursal_id, numero: p.numero, fecha: p.fecha, notas: opt(p.notas), estado: p.estado,
        creadoPor: opt(p.creado_por), createdAt: p.created_at, recibidoAt: opt(p.recibido_at), recibidoPor: opt(p.recibido_por),
        items: ((p.pedidos_fabrica_items ?? []) as Row[]).sort((a, b) => a.orden - b.orden).map(i => ({
          id: i.id, ingredienteId: opt(i.ingrediente_id), productoId: opt(i.producto_id), nombre: i.nombre, unidad: i.unidad, cantidad: num(i.cantidad),
          presentacion: opt(i.presentacion), factor: i.factor == null ? 1 : num(i.factor),
          recibido: i.recibido == null ? undefined : num(i.recibido),
        })),
      }))
    },
    async crearPedidoFabrica(sucursalId, d) {
      ok(await sb.rpc('crear_pedido_fabrica', {
        p_sucursal: sucursalId, p_fecha: d.fecha, p_notas: d.notas ?? null,
        p_items: d.items.map(i => (i.productoId ? { producto_id: i.productoId, cantidad: i.cantidad } : { ingrediente_id: i.ingredienteId, cantidad: i.cantidad })),
      }))
    },
    async recibirPedidoFabrica(pedidoId, items) {
      ok(await sb.rpc('recibir_pedido_fabrica', { p_pedido: pedidoId, p_items: items.map(i => ({ id: i.id, recibido: i.recibido })) }))
    },
    async anularPedidoFabrica(pedidoId) {
      ok(await sb.rpc('anular_pedido_fabrica', { p_pedido: pedidoId }))
    },

    async registrarIngreso(sucursalId, d) {
      ok(await sb.rpc('registrar_ingreso', {
        p_sucursal: sucursalId,
        p_items: d.items.filter(i => i.ingredienteId).map(i => ({ ingrediente_id: i.ingredienteId, cantidad: i.cantidad, costo: i.costo || 0 })),
        p_proveedor: d.proveedor ?? null, p_comprobante: d.comprobante ?? null, p_observaciones: d.observaciones ?? null,
        p_actualizar_costo: d.actualizarCosto, p_pagar_con_caja: d.pagarConCaja,
      }))
    },
    async ajustarStock(sucursalId, ingredienteId, tipo, cantidad, motivo) {
      ok(await sb.rpc('ajustar_stock', { p_sucursal: sucursalId, p_ingrediente: ingredienteId, p_tipo: tipo, p_cantidad: cantidad, p_motivo: motivo ?? null }))
    },
    async setStockMinimo(sucursalId, ingredienteId, minimo) {
      ok(await sb.rpc('set_stock_minimo', { p_sucursal: sucursalId, p_ingrediente: ingredienteId, p_minimo: minimo }))
    },

    // ---- Reportes
    async reporteComandas(sucursalIds, desde, hasta) {
      const r = await todas((a, b) => sb.from('comandas').select(SELECT_COMANDA).in('sucursal_id', sucursalIds)
        .gte('created_at', desde).lt('created_at', hasta).order('created_at').range(a, b))
      return r.map(mapComanda)
    },
    async reporteMovimientosCaja(sucursalIds, desde, hasta) {
      const r = await todas((a, b) => sb.from('caja_movimientos').select('*, tipos_gasto(nombre), cajas!inner(sucursal_id, turno, abierta_at)')
        .in('cajas.sucursal_id', sucursalIds).gte('created_at', desde).lt('created_at', hasta).order('created_at').range(a, b))
      return r.map((m): MovimientoReporte => ({
        id: m.id, tipo: m.tipo, tipoGastoId: opt(m.tipo_gasto_id), tipoGastoNombre: opt(m.tipos_gasto?.nombre),
        concepto: m.concepto, monto: num(m.monto), creadoPor: opt(m.creado_por_usuario), createdAt: m.created_at,
        sucursalId: m.cajas.sucursal_id, cajaTurno: m.cajas.turno, cajaFecha: m.cajas.abierta_at,
      }))
    },
    async reporteIngresos(sucursalIds, desde, hasta) {
      const r = await todas((a, b) => sb.from('ingresos_mercaderia').select('*, stock_movimientos(ingrediente_id, cantidad, costo)')
        .in('sucursal_id', sucursalIds).gte('created_at', desde).lt('created_at', hasta).order('created_at').range(a, b))
      return r.map((x): IngresoMercaderia => ({
        id: x.id, sucursalId: x.sucursal_id, proveedor: opt(x.proveedor), comprobante: opt(x.comprobante), observaciones: opt(x.observaciones),
        total: num(x.total), pagadoConCaja: x.pagado_con_caja, creadoPor: opt(x.creado_por_usuario), createdAt: x.created_at,
        items: (x.stock_movimientos ?? []).map((m: Row) => ({ ingredienteId: m.ingrediente_id, cantidad: num(m.cantidad), costo: num(m.costo) })),
      }))
    },
    async reporteStockMovimientos(sucursalIds, desde, hasta, tipos) {
      const r = await todas((a, b) => {
        let q = sb.from('stock_movimientos').select('*').in('sucursal_id', sucursalIds).gte('created_at', desde).lt('created_at', hasta)
        if (tipos?.length) q = q.in('tipo', tipos)
        return q.order('created_at').range(a, b)
      })
      return r.map((m): StockMovimiento => ({
        id: m.id, sucursalId: m.sucursal_id, ingredienteId: m.ingrediente_id, tipo: m.tipo, cantidad: num(m.cantidad),
        costo: numOpt(m.costo), ingresoId: opt(m.ingreso_id), comandaId: opt(m.comanda_id), motivo: opt(m.motivo),
        creadoPor: opt(m.creado_por_usuario), createdAt: m.created_at,
      }))
    },

    async listTiposGasto() {
      return (ok(await sb.from('tipos_gasto').select('*').eq('activo', true).order('orden')) as Row[]).map((t): TipoGasto => ({ id: t.id, nombre: t.nombre }))
    },
    async listComandas(cajaId) {
      return (ok(await sb.from('comandas').select(SELECT_COMANDA).eq('caja_id', cajaId).order('numero')) as Row[]).map(mapComanda)
    },
    async crearComanda(cajaId, d) {
      // numero y sucursal_id los completa el trigger asignar_numero_comanda()
      const { data: u } = await sb.auth.getUser()
      const r = ok(await sb.from('comandas').insert({ ...comandaRow(d), caja_id: cajaId, numero: 0, creada_por: u.user?.id ?? null }).select('id').single()) as Row
      await reemplazarDetalle(r.id, d)
      return getComanda(r.id)
    },
    async actualizarComanda(id, d) {
      ok(await sb.from('comandas').update(comandaRow(d)).eq('id', id))
      await reemplazarDetalle(id, d)
      return getComanda(id)
    },
    async cambiarEstado(id, estado) { ok(await sb.from('comandas').update({ estado }).eq('id', id)) },
    async marcarCobrada(id, cobrada) { ok(await sb.from('comandas').update({ cobrada }).eq('id', id)) },
    async asignarRepartidor(comandaId, repartidorId) {
      ok(await sb.from('comandas').update({ repartidor_id: repartidorId, asignada_at: new Date().toISOString(), estado: 'en_camino' }).eq('id', comandaId))
    },
    async quitarRepartidor(comandaId) {
      // Si ya había salido de la cocina, vuelve a "listo"
      const r = ok(await sb.from('comandas').select('listo_at').eq('id', comandaId).single()) as Row
      ok(await sb.from('comandas').update({ repartidor_id: null, asignada_at: null, estado: r.listo_at ? 'listo' : 'pendiente' })
        .eq('id', comandaId).not('estado', 'in', '(entregado,anulada)'))
    },
    async entregarComanda(comandaId, pagos: Pago[], cobrada) {
      ok(await sb.from('pagos').delete().eq('comanda_id', comandaId))
      if (pagos.length) ok(await sb.from('pagos').insert(pagos.map(p => ({ comanda_id: comandaId, forma: p.forma, monto: p.monto }))))
      ok(await sb.from('comandas').update({ cobrada, estado: 'entregado', entregada_at: new Date().toISOString() }).eq('id', comandaId))
    },

    async buscarClientes(q: BusquedaCliente) {
      let query = sb.from('clientes').select('*').limit(20)
      if (q.nombre) query = query.ilike('nombre', `%${q.nombre}%`)
      if (q.telefono) query = query.ilike('telefono', `%${q.telefono.replace(/\D/g, '')}%`)
      if (q.direccion) query = query.ilike('direccion', `%${q.direccion}%`)
      return (ok(await query) as Row[]).map(mapCliente)
    },
    async guardarCliente(c) {
      const p = await perfil()
      const row = {
        cuenta_id: p!.cuenta_id, nombre: c.nombre, telefono: c.telefono ?? null, direccion: c.direccion ?? null,
        entre_calles: c.entreCalles ?? null, zona_id: c.zonaId ?? null,
      }
      const r = c.id
        ? ok(await sb.from('clientes').update(row).eq('id', c.id).select().single())
        : ok(await sb.from('clientes').insert(row).select().single())
      return mapCliente(r as Row)
    },

    async encolarImpresion(jobs: NuevoPrintJob[]) {
      if (!jobs.length) return
      ok(await sb.from('print_jobs').insert(jobs.map(j => ({
        impresora_id: j.impresoraId, comanda_id: j.comandaId ?? null, tipo: j.tipo, contenido: j.contenido, copias: j.copias,
      }))))
    },
    // ---- Importación de pedidos
    async listPedidosExternos(sucursalId, limit = 100) {
      const r = ok(await sb.from('pedidos_externos').select('*').eq('sucursal_id', sucursalId).order('created_at', { ascending: false }).limit(limit)) as Row[]
      return r.map((p): PedidoExterno => ({
        id: p.id, canal: p.canal, texto: p.texto, formato: p.formato, numeroExterno: opt(p.numero_externo), estado: p.estado,
        error: opt(p.error), datos: p.datos ?? undefined, comandaId: opt(p.comanda_id), createdAt: p.created_at, procesadoAt: opt(p.procesado_at),
      }))
    },
    async importarPedidoExterno(id, d) {
      const datos = {
        tipo: d.tipo, cliente_nombre: d.clienteNombre ?? null, cliente_tel: d.clienteTel ?? null, direccion: d.direccion ?? null,
        observaciones: d.observaciones ?? null, numero_externo: d.numeroExterno ?? null, subtotal: d.subtotal, costo_envio: d.costoEnvio,
        descuento: d.descuento, adicional: d.adicional, total: d.total, cobrada: d.cobrada,
        items: d.items.map(i => ({ producto_id: i.productoId ?? null, descripcion: i.descripcion, variante: i.variante ?? null, cantidad: i.cantidad, precio_unit: i.precioUnit, nota: i.nota ?? null })),
        pagos: d.pagos.map(p => ({ forma: p.forma, monto: p.monto })),
      }
      return (ok(await sb.rpc('importar_pedido_externo', { p_id: id, p_datos: datos })) as unknown as string | null) ?? null
    },
    async marcarPedidoExterno(id, estado, error, datos) {
      const fila: Row = { estado, error: error ?? null }
      if (datos !== undefined) fila.datos = datos
      let q = sb.from('pedidos_externos').update(fila).eq('id', id)
      // el procesador automático no pisa uno que ya se importó
      if (estado === 'error') q = q.in('estado', ['pendiente', 'procesando', 'error'])
      ok(await q)
    },
    async listMapeos() {
      return (ok(await sb.from('mapeos_externos').select('*').order('texto')) as Row[]).map((m): MapeoExterno => ({
        id: m.id, canal: m.canal, texto: m.texto, productoId: opt(m.producto_id), variante: opt(m.variante), ignorar: m.ignorar,
      }))
    },
    async guardarMapeo(m) {
      const p = await perfil()
      ok(await sb.from('mapeos_externos').upsert({
        cuenta_id: p?.cuenta_id, canal: m.canal, texto: m.texto, producto_id: m.ignorar ? null : m.productoId ?? null,
        variante: m.variante ?? null, ignorar: m.ignorar,
      }, { onConflict: 'cuenta_id,canal,texto' }))
    },
    async eliminarMapeo(id) {
      ok(await sb.from('mapeos_externos').delete().eq('id', id))
    },

    async eliminarPrintJobs(ids) {
      if (!ids.length) return 0
      const r = ok(await sb.from('print_jobs').delete().in('id', ids).in('estado', ['pendiente', 'error']).select('id'))
      return (r as Row[]).length
    },
    async listPrintJobs(sucursalId, limit = 50) {
      const r = ok(await sb.from('print_jobs').select('*, impresoras!inner(sucursal_id)')
        .eq('impresoras.sucursal_id', sucursalId).order('created_at', { ascending: false }).limit(limit))
      return (r as Row[]).map((j): PrintJob => ({
        id: j.id, impresoraId: j.impresora_id, comandaId: opt(j.comanda_id), tipo: j.tipo, contenido: j.contenido,
        copias: j.copias, estado: j.estado, intentos: j.intentos, error: opt(j.error), createdAt: j.created_at,
        printedAt: opt(j.printed_at),
      }))
    },

    subscribe(onChange) {
      const ch = sb.channel('comandas-web')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, () => onChange('comandas'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => onChange('print_jobs'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => onChange('menu'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'producto_sucursal' }, () => onChange('menu'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias' }, () => onChange('menu'))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sucursales' }, () => onChange('menu'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_externos' }, () => onChange('externos'))
        .subscribe()
      return () => { sb.removeChannel(ch) }
    },
  }
  return repo
}

/** Traduce errores de Postgres a mensajes entendibles */
function traducirError(e: unknown): Error {
  const err = e as { message?: string; code?: string; details?: string }
  const m = err?.message ?? String(e)
  // Tabla o función que todavía no existe: falta correr una migración
  const falta = m.match(/(?:table|function) '?public\.(\w+)/i)
  if (err?.code === 'PGRST205' || err?.code === 'PGRST202' || err?.code === 'PGRST204' || (falta && m.includes('schema cache'))) {
    return new Error(`Falta actualizar la base de datos${falta ? ` (no existe "${falta[1]}")` : ''}. Corré en Supabase → SQL Editor los archivos de supabase/migrations que todavía no corriste, en orden.`)
  }
  if (err?.code === '42501' || m.includes('row-level security')) return new Error('No tenés permiso para hacer este cambio.')
  // update bloqueado por RLS: no devuelve filas
  if (err?.code === 'PGRST116') return new Error('No tenés permiso para hacer este cambio, o ese dato ya no existe.')
  if (err?.code === '23505' && m.includes('cajas_una_abierta')) return new Error('Ya hay una caja abierta en este local.')
  if (err?.code === '23505' && m.includes('cupones_codigo')) return new Error('Ya existe un cupón con ese código.')
  if (err?.code === '23514' && m.includes('cupones')) return new Error('Revisá el cupón: el código va de 3 a 30 letras o números, el valor mayor a cero (hasta 100%) y las fechas en orden.')
  if (err?.code === '23503') return new Error('No se puede borrar: está en uso.')
  for (const t of ['Para pagar con la caja tiene que haber una caja abierta', 'Las cantidades tienen que ser mayores a cero', 'La cantidad contada no puede ser negativa', 'La cantidad a decomisar tiene que ser mayor a cero', 'El ingreso no tiene ingredientes', 'La caja no está abierta', 'Ya hay una caja abierta en este local', 'Solo se puede reabrir la última caja del local', 'Esa caja no está cerrada']) if (m.includes(t)) return new Error(t + '.')
  if (m.includes('repartidor no es de este local')) return new Error('Ese repartidor no es de este local.')
  return new Error(m)
}
