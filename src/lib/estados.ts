import type { Comanda } from '../types'
import { minutosDesde } from './format'

/**
 * Flujo simplificado:
 *   mostrador: pendiente -> entregado
 *   delivery:  pendiente -> en camino (moto asignada) -> entregado
 * Con pantalla de cocina, antes pasa por: pendiente -> en cocina -> listo
 */
export type AccionComanda = 'cocina' | 'entregar' | 'asignar' | null

export function accionPendiente(c: Comanda, cocina = false): AccionComanda {
  if (c.estado === 'entregado' || c.estado === 'anulada') return null
  // En cocina: hasta que la cocina no lo marque listo no se entrega
  if (c.estado === 'en_preparacion') return null
  if (cocina && c.estado === 'pendiente' && !c.repartidorId) return 'cocina'
  if (c.tipo === 'mostrador') return 'entregar'
  // PedidosYa: lo lleva su repartidor, no hace falta asignar moto
  if (c.canal === 'pedidosya') return 'entregar'
  return c.repartidorId ? 'entregar' : 'asignar'
}

export function etiquetaEstado(c: Comanda) {
  if (c.estado === 'anulada') return 'Anulada'
  if (c.estado === 'entregado') return 'Entregado'
  if (c.estado === 'en_preparacion') return 'En cocina'
  if (c.estado === 'listo') return c.tipo === 'delivery' && c.canal !== 'pedidosya' ? 'Listo, sin moto' : 'Listo'
  if (c.tipo === 'delivery' && c.canal === 'pedidosya') return c.repartidorId ? 'En camino' : 'Pendiente'
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

export const TEXTO_ACCION: Record<Exclude<AccionComanda, null>, string> = {
  cocina: 'Pasar a cocina', asignar: 'Asignar delivery', entregar: 'Entregar pedido',
}
