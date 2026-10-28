import type { Comanda, Ingrediente, IngresoMercaderia, MovimientoReporte, Producto, StockMovimiento } from '../types'
import { cobradoPorForma } from './caja'
import { factorCompra } from './stock'

// ---------------------------------------------------------------------
// Períodos (fechas locales del navegador)
// ---------------------------------------------------------------------
export interface Periodo { desde: string; hasta: string } // yyyy-mm-dd, ambos incluidos

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseDia = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

/** Límites para consultar: desde 00:00 del primer día hasta 00:00 del día siguiente al último */
export function rangoISO(p: Periodo) {
  const desde = parseDia(p.desde)
  const hasta = parseDia(p.hasta)
  hasta.setDate(hasta.getDate() + 1)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

export const PERIODOS_RAPIDOS: { key: string; label: string; calc: (hoy: Date) => Periodo }[] = [
  { key: 'hoy', label: 'Hoy', calc: h => ({ desde: isoDia(h), hasta: isoDia(h) }) },
  { key: 'ayer', label: 'Ayer', calc: h => { const a = new Date(h); a.setDate(a.getDate() - 1); return { desde: isoDia(a), hasta: isoDia(a) } } },
  { key: '7', label: 'Últimos 7 días', calc: h => { const a = new Date(h); a.setDate(a.getDate() - 6); return { desde: isoDia(a), hasta: isoDia(h) } } },
  { key: 'mes', label: 'Este mes', calc: h => ({ desde: isoDia(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: isoDia(h) }) },
  { key: 'mespasado', label: 'Mes pasado', calc: h => ({ desde: isoDia(new Date(h.getFullYear(), h.getMonth() - 1, 1)), hasta: isoDia(new Date(h.getFullYear(), h.getMonth(), 0)) }) },
]

/** Día local (yyyy-mm-dd) de una fecha ISO */
export const diaDe = (iso: string) => isoDia(new Date(iso))

/** Todos los días del período, para que los días sin ventas aparezcan en cero */
export function diasDelPeriodo(p: Periodo) {
  const out: string[] = []
  const d = parseDia(p.desde)
  const fin = parseDia(p.hasta)
  while (d <= fin && out.length < 400) { out.push(isoDia(d)); d.setDate(d.getDate() + 1) }
  return out
}

// ---------------------------------------------------------------------
// Ventas en dinero
// ---------------------------------------------------------------------
export function reporteVentas(comandas: Comanda[], p: Periodo) {
  const validas = comandas.filter(c => c.estado !== 'anulada')
  const total = validas.reduce((s, c) => s + c.total, 0)
  const porDia = new Map(diasDelPeriodo(p).map(d => [d, { dia: d, comandas: 0, mostrador: 0, delivery: 0, total: 0 }]))
  for (const c of validas) {
    const fila = porDia.get(diaDe(c.createdAt))
    if (!fila) continue
    fila.comandas++
    fila[c.tipo] += c.total
    fila.total += c.total
  }
  const sinCobrar = validas.filter(c => !c.cobrada)
  return {
    total,
    cantidad: validas.length,
    ticketPromedio: validas.length ? total / validas.length : 0,
    anuladas: comandas.length - validas.length,
    mostrador: validas.filter(c => c.tipo === 'mostrador').reduce((s, c) => s + c.total, 0),
    delivery: validas.filter(c => c.tipo === 'delivery').reduce((s, c) => s + c.total, 0),
    envios: validas.reduce((s, c) => s + c.costoEnvio, 0),
    descuentos: validas.reduce((s, c) => s + c.descuento, 0),
    porDia: [...porDia.values()],
    porForma: [...cobradoPorForma(validas)].sort((a, b) => b[1] - a[1]),
    sinCobrar: sinCobrar.reduce((s, c) => s + c.total, 0),
    cantSinCobrar: sinCobrar.length,
  }
}

// ---------------------------------------------------------------------
// Venta de mercadería (productos)
// ---------------------------------------------------------------------
export interface FilaProducto {
  clave: string
  nombre: string
  categoria: string
  sueltas: number
  enPromos: number
  importe: number
}

const etiquetaVariante = (v?: string, c?: string) => [v === 'mitad' ? 'mitad' : '', c === 'horno' ? 'horno' : c === 'frita' ? 'frita' : ''].filter(Boolean).join(', ')

export function reporteProductos(comandas: Comanda[], productos: Producto[], nombreCategoria: (id: string) => string) {
  const filas = new Map<string, FilaProducto>()
  const fila = (id: string | undefined, descripcion: string, variante?: string, coccion?: string) => {
    // Comandas viejas sin id de producto: se busca por nombre para no partir la fila
    const productoId = id ?? productos.find(p => p.nombre === descripcion)?.id
    const extra = etiquetaVariante(variante, coccion)
    const clave = `${productoId ?? descripcion}|${variante === 'mitad' ? 'mitad' : ''}|${coccion ?? ''}`
    let f = filas.get(clave)
    if (!f) {
      const prod = productos.find(x => x.id === productoId)
      f = { clave, nombre: `${prod?.nombre ?? descripcion}${extra ? ` (${extra})` : ''}`, categoria: prod ? nombreCategoria(prod.categoriaId) : '', sueltas: 0, enPromos: 0, importe: 0 }
      filas.set(clave, f)
    }
    return f
  }
  for (const c of comandas) {
    if (c.estado === 'anulada') continue
    for (const it of c.items) {
      const f = fila(it.productoId, it.descripcion, it.variante, it.coccion)
      f.sueltas += it.cantidad
      f.importe += it.precioUnit * it.cantidad
      for (const comp of it.componentes) {
        fila(comp.productoId, comp.descripcion, comp.variante, comp.coccion).enPromos += comp.cantidad * it.cantidad
      }
    }
  }
  return [...filas.values()].sort((a, b) => (b.sueltas + b.enPromos) - (a.sueltas + a.enPromos) || b.importe - a.importe)
}

/** Ingredientes consumidos por ventas (movimientos de stock tipo venta) con su costo */
export function reporteConsumo(movs: StockMovimiento[], ingredientes: Ingrediente[]) {
  const m = new Map<string, number>()
  for (const x of movs) if (x.tipo === 'venta') m.set(x.ingredienteId, (m.get(x.ingredienteId) ?? 0) - x.cantidad)
  return [...m].map(([id, cantidad]) => {
    const ing = ingredientes.find(i => i.id === id)
    return { ingrediente: ing, cantidad, costo: ing ? (cantidad * ing.costo) / factorCompra(ing.unidad) : 0 }
  }).filter(x => x.ingrediente).sort((a, b) => b.costo - a.costo)
}

// ---------------------------------------------------------------------
// Gastos e ingresos / egresos de dinero
// ---------------------------------------------------------------------
export function reporteGastos(movs: MovimientoReporte[]) {
  const gastos = movs.filter(m => m.tipo === 'gasto' || m.tipo === 'sueldo')
  const grupos = new Map<string, number>()
  for (const g of gastos) {
    const k = g.tipo === 'sueldo' ? 'Sueldos' : g.tipoGastoNombre ?? 'Sin tipo'
    grupos.set(k, (grupos.get(k) ?? 0) + g.monto)
  }
  return {
    total: gastos.reduce((s, g) => s + g.monto, 0),
    porTipo: [...grupos].sort((a, b) => b[1] - a[1]),
    detalle: gastos,
  }
}

export function reporteDinero(movs: MovimientoReporte[]) {
  const lista = movs.filter(m => m.tipo === 'ingreso' || m.tipo === 'egreso')
  const ingresos = lista.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const egresos = lista.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)
  return { ingresos, egresos, neto: ingresos - egresos, detalle: lista }
}

// ---------------------------------------------------------------------
// Ingreso de mercadería
// ---------------------------------------------------------------------
export function reporteIngresosMercaderia(ingresos: IngresoMercaderia[], ingredientes: Ingrediente[]) {
  const m = new Map<string, { cantidad: number; costo: number }>()
  for (const i of ingresos) for (const it of i.items) {
    const x = m.get(it.ingredienteId) ?? { cantidad: 0, costo: 0 }
    m.set(it.ingredienteId, { cantidad: x.cantidad + it.cantidad, costo: x.costo + it.costo })
  }
  return {
    total: ingresos.reduce((s, i) => s + i.total, 0),
    porIngrediente: [...m].map(([id, v]) => {
      const ing = ingredientes.find(i => i.id === id)
      // costo promedio por unidad / kg / litro
      const promedio = ing && v.cantidad ? (v.costo / v.cantidad) * factorCompra(ing.unidad) : 0
      return { ingrediente: ing, ...v, promedio }
    }).filter(x => x.ingrediente).sort((a, b) => b.costo - a.costo),
  }
}

// ---------------------------------------------------------------------
// Stock: movimientos del período por ingrediente
// ---------------------------------------------------------------------
export function resumenMovimientosStock(movs: StockMovimiento[]) {
  const m = new Map<string, { ingreso: number; venta: number; ajuste: number; decomiso: number }>()
  for (const x of movs) {
    const r = m.get(x.ingredienteId) ?? { ingreso: 0, venta: 0, ajuste: 0, decomiso: 0 }
    r[x.tipo] += x.cantidad
    m.set(x.ingredienteId, r)
  }
  return m
}

// ---------------------------------------------------------------------
// CSV (Excel en español: separador ; y coma decimal)
// ---------------------------------------------------------------------
export function descargarCSV(nombre: string, filas: (string | number | undefined | null)[][]) {
  const celda = (v: string | number | undefined | null) => {
    if (v == null) return ''
    if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',')
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const csv = '﻿' + filas.map(f => f.map(celda).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
