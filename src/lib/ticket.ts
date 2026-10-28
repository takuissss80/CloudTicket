import type { Comanda, Impresora, LineaTicket, TipoPrintJob, Zona } from '../types'
import { FORMAS_PAGO } from '../types'
import { coccionLabel, fecha, hora, money, varianteLabel } from './format'

/**
 * Arma la comanda como una lista de líneas con formato.
 * Esto es lo que se guarda en print_jobs.contenido y lo que el spool
 * traduce a ESC/POS. Así el diseño del ticket vive en un solo lugar
 * (la web) y el spool solo sabe imprimir líneas.
 *
 * Tamaños: 'normal' = 1x, 'large' = doble alto y ancho, 'xl' = triple.
 * El ancho en caracteres depende de la comandera: 48 (80mm) o 32 (58mm).
 */

export interface OpcionesTicket {
  ancho: number
  tipo: TipoPrintJob
  mostrarPrecios?: boolean
  zonas?: Zona[]
  nombreLocal?: string
}

const anchoPara = (ancho: number, size?: 'normal' | 'large' | 'xl') =>
  size === 'large' ? Math.floor(ancho / 2) : size === 'xl' ? Math.floor(ancho / 3) : ancho

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

const txt = (text: string, extra: Partial<Extract<LineaTicket, { t: 'text' }>> = {}): LineaTicket =>
  ({ t: 'text', text, ...extra })

export function construirTicket(c: Comanda, o: OpcionesTicket): LineaTicket[] {
  const W = o.ancho
  const L: LineaTicket[] = []
  const precios = o.mostrarPrecios ?? true

  // ---- Encabezado
  if (o.nombreLocal) L.push(txt(o.nombreLocal, { align: 'center', bold: true }))
  L.push(txt(`COMANDA #${c.numero}`, { size: 'xl', bold: true, align: 'center' }))
  L.push(txt(c.tipo === 'delivery' ? ' DELIVERY ' : ' MOSTRADOR ', { size: 'large', bold: true, align: 'center', invert: true }))
  L.push(txt(`${fecha(c.createdAt)} - ${hora(c.createdAt)}`, { align: 'center' }))

  if (o.tipo === 'reimpresion') L.push(txt('** REIMPRESION **', { size: 'large', bold: true, align: 'center' }))
  if (o.tipo === 'anulacion') L.push(txt('*** ANULADA ***', { size: 'large', bold: true, align: 'center', invert: true }))

  L.push({ t: 'line' })

  // ---- Cliente
  if (c.clienteNombre) L.push(txt(c.clienteNombre, { size: 'large', bold: true }))
  if (c.tipo === 'delivery') {
    if (c.direccion) partir(`Dir: ${c.direccion}`, W).forEach(l => L.push(txt(l, { bold: true })))
    if (c.entreCalles) partir(`Entre: ${c.entreCalles}`, W).forEach(l => L.push(txt(l)))
    const zona = o.zonas?.find(z => z.id === c.zonaId)
    if (zona) L.push(txt(`Zona: ${zona.nombre}`))
  }
  if (c.clienteTel) L.push(txt(`Tel: ${c.clienteTel}`))
  if (c.horaEntrega) L.push(txt(`PARA LAS ${c.horaEntrega}`, { size: 'large', bold: true }))
  if (c.clienteNombre || c.tipo === 'delivery' || c.clienteTel || c.horaEntrega) L.push({ t: 'line' })

  // ---- Ítems
  for (const it of c.items) {
    const extra = [varianteLabel(it.variante), coccionLabel(it.coccion)].filter(Boolean).join(', ')
    const nombre = `${it.cantidad} x ${it.descripcion}${extra ? ` (${extra})` : ''}`
    const lineas = precios
      ? dosColumnas(nombre, money(it.precioUnit * it.cantidad), W)
      : partir(nombre, W)
    lineas.forEach(l => L.push(txt(l, { bold: true })))
    for (const comp of it.componentes) {
      const e = [varianteLabel(comp.variante), coccionLabel(comp.coccion)].filter(Boolean).join(', ')
      partir(`  -> ${comp.cantidad} ${comp.descripcion}${e ? ` (${e})` : ''}`, W, '     ').forEach(l => L.push(txt(l)))
    }
    if (it.nota) partir(`  * ${it.nota}`, W, '    ').forEach(l => L.push(txt(l, { bold: true })))
  }

  L.push({ t: 'line' })

  // ---- Totales
  if (precios) {
    const fila = (a: string, b: number) => dosColumnas(a, money(b), W).forEach(l => L.push(txt(l)))
    if (c.costoEnvio || c.descuento || c.adicional) fila('Subtotal', c.subtotal)
    if (c.costoEnvio) fila('Envio', c.costoEnvio)
    if (c.adicional) fila('Adicional', c.adicional)
    if (c.descuento) fila('Descuento', -c.descuento)
    const wT = anchoPara(W, 'large')
    dosColumnas('TOTAL', money(c.total), wT).forEach(l => L.push(txt(l, { size: 'large', bold: true })))

    if (c.pagos.length) {
      for (const p of c.pagos) {
        const label = FORMAS_PAGO.find(f => f.key === p.forma)?.label ?? p.forma
        dosColumnas(`Pago ${label}`, money(p.monto), W).forEach(l => L.push(txt(l)))
      }
      const pagado = c.pagos.reduce((s, p) => s + p.monto, 0)
      if (pagado > c.total) dosColumnas('Vuelto', money(pagado - c.total), W).forEach(l => L.push(txt(l, { bold: true })))
    }
    L.push(txt(c.cobrada ? 'COBRADO' : 'A COBRAR', { size: 'large', bold: true, align: 'center', invert: !c.cobrada }))
  }

  if (c.observaciones) {
    L.push({ t: 'line' })
    partir(`OBS: ${c.observaciones}`, W).forEach(l => L.push(txt(l, { bold: true })))
  }

  L.push({ t: 'feed', n: 3 })
  L.push({ t: 'cut' })
  return L
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
      contenido: construirTicket(c, { ...extra, ancho: i.ancho, tipo }),
    }))
}

/** Ticket de prueba para verificar la comandera */
export function ticketPrueba(impresora: Impresora): LineaTicket[] {
  const W = impresora.ancho
  return [
    txt('PRUEBA DE IMPRESION', { size: 'large', bold: true, align: 'center' }),
    txt(`Impresora: ${impresora.nombre}`, { align: 'center' }),
    txt(new Date().toLocaleString('es-AR'), { align: 'center' }),
    { t: 'line' },
    txt('Normal: abcdefghijklmnñopqrstuvwxyz'),
    txt('Negrita: 0123456789', { bold: true }),
    txt('GRANDE', { size: 'large' }),
    txt('XL', { size: 'xl' }),
    txt(' INVERTIDO ', { invert: true }),
    txt('1234567890'.repeat(Math.ceil(W / 10)).slice(0, W)),
    { t: 'feed', n: 3 },
    { t: 'cut' },
  ]
}
