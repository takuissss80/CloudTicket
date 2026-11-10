import type { Repo, NuevoPrintJob, BusquedaCliente, MenuData, EstadoSesion } from './repo'
import type {
  AjusteLocal, Caja, ItemComanda, Pago, Categoria, Cliente, Comanda, Cupon, MapeoExterno, NuevaComanda, PedidoExterno, UsoCupon, Impresora, Ingrediente, PrintJob, Producto,
  IngresoMercaderia, MovimientoCaja, MovimientoReporte, Repartidor, StockItem, StockMovimiento, Sesion, Sucursal, Usuario, Zona, PedidoFabrica, PlanillaFabricaItem, Plan } from '../types'
import { PREFIJO_PRODUCTO, productoDePlanilla } from './repo'
import { calcularTotales, turnoQueBloquea } from '../lib/caja'
import { consumoItem } from '../lib/stock'
import { descuentoCupon, normalizarCodigo, problemaCupon } from '../lib/descuentos'
import { errorIngredienteEnUso, importarMenuEjemplo, unirReceta } from '../lib/menu'

/**
 * Modo demo: todo vive en el navegador (localStorage).
 * Viene con una cuenta "Napoles", dos locales y tres usuarios de prueba,
 * y aplica los mismos permisos que la base real.
 */

const KEY = 'comandas-demo-v2'
const KEY_SESION = 'comandas-demo-sesion'
export const USUARIOS_DEMO = [
  { usuario: 'admin', password: '1234', descripcion: 'Administrador de la cuenta' },
  { usuario: 'principal', password: '1234', descripcion: 'Local Napoles Principal' },
  { usuario: 'benavidez', password: '1234', descripcion: 'Local Napoles Benavidez' },
  { usuario: 'cloudticket', password: '1234', descripcion: 'Administrador general' },
]
/** En la demo, el administrador general es un usuario aparte (no es de la cuenta) */
const SUPERADMIN = { id: 'superadmin', usuario: 'cloudticket', password: '1234' }

type ConLocal<T> = T & { sucursalId: string }

const TIPOS_GASTO_DEMO = ['Motos', 'Proveedores varios', 'Pago remito', 'Servicios', 'Alquiler', 'Impuestos', 'Abonos profesionales', 'Varios']
  .map((nombre, i) => ({ id: `tg-${i}`, nombre }))

interface DB {
  cuenta: { id: string; nombre: string; plan?: Plan; createdAt?: string }
  sucursales: Sucursal[]
  usuarios: (Usuario & { password: string })[]
  ingredientes: Ingrediente[]
  categorias: Categoria[]
  productos: Producto[]
  ajustes: ConLocal<AjusteLocal>[]
  zonas: ConLocal<Zona>[]
  impresoras: ConLocal<Impresora>[]
  repartidores?: ConLocal<Repartidor>[]
  movimientos?: (MovimientoCaja & { cajaId: string })[]
  stock?: ConLocal<StockItem>[]
  stockMovs?: (StockMovimiento & { comandaItemId?: string })[]
  ingresos?: IngresoMercaderia[]
  cajas: ConLocal<Caja & { ultimoNumero: number }>[]
  comandas: ConLocal<Comanda>[]
  clientes: Cliente[]
  printJobs: PrintJob[]
  cupones?: Cupon[]
  pedidosExternos?: ConLocal<PedidoExterno>[]
  mapeos?: MapeoExterno[]
  planillaFabrica?: (string | PlanillaFabricaItem)[]
  pedidosFabrica?: PedidoFabrica[]
}

const uid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
const ahora = () => new Date().toISOString()
/** Planilla de fábrica (los demos viejos la guardaban como lista de ids) */
const planilla = (): PlanillaFabricaItem[] => (db().planillaFabrica ?? []).map(x => (typeof x === 'string' ? { clave: x, factor: 1 } : { ...x }))
const pausa = <T,>(v: T) => new Promise<T>(r => setTimeout(() => r(v), 40))
const clon = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

let memoria: DB | null = null
let sesionMemoria: string | null = null
let sembrando: Promise<void> | null = null

function leerStorage(k: string) { try { return localStorage.getItem(k) } catch { return null } }
function escribirStorage(k: string, v: string | null) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* sin storage */ }
}

function db(): DB {
  if (memoria) return memoria
  const raw = leerStorage(KEY)
  if (raw) { try { memoria = JSON.parse(raw) as DB; return memoria } catch { /* corrupto */ } }
  memoria = baseVacia()
  return memoria
}

const listeners = new Set<(t: 'comandas' | 'print_jobs' | 'menu' | 'externos') => void>()
function guardar(tabla: 'comandas' | 'print_jobs' | 'menu' | 'externos' = 'comandas') {
  escribirStorage(KEY, JSON.stringify(memoria))
  listeners.forEach(l => l(tabla))
}

function baseVacia(): DB {
  const principal: Sucursal = { id: uid(), nombre: 'Napoles Principal', esPrincipal: true, activa: true, recargoDelivery: 1500, recargoDeliveryTipo: 'monto', cocinaActiva: false, cocinaAmarillo: 7, cocinaRojo: 15, plan: 'pro' }
  const benavidez: Sucursal = { id: uid(), nombre: 'Napoles Benavidez', esPrincipal: false, activa: true, recargoDelivery: 10, recargoDeliveryTipo: 'porc', cocinaActiva: false, cocinaAmarillo: 7, cocinaRojo: 15, plan: 'pro' }
  return {
    cuenta: { id: uid(), nombre: 'Napoles' },
    sucursales: [principal, benavidez],
    usuarios: [
      { userId: uid(), usuario: 'admin', password: '1234', rol: 'admin', nombre: 'Rodrigo' },
      { userId: uid(), usuario: 'principal', password: '1234', rol: 'local', sucursalId: principal.id },
      { userId: uid(), usuario: 'benavidez', password: '1234', rol: 'local', sucursalId: benavidez.id },
    ],
    ingredientes: [], categorias: [], productos: [], ajustes: [],
    zonas: [],
    impresoras: [principal, benavidez].map(s => ({
      id: uid(), sucursalId: s.id, nombre: 'Cocina', imprimeMostrador: true, imprimeDelivery: true, copias: 1, ancho: 48,
    })),
    repartidores: [
      { id: uid(), sucursalId: principal.id, nombre: 'Ariel', dni: '35123456', telefono: '1150001111', activo: true },
      { id: uid(), sucursalId: principal.id, nombre: 'Lucas', dni: '38987654', telefono: '1150002222', activo: true },
      { id: uid(), sucursalId: benavidez.id, nombre: 'Matías', dni: '40111222', telefono: '1150003333', activo: true },
    ],
    cajas: [], comandas: [],
    clientes: [
      { id: uid(), nombre: 'Juan Pérez', telefono: '1155551234', direccion: 'Darragueira 1625', entreCalles: 'Palliere y Gandhi' },
      { id: uid(), nombre: 'María Gómez', telefono: '1144443210', direccion: '25 de Mayo 2034' },
    ],
    printJobs: [],
  }
}

/** La primera vez carga el menú de ejemplo como si lo hiciera el admin */
async function asegurarMenu() {
  if (db().productos.length) return
  if (!sembrando) {
    sembrando = (async () => {
      const previa = sesionMemoria
      sesionMemoria = db().usuarios.find(u => u.rol === 'admin')!.userId
      try {
        await importarMenuEjemplo(localRepo)
        // Un ejemplo de ajuste de Benavidez: la muzza más cara y la humita agotada
        const d = db()
        const ben = d.sucursales.find(s => !s.esPrincipal)!
        const muzza = d.productos.find(p => p.nombre === 'Grande Muzzarella')
        const humita = d.productos.find(p => p.nombre === 'Humita')
        if (muzza) d.ajustes.push({ sucursalId: ben.id, productoId: muzza.id, precio: 19500, precioMitad: 9800, oculto: false, agotado: false })
        if (humita) d.ajustes.push({ sucursalId: ben.id, productoId: humita.id, oculto: false, agotado: true })
        guardar('menu')
      } finally { sesionMemoria = previa }
    })()
  }
  await sembrando
}

// ---------------------------------------------------------------------
// Permisos (los mismos que las políticas RLS)
// ---------------------------------------------------------------------
function sesionActual(): Sesion | null {
  const id = sesionMemoria ?? leerStorage(KEY_SESION)
  const u = db().usuarios.find(x => x.userId === id)
  if (!u) return null
  return { userId: u.userId, usuario: u.usuario, rol: u.rol, cuentaId: db().cuenta.id, cuentaNombre: db().cuenta.nombre, plan: db().cuenta.plan ?? 'pro', sucursalId: u.sucursalId, puedeDescontar: u.rol === 'admin' || !!u.puedeDescontar, esProduccion: u.rol !== 'admin' && !!u.esProduccion }
}
function ses(): Sesion {
  const s = sesionActual()
  if (!s) throw new Error('Tenés que iniciar sesión')
  return s
}
const esSuper = () => (sesionMemoria ?? leerStorage(KEY_SESION)) === SUPERADMIN.id
function soloSuper() {
  if (!esSuper()) throw new Error('Solo el administrador de CloudTicket')
}
function soloAdmin() {
  const s = ses()
  if (s.rol !== 'admin') throw new Error('Solo un administrador puede hacer esto')
  return s
}
/** Mismas reglas que el trigger validar_descuentos_comanda() de la base */
function validarDescuentos(data: NuevaComanda, anterior?: Comanda) {
  const manual = (c: Pick<Comanda, 'descuento' | 'descuentoCupon'>) => c.descuento - (c.descuentoCupon || 0)
  if ((data.descuentoCupon || 0) > data.descuento + 0.01) throw new Error('El descuento del cupón no puede ser mayor al descuento total')
  if (!ses().puedeDescontar) {
    const cambia = anterior
      ? Math.abs(manual(data) - manual(anterior)) > 0.01 || Math.abs(data.adicional - anterior.adicional) > 0.01
      : manual(data) > 0.01 || data.adicional > 0.01
    if (cambia) throw new Error(anterior ? 'Solo el administrador o un encargado pueden cambiar descuentos o adicionales' : 'Solo el administrador o un encargado pueden aplicar descuentos o adicionales')
  }
  if (!data.cuponId) {
    if ((data.descuentoCupon || 0) > 0.01) throw new Error('Hay descuento de cupón sin cupón')
    data.cuponCodigo = undefined
    return
  }
  const c = (db().cupones ?? []).find(x => x.id === data.cuponId)
  if (!c) throw new Error('Cupón inválido')
  data.cuponCodigo = c.codigo
  if (!anterior || anterior.cuponId !== data.cuponId) {
    const usos = db().comandas.filter(x => x.cuponId === c.id && x.estado !== 'anulada' && x.id !== anterior?.id).length
    const p = problemaCupon(c, usos)
    if (p) throw new Error(p)
  }
  const max = descuentoCupon(c, data.subtotal)
  if ((data.descuentoCupon || 0) > max + 1) throw new Error(`El cupón ${c.codigo} descuenta como máximo $${max}`)
}

function puedeLocal(sucursalId: string) {
  const s = ses()
  if (s.rol !== 'admin' && s.sucursalId !== sucursalId) throw new Error('No tenés acceso a ese local')
}
function puedeEditarProducto(sucursalId?: string) {
  const s = ses()
  if (s.rol === 'admin') return
  if (!sucursalId || sucursalId !== s.sucursalId) throw new Error('Los productos del menú madre los cambia el administrador')
}
const sinLocal = <T extends { sucursalId: string }>(x: T) => { const { sucursalId: _, ...resto } = x; void _; return resto }

const redondear = (v: number, r: number) => Math.round(v / r) * r

// ---- Stock (igual que los triggers de la base)
function moverStock(sucursalId: string, ingredienteId: string, cant: number) {
  const d = db()
  d.stock ??= []
  let s = d.stock.find(x => x.sucursalId === sucursalId && x.ingredienteId === ingredienteId)
  if (!s) { s = { sucursalId, ingredienteId, cantidad: 0, minimo: 0 }; d.stock.push(s) }
  s.cantidad = Math.round((s.cantidad + cant) * 1000) / 1000
}
function descontarComanda(c: Comanda & { sucursalId: string }) {
  if (c.estado === 'anulada') return
  const d = db()
  d.stockMovs ??= []
  for (const it of c.items) {
    for (const [ing, cant] of consumoItem(it, d.productos)) {
      if (!cant) continue
      d.stockMovs.push({ id: uid(), sucursalId: c.sucursalId, ingredienteId: ing, tipo: 'venta', cantidad: -cant, comandaId: c.id, comandaItemId: it.id, createdAt: ahora() })
      moverStock(c.sucursalId, ing, -cant)
    }
  }
}
function devolverComanda(comandaId: string) {
  const d = db()
  for (const m of (d.stockMovs ?? []).filter(x => x.comandaId === comandaId && x.tipo === 'venta')) moverStock(m.sucursalId, m.ingredienteId, -m.cantidad)
  d.stockMovs = (d.stockMovs ?? []).filter(x => !(x.comandaId === comandaId && x.tipo === 'venta'))
}
const enRango = (iso: string, desde: string, hasta: string) => iso >= desde && iso < hasta


// ---------------------------------------------------------------------

export const localRepo: Repo = {
  modo: 'demo',

  async estadoSesion(): Promise<EstadoSesion> {
    if (esSuper()) { await asegurarMenu(); return { estado: 'superadmin', usuario: SUPERADMIN.usuario } }
    const s = sesionActual()
    if (!s) return { estado: 'sin_login' }
    await asegurarMenu()
    return { estado: 'ok', sesion: s }
  },

  async login(usuario, password) {
    if (usuario.trim().toLowerCase() === SUPERADMIN.usuario && password === SUPERADMIN.password) {
      sesionMemoria = SUPERADMIN.id
      escribirStorage(KEY_SESION, SUPERADMIN.id)
      return
    }
    const u = db().usuarios.find(x => x.usuario === usuario.trim().toLowerCase() && x.password === password)
    if (!u) throw new Error('Usuario o contraseña incorrectos')
    sesionMemoria = u.userId
    escribirStorage(KEY_SESION, u.userId)
    listeners.forEach(l => l('menu'))
  },

  async logout() {
    sesionMemoria = null
    escribirStorage(KEY_SESION, null)
  },

  onAuthChange(cb) {
    const f = () => cb()
    listeners.add(f)
    return () => { listeners.delete(f) }
  },

  // ---- Locales y usuarios
  async listSucursales() {
    const s = ses()
    return pausa(clon(db().sucursales.filter(x => s.rol === 'admin' || x.id === s.sucursalId)
      .map(x => ({ ...x, recargoDelivery: x.recargoDelivery ?? 0, recargoDeliveryTipo: x.recargoDeliveryTipo ?? 'monto', cocinaActiva: !!x.cocinaActiva, cocinaAmarillo: x.cocinaAmarillo ?? 7, cocinaRojo: x.cocinaRojo ?? 15, plan: x.plan ?? 'pro' }))))
  },

  async listCupones() {
    soloAdmin()
    return pausa(clon(db().cupones ?? []))
  },

  async guardarCupon(c) {
    soloAdmin()
    const d = db()
    d.cupones ??= []
    const codigo = normalizarCodigo(c.codigo)
    if (codigo.length < 3 || codigo.length > 30) throw new Error('El código va de 3 a 30 letras o números.')
    if (!(c.valor > 0) || (c.tipo === 'porc' && c.valor > 100)) throw new Error('El valor tiene que ser mayor a cero (y hasta 100%).')
    if (c.desde && c.hasta && c.desde > c.hasta) throw new Error('La fecha de inicio es posterior al vencimiento.')
    if (d.cupones.some(x => x.codigo === codigo && x.id !== c.id)) throw new Error('Ya existe un cupón con ese código.')
    const fila: Cupon = { ...clon(c), codigo, id: c.id ?? uid() }
    const i = d.cupones.findIndex(x => x.id === c.id)
    if (i >= 0) d.cupones[i] = fila
    else d.cupones.unshift(fila)
    guardar('menu')
  },

  async eliminarCupon(id) {
    soloAdmin()
    const d = db()
    d.cupones = (d.cupones ?? []).filter(x => x.id !== id)
    for (const c of d.comandas) if (c.cuponId === id) c.cuponId = undefined
    guardar('menu')
  },

  async crearCupones(lista) {
    soloAdmin()
    const d = db()
    d.cupones ??= []
    const existentes = new Set(d.cupones.map(x => x.codigo))
    const nuevos: Cupon[] = []
    for (const c of lista) {
      const codigo = normalizarCodigo(c.codigo)
      if (existentes.has(codigo)) throw new Error(`Ya existe un cupón con el código ${codigo}.`)
      existentes.add(codigo)
      nuevos.push({ ...clon(c), codigo, id: uid() })
    }
    d.cupones.unshift(...nuevos)
    guardar('menu')
    return nuevos.length
  },

  async eliminarCupones(ids) {
    soloAdmin()
    const d = db()
    const set = new Set(ids)
    d.cupones = (d.cupones ?? []).filter(x => !set.has(x.id))
    for (const c of d.comandas) if (c.cuponId && set.has(c.cuponId)) c.cuponId = undefined
    guardar('menu')
  },

  async activarCupones(ids, activo) {
    soloAdmin()
    const set = new Set(ids)
    for (const c of db().cupones ?? []) if (set.has(c.id)) c.activo = activo
    guardar('menu')
  },

  async usoCupones() {
    soloAdmin()
    const out: Record<string, UsoCupon> = {}
    for (const c of db().comandas) {
      if (!c.cuponId || c.estado === 'anulada') continue
      const u = (out[c.cuponId] ??= { usos: 0, descontado: 0 })
      u.usos++; u.descontado += c.descuentoCupon || 0
    }
    return pausa(out)
  },

  async validarCupon(codigo) {
    ses()
    const cod = normalizarCodigo(codigo)
    const c = (db().cupones ?? []).find(x => x.codigo === cod)
    if (!c) throw new Error(`El cupón ${cod} no existe`)
    const p = problemaCupon(c, db().comandas.filter(x => x.cuponId === c.id && x.estado !== 'anulada').length)
    if (p) throw new Error(p)
    return pausa({ id: c.id, codigo: c.codigo, descripcion: c.descripcion, tipo: c.tipo, valor: c.valor })
  },

  async configCocina(sucursalId, c) {
    const s = ses()
    if (c.activa && (db().sucursales.find(x => x.id === sucursalId)?.plan ?? 'pro') !== 'pro') throw new Error('La pantalla de cocina es del plan PRO')
    if (!(s.rol === 'admin' || (s.puedeDescontar && s.sucursalId === sucursalId))) throw new Error('Solo el administrador o el encargado del local pueden configurar la cocina')
    if (c.amarillo < 1 || c.rojo <= c.amarillo) throw new Error('Los minutos de rojo tienen que ser más que los de amarillo')
    const suc = db().sucursales.find(x => x.id === sucursalId)
    if (suc) Object.assign(suc, { cocinaActiva: c.activa, cocinaAmarillo: c.amarillo, cocinaRojo: c.rojo })
    guardar('menu')
  },
  async horaServidor() { return ahora() },

  async actualizarSucursal(id, data) {
    soloAdmin()
    const s = db().sucursales.find(x => x.id === id)
    if (s) Object.assign(s, data)
    guardar('menu')
  },

  async listUsuarios() {
    soloAdmin()
    return pausa(db().usuarios.map(({ password: _, ...u }) => { void _; return u }))
  },

  async setTipoUsuario(userId, tipo) {
    if (!esSuper()) soloAdmin()
    const u = db().usuarios.find(x => x.userId === userId && x.rol === 'local')
    if (!u) throw new Error('Ese usuario no es de tu cuenta')
    u.puedeDescontar = tipo === 'encargado'
    u.esProduccion = tipo === 'produccion'
    guardar('menu')
  },

  async setPuedeDescontar(userId, valor) {
    soloAdmin()
    const u = db().usuarios.find(x => x.userId === userId && x.rol === 'local')
    if (!u) throw new Error('Ese usuario no es de tu cuenta')
    u.puedeDescontar = valor
    guardar('menu')
  },

  async crearUsuario({ usuario, password, sucursalId, nombre, puedeDescontar, tipo }) {
    soloAdmin()
    const u = usuario.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(u)) throw new Error('El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.')
    if (password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.')
    if (db().usuarios.some(x => x.usuario === u)) throw new Error(`El usuario "${u}" ya existe. Probá con otro nombre.`)
    db().usuarios.push({ userId: uid(), usuario: u, password, rol: 'local', sucursalId, nombre, puedeDescontar: tipo ? tipo === 'encargado' : !!puedeDescontar, esProduccion: tipo === 'produccion' })
    guardar('menu')
  },

  async cambiarPassword(userId, password) {
    if (!esSuper()) soloAdmin()
    if (password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.')
    const u = db().usuarios.find(x => x.userId === userId)
    if (u) u.password = password
    guardar('menu')
  },

  async eliminarUsuario(userId) {
    if (esSuper()) {
      db().usuarios = db().usuarios.filter(x => x.userId !== userId)
      guardar('menu')
      return
    }
    soloAdmin()
    const d = db()
    const u = d.usuarios.find(x => x.userId === userId)
    if (u?.rol === 'admin') throw new Error('No se puede borrar un administrador desde acá.')
    d.usuarios = d.usuarios.filter(x => x.userId !== userId)
    guardar('menu')
  },

  // ---- Administrador general (la demo tiene una sola cuenta)
  async saResumen() {
    soloSuper()
    const d = db()
    return pausa(clon([{
      id: d.cuenta.id, nombre: d.cuenta.nombre, plan: d.cuenta.plan ?? 'pro', createdAt: d.cuenta.createdAt ?? '2026-09-01T12:00:00.000Z',
      locales: d.sucursales.map(s => ({ id: s.id, nombre: s.nombre, vence: s.vence, plan: s.plan ?? 'pro', activa: s.activa, esPrincipal: s.esPrincipal, createdAt: '2026-09-01T12:00:00.000Z' })),
      usuarios: d.usuarios.map(({ password: _, ...u }) => { void _; return u }),
    }]))
  },
  async saCrearCuenta() { soloSuper(); throw new Error('En la demo hay una sola cuenta: probalo con la base real') },
  async saRenombrarCuenta(_id, nombre) { soloSuper(); db().cuenta.nombre = nombre.trim(); guardar('menu') },
  async saSetPlanLocal(id, plan) {
    soloSuper()
    const s = db().sucursales.find(x => x.id === id)
    if (s) { s.plan = plan; if (plan === 'principal') s.cocinaActiva = false }
    guardar('menu')
  },
  async saCrearLocal(_id, nombre, vence, plan) {
    soloSuper()
    if (!nombre.trim()) throw new Error('Poné el nombre del local')
    const d = db()
    const suc: Sucursal = { id: uid(), nombre: nombre.trim(), esPrincipal: false, activa: true, recargoDelivery: 0, recargoDeliveryTipo: 'monto', cocinaActiva: false, cocinaAmarillo: 7, cocinaRojo: 15, plan, vence: vence || undefined }
    d.sucursales.push(suc)
    d.impresoras.push({ id: uid(), sucursalId: suc.id, nombre: 'Cocina', imprimeMostrador: true, imprimeDelivery: true, copias: 1, ancho: 48 })
    guardar('menu')
  },
  async saEditarLocal(id, nombre, activa) {
    soloSuper()
    const s = db().sucursales.find(x => x.id === id)
    if (s) Object.assign(s, { nombre: nombre.trim(), activa })
    guardar('menu')
  },
  async saSetVence(id, vence) {
    soloSuper()
    const s = db().sucursales.find(x => x.id === id)
    if (s) s.vence = vence || undefined
    guardar('menu')
  },
  async saCrearUsuario({ sucursalId, usuario, password, tipo }) {
    soloSuper()
    const u = usuario.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(u)) throw new Error('El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.')
    if (password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.')
    if (u === SUPERADMIN.usuario || db().usuarios.some(x => x.usuario === u)) throw new Error(`El usuario "${u}" ya existe. Probá con otro nombre.`)
    db().usuarios.push(tipo === 'admin'
      ? { userId: uid(), usuario: u, password, rol: 'admin' }
      : { userId: uid(), usuario: u, password, rol: 'local', sucursalId, puedeDescontar: tipo === 'encargado', esProduccion: tipo === 'produccion' })
    guardar('menu')
  },

  // ---- Menú
  async getMenu(sucursalId): Promise<MenuData> {
    ses()
    if (sucursalId) puedeLocal(sucursalId)
    const d = db()
    // Menú madre + lo propio del local pedido (sin local: solo el menú madre)
    const visible = (suc?: string) => !suc || suc === sucursalId
    return pausa(clon({
      categorias: d.categorias.filter(c => visible(c.sucursalId)),
      productos: d.productos.filter(p => visible(p.sucursalId)),
      ajustes: sucursalId ? d.ajustes.filter(a => a.sucursalId === sucursalId).map(sinLocal) : [],
      ingredientes: d.ingredientes,
    }))
  },

  async guardarCategoria(c) {
    puedeEditarProducto(c.sucursalId)
    const d = db()
    if (c.id) {
      const x = d.categorias.find(y => y.id === c.id)
      if (!x) throw new Error('Categoría no encontrada')
      puedeEditarProducto(x.sucursalId)
      Object.assign(x, c)
      guardar('menu')
      return clon(x)
    }
    const nueva: Categoria = { ...c, id: uid() }
    d.categorias.push(nueva)
    guardar('menu')
    return clon(nueva)
  },

  async actualizarProductos(cambios) {
    const d = db()
    for (const c of cambios) {
      const p = d.productos.find(x => x.id === c.id)
      if (!p) continue
      puedeEditarProducto(p.sucursalId)
      Object.assign(p, { precio: c.precio, precioMitad: c.precioMitad, activo: c.activo })
    }
    guardar('menu')
    await pausa(null)
  },

  async guardarProducto(p) {
    puedeEditarProducto(p.sucursalId)
    const d = db()
    if (p.id) {
      const i = d.productos.findIndex(y => y.id === p.id)
      if (i < 0) throw new Error('Producto no encontrado')
      puedeEditarProducto(d.productos[i].sucursalId)
      d.productos[i] = { ...clon(p), id: p.id, receta: unirReceta(p.receta), slots: p.slots.map(s => ({ ...s, id: s.id.startsWith('nuevo') ? uid() : s.id })) }
      guardar('menu')
      return clon(d.productos[i])
    }
    const nuevo: Producto = { ...clon(p), id: uid(), receta: unirReceta(p.receta), slots: p.slots.map(s => ({ ...s, id: uid() })) }
    d.productos.push(nuevo)
    guardar('menu')
    return clon(nuevo)
  },

  async guardarAjuste(sucursalId, a) {
    puedeLocal(sucursalId)
    const d = db()
    const i = d.ajustes.findIndex(x => x.sucursalId === sucursalId && x.productoId === a.productoId)
    const fila = { ...a, sucursalId }
    if (i >= 0) d.ajustes[i] = fila; else d.ajustes.push(fila)
    guardar('menu')
  },

  async quitarAjuste(sucursalId, productoId) {
    puedeLocal(sucursalId)
    const d = db()
    d.ajustes = d.ajustes.filter(x => !(x.sucursalId === sucursalId && x.productoId === productoId))
    guardar('menu')
  },

  async aumentarPrecios(categoriaId, porcentaje, sucursalId, redondeo) {
    const f = 1 + porcentaje / 100
    const r = Math.max(redondeo || 1, 0.01)
    const d = db()
    let n = 0
    const subir = (p: { precio: number; precioMitad?: number }) => {
      p.precio = redondear(p.precio * f, r)
      if (p.precioMitad != null) p.precioMitad = redondear(p.precioMitad * f, r)
    }
    if (!sucursalId) {
      soloAdmin()
      for (const p of d.productos) if (p.categoriaId === categoriaId && !p.sucursalId && p.tipo !== 'promo') { subir(p); n++ }
    } else {
      puedeLocal(sucursalId)
      for (const p of d.productos) if (p.categoriaId === categoriaId && p.sucursalId === sucursalId && p.tipo !== 'promo') { subir(p); n++ }
      for (const a of d.ajustes) {
        const p = d.productos.find(x => x.id === a.productoId)
        if (a.sucursalId === sucursalId && p?.categoriaId === categoriaId) {
          if (a.precio != null) { a.precio = redondear(a.precio * f, r); n++ }
          if (a.precioMitad != null) a.precioMitad = redondear(a.precioMitad * f, r)
        }
      }
    }
    guardar('menu')
    return n
  },

  async eliminarCategoria(id) {
    const d = db()
    const c = d.categorias.find(x => x.id === id)
    if (!c) throw new Error('Categoría no encontrada')
    puedeEditarProducto(c.sucursalId)
    const borrados = new Set(d.productos.filter(p => p.categoriaId === id).map(p => p.id))
    d.productos = d.productos.filter(p => !borrados.has(p.id))
    for (const p of d.productos) {
      p.fijos = p.fijos.filter(f => !borrados.has(f.productoId))
      p.slots = p.slots.filter(s => s.categoriaId !== id)
    }
    d.ajustes = d.ajustes.filter(a => !borrados.has(a.productoId))
    if (d.mapeos) d.mapeos = d.mapeos.filter(m => !m.productoId || !borrados.has(m.productoId))
    if (d.planillaFabrica) d.planillaFabrica = d.planillaFabrica.filter(x => !borrados.has(productoDePlanilla(typeof x === 'string' ? x : x.clave) ?? ''))
    d.categorias = d.categorias.filter(x => x.id !== id)
    guardar('menu')
  },

  async eliminarIngrediente(id) {
    soloAdmin()
    const d = db()
    const usan = d.productos.filter(p => p.receta.some(r => r.ingredienteId === id)).map(p => p.nombre)
    if (usan.length) throw new Error(errorIngredienteEnUso(usan))
    d.ingredientes = d.ingredientes.filter(x => x.id !== id)
    if (d.stock) d.stock = d.stock.filter(x => x.ingredienteId !== id)
    guardar('menu')
  },

  async guardarIngrediente(i) {
    soloAdmin()
    const d = db()
    if (i.id) {
      const x = d.ingredientes.find(y => y.id === i.id)
      if (!x) throw new Error('Ingrediente no encontrado')
      Object.assign(x, i)
      guardar('menu')
      return clon(x)
    }
    const nuevo: Ingrediente = { ...i, id: uid() }
    d.ingredientes.push(nuevo)
    guardar('menu')
    return clon(nuevo)
  },

  // ---- Zonas e impresoras
  async listZonas(sucursalId) {
    puedeLocal(sucursalId)
    return pausa(db().zonas.filter(z => z.sucursalId === sucursalId).map(sinLocal))
  },
  async guardarZona(sucursalId, z) {
    puedeLocal(sucursalId)
    const d = db()
    if (z.id) { const x = d.zonas.find(y => y.id === z.id); if (x) Object.assign(x, z) }
    else d.zonas.push({ ...z, id: uid(), sucursalId })
    guardar('menu')
  },
  async eliminarZona(id) {
    const d = db()
    const z = d.zonas.find(x => x.id === id)
    if (z) puedeLocal(z.sucursalId)
    d.zonas = d.zonas.filter(x => x.id !== id)
    guardar('menu')
  },
  async listImpresoras(sucursalId) {
    puedeLocal(sucursalId)
    return pausa(db().impresoras.filter(i => i.sucursalId === sucursalId).map(sinLocal))
  },

  async guardarImpresora(sucursalId, i) {
    puedeLocal(sucursalId)
    if (!i.nombre.trim()) throw new Error('Poné un nombre para la comandera (ej: Cocina).')
    const d = db()
    const fila = { ...clon(i), nombre: i.nombre.trim(), copias: Math.max(1, Math.min(5, i.copias || 1)), ancho: i.ancho === 32 ? 32 : 48, sucursalId }
    const k = d.impresoras.findIndex(x => x.id === i.id)
    if (k >= 0) d.impresoras[k] = { ...d.impresoras[k], ...fila, id: d.impresoras[k].id }
    else d.impresoras.push({ ...fila, id: uid() })
    guardar('print_jobs')
  },

  async eliminarImpresora(id) {
    const d = db()
    const i = d.impresoras.find(x => x.id === id)
    if (!i) return
    puedeLocal(i.sucursalId)
    d.impresoras = d.impresoras.filter(x => x.id !== id)
    guardar('print_jobs')
  },

  async generarTokenImpresora(id) {
    const i = db().impresoras.find(x => x.id === id)
    if (!i) throw new Error('Esa comandera no existe')
    puedeLocal(i.sucursalId)
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    i.conToken = true
    i.vinculadaAt = undefined; i.pcNombre = undefined; i.impresoraWindows = undefined
    guardar('print_jobs')
    return `CT-${hex.match(/.{4}/g)!.join('-')}`
  },

  async listRepartidores(sucursalId) {
    puedeLocal(sucursalId)
    return pausa((db().repartidores ?? []).filter(r => r.sucursalId === sucursalId).map(sinLocal))
  },
  async guardarRepartidor(sucursalId, r) {
    puedeLocal(sucursalId)
    const d = db()
    d.repartidores ??= []
    if (!r.nombre.trim()) throw new Error('Poné el nombre del repartidor.')
    if (r.id) {
      const x = d.repartidores.find(y => y.id === r.id)
      if (!x) throw new Error('Repartidor no encontrado')
      Object.assign(x, r)
      guardar('comandas')
      return clon(sinLocal(x))
    }
    const nuevo = { ...r, id: uid(), sucursalId }
    d.repartidores.push(nuevo)
    guardar('comandas')
    return clon(sinLocal(nuevo))
  },

  // ---- Operación
  async getCajaAbierta(sucursalId) {
    puedeLocal(sucursalId)
    const c = db().cajas.find(x => x.sucursalId === sucursalId && x.estado === 'abierta')
    return pausa(c ? clon(sinLocal(c)) : null)
  },

  async abrirCaja(sucursalId, turno, dineroInicial) {
    puedeLocal(sucursalId)
    const d = db()
    if (d.cajas.some(c => c.sucursalId === sucursalId && c.estado === 'abierta')) throw new Error('Ya hay una caja abierta en este local.')
    const bloquea = turnoQueBloquea(turno, d.cajas.filter(c => c.sucursalId === sucursalId))
    if (bloquea && ses().rol !== 'admin') throw new Error(`Hoy ya se abrió la caja ${bloquea.toLowerCase()}. Solo el administrador puede abrir un turno anterior o repetirlo.`)
    const caja = {
      id: uid(), sucursalId, turno, estado: 'abierta' as const, abiertaAt: ahora(), ultimoNumero: 0,
      dineroInicial: dineroInicial || 0, abiertaPor: ses().usuario,
    }
    d.cajas.push(caja)
    guardar()
    return clon(sinLocal(caja))
  },

  async cerrarCaja(id, dineroCierre, observaciones) {
    const d = db()
    const c = d.cajas.find(x => x.id === id && x.estado === 'abierta')
    if (!c) throw new Error('La caja no está abierta')
    puedeLocal(c.sucursalId)
    const totales = calcularTotales(c, d.comandas.filter(x => x.cajaId === id), (d.movimientos ?? []).filter(m => m.cajaId === id))
    Object.assign(c, {
      estado: 'cerrada', cerradaAt: ahora(), cerradaPor: ses().usuario, observaciones: observaciones?.trim() || undefined,
      totales, dineroCierre, diferencia: dineroCierre - totales.efectivoTeorico,
    })
    guardar()
  },

  async reabrirCaja(id) {
    const d = db()
    const c = d.cajas.find(x => x.id === id && x.estado === 'cerrada')
    if (!c) throw new Error('Esa caja no está cerrada')
    puedeLocal(c.sucursalId)
    if (d.cajas.some(x => x.sucursalId === c.sucursalId && x.estado === 'abierta')) throw new Error('Ya hay una caja abierta en este local')
    if (d.cajas.some(x => x.sucursalId === c.sucursalId && x.abiertaAt > c.abiertaAt)) throw new Error('Solo se puede reabrir la última caja del local')
    Object.assign(c, { estado: 'abierta', cerradaAt: undefined, cerradaPor: undefined, totales: undefined, dineroCierre: undefined, diferencia: undefined })
    guardar()
  },

  async listCajas(sucursalId, limit = 60) {
    puedeLocal(sucursalId)
    return pausa(clon(db().cajas.filter(c => c.sucursalId === sucursalId)
      .sort((a, b) => b.abiertaAt.localeCompare(a.abiertaAt)).slice(0, limit).map(sinLocal)))
  },

  async listMovimientos(cajaId) {
    const caja = db().cajas.find(c => c.id === cajaId)
    if (!caja) return []
    puedeLocal(caja.sucursalId)
    return pausa(clon((db().movimientos ?? []).filter(m => m.cajaId === cajaId)))
  },

  async agregarMovimiento(cajaId, m) {
    const d = db()
    const caja = d.cajas.find(c => c.id === cajaId)
    if (!caja || caja.estado !== 'abierta') throw new Error('La caja no está abierta')
    puedeLocal(caja.sucursalId)
    if (!(m.monto > 0)) throw new Error('Poné un monto mayor a cero.')
    if (!m.concepto.trim()) throw new Error('Poné un concepto.')
    d.movimientos ??= []
    d.movimientos.push({
      ...m, concepto: m.concepto.trim(), id: uid(), cajaId, createdAt: ahora(), creadoPor: ses().usuario,
      tipoGastoNombre: TIPOS_GASTO_DEMO.find(t => t.id === m.tipoGastoId)?.nombre,
    })
    guardar()
  },

  async eliminarMovimiento(id) {
    const d = db()
    const m = (d.movimientos ?? []).find(x => x.id === id)
    if (!m) return
    const caja = d.cajas.find(c => c.id === m.cajaId)
    if (!caja || caja.estado !== 'abierta') throw new Error('Solo se borran movimientos con la caja abierta')
    puedeLocal(caja.sucursalId)
    d.movimientos = d.movimientos!.filter(x => x.id !== id)
    guardar()
  },

  async listTiposGasto() { return pausa(TIPOS_GASTO_DEMO) },

  // ---- Stock
  async getStock(sucursalId) {
    if (!ses().esProduccion) puedeLocal(sucursalId)
    return pausa(clon((db().stock ?? []).filter(x => x.sucursalId === sucursalId).map(sinLocal)))
  },

  // ---- Pedido a fábrica
  async getPlanillaFabrica() { return pausa(planilla()) },
  async guardarPlanillaFabrica(items) {
    soloAdmin()
    db().planillaFabrica = items.map(x => ({ clave: x.clave, presentacion: x.presentacion?.trim() || undefined, factor: x.factor > 0 ? x.factor : 1 }))
    guardar('menu')
  },
  async listPedidosFabrica(sucursalIds, limite = 100) {
    const s = ses()
    const visibles = (p: PedidoFabrica) => s.rol === 'admin' || s.esProduccion || p.sucursalId === s.sucursalId
    return pausa(clon((db().pedidosFabrica ?? [])
      .filter(p => visibles(p) && (!sucursalIds || sucursalIds.includes(p.sucursalId)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, limite)
      .map(p => ({ ...p, items: p.items.map(it => ({ ...it, factor: it.factor ?? 1 })) }))))
  },
  async crearPedidoFabrica(sucursalId, d) {
    if (ses().esProduccion) throw new Error('Sin acceso a ese local')
    puedeLocal(sucursalId)
    if (!d.fecha) throw new Error('Poné la fecha del pedido')
    const db0 = db()
    const items = d.items.filter(i => i.cantidad > 0).map(i => {
      const pl = planilla().find(x => x.clave === (i.productoId ? PREFIJO_PRODUCTO + i.productoId : i.ingredienteId))
      const pres = { presentacion: pl?.presentacion, factor: pl?.factor ?? 1 }
      if (i.productoId) {
        const prod = db0.productos.find(x => x.id === i.productoId)
        if (!prod) throw new Error('Producto inválido')
        return { id: uid(), productoId: prod.id, nombre: prod.nombre, unidad: 'un' as const, cantidad: i.cantidad, ...pres }
      }
      const ing = db0.ingredientes.find(x => x.id === i.ingredienteId)
      if (!ing) throw new Error('Ingrediente inválido')
      return { id: uid(), ingredienteId: ing.id, nombre: ing.nombre, unidad: ing.unidad, cantidad: i.cantidad, ...pres }
    })
    if (!items.length) throw new Error('El pedido está vacío: poné al menos una cantidad')
    db0.pedidosFabrica ??= []
    const numero = Math.max(0, ...db0.pedidosFabrica.filter(p => p.sucursalId === sucursalId).map(p => p.numero)) + 1
    db0.pedidosFabrica.push({ id: uid(), sucursalId, numero, fecha: d.fecha, notas: d.notas?.trim() || undefined, estado: 'pendiente', creadoPor: ses().usuario, createdAt: ahora(), items })
    guardar('menu')
  },
  async recibirPedidoFabrica(pedidoId, items) {
    const d = db()
    const p = (d.pedidosFabrica ?? []).find(x => x.id === pedidoId)
    if (!p || ses().esProduccion) throw new Error('Sin acceso a ese pedido')
    puedeLocal(p.sucursalId)
    if (p.estado !== 'pendiente') throw new Error('Este pedido ya fue recibido')
    d.stockMovs ??= []
    for (const it of p.items) {
      const rec = Math.max(0, items.find(x => x.id === it.id)?.recibido ?? 0)
      it.recibido = rec
      if (rec > 0 && it.ingredienteId) {
        const base = rec * (it.factor ?? 1)
        d.stockMovs.push({ id: uid(), sucursalId: p.sucursalId, ingredienteId: it.ingredienteId, tipo: 'ingreso', cantidad: base, motivo: `Pedido fábrica #${p.numero}`, creadoPor: ses().usuario, createdAt: ahora() })
        moverStock(p.sucursalId, it.ingredienteId, base)
      }
    }
    Object.assign(p, { estado: 'recibido', recibidoAt: ahora(), recibidoPor: ses().usuario })
    guardar('menu')
  },
  async anularPedidoFabrica(pedidoId) {
    const p = (db().pedidosFabrica ?? []).find(x => x.id === pedidoId)
    if (!p || ses().esProduccion) throw new Error('Sin acceso a ese pedido')
    puedeLocal(p.sucursalId)
    if (p.estado !== 'pendiente') throw new Error('Solo se puede anular un pedido que todavía no llegó')
    p.estado = 'anulado'
    guardar('menu')
  },

  async registrarIngreso(sucursalId, data) {
    puedeLocal(sucursalId)
    const d = db()
    const items = data.items.filter(i => i.ingredienteId)
    if (!items.length) throw new Error('El ingreso no tiene ingredientes')
    if (items.some(i => !(i.cantidad > 0))) throw new Error('Las cantidades tienen que ser mayores a cero')
    const total = items.reduce((s, i) => s + (i.costo || 0), 0)
    const ing: IngresoMercaderia = {
      id: uid(), sucursalId, proveedor: data.proveedor?.trim() || undefined, comprobante: data.comprobante?.trim() || undefined,
      observaciones: data.observaciones?.trim() || undefined, total, pagadoConCaja: false, creadoPor: ses().usuario, createdAt: ahora(), items,
    }
    if (data.pagarConCaja && total > 0) {
      const caja = d.cajas.find(c => c.sucursalId === sucursalId && c.estado === 'abierta')
      if (!caja) throw new Error('Para pagar con la caja tiene que haber una caja abierta')
      d.movimientos ??= []
      d.movimientos.push({ id: uid(), cajaId: caja.id, tipo: 'gasto', tipoGastoId: 'tg-2', tipoGastoNombre: 'Pago remito',
        concepto: ['Mercadería', ing.proveedor, ing.comprobante].filter(Boolean).join(' '), monto: total, createdAt: ahora(), creadoPor: ses().usuario })
      ing.pagadoConCaja = true
    }
    d.ingresos ??= []
    d.ingresos.push(ing)
    d.stockMovs ??= []
    for (const it of items) {
      d.stockMovs.push({ id: uid(), sucursalId, ingredienteId: it.ingredienteId, tipo: 'ingreso', cantidad: it.cantidad, costo: it.costo, ingresoId: ing.id, creadoPor: ses().usuario, createdAt: ahora() })
      moverStock(sucursalId, it.ingredienteId, it.cantidad)
      const x = d.ingredientes.find(y => y.id === it.ingredienteId)
      if (x && data.actualizarCosto && it.costo > 0) x.costo = Math.round(it.costo / it.cantidad * (x.unidad === 'un' ? 1 : 1000) * 100) / 100
    }
    guardar('menu')
  },

  async ajustarStock(sucursalId, ingredienteId, tipo, cantidad, motivo) {
    puedeLocal(sucursalId)
    const d = db()
    const actual = (d.stock ?? []).find(x => x.sucursalId === sucursalId && x.ingredienteId === ingredienteId)?.cantidad ?? 0
    let delta: number
    if (tipo === 'ajuste') {
      if (!(cantidad >= 0)) throw new Error('La cantidad contada no puede ser negativa')
      delta = cantidad - actual
    } else {
      if (!(cantidad > 0)) throw new Error('La cantidad a decomisar tiene que ser mayor a cero')
      delta = -cantidad
    }
    if (!delta) return
    d.stockMovs ??= []
    d.stockMovs.push({ id: uid(), sucursalId, ingredienteId, tipo, cantidad: delta, motivo: motivo?.trim() || undefined, creadoPor: ses().usuario, createdAt: ahora() })
    moverStock(sucursalId, ingredienteId, delta)
    guardar('menu')
  },

  async setStockMinimo(sucursalId, ingredienteId, minimo) {
    puedeLocal(sucursalId)
    moverStock(sucursalId, ingredienteId, 0)
    const s = db().stock!.find(x => x.sucursalId === sucursalId && x.ingredienteId === ingredienteId)!
    s.minimo = Math.max(0, minimo || 0)
    guardar('menu')
  },

  // ---- Reportes
  async reporteComandas(sucursalIds, desde, hasta) {
    sucursalIds.forEach(puedeLocal)
    return pausa(clon(db().comandas.filter(c => sucursalIds.includes(c.sucursalId) && enRango(c.createdAt, desde, hasta))))
  },
  async reporteMovimientosCaja(sucursalIds, desde, hasta) {
    sucursalIds.forEach(puedeLocal)
    const d = db()
    const out: MovimientoReporte[] = []
    for (const m of d.movimientos ?? []) {
      const caja = d.cajas.find(c => c.id === m.cajaId)
      if (!caja || !sucursalIds.includes(caja.sucursalId) || !enRango(m.createdAt, desde, hasta)) continue
      const { cajaId: _, ...resto } = m; void _
      out.push({ ...resto, sucursalId: caja.sucursalId, cajaTurno: caja.turno, cajaFecha: caja.abiertaAt })
    }
    return pausa(clon(out))
  },
  async reporteIngresos(sucursalIds, desde, hasta) {
    sucursalIds.forEach(puedeLocal)
    return pausa(clon((db().ingresos ?? []).filter(i => sucursalIds.includes(i.sucursalId) && enRango(i.createdAt, desde, hasta))))
  },
  async reporteStockMovimientos(sucursalIds, desde, hasta, tipos) {
    sucursalIds.forEach(puedeLocal)
    return pausa(clon((db().stockMovs ?? []).filter(m => sucursalIds.includes(m.sucursalId) && enRango(m.createdAt, desde, hasta) && (!tipos || tipos.includes(m.tipo)))
      .map(({ comandaItemId: _, ...m }) => { void _; return m })))
  },

  async listComandas(cajaId) {
    const caja = db().cajas.find(c => c.id === cajaId)
    if (!caja) return []
    puedeLocal(caja.sucursalId)
    return pausa(clon(db().comandas.filter(c => c.cajaId === cajaId).map(sinLocal)))
  },

  async crearComanda(cajaId, data) {
    const d = db()
    const caja = d.cajas.find(c => c.id === cajaId && c.estado === 'abierta')
    if (!caja) throw new Error('La caja no está abierta')
    puedeLocal(caja.sucursalId)
    data = clon(data)
    validarDescuentos(data)
    caja.ultimoNumero += 1
    const comanda = { ...clon(data), id: uid(), cajaId, sucursalId: caja.sucursalId, numero: caja.ultimoNumero, estado: 'pendiente' as const, createdAt: ahora(), updatedAt: ahora() }
    // los ítems necesitan id propio para el stock
    comanda.items = comanda.items.map(it => ({ ...it, id: uid() }))
    d.comandas.push(comanda)
    descontarComanda(comanda)
    guardar()
    return clon(sinLocal(comanda))
  },

  async actualizarComanda(id, data) {
    const d = db()
    const i = d.comandas.findIndex(c => c.id === id)
    if (i < 0) throw new Error('Comanda no encontrada')
    puedeLocal(d.comandas[i].sucursalId)
    if (!ses().puedeDescontar) throw new Error('Solo el administrador o un encargado pueden modificar comandas')
    data = clon(data)
    validarDescuentos(data, d.comandas[i])
    devolverComanda(id)
    d.comandas[i] = { ...d.comandas[i], ...clon(data), updatedAt: ahora() }
    d.comandas[i].items = d.comandas[i].items.map(it => ({ ...it, id: uid() }))
    descontarComanda(d.comandas[i])
    guardar()
    return clon(sinLocal(d.comandas[i]))
  },

  async cambiarEstado(id, estado) {
    const c = db().comandas.find(x => x.id === id)
    if (!c) return
    puedeLocal(c.sucursalId)
    if ((estado === 'anulada') !== (c.estado === 'anulada') && !ses().puedeDescontar) throw new Error('Solo el administrador o un encargado pueden anular comandas')
    if (estado === 'anulada' && c.estado !== 'anulada') devolverComanda(c.id)
    if (estado !== c.estado && estado === 'en_preparacion') { c.cocinaAt = c.cocinaAt ?? ahora(); c.listoAt = undefined }
    if (estado !== c.estado && estado === 'listo') { c.listoAt = ahora(); c.cocinaAt = c.cocinaAt ?? ahora() }
    c.estado = estado; c.updatedAt = ahora()
    guardar()
  },

  async marcarCobrada(id, cobrada) {
    const c = db().comandas.find(x => x.id === id)
    if (!c) return
    puedeLocal(c.sucursalId)
    c.cobrada = cobrada; c.updatedAt = ahora()
    guardar()
  },

  async asignarRepartidor(comandaId, repartidorId) {
    const d = db()
    const c = d.comandas.find(x => x.id === comandaId)
    if (!c) throw new Error('Comanda no encontrada')
    puedeLocal(c.sucursalId)
    const r = (d.repartidores ?? []).find(x => x.id === repartidorId && x.sucursalId === c.sucursalId)
    if (!r) throw new Error('Ese repartidor no es de este local')
    c.repartidorId = r.id; c.repartidorNombre = r.nombre
    c.asignadaAt = ahora(); c.estado = 'en_camino'; c.updatedAt = ahora()
    guardar()
  },

  async quitarRepartidor(comandaId) {
    const c = db().comandas.find(x => x.id === comandaId)
    if (!c) throw new Error('Comanda no encontrada')
    puedeLocal(c.sucursalId)
    if (c.estado === 'entregado' || c.estado === 'anulada') throw new Error('El pedido ya está cerrado')
    c.repartidorId = undefined; c.repartidorNombre = undefined
    c.asignadaAt = undefined; c.estado = c.listoAt ? 'listo' : 'pendiente'; c.updatedAt = ahora()
    guardar()
  },

  async entregarComanda(comandaId, pagos, cobrada) {
    const c = db().comandas.find(x => x.id === comandaId)
    if (!c) throw new Error('Comanda no encontrada')
    puedeLocal(c.sucursalId)
    c.pagos = clon(pagos); c.cobrada = cobrada
    c.estado = 'entregado'; c.entregadaAt = ahora(); c.updatedAt = ahora()
    guardar()
  },

  async buscarClientes(q: BusquedaCliente) {
    ses()
    const norm = (s?: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const dig = (s?: string) => (s ?? '').replace(/\D/g, '')
    return pausa(clon(db().clientes.filter(c =>
      (!q.nombre || norm(c.nombre).includes(norm(q.nombre))) &&
      (!q.telefono || dig(c.telefono).includes(dig(q.telefono))) &&
      (!q.direccion || norm(c.direccion).includes(norm(q.direccion))),
    ).slice(0, 20)))
  },

  async guardarCliente(c) {
    ses()
    const d = db()
    if (c.id) {
      const x = d.clientes.find(y => y.id === c.id)
      if (x) { Object.assign(x, c); guardar(); return clon(x) }
    }
    const nuevo: Cliente = { ...c, id: uid() }
    d.clientes.push(nuevo)
    guardar()
    return clon(nuevo)
  },

  async encolarImpresion(jobs: NuevoPrintJob[]) {
    const d = db()
    for (const j of jobs) {
      const imp = d.impresoras.find(i => i.id === j.impresoraId)
      if (!imp) throw new Error('Comandera no encontrada')
      puedeLocal(imp.sucursalId)
      d.printJobs.unshift({ ...clon(j), id: uid(), estado: 'pendiente', intentos: 0, createdAt: ahora() })
    }
    d.printJobs = d.printJobs.slice(0, 300)
    guardar('print_jobs')
  },

  async listPrintJobs(sucursalId, limit = 50) {
    puedeLocal(sucursalId)
    const imps = new Set(db().impresoras.filter(i => i.sucursalId === sucursalId).map(i => i.id))
    return pausa(clon(db().printJobs.filter(j => imps.has(j.impresoraId)).slice(0, limit)))
  },

  // ---- Importación de pedidos (demo: mismas reglas que importar_pedido_externo)
  async listPedidosExternos(sucursalId, limit = 100) {
    puedeLocal(sucursalId)
    return pausa(clon((db().pedidosExternos ?? []).filter(p => p.sucursalId === sucursalId).slice(0, limit).map(sinLocal)))
  },

  async importarPedidoExterno(id, d) {
    const db_ = db()
    const pe = (db_.pedidosExternos ?? []).find(p => p.id === id)
    if (!pe) throw new Error('Pedido no encontrado')
    puedeLocal(pe.sucursalId)
    if (pe.estado === 'importado' || pe.estado === 'ignorado') return pe.comandaId ?? null
    const num = d.numeroExterno?.trim() || undefined
    if (num && (db_.pedidosExternos ?? []).some(x => x.id !== id && x.sucursalId === pe.sucursalId && x.numeroExterno === num && x.estado === 'importado')) {
      Object.assign(pe, { estado: 'ignorado', error: `Pedido repetido: ya se importó el ${num}`, procesadoAt: ahora(), datos: clon(d) })
      guardar('externos')
      return null
    }
    const caja = db_.cajas.find(c => c.sucursalId === pe.sucursalId && c.estado === 'abierta')
    if (!caja) throw new Error('No hay caja abierta: abrí la caja para importar el pedido')
    caja.ultimoNumero += 1
    const comanda: ConLocal<Comanda> = {
      id: uid(), cajaId: caja.id, sucursalId: caja.sucursalId, numero: caja.ultimoNumero, estado: 'pendiente', tipo: d.tipo,
      clienteNombre: d.clienteNombre, clienteTel: d.clienteTel, direccion: d.direccion, observaciones: d.observaciones,
      costoEnvio: d.costoEnvio, subtotal: d.subtotal, descuento: d.descuento, adicional: d.adicional, total: d.total, descuentoCupon: 0,
      cobrada: d.cobrada, canal: pe.canal, externoId: num, pagos: clon(d.pagos.filter(p => p.monto > 0)),
      items: d.items.map(i => ({ id: uid(), productoId: i.productoId, descripcion: i.descripcion, variante: i.variante, cantidad: i.cantidad, precioUnit: i.precioUnit, nota: i.nota, componentes: [] })),
      createdAt: ahora(), updatedAt: ahora(),
    }
    db_.comandas.push(comanda)
    descontarComanda(comanda)
    Object.assign(pe, { estado: 'importado', comandaId: comanda.id, numeroExterno: num, datos: clon(d), error: undefined, procesadoAt: ahora() })
    guardar('externos')
    guardar()
    return comanda.id
  },

  async marcarPedidoExterno(id, estado, error, datos) {
    const pe = (db().pedidosExternos ?? []).find(p => p.id === id)
    if (!pe) return
    puedeLocal(pe.sucursalId)
    if (estado === 'error' && (pe.estado === 'importado' || pe.estado === 'ignorado')) return
    pe.estado = estado; pe.error = error
    if (datos !== undefined) pe.datos = clon(datos)
    guardar('externos')
  },

  async listMapeos() {
    ses()
    return pausa(clon(db().mapeos ?? []))
  },

  async guardarMapeo(m) {
    ses()
    const d = db()
    d.mapeos ??= []
    const i = d.mapeos.findIndex(x => x.canal === m.canal && x.texto === m.texto)
    const fila = { ...clon(m), productoId: m.ignorar ? undefined : m.productoId, id: i >= 0 ? d.mapeos[i].id : uid() }
    if (i >= 0) d.mapeos[i] = fila
    else d.mapeos.push(fila)
    guardar('externos')
  },

  async eliminarMapeo(id) {
    ses()
    const d = db()
    d.mapeos = (d.mapeos ?? []).filter(x => x.id !== id)
    guardar('externos')
  },

  async simularCaptura(sucursalId, texto) {
    puedeLocal(sucursalId)
    const d = db()
    d.pedidosExternos ??= []
    const hash = texto.replace(/\s+/g, ' ').trim()
    if (d.pedidosExternos.some(p => p.sucursalId === sucursalId && p.texto.replace(/\s+/g, ' ').trim() === hash)) return 'duplicado'
    d.pedidosExternos.unshift({ id: uid(), sucursalId, canal: 'pedidosya', texto, formato: 'texto', estado: 'pendiente', createdAt: ahora() })
    guardar('externos')
    return 'nuevo'
  },

  async eliminarPrintJobs(ids) {
    const d = db()
    const imps = new Map(d.impresoras.map(i => [i.id, i.sucursalId]))
    const borrar = new Set(d.printJobs.filter(j => ids.includes(j.id) && (j.estado === 'pendiente' || j.estado === 'error')).map(j => j.id))
    for (const j of d.printJobs) if (borrar.has(j.id)) puedeLocal(imps.get(j.impresoraId) ?? '')
    d.printJobs = d.printJobs.filter(j => !borrar.has(j.id))
    guardar('print_jobs')
    return borrar.size
  },

  async simularSpool() {
    for (const j of db().printJobs) {
      if (j.estado === 'pendiente') { j.estado = 'impreso'; j.printedAt = ahora(); j.intentos += 1 }
    }
    guardar('print_jobs')
  },

  subscribe(onChange) {
    listeners.add(onChange)
    const onStorage = (ev: StorageEvent) => { if (ev.key === KEY) { memoria = null; onChange('comandas'); onChange('menu') } }
    window.addEventListener('storage', onStorage)
    return () => { listeners.delete(onChange); window.removeEventListener('storage', onStorage) }
  },
}

/** Borra los datos de la demo y vuelve al estado inicial */
export function resetDemo() {
  escribirStorage(KEY, null)
  memoria = null
  sembrando = null
}

export type { Usuario }

/**
 * Solo demo de la app del celular: inventa un mes de cajas, comandas y gastos
 * para que los tableros tengan algo para mostrar. No hace nada si ya hay comandas.
 */
export async function sembrarHistorialDemo() {
  await asegurarMenu()
  const d = db()
  if (d.comandas.length) return
  let semilla = 7
  const rnd = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646 }
  const elegir = <T,>(l: T[]) => l[Math.floor(rnd() * l.length)]
  const vendibles = d.productos.filter(p => p.activo && p.tipo === 'producto' && p.precio > 0)
  const promos = d.productos.filter(p => p.activo && p.tipo === 'promo' && p.precio > 0)
  const tipos = TIPOS_GASTO_DEMO
  const formas: Pago['forma'][] = ['efectivo', 'efectivo', 'efectivo', 'mercado_pago', 'transferencia', 'tarjeta']
  const hoy = new Date()
  d.movimientos ??= []
  for (const suc of d.sucursales) {
    const escala = suc.esPrincipal ? 1 : 0.6
    for (let back = 34; back >= 0; back--) {
      const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - back)
      const turnos = back === 0 ? [{ t: 'Noche', h: 19 }] : [{ t: 'Mañana', h: 11 }, { t: 'Noche', h: 19 }]
      for (const { t, h } of turnos) {
        const abre = new Date(dia); abre.setHours(h, 2 + Math.floor(rnd() * 20))
        if (abre > hoy) abre.setTime(hoy.getTime() - 3 * 3600_000)
        const abierta = back === 0
        const caja = {
          id: uid(), sucursalId: suc.id, turno: t, estado: abierta ? 'abierta' as const : 'cerrada' as const,
          abiertaAt: abre.toISOString(), dineroInicial: 20000, abiertaPor: suc.esPrincipal ? 'principal' : 'benavidez', ultimoNumero: 0,
        } as ConLocal<Caja & { ultimoNumero: number }>
        const finde = [0, 5, 6].includes(dia.getDay())
        const n = Math.round((t === 'Noche' ? 14 : 5) * escala * (finde ? 1.6 : 1) * (0.7 + rnd() * 0.6))
        const comandasCaja: Comanda[] = []
        for (let i = 0; i < n; i++) {
          const creada = new Date(abre.getTime() + (i + rnd()) * (abierta ? 6 : 14) * 60_000)
          const items: ItemComanda[] = []
          for (let k = 0, m = 1 + Math.floor(rnd() * 3); k < m; k++) {
            const p = rnd() < 0.15 && promos.length ? elegir(promos) : elegir(vendibles)
            const cant = p.nombre.toLowerCase().includes('empanada') ? 3 + Math.floor(rnd() * 9) : 1 + Math.floor(rnd() * 2)
            items.push({ id: uid(), productoId: p.id, descripcion: p.nombre, cantidad: cant, precioUnit: p.precio, componentes: [] })
          }
          const subtotal = items.reduce((s, x) => s + x.precioUnit * x.cantidad, 0)
          const r = rnd()
          const canal = r < 0.25 ? 'pedidosya' as const : 'propio' as const
          const tipo = canal === 'pedidosya' || r < 0.65 ? 'delivery' as const : 'mostrador' as const
          const envio = tipo === 'delivery' && canal === 'propio' ? 1500 : 0
          const anulada = rnd() < 0.03
          const enCurso = abierta && i >= n - 3
          const total = subtotal + envio
          const forma = canal === 'pedidosya' ? 'pedidosya' as const : elegir(formas)
          comandasCaja.push({
            id: uid(), cajaId: caja.id, numero: i + 1, tipo, estado: anulada ? 'anulada' : enCurso ? 'pendiente' : 'entregado',
            canal, clienteNombre: tipo === 'mostrador' ? 'Cliente' : undefined, costoEnvio: envio, subtotal, descuento: 0, adicional: 0, total,
            descuentoCupon: 0, cobrada: !enCurso, pagos: enCurso ? [] : [{ forma, monto: total }], items, createdAt: creada.toISOString(),
          } as Comanda)
        }
        caja.ultimoNumero = n
        for (const c of comandasCaja) d.comandas.push({ ...c, sucursalId: suc.id })
        const movs: MovimientoCaja[] = []
        const mov = (tipo: MovimientoCaja['tipo'], concepto: string, monto: number, tg?: { id: string; nombre: string }) => movs.push({
          id: uid(), tipo, concepto, monto, tipoGastoId: tg?.id, tipoGastoNombre: tg?.nombre, creadoPor: caja.abiertaPor,
          createdAt: new Date(abre.getTime() + (1 + rnd() * 4) * 3600_000 * (abierta ? 0.3 : 1)).toISOString(),
        })
        if (rnd() < 0.7) { const tg = elegir(tipos); mov('gasto', tg.nombre === 'Motos' ? 'Nafta motos' : tg.nombre, Math.round((3 + rnd() * 30)) * 1000, tg) }
        if (t === 'Noche' && rnd() < 0.5) mov('egreso', 'Retiro al cofre', Math.round(5 + rnd() * 10) * 10000)
        if (t === 'Noche' && [1, 15].includes(dia.getDate())) mov('sueldo', 'Quincena cocinero', 250000)
        if (rnd() < 0.08) mov('ingreso', 'Cambio', 20000)
        for (const m of movs) d.movimientos.push({ ...m, cajaId: caja.id })
        if (!abierta) {
          const t2 = calcularTotales(caja, comandasCaja, movs)
          const dif = rnd() < 0.6 ? 0 : Math.round((rnd() - 0.55) * 8) * 500
          Object.assign(caja, {
            cerradaAt: new Date(abre.getTime() + 5 * 3600_000).toISOString(), cerradaPor: caja.abiertaPor,
            dineroCierre: t2.efectivoTeorico + dif, diferencia: dif, totales: t2,
          })
        }
        d.cajas.push(caja)
      }
    }
  }
  guardar()
}

