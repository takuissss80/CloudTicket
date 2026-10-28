import type { Comanda, EstadoComanda } from '../types'
import { ESTADOS } from '../types'

/** Flujo de estados por tipo de comanda */
export const flujo: Record<Comanda['tipo'], EstadoComanda[]> = {
  mostrador: ['pendiente', 'en_preparacion', 'listo', 'entregado'],
  delivery: ['pendiente', 'en_preparacion', 'listo', 'en_camino', 'entregado'],
}

export function siguienteEstado(c: Comanda): EstadoComanda | null {
  const f = flujo[c.tipo]
  const i = f.indexOf(c.estado)
  return i >= 0 && i < f.length - 1 ? f[i + 1] : null
}

export const etiquetaEstado = (e: EstadoComanda) => ESTADOS.find(x => x.key === e)?.label ?? e
