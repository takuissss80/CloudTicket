import type { Comanda, Ingrediente, ItemComanda, Producto, UnidadIngrediente } from '../types'

/**
 * Ingredientes que consume un ítem vendido: su receta y la de cada componente
 * de promo con productoId. La mitad consume la mitad. Igual que consumo_item() en la base.
 */
export function consumoItem(item: Pick<ItemComanda, 'productoId' | 'variante' | 'cantidad' | 'componentes'>, productos: Producto[]) {
  const total = new Map<string, number>()
  const sumar = (productoId: string | undefined, factor: number) => {
    const p = productos.find(x => x.id === productoId)
    for (const r of p?.receta ?? []) total.set(r.ingredienteId, (total.get(r.ingredienteId) ?? 0) + r.cantidad * factor)
  }
  sumar(item.productoId, item.cantidad * (item.variante === 'mitad' ? 0.5 : 1))
  for (const c of item.componentes) {
    if (c.productoId) sumar(c.productoId, c.cantidad * item.cantidad * (c.variante === 'mitad' ? 0.5 : 1))
  }
  return total
}

export function consumoComanda(c: Pick<Comanda, 'items'>, productos: Producto[]) {
  const total = new Map<string, number>()
  for (const it of c.items) for (const [k, v] of consumoItem(it, productos)) total.set(k, (total.get(k) ?? 0) + v)
  return total
}

// ---------------------------------------------------------------------
// Unidades: se guarda en un / g / ml; se compra y se muestra en un / kg / L
// ---------------------------------------------------------------------
export const factorCompra = (u: UnidadIngrediente) => (u === 'un' ? 1 : 1000)
export const unidadCompra = (u: UnidadIngrediente) => (u === 'un' ? 'u.' : u === 'g' ? 'kg' : 'L')

const nf = (max: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: max })

/** 12500 g -> "12,5 kg"; 350 g -> "350 g"; 3 un -> "3 u." */
export function formatCantidad(cant: number, u: UnidadIngrediente) {
  if (u === 'un') return `${nf(2).format(cant)} u.`
  if (Math.abs(cant) >= 1000) return `${nf(2).format(cant / 1000)} ${u === 'g' ? 'kg' : 'L'}`
  return `${nf(1).format(cant)} ${u}`
}

/** Valor del stock: cantidad base * costo (por un / kg / L) */
export const valorStock = (cant: number, ing: Ingrediente) => (Math.max(0, cant) * ing.costo) / factorCompra(ing.unidad)
