import type { AjusteLocal, Ingrediente, Producto, RecetaItem, Variante, Zona } from '../types'
import type { Catalogo, MenuData, Repo } from '../data/repo'
import * as ejemplo from '../data/menu'

/**
 * Arma el catálogo que ve un local: menú madre + productos propios,
 * con los precios del local, sin ocultos ni inactivos.
 */
export function resolverCatalogo(menu: MenuData, zonas: Zona[], sucursalId: string): Catalogo {
  const ajustes = new Map(menu.ajustes.map(a => [a.productoId, a]))
  const productos = menu.productos
    .filter(p => p.activo && (!p.sucursalId || p.sucursalId === sucursalId))
    .filter(p => !ajustes.get(p.id)?.oculto)
    .map(p => {
      const a = ajustes.get(p.id)
      return {
        ...p,
        precio: a?.precio ?? p.precio,
        precioMitad: p.precioMitad == null ? undefined : a?.precioMitad ?? p.precioMitad,
        agotado: !!a?.agotado,
      }
    })
  const categorias = menu.categorias
    .filter(c => c.activa && (!c.sucursalId || c.sucursalId === sucursalId))
    .filter(c => productos.some(p => p.categoriaId === c.id))
    .sort((a, b) => a.orden - b.orden)
  return { categorias, productos, zonas }
}

/** Precio efectivo de un producto en un local */
export function precioEnLocal(p: Producto, a?: AjusteLocal) {
  return {
    precio: a?.precio ?? p.precio,
    precioMitad: p.precioMitad == null ? undefined : a?.precioMitad ?? p.precioMitad,
  }
}

// ---------------------------------------------------------------------
// Costos
// ---------------------------------------------------------------------

/** Divisor para pasar del costo cargado (por kg / litro / unidad) a la unidad de la receta */
export const divisorUnidad = (u: Ingrediente['unidad']) => (u === 'un' ? 1 : 1000)
export const unidadCorta = (u: Ingrediente['unidad']) => (u === 'un' ? 'u.' : u)
export const unidadCosto = (u: Ingrediente['unidad']) => (u === 'un' ? 'unidad' : u === 'g' ? 'kilo' : 'litro')

/** Une ingredientes repetidos de una receta sumando sus cantidades */
export function unirReceta(receta: RecetaItem[]): RecetaItem[] {
  const m = new Map<string, number>()
  for (const r of receta) if (r.cantidad > 0) m.set(r.ingredienteId, (m.get(r.ingredienteId) ?? 0) + r.cantidad)
  return [...m].map(([ingredienteId, cantidad]) => ({ ingredienteId, cantidad }))
}

export function costoReceta(receta: RecetaItem[], ingredientes: Ingrediente[]) {
  let total = 0
  for (const r of receta) {
    const i = ingredientes.find(x => x.id === r.ingredienteId)
    if (i) total += (r.cantidad * i.costo) / divisorUnidad(i.unidad)
  }
  return total
}

/**
 * Costo de un producto. Mitad = mitad de la receta.
 * Promos: costo de los fijos + promedio de lo que se puede elegir en cada grupo.
 */
export function costoProducto(p: Producto, productos: Producto[], ingredientes: Ingrediente[], variante: Variante = 'entera', profundidad = 0): number {
  if (profundidad > 3) return 0
  if (p.tipo !== 'promo') {
    const c = costoReceta(p.receta, ingredientes)
    return variante === 'mitad' ? c / 2 : c
  }
  let total = 0
  for (const f of p.fijos) {
    const x = productos.find(y => y.id === f.productoId)
    if (x) total += f.cantidad * costoProducto(x, productos, ingredientes, f.variante, profundidad + 1)
  }
  for (const s of p.slots) {
    const opciones = productos.filter(y => y.categoriaId === s.categoriaId && y.tipo === 'producto' && y.activo)
    if (!opciones.length) continue
    const prom = opciones.reduce((acc, y) => acc + costoProducto(y, productos, ingredientes, 'entera', profundidad + 1), 0) / opciones.length
    total += s.cantidad * prom
  }
  return total
}

/** Margen sobre el precio de venta, en % */
export const margen = (precio: number, costo: number) => (precio > 0 ? ((precio - costo) / precio) * 100 : 0)

// ---------------------------------------------------------------------
// Menú de ejemplo
// ---------------------------------------------------------------------

/** Carga el menú de ejemplo (ingredientes, categorías, productos y promos) en el menú madre */
export async function importarMenuEjemplo(repo: Repo, onProgreso?: (texto: string) => void) {
  const ing = new Map<string, string>()
  onProgreso?.('Cargando ingredientes')
  for (const i of ejemplo.ingredientes) {
    const g = await repo.guardarIngrediente({ nombre: i.nombre, unidad: i.unidad, costo: i.costo, activo: true })
    ing.set(i.key, g.id)
  }
  const cat = new Map<string, string>()
  onProgreso?.('Cargando categorías')
  for (const [orden, c] of ejemplo.categorias.entries()) {
    const g = await repo.guardarCategoria({ nombre: c.nombre, color: c.color, orden, activa: true })
    cat.set(c.key, g.id)
  }
  const prod = new Map<string, string>()
  // Primero los productos y extras, después las promos (que los referencian)
  const orden = [...ejemplo.productos.filter(p => p.tipo !== 'promo'), ...ejemplo.productos.filter(p => p.tipo === 'promo')]
  for (const [i, p] of orden.entries()) {
    onProgreso?.(`Cargando productos (${i + 1} de ${orden.length})`)
    const g = await repo.guardarProducto({
      categoriaId: cat.get(p.categoria)!,
      tipo: p.tipo ?? 'producto',
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      precioMitad: p.precioMitad,
      admiteCoccion: !!p.coccion,
      incluyeEnvio: !!p.incluyeEnvio,
      orden: i,
      activo: true,
      receta: (p.receta ?? []).map(([k, cantidad]) => ({ ingredienteId: ing.get(k)!, cantidad })),
      fijos: (p.fijos ?? []).map(f => ({ productoId: prod.get(f.producto)!, cantidad: f.cantidad, variante: f.variante ?? 'entera' })),
      slots: (p.slots ?? []).map((s, j) => ({ id: `nuevo-${j}`, nombre: s.nombre, categoriaId: cat.get(s.categoria)!, cantidad: s.cantidad })),
    })
    prod.set(p.key, g.id)
  }
}
