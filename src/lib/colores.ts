import type { ColorCategoria } from '../types'

/** Colores para las categorías y marcas. Los 4 primeros siguen el tema (claro/oscuro). */
export const COLORES_CATEGORIA: { key: ColorCategoria; label: string; fondo: string; texto: string }[] = [
  { key: 'blue', label: 'Azul', fondo: 'var(--c-pizarra)', texto: '#ffffff' },
  { key: 'red', label: 'Rojo', fondo: 'var(--c-tomate)', texto: '#ffffff' },
  { key: 'amber', label: 'Amarillo', fondo: 'var(--c-muzza)', texto: 'var(--c-sobre-muzza)' },
  { key: 'green', label: 'Verde', fondo: 'var(--c-albahaca)', texto: 'var(--c-sobre-albahaca)' },
  { key: 'orange', label: 'Naranja', fondo: '#f07a1a', texto: '#1a1a1a' },
  { key: 'pink', label: 'Rosa', fondo: '#e0479e', texto: '#ffffff' },
  { key: 'violet', label: 'Violeta', fondo: '#8b5cf6', texto: '#ffffff' },
  { key: 'sky', label: 'Celeste', fondo: '#2ea8e0', texto: '#0d1226' },
  { key: 'teal', label: 'Turquesa', fondo: '#14b8a6', texto: '#0d1226' },
  { key: 'lime', label: 'Lima', fondo: '#84cc16', texto: '#1a1a1a' },
  { key: 'brown', label: 'Marrón', fondo: '#9a5b2e', texto: '#ffffff' },
  { key: 'gray', label: 'Gris', fondo: '#6b7280', texto: '#ffffff' },
  { key: 'black', label: 'Negro', fondo: '#1f2937', texto: '#ffffff' },
]

const porKey = new Map(COLORES_CATEGORIA.map(c => [c.key, c]))
/** Color de una categoría (si viene uno desconocido, azul) */
export const colorCategoria = (k: string | undefined) => porKey.get(k as ColorCategoria) ?? COLORES_CATEGORIA[0]
