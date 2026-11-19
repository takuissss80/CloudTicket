import type { Caja, Categoria, Comanda, MovimientoCaja, Producto, TotalesCaja } from '../types'

/** Efectivo que realmente quedó de una comanda: lo pagado en efectivo menos el vuelto */
export function efectivoNeto(c: Comanda) {
  const efectivo = c.pagos.filter(p => p.forma === 'efectivo').reduce((s, p) => s + p.monto, 0)
  const pagado = c.pagos.reduce((s, p) => s + p.monto, 0)
  return Math.max(0, efectivo - Math.max(0, pagado - c.total))
}

/**
 * Totales de la caja, igual que la función totales_caja() de la base.
 * Solo cuenta el efectivo de las comandas cobradas y no anuladas.
 */
export function calcularTotales(caja: Pick<Caja, 'dineroInicial'>, comandas: Comanda[], movimientos: MovimientoCaja[]): TotalesCaja {
  const validas = comandas.filter(c => c.estado !== 'anulada')
  const suma = (t: MovimientoCaja['tipo']) => movimientos.filter(m => m.tipo === t).reduce((s, m) => s + m.monto, 0)
  const ventasEfectivo = validas.filter(c => c.cobrada).reduce((s, c) => s + efectivoNeto(c), 0)
  const t = {
    cantComandas: validas.length,
    cantAnuladas: comandas.length - validas.length,
    totalVentas: validas.reduce((s, c) => s + c.total, 0),
    ventasEfectivo,
    totalIngresos: suma('ingreso'),
    totalGastos: suma('gasto'),
    totalEgresos: suma('egreso'),
    totalSueldos: suma('sueldo'),
  }
  return {
    ...t,
    efectivoTeorico: (caja.dineroInicial || 0) + t.ventasEfectivo + t.totalIngresos - t.totalGastos - t.totalEgresos - t.totalSueldos,
  }
}

/** Cobrado por forma de pago (sin vuelto), de las comandas cobradas */
export function cobradoPorForma(comandas: Comanda[]) {
  const m = new Map<string, number>()
  for (const c of comandas) {
    if (c.estado === 'anulada' || !c.cobrada) continue
    const vuelto = Math.max(0, c.pagos.reduce((s, p) => s + p.monto, 0) - c.total)
    for (const p of c.pagos) {
      const monto = p.forma === 'efectivo' ? Math.max(0, p.monto - vuelto) : p.monto
      m.set(p.forma, (m.get(p.forma) ?? 0) + monto)
    }
  }
  return m
}

export const TURNOS = ['Mañana', 'Tarde', 'Noche']

export const turnoSugerido = () => {
  const h = new Date().getHours()
  return h >= 6 && h < 14 ? 'Mañana' : h >= 14 && h < 19 ? 'Tarde' : 'Noche'
}

/** Día local (yyyy-mm-dd) de una fecha ISO */
const diaLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

/**
 * Orden de los turnos: en un mismo día no se puede abrir un turno anterior (ni repetir uno)
 * a otro que ya se abrió. Devuelve el turno que lo impide, o null si se puede abrir.
 * Solo el administrador puede saltearlo (lo valida también la base).
 */
export function turnoQueBloquea(turno: string, cajas: { turno: string; abiertaAt: string }[], ahora = new Date().toISOString()) {
  const hoy = diaLocal(ahora)
  const i = TURNOS.indexOf(turno)
  let peor: string | null = null
  for (const c of cajas) {
    if (diaLocal(c.abiertaAt) !== hoy) continue
    const j = TURNOS.indexOf(c.turno)
    if (j >= i && (peor == null || j > TURNOS.indexOf(peor))) peor = c.turno
  }
  return peor
}

/**
 * Venta por categoría contenedora (ej.: por marca: NAPOLES, MAXX BURGER, TODO MILA).
 * Si una comanda mezcla marcas, su total y sus pagos se reparten en proporción a lo que suma cada una.
 * Devuelve vacío si las ventas no se reparten en al menos dos grupos.
 */
export interface VentaGrupo { nombre: string; comandas: number; total: number; cobrado: number; porForma: Map<string, number> }
export function ventasPorGrupo(comandas: Comanda[], categorias: Categoria[], productos: Producto[]): VentaGrupo[] {
  const cat = new Map(categorias.map(c => [c.id, c]))
  const conHijas = new Set(categorias.filter(c => c.padreId).map(c => c.padreId!))
  if (!conHijas.size) return []
  const prodCat = new Map(productos.map(p => [p.id, p.categoriaId]))
  const OTROS = 'OTROS'
  const grupoDe = (it: Comanda['items'][number]) => {
    const c = cat.get(prodCat.get(it.productoId ?? '') ?? '')
    if (!c) return OTROS
    if (conHijas.has(c.id)) return c.nombre
    const p = c.padreId ? cat.get(c.padreId) : undefined
    return p ? p.nombre : OTROS
  }
  const g = new Map<string, VentaGrupo>()
  const de = (n: string) => { let x = g.get(n); if (!x) g.set(n, x = { nombre: n, comandas: 0, total: 0, cobrado: 0, porForma: new Map() }); return x }
  for (const c of comandas) {
    if (c.estado === 'anulada') continue
    const partes = new Map<string, number>()
    for (const it of c.items) partes.set(grupoDe(it), (partes.get(grupoDe(it)) ?? 0) + it.precioUnit * it.cantidad)
    const suma = [...partes.values()].reduce((s, v) => s + v, 0)
    if (!partes.size) partes.set(OTROS, 1)
    const vuelto = Math.max(0, c.pagos.reduce((s, p) => s + p.monto, 0) - c.total)
    for (const [n, v] of partes) {
      const parte = suma > 0 ? v / suma : 1 / partes.size
      const x = de(n)
      x.comandas++
      x.total += c.total * parte
      if (!c.cobrada) continue
      for (const p of c.pagos) {
        const monto = (p.forma === 'efectivo' ? Math.max(0, p.monto - vuelto) : p.monto) * parte
        x.porForma.set(p.forma, (x.porForma.get(p.forma) ?? 0) + monto)
        x.cobrado += monto
      }
    }
  }
  const lista = [...g.values()]
  if (lista.length < 2) return []
  const orden = new Map(categorias.map(c => [c.nombre, c.orden]))
  return lista.sort((a, b) => (a.nombre === OTROS ? 1 : b.nombre === OTROS ? -1 : (orden.get(a.nombre) ?? 0) - (orden.get(b.nombre) ?? 0)))
}
