import type { Comanda } from '../types'
import { minutosDesde } from './format'

/**
 * Flujo simplificado:
 *   mostrador: pendiente -> entregado
 *   delivery:  pendiente -> en camino (moto asignada) -> entregado
 */
export type AccionComanda = 'entregar' | 'asignar' | null

export function accionPendiente(c: Comanda): AccionComanda {
  if (c.estado === 'entregado' || c.estado === 'anulada') return null
  if (c.tipo === 'mostrador') return 'entregar'
  return c.repartidorId ? 'entregar' : 'asignar'
}

export function etiquetaEstado(c: Comanda) {
  if (c.estado === 'anulada') return 'Anulada'
  if (c.estado === 'entregado') return 'Entregado'
  if (c.tipo === 'delivery') return c.repartidorId ? 'En camino' : 'Sin moto'
  return 'Pendiente'
}

/** Minutos de viaje de la moto: en curso o el total si ya se entregó */
export function minutosDelivery(c: Comanda, ahora = Date.now()) {
  if (!c.asignadaAt) return null
  const fin = c.entregadaAt ? new Date(c.entregadaAt).getTime() : ahora
  return minutosDesde(c.asignadaAt, fin)
}

/** Más de esto en la calle se marca en rojo */
export const MINUTOS_ALERTA_DELIVERY = 30
