import type { Comanda, FormatoTicket, Impresora, LineaTicket, TipoPrintJob, Zona } from '../types'
import { FORMAS_PAGO } from '../types'
import { coccionLabel, fecha, hora, money, varianteLabel } from './format'

/**
 * Arma la comanda como una lista de líneas con formato.
 * Esto es lo que se guarda en print_jobs.contenido y lo que el spool
 * traduce a ESC/POS. Así el diseño del ticket vive en un solo lugar
 * (la web) y el spool solo sabe imprimir líneas.
 *
 * Tamaños: 'small' = letra chica (fuente B), 'normal' = 1x, 'large' = doble alto y ancho, 'xl' = triple.
 * El ancho en caracteres depende de la comandera: 48 (80mm) o 32 (58mm).
 */

export interface OpcionesTicket {
  ancho: number
  tipo: TipoPrintJob
  formato?: FormatoTicket
  mostrarPrecios?: boolean
  zonas?: Zona[]
  nombreLocal?: string
  /** El programa de Windows sabe imprimir letra chica (desde la versión 1.3.0) */
  letraChica?: boolean
}

/** Versión mínima del programa que imprime la letra chica (fuente B) */
export const VERSION_LETRA_CHICA = '1.3.0'
export function versionAlMenos(v: string | undefined, minima: string) {
  if (!v) return false
  const a = v.split('.').map(Number), b = minima.split('.').map(Number)
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) }
  return true
}

// Letra chica (fuente B, 9 puntos): 56 caracteres en 80 mm y 37 en 58 mm (con margen para cabezales de 512 puntos)
const anchoPara = (ancho: number, size?: Tam) =>
  size === 'small' ? Math.floor((ancho * 7) / 6) : size === 'large' ? Math.floor(ancho / 2) : size === 'xl' ? Math.floor(ancho / 3) : ancho

/** Texto a la izquierda y a la derecha en la misma línea */
export function dosColumnas(izq: string, der: string, ancho: number) {
  const espacio = ancho - der.length - 1
  if (izq.length > espacio) {
    // Si no entra, corto el texto de la izquierda en varias líneas
    const lineas = partir(izq, espacio)
    const ultima = lineas.pop()!
    return [...lineas, ultima.padEnd(espacio) + ' ' + der]
  }
  return [izq.padEnd(ancho - der.length) + der]
}

/** Parte un texto en líneas de como máximo `ancho` caracteres, respetando palabras */
export function partir(texto: string, ancho: number, sangria = ''): string[] {
  const inicio = texto.match(/^\s*/)?.[0] ?? ''
  const palabras = texto.trim().split(/\s+/).filter(Boolean)
  const out: string[] = []
  let actual = inicio
  for (const p of palabras) {
    const vacio = actual.trim() === ''
    const candidato = vacio ? actual + p : actual + ' ' + p
    if (candidato.length <= ancho) actual = candidato
    else {
      if (!vacio) out.push(actual)
      actual = (vacio ? actual : sangria) + p
      while (actual.length > ancho) { out.push(actual.slice(0, ancho)); actual = sangria + actual.slice(ancho) }
    }
  }
  if (actual.trim()) out.push(actual)
  return out.length ? out : ['']
}

type Tam = 'small' | 'normal' | 'large' | 'xl'

/** Tamaño de cada parte del ticket según el formato elegido para la comandera */
export const FORMATOS: Record<FormatoTicket, {
  nombre: string; descripcion: string
  titulo: Tam; tipo: Tam; cliente: Tam; item: Tam; detalle: Tam; total: Tam; avance: number
}> = {
  chico: { nombre: 'Chico', descripcion: 'Productos en letra chica. Ahorra papel.', titulo: 'large', tipo: 'normal', cliente: 'normal', item: 'small', detalle: 'small', total: 'normal', avance: 2 },
  normal: { nombre: 'Normal', descripcion: 'Título y cliente grandes, productos en letra normal.', titulo: 'xl', tipo: 'large', cliente: 'large', item: 'normal', detalle: 'normal', total: 'large', avance: 3 },
  grande: { nombre: 'Grande', descripcion: 'Productos con letra doble. Para leer de lejos en la cocina.', titulo: 'xl', tipo: 'large', cliente: 'large', item: 'large', detalle: 'large', total: 'large', avance: 4 },
}

const txt = (text: string, extra: Partial<Extract<LineaTicket, { t: 'text' }>> = {}): LineaTicket =>
  ({ t: 'text', text, ...extra })

export function construirTicket(c: Comanda, o: OpcionesTicket): LineaTicket[] {
  const W = o.ancho
  const base = FORMATOS[o.formato ?? 'normal']
  // Con un programa viejo que no conoce la letra chica, se imprime en normal
  const F = o.letraChica === false
    ? Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v === 'small' ? 'normal' : v])) as typeof base
    : base
  const L: LineaTicket[] = []
  const precios = o.mostrarPrecios ?? true
  /** Agrega un texto partido al ancho que permite su tamaño */
  const linea = (texto: string, size: Tam, extra: Partial<Extract<LineaTicket, { t: 'text' }>> = {}, sangria = '') =>
    partir(texto, anchoPara(W, size), sangria).forEach(l => L.push(txt(l, { ...extra, ...(size !== 'normal' ? { size } : {}) })))
  const dos = (izq: string, der: string, size: Tam, extra: Partial<Extract<LineaTicket, { t: 'text' }>> = {}) =>
    dosColumnas(izq, der, anchoPara(W, size)).forEach(l => L.push(txt(l, { ...extra, ...(size !== 'normal' ? { size } : {}) })))

  // ---- Encabezado
  if (o.nombreLocal) linea(o.nombreLocal, 'normal', { align: 'center', bold: true })
  linea(`COMANDA #${c.numero}`, F.titulo, { bold: true, align: 'center' })
  linea(c.tipo === 'delivery' ? ' DELIVERY ' : ' MOSTRADOR ', F.tipo, { bold: true, align: 'center', invert: true })
  L.push(txt(`${fecha(c.createdAt)} - ${hora(c.createdAt)}`, { align: 'center' }))

  if (o.tipo === 'reimpresion') linea('** REIMPRESION **', 'large', { bold: true, align: 'center' })
  if (o.tipo === 'anulacion') linea('*** ANULADA ***', 'large', { bold: true, align: 'center', invert: true })
  if (o.tipo === 'prueba') linea('** PRUEBA **', 'large', { bold: true, align: 'center' })

  L.push({ t: 'line' })

  // ---- Cliente
  if (c.clienteNombre) linea(c.clienteNombre, F.cliente, { bold: true })
  if (c.tipo === 'delivery') {
    if (c.direccion) linea(`Dir: ${c.direccion}`, 'normal', { bold: true })
    if (c.entreCalles) linea(`Entre: ${c.entreCalles}`, 'normal')
    const zona = o.zonas?.find(z => z.id === c.zonaId)
    if (zona) linea(`Zona: ${zona.nombre}`, 'normal')
  }
  if (c.clienteTel) linea(`Tel: ${c.clienteTel}`, 'normal')
  if (c.horaEntrega) linea(`PARA LAS ${c.horaEntrega}`, F.cliente, { bold: true })
  if (c.clienteNombre || c.tipo === 'delivery' || c.clienteTel || c.horaEntrega) L.push({ t: 'line' })

  // ---- Ítems
  for (const it of c.items) {
    const extra = [varianteLabel(it.variante), coccionLabel(it.coccion)].filter(Boolean).join(', ')
    const nombre = `${it.cantidad} x ${it.descripcion}${extra ? ` (${extra})` : ''}`
    if (precios) dos(nombre, money(it.precioUnit * it.cantidad), F.item, { bold: true })
    else linea(nombre, F.item, { bold: true })
    for (const comp of it.componentes) {
      const e = [varianteLabel(comp.variante), coccionLabel(comp.coccion)].filter(Boolean).join(', ')
      linea(`  -> ${comp.cantidad} ${comp.descripcion}${e ? ` (${e})` : ''}`, F.detalle, {}, '     ')
    }
    if (it.nota) linea(`  * ${it.nota}`, F.detalle, { bold: true }, '    ')
  }

  L.push({ t: 'line' })

  // ---- Totales
  if (precios) {
    const fila = (a: string, b: number) => dos(a, b < 0 ? `-${money(-b)}` : money(b), 'normal')
    if (c.costoEnvio || c.descuento || c.adicional) fila('Subtotal', c.subtotal)
    if (c.costoEnvio) fila('Envio', c.costoEnvio)
    if (c.adicional) fila('Adicional', c.adicional)
    const descCupon = c.descuentoCupon || 0
    if (c.descuento - descCupon > 0.009) fila('Descuento', -(c.descuento - descCupon))
    if (descCupon > 0.009) fila(`Cupon ${c.cuponCodigo ?? ''}`.trim(), -descCupon)
    dos('TOTAL', money(c.total), F.total, { bold: true })

    if (c.pagos.length) {
      for (const p of c.pagos) {
        const label = FORMAS_PAGO.find(f => f.key === p.forma)?.label ?? p.forma
        dos(`Pago ${label}`, money(p.monto), 'normal')
      }
      const pagado = c.pagos.reduce((s, p) => s + p.monto, 0)
      if (pagado > c.total) dos('Vuelto', money(pagado - c.total), 'normal', { bold: true })
    }
    linea(c.cobrada ? 'COBRADO' : 'A COBRAR', F.tipo, { bold: true, align: 'center', invert: !c.cobrada })
  }

  if (c.observaciones) {
    L.push({ t: 'line' })
    linea(`OBS: ${c.observaciones}`, F.detalle, { bold: true })
  }

  L.push({ t: 'feed', n: F.avance })
  L.push({ t: 'cut' })
  return L
}

/** Comanda de ejemplo para la vista previa y la prueba de impresión */
export function comandaEjemplo(): Comanda {
  const ahora = new Date().toISOString()
  return {
    id: 'ejemplo', cajaId: '', numero: 25, tipo: 'delivery', estado: 'pendiente',
    clienteNombre: 'Lucía Fernández', clienteTel: '11 5555-1234', direccion: 'Av. San Martín 1234, 3° B', entreCalles: 'Güemes y Mitre',
    horaEntrega: '21:30', costoEnvio: 1500, subtotal: 31500, descuento: 0, adicional: 0, total: 33000, descuentoCupon: 0,
    observaciones: 'Tocar timbre 3B', cobrada: false, pagos: [{ forma: 'efectivo', monto: 35000 }],
    items: [
      { id: '1', descripcion: 'Grande Muzzarella', cantidad: 2, precioUnit: 12000, componentes: [], nota: 'sin aceitunas' },
      { id: '2', descripcion: 'PROMO 4', cantidad: 1, precioUnit: 7500, componentes: [
        { descripcion: 'Jamón y queso', cantidad: 2, coccion: 'horno' }, { descripcion: 'Carne a cuchillo', cantidad: 2, coccion: 'frita' },
      ] },
    ],
    createdAt: ahora, updatedAt: ahora,
  }
}

/** Arma un print_job por cada impresora que corresponde al tipo de comanda */
export function jobsParaComanda(c: Comanda, impresoras: Impresora[], tipo: TipoPrintJob, extra: Omit<OpcionesTicket, 'ancho' | 'tipo'> = {}) {
  return impresoras
    .filter(i => (c.tipo === 'delivery' ? i.imprimeDelivery : i.imprimeMostrador))
    .map(i => ({
      impresoraId: i.id,
      comandaId: c.id,
      tipo,
      copias: i.copias,
      contenido: construirTicket(c, { ...extra, ancho: i.ancho, tipo, formato: i.formato, mostrarPrecios: i.mostrarPrecios, letraChica: versionAlMenos(i.versionPrograma, VERSION_LETRA_CHICA) }),
    }))
}

/** Ticket de prueba: una comanda de ejemplo con el formato de la comandera */
export function ticketPrueba(impresora: Impresora, nombreLocal?: string): LineaTicket[] {
  return construirTicket(comandaEjemplo(), {
    ancho: impresora.ancho, tipo: 'prueba', formato: impresora.formato, mostrarPrecios: impresora.mostrarPrecios,
    letraChica: !impresora.versionPrograma || versionAlMenos(impresora.versionPrograma, VERSION_LETRA_CHICA),
    nombreLocal: nombreLocal ?? impresora.nombre,
  })
}
