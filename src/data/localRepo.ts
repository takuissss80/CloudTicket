import type { Repo, NuevoPrintJob, BusquedaCliente, MenuData, EstadoSesion } from './repo'
import type {
  AjusteLocal, Caja, Categoria, Cliente, Comanda, Impresora, Ingrediente, PrintJob, Producto,
  MovimientoCaja, Repartidor, Sesion, Sucursal, Usuario, Zona,
} from '../types'
import { calcularTotales } from '../lib/caja'
import { importarMenuEjemplo, unirReceta } from '../lib/menu'

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
]

type ConLocal<T> = T & { sucursalId: string }

const TIPOS_GASTO_DEMO = ['Motos', 'Proveedores varios', 'Pago remito', 'Servicios', 'Alquiler', 'Impuestos', 'Abonos profesionales', 'Varios']
  .map((nombre, i) => ({ id: `tg-${i}`, nombre }))

interface DB {
  cuenta: { id: string; nombre: string }
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
  cajas: ConLocal<Caja & { ultimoNumero: number }>[]
  comandas: ConLocal<Comanda>[]
  clientes: Cliente[]
  printJobs: PrintJob[]
}

const uid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
const ahora = () => new Date().toISOString()
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

const listeners = new Set<(t: 'comandas' | 'print_jobs' | 'menu') => void>()
function guardar(tabla: 'comandas' | 'print_jobs' | 'menu' = 'comandas') {
  escribirStorage(KEY, JSON.stringify(memoria))
  listeners.forEach(l => l(tabla))
}

function baseVacia(): DB {
  const principal: Sucursal = { id: uid(), nombre: 'Napoles Principal', esPrincipal: true, activa: true }
  const benavidez: Sucursal = { id: uid(), nombre: 'Napoles Benavidez', esPrincipal: false, activa: true }
  return {
    cuenta: { id: uid(), nombre: 'Napoles' },
    sucursales: [principal, benavidez],
    usuarios: [
      { userId: uid(), usuario: 'admin', password: '1234', rol: 'admin', nombre: 'Rodrigo' },
      { userId: uid(), usuario: 'principal', password: '1234', rol: 'local', sucursalId: principal.id },
      { userId: uid(), usuario: 'benavidez', password: '1234', rol: 'local', sucursalId: benavidez.id },
    ],
    ingredientes: [], categorias: [], productos: [], ajustes: [],
    zonas: [principal, benavidez].flatMap(s => [
      { id: uid(), sucursalId: s.id, nombre: 'Zona 1 (hasta 15 cuadras)', costo: 2000 },
      { id: uid(), sucursalId: s.id, nombre: 'Zona 2 (hasta 30 cuadras)', costo: 3000 },
    ]),
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
  return { userId: u.userId, usuario: u.usuario, rol: u.rol, cuentaId: db().cuenta.id, cuentaNombre: db().cuenta.nombre, sucursalId: u.sucursalId }
}
function ses(): Sesion {
  const s = sesionActual()
  if (!s) throw new Error('Tenés que iniciar sesión')
  return s
}
function soloAdmin() {
  const s = ses()
  if (s.rol !== 'admin') throw new Error('Solo un administrador puede hacer esto')
  return s
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

// ---------------------------------------------------------------------

export const localRepo: Repo = {
  modo: 'demo',

  async estadoSesion(): Promise<EstadoSesion> {
    const s = sesionActual()
    if (!s) return { estado: 'sin_login' }
    await asegurarMenu()
    return { estado: 'ok', sesion: s }
  },

  async login(usuario, password) {
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

  async crearCuenta() { throw new Error('En la demo la cuenta ya está creada') },

  onAuthChange(cb) {
    const f = () => cb()
    listeners.add(f)
    return () => { listeners.delete(f) }
  },

  // ---- Locales y usuarios
  async listSucursales() {
    const s = ses()
    return pausa(clon(db().sucursales.filter(x => s.rol === 'admin' || x.id === s.sucursalId)))
  },

  async crearSucursal(nombre) {
    soloAdmin()
    const d = db()
    const suc: Sucursal = { id: uid(), nombre: nombre.trim(), esPrincipal: false, activa: true }
    d.sucursales.push(suc)
    d.impresoras.push({ id: uid(), sucursalId: suc.id, nombre: 'Cocina', imprimeMostrador: true, imprimeDelivery: true, copias: 1, ancho: 48 })
    guardar('menu')
    return suc
  },

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

  async crearUsuario({ usuario, password, sucursalId, nombre }) {
    soloAdmin()
    const u = usuario.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(u)) throw new Error('El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.')
    if (password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.')
    if (db().usuarios.some(x => x.usuario === u)) throw new Error(`El usuario "${u}" ya existe. Probá con otro nombre.`)
    db().usuarios.push({ userId: uid(), usuario: u, password, rol: 'local', sucursalId, nombre })
    guardar('menu')
  },

  async cambiarPassword(userId, password) {
    soloAdmin()
    if (password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.')
    const u = db().usuarios.find(x => x.userId === userId)
    if (u) u.password = password
    guardar('menu')
  },

  async eliminarUsuario(userId) {
    soloAdmin()
    const d = db()
    const u = d.usuarios.find(x => x.userId === userId)
    if (u?.rol === 'admin') throw new Error('No se puede borrar un administrador desde acá.')
    d.usuarios = d.usuarios.filter(x => x.userId !== userId)
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
    caja.ultimoNumero += 1
    const comanda = { ...clon(data), id: uid(), cajaId, sucursalId: caja.sucursalId, numero: caja.ultimoNumero, estado: 'pendiente' as const, createdAt: ahora(), updatedAt: ahora() }
    d.comandas.push(comanda)
    guardar()
    return clon(sinLocal(comanda))
  },

  async actualizarComanda(id, data) {
    const d = db()
    const i = d.comandas.findIndex(c => c.id === id)
    if (i < 0) throw new Error('Comanda no encontrada')
    puedeLocal(d.comandas[i].sucursalId)
    d.comandas[i] = { ...d.comandas[i], ...clon(data), updatedAt: ahora() }
    guardar()
    return clon(sinLocal(d.comandas[i]))
  },

  async cambiarEstado(id, estado) {
    const c = db().comandas.find(x => x.id === id)
    if (!c) return
    puedeLocal(c.sucursalId)
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
