import type { Caja, Comanda, MovimientoCaja, TotalesCaja } from '../types'

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
