import type { Caja, Comanda, FormatoTicket, Impresora, LineaTicket, MovimientoCaja, TipoPrintJob, TotalesCaja, Zona } from '../types'
import { FORMAS_PAGO } from '../types'
import { coccionLabel, fecha, hora, money, nombreConVariante, varianteLabel } from './format'

/**
 * Arma la comanda como una lista de líneas con formato.
 * Esto es lo que se guarda en print_jobs.contenido y lo que el spool
 * traduce a ESC/POS. Así el diseño del ticket vive en un solo lugar
 * (la web) y el spool solo sabe imprimir líneas.
 *
 * Tamaños: 'small' = letra chica (fuente B), 'normal' = 1x, 'tall' = doble alto (mismo ancho), 'large' = doble alto y ancho, 'xl' = triple.
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
/** Versión mínima que imprime todos los tamaños (la letra alta llegó en la 1.4.0) */
export const VERSION_TAMANOS = '1.4.0'
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

type Tam = 'small' | 'normal' | 'tall' | 'large' | 'xl'

/** Tamaño de cada parte del ticket según el formato elegido para la comandera */
export const FORMATOS: Record<FormatoTicket, {
  nombre: string; descripcion: string
  titulo: Tam; tipo: Tam; cliente: Tam; direccion: Tam; item: Tam; detalle: Tam; total: Tam; avance: number
}> = {
  chico: { nombre: 'Chico', descripcion: 'Productos en letra chica. Ahorra papel.', titulo: 'large', tipo: 'normal', cliente: 'normal', direccion: 'normal', item: 'small', detalle: 'small', total: 'normal', avance: 2 },
  normal: { nombre: 'Normal', descripcion: 'Productos y dirección en letra alta, fácil de leer.', titulo: 'xl', tipo: 'large', cliente: 'large', direccion: 'tall', item: 'tall', detalle: 'tall', total: 'large', avance: 3 },
  grande: { nombre: 'Grande', descripcion: 'Productos y dirección con letra doble. Para leer de lejos en la cocina.', titulo: 'xl', tipo: 'large', cliente: 'large', direccion: 'large', item: 'large', detalle: 'large', total: 'large', avance: 4 },
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
    if (c.direccion) linea(`Dir: ${c.direccion}`, F.direccion, { bold: true })
    if (c.entreCalles) linea(`Entre: ${c.entreCalles}`, F.direccion)
    const zona = o.zonas?.find(z => z.id === c.zonaId)
    if (zona) linea(`Zona: ${zona.nombre}`, 'normal')
  }
  if (c.clienteTel) linea(`Tel: ${c.clienteTel}`, 'normal')
  if (c.horaEntrega) linea(`PARA LAS ${c.horaEntrega}`, F.cliente, { bold: true })
  if (c.clienteNombre || c.tipo === 'delivery' || c.clienteTel || c.horaEntrega) L.push({ t: 'line' })

  // ---- Ítems
  for (const it of c.items) {
    const esMitad = it.variante === 'mitad'
    const extra = [esMitad ? '' : varianteLabel(it.variante), coccionLabel(it.coccion)].filter(Boolean).join(', ')
    // Mitades: "1 Mitad Muzzarella" (sin "x", para que no parezca una pizza entera)
    const nombre = `${it.cantidad}${esMitad ? '' : ' x'} ${nombreConVariante(it.descripcion, it.variante)}${extra ? ` (${extra})` : ''}`
    if (precios) dos(nombre, money(it.precioUnit * it.cantidad), F.item, { bold: true })
    else linea(nombre, F.item, { bold: true })
    for (const comp of it.componentes) {
      const e = [comp.variante === 'mitad' ? '' : varianteLabel(comp.variante), coccionLabel(comp.coccion)].filter(Boolean).join(', ')
      linea(`  -> ${comp.cantidad} ${nombreConVariante(comp.descripcion, comp.variante)}${e ? ` (${e})` : ''}`, F.detalle, {}, '     ')
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

// ---------------------------------------------------------------------
// Cierre de caja impreso (para guardar con las comandas del turno)
// ---------------------------------------------------------------------
export interface DatosCierre {
  caja: Caja
  totales: TotalesCaja
  comandas: Comanda[]
  movimientos: MovimientoCaja[]
  nombreLocal?: string
}

export function ticketCierre(d: DatosCierre, ancho: number): LineaTicket[] {
  const { caja, totales: t, comandas, movimientos } = d
  const L: LineaTicket[] = []
  const linea = (texto: string, size: Tam = 'normal', extra: Partial<Extract<LineaTicket, { t: 'text' }>> = {}) =>
    partir(texto, anchoPara(ancho, size)).forEach(l => L.push(txt(l, { ...extra, ...(size !== 'normal' ? { size } : {}) })))
  const dos = (izq: string, der: string, extra: Partial<Extract<LineaTicket, { t: 'text' }>> = {}) =>
    dosColumnas(izq, der, ancho).forEach(l => L.push(txt(l, extra)))
  const titulo = (s: string) => { L.push({ t: 'line' }); linea(s, 'normal', { bold: true }) }

  if (d.nombreLocal) linea(d.nombreLocal, 'normal', { align: 'center', bold: true })
  linea('CIERRE DE CAJA', 'large', { bold: true, align: 'center' })
  linea(` TURNO ${caja.turno.toUpperCase()} `, 'normal', { bold: true, align: 'center', invert: true })
  linea(`Abrio: ${fecha(caja.abiertaAt)} ${hora(caja.abiertaAt)}${caja.abiertaPor ? ` (${caja.abiertaPor})` : ''}`, 'normal', { align: 'center' })
  if (caja.cerradaAt) linea(`Cerro: ${fecha(caja.cerradaAt)} ${hora(caja.cerradaAt)}${caja.cerradaPor ? ` (${caja.cerradaPor})` : ''}`, 'normal', { align: 'center' })
  else linea('(caja abierta: cierre parcial)', 'normal', { align: 'center' })

  // Ventas
  const validas = comandas.filter(c => c.estado !== 'anulada')
  titulo('VENTAS')
  dos(`Comandas: ${t.cantComandas}`, money(t.totalVentas), { bold: true })
  if (t.cantAnuladas) dos('Anuladas', String(t.cantAnuladas))
  const grupo = (f: (c: Comanda) => boolean) => { const l = validas.filter(f); return [l.length, l.reduce((s, c) => s + c.total, 0)] as const }
  for (const [label, f] of [
    ['Mostrador', (c: Comanda) => c.tipo === 'mostrador' && c.canal !== 'pedidosya'],
    ['Delivery', (c: Comanda) => c.tipo === 'delivery' && c.canal !== 'pedidosya'],
    ['PedidosYa', (c: Comanda) => c.canal === 'pedidosya'],
  ] as const) {
    const [n, m] = grupo(f)
    if (n) dos(`  ${label} (${n})`, money(m))
  }
  const sinCobrar = validas.filter(c => !c.cobrada)
  if (sinCobrar.length) dos(`  Sin cobrar (${sinCobrar.length})`, money(sinCobrar.reduce((s, c) => s + c.total, 0)))
  const descuentos = validas.reduce((s, c) => s + (c.descuento || 0), 0)
  if (descuentos > 0.009) dos('  Descuentos', `-${money(descuentos)}`)
  const envios = validas.reduce((s, c) => s + (c.costoEnvio || 0), 0)
  if (envios > 0.009) dos('  Envios cobrados', money(envios))

  // Cobrado por forma de pago
  const porForma = new Map<string, number>()
  for (const c of validas) {
    if (!c.cobrada) continue
    const vuelto = Math.max(0, c.pagos.reduce((s, p) => s + p.monto, 0) - c.total)
    for (const p of c.pagos) porForma.set(p.forma, (porForma.get(p.forma) ?? 0) + (p.forma === 'efectivo' ? Math.max(0, p.monto - vuelto) : p.monto))
  }
  if (porForma.size) {
    titulo('COBRADO POR FORMA DE PAGO')
    for (const [forma, monto] of porForma) dos(`  ${FORMAS_PAGO.find(f => f.key === forma)?.label ?? forma}`, money(monto))
  }

  // Efectivo
  titulo('EFECTIVO')
  dos('Dinero al inicio', money(caja.dineroInicial || 0))
  dos('+ Ventas en efectivo', money(t.ventasEfectivo))
  if (t.totalIngresos) dos('+ Ingresos', money(t.totalIngresos))
  if (t.totalGastos) dos('- Gastos', money(t.totalGastos))
  if (t.totalEgresos) dos('- Retiros', money(t.totalEgresos))
  if (t.totalSueldos) dos('- Sueldos', money(t.totalSueldos))
  dos('TEORICO EN CAJA', money(t.efectivoTeorico), { bold: true })
  if (caja.dineroCierre != null) {
    dos('CONTADO', money(caja.dineroCierre), { bold: true })
    const dif = caja.diferencia ?? caja.dineroCierre - t.efectivoTeorico
    linea(Math.abs(dif) < 0.01 ? 'SIN DIFERENCIA' : `${dif > 0 ? 'SOBRA' : 'FALTA'} ${money(Math.abs(dif))}`, 'tall', { bold: true, align: 'center', invert: dif < -0.009 })
  }

  // Detalle de movimientos
  const salidas = movimientos.filter(m => m.tipo !== 'ingreso')
  if (movimientos.length) {
    titulo('MOVIMIENTOS')
    const nombre = { gasto: 'Gasto', egreso: 'Retiro', sueldo: 'Sueldo', ingreso: 'Ingreso' } as const
    for (const m of movimientos) dos(`${hora(m.createdAt)} ${nombre[m.tipo]}: ${m.concepto}`, `${m.tipo === 'ingreso' ? '' : '-'}${money(m.monto)}`)
    if (salidas.length) dos('Total salidas', `-${money(salidas.reduce((s, m) => s + m.monto, 0))}`, { bold: true })
  }

  if (caja.observaciones) { titulo('OBSERVACIONES'); linea(caja.observaciones) }

  L.push({ t: 'line' })
  L.push({ t: 'feed', n: 1 })
  linea('Firma: ______________________', 'normal')
  linea(`Impreso ${fecha(new Date().toISOString())} ${hora(new Date().toISOString())}`, 'small', { align: 'center' })
  L.push({ t: 'feed', n: 3 })
  L.push({ t: 'cut' })
  return L
}
