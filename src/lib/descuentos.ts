import type { Cupon, CuponAplicado, TipoValor } from '../types'

/** Monto en pesos de un valor fijo o porcentual sobre una base (redondeado al peso) */
export function montoDe(tipo: TipoValor | 'porc' | 'monto', valor: number, base: number) {
  if (!(valor > 0)) return 0
  return tipo === 'porc' ? Math.round((base * Math.min(valor, 100)) / 100) : valor
}

/** Cuánto descuenta un cupón sobre el subtotal de los productos */
export function descuentoCupon(c: CuponAplicado | undefined, subtotal: number) {
  if (!c) return 0
  return Math.min(subtotal, montoDe(c.tipo, c.valor, subtotal))
}

export const textoValor = (tipo: TipoValor | 'porc' | 'monto', valor: number, money: (n: number) => string) =>
  tipo === 'porc' ? `${valor}%` : money(valor)

const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export type EstadoCupon = 'vigente' | 'programado' | 'vencido' | 'inactivo'
export function estadoCupon(c: Cupon, hoy = hoyISO()): EstadoCupon {
  if (!c.activo) return 'inactivo'
  if (c.desde && hoy < c.desde) return 'programado'
  if (c.hasta && hoy > c.hasta) return 'vencido'
  return 'vigente'
}

/** Mensaje si no se puede usar hoy, o null si está vigente (misma regla que la base) */
export function problemaCupon(c: Cupon, hoy = hoyISO()) {
  const f = (s: string) => s.split('-').reverse().join('/')
  switch (estadoCupon(c, hoy)) {
    case 'inactivo': return `El cupón ${c.codigo} está desactivado`
    case 'programado': return `El cupón ${c.codigo} vale desde el ${f(c.desde!)}`
    case 'vencido': return `El cupón ${c.codigo} venció el ${f(c.hasta!)}`
    default: return null
  }
}

/** Código en mayúsculas, sin espacios ni acentos */
export const normalizarCodigo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '')
