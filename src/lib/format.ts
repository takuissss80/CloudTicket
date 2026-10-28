const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const money = (n: number) => '$' + fmt.format(Math.round(n * 100) / 100)

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

export const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Minutos transcurridos desde una fecha ISO */
export const minutosDesde = (iso: string, ahora = Date.now()) =>
  Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000))

export const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export const varianteLabel = (v?: string) =>
  v === 'entera' ? 'Entera' : v === 'mitad' ? 'Mitad' : ''

export const coccionLabel = (c?: string) =>
  c === 'horno' ? 'Horno' : c === 'frita' ? 'Frita' : ''
