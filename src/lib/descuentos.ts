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

export type EstadoCupon = 'vigente' | 'programado' | 'vencido' | 'inactivo' | 'usado'
export function estadoCupon(c: Cupon, usos = 0, hoy = hoyISO()): EstadoCupon {
  if (!c.activo) return 'inactivo'
  if (c.maxUsos && usos >= c.maxUsos) return 'usado'
  if (c.desde && hoy < c.desde) return 'programado'
  if (c.hasta && hoy > c.hasta) return 'vencido'
  return 'vigente'
}

/** Mensaje si no se puede usar hoy, o null si está vigente (misma regla que la base) */
export function problemaCupon(c: Cupon, usos = 0, hoy = hoyISO()) {
  const f = (s: string) => s.split('-').reverse().join('/')
  switch (estadoCupon(c, usos, hoy)) {
    case 'usado': return c.maxUsos === 1 ? `El cupón ${c.codigo} ya fue usado` : `El cupón ${c.codigo} ya se usó las ${c.maxUsos} veces permitidas`
    case 'inactivo': return `El cupón ${c.codigo} está desactivado`
    case 'programado': return `El cupón ${c.codigo} vale desde el ${f(c.desde!)}`
    case 'vencido': return `El cupón ${c.codigo} venció el ${f(c.hasta!)}`
    default: return null
  }
}

/** Código en mayúsculas, sin espacios ni acentos */
export const normalizarCodigo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '')

/** Letras y números sin los que se confunden al dictarlos (0/O, 1/I/L) */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Código aleatorio, con prefijo opcional: VERANO-7KQ2MX */
export function generarCodigo(largo = 8, prefijo = '') {
  const n = Math.max(4, Math.min(16, largo))
  const bytes = new Uint32Array(n)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 2 ** 32)
  const cuerpo = Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('')
  const pre = normalizarCodigo(prefijo)
  return (pre ? `${pre}-${cuerpo}` : cuerpo).slice(0, 30)
}

/** Varios códigos aleatorios distintos entre sí y de los que ya existen */
export function generarCodigos(cantidad: number, largo: number, prefijo: string, existentes: Set<string>) {
  const out = new Set<string>()
  let intentos = 0
  while (out.size < cantidad && intentos++ < cantidad * 50) {
    const c = generarCodigo(largo, prefijo)
    if (!existentes.has(c)) out.add(c)
  }
  return [...out]
}
