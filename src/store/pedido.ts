import { create } from 'zustand'
import type { Comanda, Componente, Coccion, CuponAplicado, FormaPago, ItemComanda, Pago, Sucursal, TipoComanda, TipoValor, Variante, Zona, Producto } from '../types'
import { descuentoCupon, montoDe } from '../lib/descuentos'

/** Pedido que se está cargando o editando (todavía no guardado) */
export interface PedidoState {
  abierto: boolean
  editandoId?: string
  editandoNumero?: number
  tipo: TipoComanda
  items: ItemComanda[]
  clienteId?: string
  clienteNombre: string
  clienteTel: string
  direccion: string
  entreCalles: string
  zonaId?: string
  envioManual?: number
  /** Descuento y adicional manuales (solo admin): valor en $ o en % según el tipo */
  descuento: number
  descuentoTipo: TipoValor
  adicional: number
  adicionalTipo: TipoValor
  cupon?: CuponAplicado
  observaciones: string
  horaEntrega: string
  pagos: Pago[]
  cobrada: boolean

  nuevo(tipo: TipoComanda): void
  editar(c: Comanda): void
  cerrar(): void
  restablecer(): void
  agregar(item: Omit<ItemComanda, 'id'>): void
  setCantidad(id: string, cantidad: number): void
  setNota(id: string, nota: string): void
  quitar(id: string): void
  set(p: Partial<PedidoState>): void
  setPago(i: number, p: Partial<Pago>): void
  agregarPago(forma: FormaPago, monto: number): void
  quitarPago(i: number): void
}

let seq = 0
const nuevoId = () => `tmp-${Date.now().toString(36)}-${++seq}`

const vacio = {
  editandoId: undefined,
  editandoNumero: undefined,
  items: [] as ItemComanda[],
  clienteId: undefined,
  clienteNombre: '',
  clienteTel: '',
  direccion: '',
  entreCalles: '',
  zonaId: undefined,
  envioManual: undefined,
  descuento: 0,
  descuentoTipo: 'monto' as TipoValor,
  adicional: 0,
  adicionalTipo: 'monto' as TipoValor,
  cupon: undefined as CuponAplicado | undefined,
  observaciones: '',
  horaEntrega: '',
  pagos: [] as Pago[],
  cobrada: false,
}

/** Dos renglones se pueden sumar si son el mismo producto simple */
const mismoRenglon = (a: Omit<ItemComanda, 'id'>, b: ItemComanda) =>
  !!a.productoId && a.productoId === b.productoId && a.variante === b.variante && a.coccion === b.coccion &&
  !a.nota && !b.nota && a.componentes.length === 0 && b.componentes.length === 0 && a.precioUnit === b.precioUnit

export const usePedido = create<PedidoState>((set) => ({
  abierto: false,
  tipo: 'mostrador',
  ...vacio,

  nuevo: (tipo) => set({ ...vacio, abierto: true, tipo }),

  editar: (c) => set({
    ...vacio,
    abierto: true,
    editandoId: c.id,
    editandoNumero: c.numero,
    tipo: c.tipo,
    items: c.items.map(i => ({ ...i, componentes: [...i.componentes] })),
    clienteId: c.clienteId,
    clienteNombre: c.clienteNombre ?? '',
    clienteTel: c.clienteTel ?? '',
    direccion: c.direccion ?? '',
    entreCalles: c.entreCalles ?? '',
    zonaId: c.zonaId,
    envioManual: c.costoEnvio,
    // Al editar se conserva lo que ya se descontó, en pesos
    descuento: Math.max(0, c.descuento - (c.descuentoCupon || 0)),
    adicional: c.adicional,
    cupon: c.cuponId ? { id: c.cuponId, codigo: c.cuponCodigo ?? '', tipo: 'monto', valor: c.descuentoCupon || 0 } : undefined,
    observaciones: c.observaciones ?? '',
    horaEntrega: c.horaEntrega ?? '',
    pagos: c.pagos.map(p => ({ ...p })),
    cobrada: c.cobrada,
  }),

  cerrar: () => set({ abierto: false }),

  restablecer: () => set(s => ({ ...vacio, editandoId: s.editandoId, editandoNumero: s.editandoNumero })),

  agregar: (item) => set(s => {
    const i = s.items.findIndex(x => mismoRenglon(item, x))
    if (i >= 0) {
      const items = [...s.items]
      items[i] = { ...items[i], cantidad: items[i].cantidad + item.cantidad }
      return { items }
    }
    return { items: [...s.items, { ...item, id: nuevoId() }] }
  }),

  setCantidad: (id, cantidad) => set(s => ({
    items: cantidad <= 0 ? s.items.filter(i => i.id !== id) : s.items.map(i => i.id === id ? { ...i, cantidad } : i),
  })),

  setNota: (id, nota) => set(s => ({ items: s.items.map(i => i.id === id ? { ...i, nota: nota || undefined } : i) })),

  quitar: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),

  set: (p) => set(p),

  setPago: (i, p) => set(s => ({ pagos: s.pagos.map((x, j) => j === i ? { ...x, ...p } : x) })),
  agregarPago: (forma, monto) => set(s => ({ pagos: [...s.pagos, { forma, monto }] })),
  quitarPago: (i) => set(s => ({ pagos: s.pagos.filter((_, j) => j !== i) })),
}))

// ---------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------

export const subtotalItems = (items: ItemComanda[]) =>
  items.reduce((s, i) => s + i.precioUnit * i.cantidad, 0)

type Recargo = Pick<Sucursal, 'recargoDelivery' | 'recargoDeliveryTipo'> | undefined

/**
 * Envío de delivery: si se cargó a mano, ese; si alguna promo lo incluye, 0;
 * si el cliente tiene zona, el de la zona; si no, el recargo automático del local.
 */
export function calcularEnvio(p: Pick<PedidoState, 'tipo' | 'zonaId' | 'envioManual' | 'items'>, zonas: Zona[], productos: Producto[], recargo?: Recargo) {
  if (p.tipo !== 'delivery') return 0
  if (p.envioManual != null) return p.envioManual
  const incluido = p.items.some(i => productos.find(x => x.id === i.productoId)?.incluyeEnvio)
  if (incluido) return 0
  const zona = zonas.find(z => z.id === p.zonaId)
  if (zona) return zona.costo
  return recargo ? montoDe(recargo.recargoDeliveryTipo, recargo.recargoDelivery, subtotalItems(p.items)) : 0
}

/** Totales del pedido. Descuentos y adicional en % se calculan sobre los productos. */
export function totales(p: PedidoState, zonas: Zona[], productos: Producto[], recargo?: Recargo) {
  const subtotal = subtotalItems(p.items)
  const envio = calcularEnvio(p, zonas, productos, recargo)
  const adicional = montoDe(p.adicionalTipo, p.adicional || 0, subtotal)
  const descCupon = descuentoCupon(p.cupon, subtotal)
  const descManual = Math.min(montoDe(p.descuentoTipo, p.descuento || 0, subtotal), Math.max(0, subtotal + envio + adicional - descCupon))
  const descuento = descCupon + descManual
  const total = Math.max(0, subtotal + envio + adicional - descuento)
  return { subtotal, envio, adicional, descuentoCupon: descCupon, descuentoManual: descManual, descuento, total }
}

/** Arma el renglón de un producto simple */
export function itemProducto(prod: Producto, variante: Variante, cantidad: number, coccion?: Coccion): Omit<ItemComanda, 'id'> {
  const precio = variante === 'mitad' ? prod.precioMitad ?? prod.precio : prod.precio
  return {
    productoId: prod.id,
    descripcion: prod.nombre,
    variante: prod.precioMitad != null ? variante : undefined,
    coccion,
    cantidad,
    precioUnit: precio,
    componentes: [],
  }
}

/** Arma el renglón de una promo con sus fijos y lo elegido en cada grupo */
export function itemPromo(promo: Producto, elegidos: Componente[], productos: Producto[], nota?: string): Omit<ItemComanda, 'id'> {
  const fijos: Componente[] = promo.fijos.map(f => {
    const p = productos.find(x => x.id === f.productoId)
    return {
      productoId: f.productoId,
      descripcion: p?.nombre ?? '¿producto?',
      cantidad: f.cantidad,
      variante: p?.precioMitad != null && f.variante !== 'unica' ? f.variante : undefined,
    }
  })
  return {
    productoId: promo.id,
    descripcion: promo.nombre,
    cantidad: 1,
    precioUnit: promo.precio,
    nota: nota || undefined,
    componentes: [...fijos, ...elegidos],
  }
}

/** Mostrador: para tomar un pedido nuevo hacen falta nombre y teléfono. Devuelve qué falta o null. */
export function faltaClienteMostrador(p: Pick<PedidoState, 'tipo' | 'editandoId' | 'clienteNombre' | 'clienteTel'>) {
  if (p.tipo !== 'mostrador' || p.editandoId) return null
  const falta: string[] = []
  if (!p.clienteNombre.trim()) falta.push('el nombre')
  if (p.clienteTel.replace(/\D/g, '').length < 6) falta.push('el teléfono')
  return falta.length ? `Falta ${falta.join(' y ')} del cliente` : null
}
