import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { unirReceta } from '../lib/menu'
import type { Repo, NuevoPrintJob, BusquedaCliente, EstadoSesion, MenuData } from './repo'
import type {
  AjusteLocal, Caja, Categoria, Cliente, Comanda, Impresora, Ingrediente, ItemComanda, NuevaComanda,
  MovimientoCaja, Pago, PrintJob, Producto, Repartidor, TipoGasto, Sucursal, Usuario, Zona,
} from '../types'

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
const mapSucursal = (r: Row): Sucursal => ({ id: r.id, nombre: r.nombre, esPrincipal: r.es_principal, activa: r.activa })
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
    horaEntrega: opt(r.hora_entrega), cobrada: r.cobrada, createdAt: r.created_at, updatedAt: r.updated_at,
    repartidorId: opt(r.repartidor_id), repartidorNombre: opt(r.repartidores?.nombre),
    asignadaAt: opt(r.asignada_at), entregadaAt: opt(r.entregada_at),
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
})

const SELECT_COMANDA = '*, comanda_items(*), pagos(*), repartidores(nombre)'
const SELECT_PRODUCTO = '*, recetas(*), promo_fijos!promo_fijos_promo_id_fkey(*), promo_slots(*)'

export function crearSupabaseRepo(url: string, anonKey: string, opciones?: { headers?: Record<string, string> }): Repo & { client: SupabaseClient } {
  const sb = createClient(url, anonKey, opciones?.headers ? { global: { headers: opciones.headers } } : undefined)

  const ok = <T,>(res: { data: T; error: unknown }): T => {
    if (res.error) throw traducirError(res.error)
    return res.data
  }

  let perfilCache: Row | null = null
  async function perfil() {
    if (perfilCache) return perfilCache
    const { data: u } = await sb.auth.getUser()
    if (!u.user) return null
    const r = await sb.from('perfiles').select('*, cuentas(nombre)').eq('user_id', u.user.id).maybeSingle()
    perfilCache = ok(r) as Row | null
    return perfilCache
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
      const p = await perfil()
      if (!p) return { estado: 'sin_cuenta', email: data.session.user.email ?? '' }
      return {
        estado: 'ok',
        sesion: {
          userId: p.user_id, usuario: p.usuario, rol: p.rol, cuentaId: p.cuenta_id,
          cuentaNombre: p.cuentas?.nombre ?? '', sucursalId: opt(p.sucursal_id),
        },
      }
    },

    async login(usuario, password) {
      perfilCache = null
      const { error } = await sb.auth.signInWithPassword({ email: emailDeUsuario(usuario), password })
      if (error) throw new Error(error.message.includes('confirm') ? 'Falta confirmar el email: revisá tu casilla.' : 'Usuario o contraseña incorrectos')
    },

    async logout() { perfilCache = null; await sb.auth.signOut() },

    async registrar(email, password) {
      const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
      if (error) throw new Error(error.message)
      return { requiereConfirmacion: !data.session }
    },

    async crearCuenta(nombreCuenta, nombreLocal) {
      const { data } = await sb.auth.getUser()
      ok(await sb.rpc('crear_cuenta', { p_cuenta: nombreCuenta, p_local: nombreLocal, p_usuario: data.user?.email ?? '' }))
      perfilCache = null
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => { perfilCache = null; cb() })
      return () => data.subscription.unsubscribe()
    },

    // ---- Locales y usuarios
    async listSucursales() {
      return (ok(await sb.from('sucursales').select('*').order('es_principal', { ascending: false }).order('created_at')) as Row[]).map(mapSucursal)
    },
    async crearSucursal(nombre) {
      const id = ok(await sb.rpc('crear_sucursal', { p_nombre: nombre })) as unknown as string
      return mapSucursal(ok(await sb.from('sucursales').select('*').eq('id', id).single()) as Row)
    },
    async actualizarSucursal(id, data) {
      ok(await sb.from('sucursales').update(data).eq('id', id))
    },
    async listUsuarios() {
      return (ok(await sb.from('perfiles').select('*').order('created_at')) as Row[]).map((p): Usuario => ({
        userId: p.user_id, usuario: p.usuario, rol: p.rol, sucursalId: opt(p.sucursal_id), nombre: opt(p.nombre),
      }))
    },
    async crearUsuario(d) { await invocarUsuarios({ accion: 'crear', usuario: d.usuario, password: d.password, sucursal_id: d.sucursalId, nombre: d.nombre }) },
    async cambiarPassword(userId, password) { await invocarUsuarios({ accion: 'password', user_id: userId, password }) },
    async eliminarUsuario(userId) { await invocarUsuarios({ accion: 'eliminar', user_id: userId }) },

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
        copias: i.copias, ancho: i.ancho, ultimoPing: opt(i.ultimo_ping),
      }))
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
  if (err?.code === '42501' || m.includes('row-level security')) return new Error('No tenés permiso para hacer este cambio.')
  // update bloqueado por RLS: no devuelve filas
  if (err?.code === 'PGRST116') return new Error('No tenés permiso para hacer este cambio, o ese dato ya no existe.')
  if (err?.code === '23505' && m.includes('cajas_una_abierta')) return new Error('Ya hay una caja abierta en este local.')
  if (err?.code === '23503') return new Error('No se puede borrar: está en uso.')
  for (const t of ['La caja no está abierta', 'Ya hay una caja abierta en este local', 'Solo se puede reabrir la última caja del local', 'Esa caja no está cerrada']) if (m.includes(t)) return new Error(t + '.')
  if (m.includes('repartidor no es de este local')) return new Error('Ese repartidor no es de este local.')
  return new Error(m)
}
