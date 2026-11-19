import type { Caja, Categoria, Comanda, MovimientoCaja, Producto, TotalesCaja, TurnoCaja } from '../types'

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

/** Turnos cuando el local no configuró los suyos */
export const TURNOS_DEFECTO: TurnoCaja[] = [{ nombre: 'Mañana', desde: '06:00' }, { nombre: 'Tarde', desde: '14:00' }, { nombre: 'Noche', desde: '19:00' }]
export const TURNOS = TURNOS_DEFECTO.map(t => t.nombre)

/** Lista válida y ordenada por hora (o la de siempre si está vacía) */
export function normalizarTurnos(t: unknown): TurnoCaja[] {
  const l = Array.isArray(t)
    ? t.filter((x): x is TurnoCaja => !!x && typeof x.nombre === 'string' && x.nombre.trim() !== '')
      .map(x => ({ nombre: x.nombre.trim(), desde: /^\d{2}:\d{2}$/.test(x.desde ?? '') ? x.desde : '00:00' }))
    : []
  return l.length ? [...l].sort((a, b) => a.desde.localeCompare(b.desde)) : TURNOS_DEFECTO
}

/** El turno que corresponde a esta hora: el último que ya empezó (antes del primero, sigue el último de la noche) */
export const turnoSugerido = (turnos: TurnoCaja[] = TURNOS_DEFECTO, ahora = new Date()) => {
  const hm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  const l = normalizarTurnos(turnos)
  return [...l].reverse().find(t => t.desde <= hm)?.nombre ?? l[l.length - 1].nombre
}

/** Día local (yyyy-mm-dd) de una fecha ISO */
const diaLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

/**
 * Orden de los turnos: en un mismo día no se puede abrir un turno anterior (ni repetir uno)
 * a otro que ya se abrió. Devuelve el turno que lo impide, o null si se puede abrir.
 * Solo el administrador puede saltearlo (lo valida también la base).
 */
export function turnoQueBloquea(turno: string, cajas: { turno: string; abiertaAt: string }[], turnos: TurnoCaja[] = TURNOS_DEFECTO, ahora = new Date().toISOString()) {
  const orden = normalizarTurnos(turnos).map(t => t.nombre)
  const hoy = diaLocal(ahora)
  const i = orden.indexOf(turno)
  if (i < 0) return null
  let peor: string | null = null
  for (const c of cajas) {
    if (diaLocal(c.abiertaAt) !== hoy) continue
    const j = orden.indexOf(c.turno)
    if (j >= i && (peor == null || j > orden.indexOf(peor))) peor = c.turno
  }
  return peor
}

/**
 * Venta por categoría contenedora (ej.: por marca: NAPOLES, MAXX BURGER, TODO MILA).
 * Si una comanda mezcla marcas, su total y sus pagos se reparten en proporción a lo que suma cada una.
 * Devuelve vacío si las ventas no se reparten en al menos dos grupos.
 */
export interface VentaGrupo { nombre: string; comandas: number; total: number; cobrado: number; porForma: Map<string, number> }
export function ventasPorGrupo(comandas: Comanda[], categorias: Categoria[], productos: Producto[],
  /** Marcas que se muestran siempre (aunque no hayan vendido); con esto no se exige que haya dos con ventas */
  siempre?: string[]): VentaGrupo[] {
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
  for (const n of siempre ?? []) de(n)
  const lista = [...g.values()]
  if (lista.length < 2) return []
  const orden = new Map(categorias.map(c => [c.nombre, c.orden]))
  return lista.sort((a, b) => (a.nombre === OTROS ? 1 : b.nombre === OTROS ? -1 : (orden.get(a.nombre) ?? 0) - (orden.get(b.nombre) ?? 0)))
}

/**
 * Marcas (categorías contenedoras) que se ven en los locales de estos menús:
 * las que agrupan algo y no están ocultas ni "sueltas" en ese local.
 */
export function marcasDeLocales(menus: { categorias: Categoria[]; categoriasOcultas?: string[]; categoriasSueltas?: string[] }[]) {
  const nombres = new Set<string>()
  for (const m of menus) {
    const fuera = new Set([...(m.categoriasOcultas ?? []), ...(m.categoriasSueltas ?? [])])
    for (const c of m.categorias) {
      if (c.activa && !fuera.has(c.id) && m.categorias.some(h => h.padreId === c.id)) nombres.add(c.nombre)
    }
  }
  return [...nombres]
}
