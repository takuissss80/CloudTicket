import type { ImportacionPedido, MapeoExterno, Producto } from '../types'

// ---------------------------------------------------------------------
// Lectura de tickets de PedidosYa (texto que imprimió GoWin u otro sistema)
// Pensado para el formato típico: "2 x Producto   $12.000". Si algún ticket
// real no se lee bien, se ajusta acá (y se prueba en "Probar un ticket").
// ---------------------------------------------------------------------

export interface ItemTicket {
  cantidad: number
  nombre: string
  /** Precio de la línea (cantidad x unitario) si el ticket lo trae */
  precio?: number
  extras: string[]
}

export interface TicketLeido {
  numero?: string
  cliente?: string
  telefono?: string
  direccion?: string
  notas?: string
  items: ItemTicket[]
  subtotal?: number
  envio?: number
  descuento?: number
  total?: number
  pago?: 'online' | 'efectivo'
  retiro: boolean
  /** De qué gestor vino el ticket */
  origen: 'pedidosya' | 'mercadopago'
}

/** "$ 12.500,00" -> 12500 (formato argentino; también 12,500.00) */
export function parsearMonto(s: string): number | undefined {
  const limpio = s.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(limpio)) return undefined
  const neg = limpio.startsWith('-')
  let t = limpio.replace(/-/g, '')
  const ultPunto = t.lastIndexOf('.'), ultComa = t.lastIndexOf(',')
  if (ultPunto >= 0 && ultComa >= 0) {
    t = ultComa > ultPunto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (ultComa >= 0) {
    t = t.length - ultComa - 1 === 3 && (t.match(/,/g) ?? []).length >= 1 && !/,\d{1,2}$/.test(t) ? t.replace(/,/g, '') : t.replace(/,/g, '.')
  } else if (ultPunto >= 0) {
    const dec = t.length - ultPunto - 1
    if (dec === 3 || (t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  }
  const n = Number(t)
  if (!Number.isFinite(n)) return undefined
  return neg ? -n : n
}

const MONTO = String.raw`-?\$?\s*-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|-?\$?\s*-?\d+(?:[.,]\d{1,2})?`
const reMontoFinal = new RegExp(String.raw`\s+(${MONTO})\s*$`)
const reItem = /^\s*(\d{1,3}(?:[.,]5)?)\s*(?:x|X|×|u\.?|un\.?|uds?\.?)?\s+(.+)$/
// Mercado Pago pega la x al producto: "1 xSalchichas Chica"
const reItemXPegada = /^\s*(\d{1,3})\s*[xX×](?=\p{Lu}\p{Ll})(.+)$/u
const reItemXAlFinal = /^\s*(.+?)\s+[xX×]\s?(\d{1,3})\s*$/
const reCierre = /^\s*(sub\s*-?\s*total|total|env[ií]o|costo de (env[ií]o|entrega)|delivery|descuento|cup[oó]n|bonificaci[oó]n|promoci[oó]n|propina|forma de pago|m[eé]todo de pago|medio de pago|pago|abona|paga con|vuelto|cargo|tarifa|recargo)\b/i
const reExtra = /^\s*([-+*•>·]|\s{2,})\s*\S/

function montoDeLinea(l: string) {
  const m = l.match(new RegExp(String.raw`(${MONTO})\s*$`))
  return m ? parsearMonto(m[1]) : undefined
}

export function parsearTicket(texto: string): TicketLeido {
  const crudas = texto.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''))
  // GoWin corta los precios largos: "29.640," y en la línea de abajo "00"
  const lineas: string[] = []
  for (const l of crudas) {
    const prev = lineas[lineas.length - 1]
    if (prev !== undefined && /\d[.,]$/.test(prev) && /^\s*\d{1,2}\s*$/.test(l)) lineas[lineas.length - 1] = prev + l.trim()
    else lineas.push(l)
  }
  const todo = lineas.join('\n')
  const t: TicketLeido = { items: [], retiro: false, origen: esMercadoPago(todo) ? 'mercadopago' : 'pedidosya' }

  const num = todo.match(/(?:pedido|orden|order|n[°ºo]\.?\s*de\s*pedido)\s*(?:n[°ºo.]*|nro\.?|n[uú]mero|id)?\s*[:#]?\s*#?\s*(\d{4,})/i)
    ?? todo.match(/#\s*(\d{4,})/)
  if (num) t.numero = num[1]
  // Mercado Pago: el número va solo en una línea, arriba de "Recibido:"
  if (!t.numero && t.origen === 'mercadopago') {
    const iRec = lineas.findIndex(l => /^\s*recibido\s*:/i.test(l))
    const suelto = lineas.slice(0, iRec > 0 ? iRec : 4).map(l => l.trim()).find(l => /^#?\d{3,8}$/.test(l))
    if (suelto) t.numero = suelto.replace('#', '')
  }
  const campo = (re: RegExp) => todo.match(re)?.[1]?.trim()
  t.cliente = campo(/^\s*(?:cliente|nombre|a nombre de|para)\s*[:\-]\s*(.+)$/im)
  t.telefono = campo(/(?:tel[eé]fono|tel\.?|cel(?:ular)?|whats?app)\s*[:\-]?\s*([+\d][\d\s\-()]{6,}\d)/i)?.replace(/\s+/g, ' ')
  t.direccion = campo(/^\s*(?:direcci[oó]n(?: de entrega)?|domicilio|entregar en|entrega en)\s*[:\-]\s*(.+)$/im)
  t.notas = campo(/^\s*(?:notas?|observaciones?|comentarios?|aclaraci[oó]n(?:es)?|indicaciones)\s*[:\-]\s*(.+)$/im)
  if (t.origen === 'mercadopago') leerClienteMercadoPago(lineas, t)
  if (!t.cliente) leerBloqueCliente(lineas, t)
  t.retiro = /retir[ao] en (el )?local|retiro en|para retirar|take\s?away|pick\s?up|retira el cliente/i.test(todo)
  if (/pedido abonado|ya abonado/i.test(todo)) t.pago = 'online'
  if (/pag(ad)?o (con )?(online|en l[ií]nea|tarjeta|mercado ?pago)|ya pagad|pagado|pago online|online|medio de pago\s*:\s*(visa|master|amex|american|cabal|naranja|maestro|d[eé]bito|cr[eé]dito|tarjeta|mercado ?pago|pago online)/i.test(todo)) t.pago = 'online'
  if (/efectivo|abona con|paga con|cash/i.test(todo) && !/no (abona|paga) en efectivo/i.test(todo)) t.pago = t.pago === 'online' && /pagado/i.test(todo) ? 'online' : 'efectivo'

  // Totales: la última línea "Total" (que no sea subtotal)
  for (const l of lineas) {
    const s = l.trim()
    if (/^sub\s*-?\s*total\b/i.test(s)) t.subtotal = montoDeLinea(s) ?? t.subtotal
    else if (/^total\b/i.test(s)) t.total = montoDeLinea(s) ?? t.total
    else if (/^(env[ií]o|costo de (env[ií]o|entrega)|delivery|cargo de env)/i.test(s)) {
      const m = montoDeLinea(s); if (m != null) t.envio = Math.abs(m)
    } else if (/^(descuento|cup[oó]n|bonificaci[oó]n|promoci[oó]n|dto\.?)/i.test(s)) {
      const m = montoDeLinea(s); if (m != null) t.descuento = (t.descuento ?? 0) + Math.abs(m)
    }
  }

  // Productos: desde la primera línea con forma de producto hasta los totales
  let empezo = false
  for (const l of lineas) {
    if (!l.trim() || /^[\s\-=_*.·~]+$/.test(l)) continue  // vacías y separadores
    if (empezo && reCierre.test(l)) break
    const ult = t.items[t.items.length - 1]
    if (ult && reExtra.test(l) && !reItem.test(l.trim())) {
      ult.extras.push(l.trim().replace(/^[-+*•>·]\s*/, ''))
      continue
    }
    const item = leerItem(l)
    if (item) { t.items.push(item); empezo = true }
  }
  if (t.origen === 'mercadopago') preciosSueltos(lineas, t)
  return t
}

/** Ticket del gestor de pedidos de Mercado Pago: "Recibido:", "Entrega prevista:", "Enviar a" */
function esMercadoPago(todo: string) {
  if (/pedidos ?ya|nro\.? ?orden/i.test(todo)) return false
  return /mercado ?pago/i.test(todo) || (/^\s*recibido\s*:/im.test(todo) && /entrega prevista|^\s*enviar a\s*$|retir[ao] en/im.test(todo))
}

/**
 * Mercado Pago pone cada dato abajo de su etiqueta:
 *   Enviar a / MARISOL SANCHEZ / Dirección: / Avenida General San / Martin 3738 /
 *   Referencia: / Timbre Casa PB / Referencia: Entre peru y / dean funes. / Ciudad: / Florida Oeste
 */
const reEtiquetaMP = /^\s*(enviar a|retira|direcci\S{0,3}n|referencia|ciudad|tel[eé]fono|tel\.?|notas?|comentarios?)\s*:?\s*(.*)$/i
function leerClienteMercadoPago(lineas: string[], t: TicketLeido) {
  const bloques: { etiqueta: string; valor: string[] }[] = []
  const iEnvio = lineas.findIndex(l => /^\s*(enviar a|retira)\b/i.test(l))
  if (iEnvio < 0) return
  for (const l of lineas.slice(iEnvio)) {
    const s = l.trim()
    if (!s) continue
    const m = s.match(reEtiquetaMP)
    if (m) bloques.push({ etiqueta: m[1].toLowerCase(), valor: m[2] ? [m[2]] : [] })
    else if (bloques.length) bloques[bloques.length - 1].valor.push(s)
  }
  const junto = (b: { valor: string[] }) => b.valor.join(' ').replace(/\s+/g, ' ').trim()
  const nombre = bloques.find(b => b.etiqueta === 'enviar a' || b.etiqueta === 'retira')
  if (nombre?.valor.length) {
    const n = nombre.valor[0]
    t.cliente = n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : n
  }
  const dir = bloques.filter(b => b.etiqueta.startsWith('direcci')).map(junto).filter(Boolean)
  const ciudad = bloques.filter(b => b.etiqueta === 'ciudad').map(junto).filter(Boolean)
  if (dir.length) t.direccion = [...dir, ...ciudad].join(', ')
  const notas = bloques.filter(b => b.etiqueta === 'referencia' || b.etiqueta.startsWith('nota') || b.etiqueta.startsWith('comentario')).map(junto).filter(Boolean)
  if (notas.length) t.notas = notas.join(' · ')
  const tel = bloques.find(b => b.etiqueta.startsWith('tel'))
  if (tel && !t.telefono) t.telefono = junto(tel) || undefined
  if (/^\s*retira\b/im.test(lineas.join('\n'))) t.retiro = true
}

/**
 * Mercado Pago imprime los precios de cada producto sueltos, debajo de los totales:
 *   "$" / "13900.00" / "$" / "12900.00"  (en el mismo orden que los productos)
 * Se usan solo si son tantos como los productos y suman el total.
 */
function preciosSueltos(lineas: string[], t: TicketLeido) {
  if (!t.items.length || t.items.some(i => i.precio != null)) return
  const montos: number[] = []
  const iTotal = lineas.findIndex(l => /^\s*total\b/i.test(l))
  for (let i = iTotal + 1; i < lineas.length && iTotal >= 0; i++) {
    const s = lineas[i].trim()
    if (/^(enviar a|retira|direcci)/i.test(s)) break
    const solo = s === '$' && /^\s*[\d.,]+\s*$/.test(lineas[i + 1] ?? '') ? '$' + lineas[++i].trim() : s
    if (/^\$\s*[\d.,]+$/.test(solo)) { const m = parsearMonto(solo); if (m != null) montos.push(m) }
  }
  if (montos.length !== t.items.length) return
  const suma = montos.reduce((a, b) => a + b, 0)
  const esperado = (t.total ?? suma) - (t.envio ?? 0) + (t.descuento ?? 0)
  if (Math.abs(suma - esperado) > 1) return
  t.items.forEach((it, i) => { it.precio = montos[i] })
}

/**
 * Tickets de GoWin: el cliente viene sin etiquetas, en un bloque entre separadores:
 *   ALAN BARTKUS / Alemania 334 / El Talar,Tigre / Tel.: +54... / (indicaciones)
 * Se toma el bloque donde está la línea del teléfono.
 */
const reSeparador = /^[\s\-=_*.·~]{5,}$/
const reTelLinea = /^\s*(?:tel[eé]fono|tel\.?|cel(?:ular)?|whats?app)\s*[:.\-]?\s*[+\d]/i
function leerBloqueCliente(lineas: string[], t: TicketLeido) {
  let antes: string[], despues: string[] = []
  const iTel = lineas.findIndex(l => reTelLinea.test(l))
  if (iTel >= 0) {
    let ini = iTel, fin = iTel
    while (ini > 0 && !reSeparador.test(lineas[ini - 1])) ini--
    while (fin < lineas.length - 1 && !reSeparador.test(lineas[fin + 1])) fin++
    antes = lineas.slice(ini, iTel).map(l => l.trim()).filter(Boolean)
    despues = lineas.slice(iTel + 1, fin + 1).map(l => l.trim()).filter(Boolean)
  } else {
    // Sin teléfono (pedidos que reparte PedidosYa): el bloque justo antes de "Medio de pago"
    const iPago = lineas.findIndex(l => /^\s*(medio|forma|m[eé]todo) de pago\b/i.test(l))
    if (iPago < 0) return
    let fin = iPago - 1
    while (fin >= 0 && !reSeparador.test(lineas[fin])) fin--
    if (fin < 0) return
    let ini = fin - 1
    while (ini >= 0 && !reSeparador.test(lineas[ini])) ini--
    antes = lineas.slice(ini + 1, fin).map(l => l.trim()).filter(Boolean)
  }
  // Fechas, horas, números sueltos y palabras de encabezado no son el cliente
  while (antes.length && /^(\w{2,4},?\s*)?\d{1,2}[\/:.-]\d{1,2}([\/.-]\d{2,4})?$|^[#\d\s]+$|^(entrega|retiro|delivery|pedidos ?ya|hurrier|rider|repartidor)\b/i.test(antes[0])) antes.shift()
  if (!antes.length || antes.length > 6) return
  if (antes.some(l => /\$/.test(l) && reMontoFinal.test(' ' + l))) return
  if (!/\p{L}{2,}/u.test(antes[0]) || antes[0].length > 60) return
  // "ALAN BARTKUS" -> "Alan Bartkus"
  t.cliente = antes[0] === antes[0].toUpperCase() ? antes[0].toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : antes[0]
  // "Entre General Paz y Lavalle" son indicaciones, el resto es la dirección
  const resto = antes.slice(1)
  const indicaciones = [...resto.filter(l => /^entre\b/i.test(l)), ...despues]
  const direccion = resto.filter(l => !/^entre\b/i.test(l))
  if (!t.direccion && direccion.length) t.direccion = direccion.join(', ')
  if (!t.notas && indicaciones.length) t.notas = indicaciones.join(' ')
}

function leerItem(linea: string): ItemTicket | null {
  let resto = linea.trim()
  let precio: number | undefined
  const m = resto.match(reMontoFinal)
  if (m && /\d{2,}/.test(m[1])) {
    precio = parsearMonto(m[1])
    resto = resto.slice(0, m.index).trim()
  }
  let cantidad: number | undefined, nombre: string | undefined
  const pegada = resto.match(reItemXPegada)
  const a = pegada ?? resto.match(reItem)
  if (a) { cantidad = Number(a[1].replace(',', '.')); nombre = a[2] }
  else {
    const b = resto.match(reItemXAlFinal)
    if (b) { cantidad = Number(b[2]); nombre = b[1] }
  }
  if (!cantidad || !nombre) return null
  nombre = nombre.replace(/\s{2,}/g, ' ').replace(/[.\s]+$/, '').trim()
  // tiene que tener letras de verdad (no un teléfono, una fecha o una dirección con número)
  if ((nombre.match(/[a-záéíóúñ]/gi) ?? []).length < 3) return null
  if (cantidad > 50) return null
  return { cantidad, nombre, precio, extras: [] }
}

// ---------------------------------------------------------------------
// Asociar con el menú
// ---------------------------------------------------------------------
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'a', 'al', 'en', 'pizza', 'pizzas', 'x', 'u', 'un', 'una'])

export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim()

const palabras = (s: string) => new Set(normalizar(s).split(' ').filter(w => w && !PALABRAS_VACIAS.has(w)))

function parecido(a: string, b: string) {
  const A = palabras(a), B = palabras(b)
  if (!A.size || !B.size) return 0
  let comun = 0
  for (const w of A) if (B.has(w)) comun++
  return comun / (A.size + B.size - comun)
}

const esMitad = (s: string) => /(^|\s)(1\/2|media|mitad)(\s|$)/i.test(normalizar(s))
const sinMitad = (s: string) => normalizar(s).replace(/(^|\s)(1\/2|media|mitad)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()

export interface ItemAsociado extends ItemTicket {
  producto?: Producto
  variante?: 'entera' | 'mitad'
  ignorar?: boolean
  /** cómo se reconoció */
  como?: 'asociado' | 'nombre' | 'parecido'
  sugerencias: Producto[]
}

export function asociarItems(items: ItemTicket[], productos: Producto[], mapeos: MapeoExterno[]): ItemAsociado[] {
  const porTexto = new Map(mapeos.map(m => [m.texto, m]))
  const vendibles = productos
  return items.map(it => {
    const clave = normalizar(it.nombre)
    const map = porTexto.get(clave)
    if (map) {
      if (map.ignorar) return { ...it, ignorar: true, como: 'asociado', sugerencias: [] }
      const p = productos.find(x => x.id === map.productoId)
      if (p) return { ...it, producto: p, variante: map.variante, como: 'asociado', sugerencias: [] }
    }
    const mitad = esMitad(it.nombre)
    const base = mitad ? sinMitad(it.nombre) : clave
    const exacto = vendibles.find(p => normalizar(p.nombre) === base)
    if (exacto) return { ...it, producto: exacto, variante: mitad ? 'mitad' : undefined, como: 'nombre', sugerencias: [] }
    const puntajes = vendibles.map(p => ({ p, s: parecido(base, p.nombre) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
    const [uno, dos] = puntajes
    if (uno && uno.s >= 0.75 && (!dos || uno.s - dos.s >= 0.15)) {
      return { ...it, producto: uno.p, variante: mitad ? 'mitad' : undefined, como: 'parecido', sugerencias: [] }
    }
    return { ...it, sugerencias: puntajes.slice(0, 4).map(x => x.p) }
  })
}

/** Productos que no se pudieron reconocer */
export const faltantes = (items: ItemAsociado[]) => items.filter(i => !i.producto && !i.ignorar)

/** Arma lo que se importa. El total queda igual al del ticket (la diferencia va a descuento/adicional). */
export function armarImportacion(t: TicketLeido, items: ItemAsociado[]): ImportacionPedido {
  const lineas = items.filter(i => !i.ignorar && i.producto).map(i => {
    const precioLinea = i.precio ?? (i.variante === 'mitad' ? i.producto!.precioMitad ?? i.producto!.precio / 2 : i.producto!.precio) * i.cantidad
    return {
      productoId: i.producto!.id,
      descripcion: i.producto!.nombre + (i.variante === 'mitad' ? ' (½)' : ''),
      variante: i.variante,
      cantidad: i.cantidad,
      precioUnit: Math.round((precioLinea / i.cantidad) * 100) / 100,
      nota: i.extras.length ? i.extras.join(', ').slice(0, 300) : undefined,
    }
  })
  const subtotal = lineas.reduce((s, l) => s + l.precioUnit * l.cantidad, 0)
  const envio = t.retiro ? 0 : t.envio ?? 0
  let descuento = t.descuento ?? 0
  let adicional = 0
  const total = t.total ?? Math.max(0, subtotal + envio - descuento)
  const diferencia = Math.round((total - (subtotal + envio - descuento)) * 100) / 100
  if (diferencia > 0) adicional = diferencia
  else if (diferencia < 0) descuento += -diferencia
  const online = t.pago !== 'efectivo'
  return {
    tipo: t.retiro ? 'mostrador' : 'delivery',
    clienteNombre: t.cliente, clienteTel: t.telefono, direccion: t.direccion,
    observaciones: [(t.origen === 'mercadopago' ? 'Mercado Pago' : 'PedidosYa') + (t.numero ? ` #${t.numero}` : ''), t.notas].filter(Boolean).join(' · '),
    numeroExterno: t.numero,
    subtotal, costoEnvio: envio, descuento, adicional, total,
    cobrada: online,
    items: lineas,
    pagos: [{ forma: online ? (t.origen === 'mercadopago' ? 'mercado_pago' : 'pedidosya') : 'efectivo', monto: total }],
  }
}

/** Interpreta un ticket completo; devuelve el error si no se puede importar */
export function interpretarPedido(texto: string, productos: Producto[], mapeos: MapeoExterno[]) {
  const ticket = parsearTicket(texto)
  const items = asociarItems(ticket.items, productos, mapeos)
  let error: string | undefined
  if (!ticket.items.length) error = 'No se encontraron productos en el ticket'
  else if (faltantes(items).length) error = `No se reconoce: ${faltantes(items).map(i => i.nombre).join(', ')}`
  return { ticket, items, error, importacion: error ? undefined : armarImportacion(ticket, items) }
}

/** Ticket de ejemplo (para probar y para el modo demo) */
export const TICKET_EJEMPLO = `PEDIDOS YA
Napoles Pizzeria
Pedido #48213
31/10/2026 21:05
Cliente: Lucía Fernández
Teléfono: 11 5555-1234
Dirección: Av. San Martín 1234, depto 3B
--------------------------------
2 x Grande Muzzarella      $24.000
   - Sin aceitunas
1 x Empanada de Carne       $3.000
1 x Coca-Cola 1.5L          $4.500
--------------------------------
Subtotal                   $31.500
Envío                       $1.500
Descuento                  -$3.150
TOTAL                      $29.850
Pagado online
Notas: tocar timbre 3B`
