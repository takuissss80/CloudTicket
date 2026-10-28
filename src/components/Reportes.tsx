import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Comanda, Ingrediente, IngresoMercaderia, MovimientoReporte, Producto, Categoria, StockItem, StockMovimiento } from '../types'
import { FORMAS_PAGO } from '../types'
import { repo } from '../data'
import { mensajeError, useApp } from '../store/app'
import { fecha, hora, money } from '../lib/format'
import { factorCompra, formatCantidad, unidadCompra, valorStock } from '../lib/stock'
import {
  PERIODOS_RAPIDOS, descargarCSV, isoDia, rangoISO, reporteConsumo, reporteDinero, reporteGastos,
  reporteIngresosMercaderia, reporteProductos, reporteVentas, resumenMovimientosStock, type Periodo,
} from '../lib/reportes'
import { Btn, inputBase } from './ui'

type Tab = 'ventas' | 'productos' | 'gastos' | 'dinero' | 'mercaderia' | 'stock'

const TABS: { key: Tab; label: string }[] = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'productos', label: 'Venta de mercadería' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'dinero', label: 'Ingresos y egresos de dinero' },
  { key: 'mercaderia', label: 'Ingreso de mercadería' },
  { key: 'stock', label: 'Stock' },
]

interface Datos {
  comandas?: Comanda[]
  movCaja?: MovimientoReporte[]
  ingresos?: IngresoMercaderia[]
  movStock?: StockMovimiento[]
  stock?: Map<string, StockItem[]>
  productos?: Producto[]
  categorias?: Categoria[]
  ingredientes?: Ingrediente[]
}

const fmtDia = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y.slice(2)}` }
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const diaSemana = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return DIAS[new Date(y, m - 1, dd).getDay()] }

export function Reportes({ onClose }: { onClose: () => void }) {
  const { sesion, sucursales, sucursalId } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  const [tab, setTab] = useState<Tab>('ventas')
  const [local, setLocal] = useState<string>(esAdmin ? 'todos' : sesion?.sucursalId ?? sucursalId ?? '')
  const hoy = useMemo(() => new Date(), [])
  const [periodo, setPeriodo] = useState<Periodo>(PERIODOS_RAPIDOS[3].calc(hoy))
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  const locales = useMemo(() => (local === 'todos' ? sucursales.map(s => s.id) : [local]).filter(Boolean), [local, sucursales])
  const nombreLocal = (id: string) => sucursales.find(s => s.id === id)?.nombre ?? ''
  const variosLocales = locales.length > 1

  useEffect(() => {
    let vivo = true
    setDatos(null); setError('')
    const { desde, hasta } = rangoISO(periodo)
    const cargar = async (): Promise<Datos> => {
      switch (tab) {
        case 'ventas': return { comandas: await repo.reporteComandas(locales, desde, hasta) }
        case 'productos': {
          const [comandas, movStock, menu] = await Promise.all([
            repo.reporteComandas(locales, desde, hasta), repo.reporteStockMovimientos(locales, desde, hasta, ['venta']),
            repo.getMenu(locales.length === 1 ? locales[0] : null),
          ])
          return { comandas, movStock, productos: menu.productos, categorias: menu.categorias, ingredientes: menu.ingredientes }
        }
        case 'gastos':
        case 'dinero': return { movCaja: await repo.reporteMovimientosCaja(locales, desde, hasta) }
        case 'mercaderia': {
          const [ingresos, menu] = await Promise.all([repo.reporteIngresos(locales, desde, hasta), repo.getMenu(null)])
          return { ingresos, ingredientes: menu.ingredientes }
        }
        case 'stock': {
          const [movStock, menu, ...stocks] = await Promise.all([
            repo.reporteStockMovimientos(locales, desde, hasta), repo.getMenu(null), ...locales.map(l => repo.getStock(l)),
          ])
          return { movStock, ingredientes: menu.ingredientes, stock: new Map(locales.map((l, i) => [l, stocks[i]])) }
        }
      }
    }
    if (!locales.length) return
    cargar().then(d => { if (vivo) setDatos(d) }).catch(e => { if (vivo) setError(mensajeError(e)) })
    return () => { vivo = false }
  }, [tab, locales, periodo])

  const titulo = `${TABS.find(t => t.key === tab)?.label} ${local === 'todos' ? 'todos los locales' : nombreLocal(local)} ${periodo.desde} a ${periodo.hasta}`
  const archivo = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-tinta px-4 py-3 text-white">
        <button onClick={onClose} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>
        <h1 className="font-cond text-3xl font-bold leading-none">Reportes</h1>
        <nav className="flex flex-wrap gap-1 rounded-lg bg-white/10 p-1 lg:ml-auto" aria-label="Reportes">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key}
              className={`h-9 rounded-md px-3 text-[15px] font-semibold ${tab === t.key ? 'bg-white text-tinta' : 'text-white/85 hover:text-white'}`}>{t.label}</button>
          ))}
        </nav>
      </header>

      <div className="border-b border-linea bg-papel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          {esAdmin && sucursales.length > 0 ? (
            <select aria-label="Local" value={local} onChange={e => setLocal(e.target.value)} className={`${inputBase} h-10 w-52`}>
              {sucursales.length > 1 && <option value="todos">Todos los locales</option>}
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          ) : <span className="font-cond text-xl font-bold">{nombreLocal(local)}</span>}
          {(
            <>
              <div className="flex flex-wrap gap-1">
                {PERIODOS_RAPIDOS.map(p => {
                  const v = p.calc(hoy)
                  const activo = v.desde === periodo.desde && v.hasta === periodo.hasta
                  return (
                    <button key={p.key} onClick={() => setPeriodo(v)} aria-pressed={activo}
                      className={`h-10 rounded-lg px-3 text-[15px] font-semibold ${activo ? 'bg-tinta text-white' : 'bg-white ring-1 ring-linea hover:bg-harina'}`}>{p.label}</button>
                  )
                })}
              </div>
              <label className="flex items-center gap-1 text-[15px] text-gris">
                Desde <input type="date" aria-label="Desde" value={periodo.desde} max={periodo.hasta} onChange={e => e.target.value && setPeriodo({ ...periodo, desde: e.target.value })} className={`${inputBase} h-10 px-2`} />
              </label>
              <label className="flex items-center gap-1 text-[15px] text-gris">
                hasta <input type="date" aria-label="Hasta" value={periodo.hasta} min={periodo.desde} max={isoDia(hoy)} onChange={e => e.target.value && setPeriodo({ ...periodo, hasta: e.target.value })} className={`${inputBase} h-10 px-2`} />
              </label>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4">
          {error ? <p className="rounded-xl bg-tomate-claro p-4 text-tomate">{error}</p>
            : !datos ? <p className="p-8 text-center text-gris">Cargando…</p>
            : tab === 'ventas' ? <RepVentas d={datos} periodo={periodo} archivo={archivo} />
            : tab === 'productos' ? <RepProductos d={datos} archivo={archivo} />
            : tab === 'gastos' ? <RepGastos d={datos} archivo={archivo} nombreLocal={nombreLocal} varios={variosLocales} />
            : tab === 'dinero' ? <RepDinero d={datos} archivo={archivo} nombreLocal={nombreLocal} varios={variosLocales} />
            : tab === 'mercaderia' ? <RepMercaderia d={datos} archivo={archivo} nombreLocal={nombreLocal} varios={variosLocales} />
            : <RepStock d={datos} archivo={archivo} locales={locales} nombreLocal={nombreLocal} />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------
function Tarjeta({ label, valor, detalle, tono }: { label: string; valor: ReactNode; detalle?: ReactNode; tono?: 'bien' | 'mal' }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-linea">
      <div className="text-sm text-gris">{label}</div>
      <div className={`font-cond text-3xl font-bold tabular-nums ${tono === 'mal' ? 'text-tomate' : tono === 'bien' ? 'text-albahaca' : ''}`}>{valor}</div>
      {detalle && <div className="text-sm text-gris">{detalle}</div>}
    </div>
  )
}

function Seccion({ titulo, children, csv }: { titulo: string; children: ReactNode; csv?: () => void }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 className="font-cond text-2xl font-bold">{titulo}</h2>
        {csv && <Btn tono="fantasma" className="ml-auto" onClick={csv}>Descargar Excel (CSV)</Btn>}
      </div>
      {children}
    </section>
  )
}

function Tabla({ cabecera, children, ancho = 'min-w-[640px]' }: { cabecera: (string | [string, 'right'])[]; children: ReactNode; ancho?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-linea">
      <table className={`w-full ${ancho} text-left text-[15px]`}>
        <thead className="border-b border-linea text-sm text-gris">
          <tr>{cabecera.map((c, i) => Array.isArray(c)
            ? <th key={i} className="px-3 py-2 text-right font-medium">{c[0]}</th>
            : <th key={i} className="px-3 py-2 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-linea">{children}</tbody>
      </table>
    </div>
  )
}

const Vacio = ({ children }: { children: ReactNode }) => <p className="rounded-xl bg-white p-8 text-center text-gris ring-1 ring-linea">{children}</p>

function Barra({ valor, max, tono = 'bg-pizarra' }: { valor: number; max: number; tono?: string }) {
  return (
    <div className="h-2.5 w-full min-w-16 rounded-full bg-harina">
      <div className={`h-2.5 rounded-full ${tono}`} style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0}%` }} />
    </div>
  )
}

const td = 'px-3 py-2'
const tdr = 'px-3 py-2 text-right tabular-nums'
const labelForma = (k: string) => FORMAS_PAGO.find(f => f.key === k)?.label ?? k
const fechaHora = (iso: string) => `${fecha(iso)} ${hora(iso)}`

// ---------------------------------------------------------------------
// Ventas en dinero
// ---------------------------------------------------------------------
function RepVentas({ d, periodo, archivo }: { d: Datos; periodo: Periodo; archivo: string }) {
  const r = reporteVentas(d.comandas ?? [], periodo)
  const max = Math.max(0, ...r.porDia.map(x => x.total))
  if (!r.cantidad && !r.anuladas) return <Vacio>No hay ventas en este período.</Vacio>
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta label="Ventas" valor={money(r.total)} detalle={`${r.cantidad} ${r.cantidad === 1 ? 'comanda' : 'comandas'}${r.anuladas ? `, ${r.anuladas} ${r.anuladas === 1 ? 'anulada' : 'anuladas'}` : ''}`} />
        <Tarjeta label="Ticket promedio" valor={money(r.ticketPromedio)} />
        <Tarjeta label="Mostrador / Delivery" valor={<span className="text-2xl">{money(r.mostrador)} / {money(r.delivery)}</span>} detalle={`Envíos cobrados ${money(r.envios)}`} />
        <Tarjeta label="Sin cobrar" valor={money(r.sinCobrar)} tono={r.sinCobrar ? 'mal' : undefined} detalle={r.cantSinCobrar ? `${r.cantSinCobrar} comandas` : 'Todo cobrado'} />
      </div>

      <Seccion titulo="Por forma de pago">
        {r.porForma.length ? (
          <Tabla cabecera={['Forma de pago', ['Cobrado', 'right'], '']} ancho="min-w-[420px]">
            {r.porForma.map(([k, v]) => (
              <tr key={k}><td className={td}>{labelForma(k)}</td><td className={tdr}>{money(v)}</td><td className="w-1/2 px-3"><Barra valor={v} max={r.porForma[0][1]} tono="bg-albahaca" /></td></tr>
            ))}
          </Tabla>
        ) : <Vacio>No hay comandas cobradas.</Vacio>}
      </Seccion>

      <Seccion titulo="Por día" csv={() => descargarCSV(archivo, [
        ['Día', 'Comandas', 'Mostrador', 'Delivery', 'Total'],
        ...r.porDia.map(x => [fmtDia(x.dia), x.comandas, x.mostrador, x.delivery, x.total]),
        ['Total', r.cantidad, r.mostrador, r.delivery, r.total],
      ])}>
        <Tabla cabecera={['Día', ['Comandas', 'right'], ['Mostrador', 'right'], ['Delivery', 'right'], ['Total', 'right'], '']}>
          {r.porDia.map(x => (
            <tr key={x.dia} className={x.comandas ? '' : 'text-gris'}>
              <td className={td}><span className="inline-block w-9 text-gris">{diaSemana(x.dia)}</span>{fmtDia(x.dia)}</td>
              <td className={tdr}>{x.comandas}</td>
              <td className={tdr}>{money(x.mostrador)}</td>
              <td className={tdr}>{money(x.delivery)}</td>
              <td className={`${tdr} font-semibold`}>{money(x.total)}</td>
              <td className="w-1/4 px-3"><Barra valor={x.total} max={max} /></td>
            </tr>
          ))}
          <tr className="bg-harina font-semibold">
            <td className={td}>Total</td><td className={tdr}>{r.cantidad}</td><td className={tdr}>{money(r.mostrador)}</td>
            <td className={tdr}>{money(r.delivery)}</td><td className={tdr}>{money(r.total)}</td><td />
          </tr>
        </Tabla>
      </Seccion>
    </div>
  )
}

// ---------------------------------------------------------------------
// Venta de mercadería
// ---------------------------------------------------------------------
function RepProductos({ d, archivo }: { d: Datos; archivo: string }) {
  const nombreCat = (id: string) => d.categorias?.find(c => c.id === id)?.nombre ?? ''
  const filas = reporteProductos(d.comandas ?? [], d.productos ?? [], nombreCat)
  const consumo = reporteConsumo(d.movStock ?? [], d.ingredientes ?? [])
  const costoTotal = consumo.reduce((s, x) => s + x.costo, 0)
  const ventas = (d.comandas ?? []).filter(c => c.estado !== 'anulada').reduce((s, c) => s + c.total, 0)
  if (!filas.length) return <Vacio>No hay ventas en este período.</Vacio>
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta label="Unidades vendidas" valor={filas.reduce((s, f) => s + f.sueltas, 0).toLocaleString('es-AR')} detalle="Sin contar lo que va dentro de las promos" />
        <Tarjeta label="Costo de la mercadería vendida" valor={money(costoTotal)} detalle={consumo.length ? 'Según recetas y costos actuales' : 'Sin recetas cargadas'} />
        <Tarjeta label="Margen bruto" valor={ventas && costoTotal ? `${Math.round(((ventas - costoTotal) / ventas) * 100)}%` : '—'} detalle={`Sobre ventas de ${money(ventas)}`} />
      </div>

      <Seccion titulo="Productos vendidos" csv={() => descargarCSV(archivo, [
        ['Producto', 'Categoría', 'Vendidos', 'En promos', 'Total unidades', 'Importe'],
        ...filas.map(f => [f.nombre, f.categoria, f.sueltas, f.enPromos, f.sueltas + f.enPromos, f.importe]),
      ])}>
        <Tabla cabecera={['Producto', 'Categoría', ['Vendidos', 'right'], ['En promos', 'right'], ['Total', 'right'], ['Importe', 'right']]}>
          {filas.map(f => (
            <tr key={f.clave}>
              <td className={`${td} font-semibold`}>{f.nombre}</td>
              <td className={`${td} text-sm text-gris`}>{f.categoria}</td>
              <td className={tdr}>{f.sueltas || ''}</td>
              <td className={`${tdr} text-gris`}>{f.enPromos || ''}</td>
              <td className={`${tdr} font-semibold`}>{f.sueltas + f.enPromos}</td>
              <td className={tdr}>{f.importe ? money(f.importe) : ''}</td>
            </tr>
          ))}
        </Tabla>
        <p className="text-sm text-gris">"En promos" son las unidades que salieron dentro de una promo (por ejemplo, las empanadas de la Promo 4). Su importe está en la fila de la promo.</p>
      </Seccion>

      {consumo.length > 0 && (
        <Seccion titulo="Ingredientes consumidos" csv={() => descargarCSV(`${archivo}-ingredientes`, [
          ['Ingrediente', 'Cantidad', 'Unidad', 'Costo'],
          ...consumo.map(x => [x.ingrediente!.nombre, x.cantidad / factorCompra(x.ingrediente!.unidad), unidadCompra(x.ingrediente!.unidad), x.costo]),
        ])}>
          <Tabla cabecera={['Ingrediente', ['Cantidad', 'right'], ['Costo', 'right']]} ancho="min-w-[420px]">
            {consumo.map(x => (
              <tr key={x.ingrediente!.id}><td className={td}>{x.ingrediente!.nombre}</td><td className={tdr}>{formatCantidad(x.cantidad, x.ingrediente!.unidad)}</td><td className={tdr}>{money(x.costo)}</td></tr>
            ))}
          </Tabla>
        </Seccion>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------
function RepGastos({ d, archivo, nombreLocal, varios }: { d: Datos; archivo: string; nombreLocal: (id: string) => string; varios: boolean }) {
  const r = reporteGastos(d.movCaja ?? [])
  if (!r.detalle.length) return <Vacio>No hay gastos ni sueldos cargados en este período.</Vacio>
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta label="Total de gastos" valor={money(r.total)} detalle={`${r.detalle.length} movimientos`} />
        <Tarjeta label="Mayor gasto" valor={<span className="text-2xl">{r.porTipo[0][0]}</span>} detalle={money(r.porTipo[0][1])} />
      </div>
      <Seccion titulo="Por tipo de gasto">
        <Tabla cabecera={['Tipo', ['Total', 'right'], ['%', 'right'], '']} ancho="min-w-[480px]">
          {r.porTipo.map(([k, v]) => (
            <tr key={k}><td className={`${td} font-semibold`}>{k}</td><td className={tdr}>{money(v)}</td><td className={`${tdr} text-gris`}>{Math.round((v / r.total) * 100)}%</td>
              <td className="w-1/3 px-3"><Barra valor={v} max={r.porTipo[0][1]} tono="bg-tomate" /></td></tr>
          ))}
        </Tabla>
      </Seccion>
      <Seccion titulo="Detalle" csv={() => descargarCSV(archivo, [
        ['Fecha', 'Hora', ...(varios ? ['Local'] : []), 'Turno', 'Tipo', 'Concepto', 'Usuario', 'Monto'],
        ...r.detalle.map(m => [fecha(m.createdAt), hora(m.createdAt), ...(varios ? [nombreLocal(m.sucursalId)] : []), m.cajaTurno,
          m.tipo === 'sueldo' ? 'Sueldo' : m.tipoGastoNombre ?? 'Sin tipo', m.concepto, m.creadoPor ?? '', m.monto]),
      ])}>
        <Tabla cabecera={['Fecha', ...(varios ? ['Local'] : []), 'Tipo', 'Concepto', 'Usuario', ['Monto', 'right']]}>
          {r.detalle.map(m => (
            <tr key={m.id}>
              <td className={`${td} whitespace-nowrap text-sm`}>{fechaHora(m.createdAt)} <span className="text-gris">({m.cajaTurno.toLowerCase()})</span></td>
              {varios && <td className={`${td} text-sm`}>{nombreLocal(m.sucursalId)}</td>}
              <td className={td}>{m.tipo === 'sueldo' ? 'Sueldo' : m.tipoGastoNombre ?? 'Sin tipo'}</td>
              <td className={td}>{m.concepto}</td>
              <td className={`${td} text-sm text-gris`}>{m.creadoPor}</td>
              <td className={`${tdr} font-semibold`}>{money(m.monto)}</td>
            </tr>
          ))}
        </Tabla>
      </Seccion>
    </div>
  )
}

// ---------------------------------------------------------------------
// Ingresos y egresos de dinero
// ---------------------------------------------------------------------
function RepDinero({ d, archivo, nombreLocal, varios }: { d: Datos; archivo: string; nombreLocal: (id: string) => string; varios: boolean }) {
  const r = reporteDinero(d.movCaja ?? [])
  if (!r.detalle.length) return <Vacio>No hay ingresos ni retiros de dinero en este período.</Vacio>
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta label="Ingresos" valor={money(r.ingresos)} tono="bien" detalle="Efectivo que entró a la caja sin ser venta" />
        <Tarjeta label="Egresos (retiros)" valor={money(r.egresos)} tono="mal" detalle="Efectivo que se sacó de la caja" />
        <Tarjeta label="Neto" valor={money(r.neto)} />
      </div>
      <Seccion titulo="Detalle" csv={() => descargarCSV(archivo, [
        ['Fecha', 'Hora', ...(varios ? ['Local'] : []), 'Turno', 'Tipo', 'Concepto', 'Usuario', 'Monto'],
        ...r.detalle.map(m => [fecha(m.createdAt), hora(m.createdAt), ...(varios ? [nombreLocal(m.sucursalId)] : []), m.cajaTurno,
          m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso', m.concepto, m.creadoPor ?? '', m.tipo === 'ingreso' ? m.monto : -m.monto]),
      ])}>
        <Tabla cabecera={['Fecha', ...(varios ? ['Local'] : []), 'Tipo', 'Concepto', 'Usuario', ['Monto', 'right']]}>
          {r.detalle.map(m => (
            <tr key={m.id}>
              <td className={`${td} whitespace-nowrap text-sm`}>{fechaHora(m.createdAt)} <span className="text-gris">({m.cajaTurno.toLowerCase()})</span></td>
              {varios && <td className={`${td} text-sm`}>{nombreLocal(m.sucursalId)}</td>}
              <td className={td}><span className={`rounded px-2 py-0.5 text-xs font-bold ${m.tipo === 'ingreso' ? 'bg-albahaca-claro text-albahaca' : 'bg-tomate-claro text-tomate'}`}>{m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</span></td>
              <td className={td}>{m.concepto}</td>
              <td className={`${td} text-sm text-gris`}>{m.creadoPor}</td>
              <td className={`${tdr} font-semibold ${m.tipo === 'ingreso' ? 'text-albahaca' : 'text-tomate'}`}>{m.tipo === 'ingreso' ? '' : '−'}{money(m.monto)}</td>
            </tr>
          ))}
        </Tabla>
      </Seccion>
    </div>
  )
}

// ---------------------------------------------------------------------
// Ingreso de mercadería
// ---------------------------------------------------------------------
function RepMercaderia({ d, archivo, nombreLocal, varios }: { d: Datos; archivo: string; nombreLocal: (id: string) => string; varios: boolean }) {
  const ingresos = [...(d.ingresos ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const ings = d.ingredientes ?? []
  const r = reporteIngresosMercaderia(ingresos, ings)
  const [abierto, setAbierto] = useState<string | null>(null)
  if (!ingresos.length) return <Vacio>No hay ingresos de mercadería en este período. Se cargan en Administración → Stock → Ingresar mercadería.</Vacio>
  const nombreIng = (id: string) => ings.find(i => i.id === id)
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta label="Total comprado" valor={money(r.total)} detalle={`${ingresos.length} ingresos`} />
        <Tarjeta label="Pagado con la caja" valor={money(ingresos.filter(i => i.pagadoConCaja).reduce((s, i) => s + i.total, 0))} />
      </div>
      <Seccion titulo="Ingresos" csv={() => descargarCSV(archivo, [
        ['Fecha', 'Hora', ...(varios ? ['Local'] : []), 'Proveedor', 'Comprobante', 'Ingrediente', 'Cantidad', 'Unidad', 'Costo', 'Usuario'],
        ...ingresos.flatMap(i => i.items.map(it => {
          const ing = nombreIng(it.ingredienteId)
          return [fecha(i.createdAt), hora(i.createdAt), ...(varios ? [nombreLocal(i.sucursalId)] : []), i.proveedor ?? '', i.comprobante ?? '',
            ing?.nombre ?? '', ing ? it.cantidad / factorCompra(ing.unidad) : it.cantidad, ing ? unidadCompra(ing.unidad) : '', it.costo, i.creadoPor ?? '']
        })),
      ])}>
        <Tabla cabecera={['Fecha', ...(varios ? ['Local'] : []), 'Proveedor', 'Comprobante', ['Ítems', 'right'], ['Total', 'right'], '']}>
          {ingresos.map(i => (
            <Fragment key={i.id}>
              <tr onClick={() => setAbierto(abierto === i.id ? null : i.id)} className="cursor-pointer hover:bg-harina">
                <td className={`${td} whitespace-nowrap text-sm`}>{fechaHora(i.createdAt)}</td>
                {varios && <td className={`${td} text-sm`}>{nombreLocal(i.sucursalId)}</td>}
                <td className={`${td} font-semibold`}>{i.proveedor ?? '—'}</td>
                <td className={td}>{i.comprobante ?? ''}</td>
                <td className={tdr}>{i.items.length}</td>
                <td className={`${tdr} font-semibold`}>{money(i.total)}</td>
                <td className={`${td} text-sm text-gris`}>{i.pagadoConCaja ? 'Pagado con caja' : ''} {abierto === i.id ? '▲' : '▼'}</td>
              </tr>
              {abierto === i.id && (
                <tr className="bg-harina/60">
                  <td colSpan={varios ? 7 : 6} className="px-6 py-2">
                    <ul className="space-y-1 text-[15px]">
                      {i.items.map((it, k) => {
                        const ing = nombreIng(it.ingredienteId)
                        return <li key={k} className="flex justify-between gap-4"><span>{ing?.nombre}: {ing ? formatCantidad(it.cantidad, ing.unidad) : it.cantidad}</span><span className="tabular-nums">{money(it.costo)}</span></li>
                      })}
                      {i.observaciones && <li className="text-gris">Obs: {i.observaciones}</li>}
                      {i.creadoPor && <li className="text-sm text-gris">Cargado por {i.creadoPor}</li>}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </Tabla>
      </Seccion>
      <Seccion titulo="Por ingrediente">
        <Tabla cabecera={['Ingrediente', ['Cantidad', 'right'], ['Gastado', 'right'], ['Precio promedio', 'right']]} ancho="min-w-[520px]">
          {r.porIngrediente.map(x => (
            <tr key={x.ingrediente!.id}>
              <td className={`${td} font-semibold`}>{x.ingrediente!.nombre}</td>
              <td className={tdr}>{formatCantidad(x.cantidad, x.ingrediente!.unidad)}</td>
              <td className={tdr}>{money(x.costo)}</td>
              <td className={`${tdr} text-gris`}>{x.promedio ? `${money(x.promedio)} / ${unidadCompra(x.ingrediente!.unidad)}` : ''}</td>
            </tr>
          ))}
        </Tabla>
      </Seccion>
    </div>
  )
}

// ---------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------
function RepStock({ d, archivo, locales, nombreLocal }: { d: Datos; archivo: string; locales: string[]; nombreLocal: (id: string) => string }) {
  const ings = (d.ingredientes ?? []).filter(i => i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre))
  const movs = resumenMovimientosStock(d.movStock ?? [])
  const stockDe = (local: string, ing: string) => d.stock?.get(local)?.find(s => s.ingredienteId === ing)
  const filas = ings.map(i => {
    const porLocal = locales.map(l => stockDe(l, i.id)?.cantidad ?? 0)
    const total = porLocal.reduce((s, x) => s + x, 0)
    const minimo = locales.reduce((s, l) => s + (stockDe(l, i.id)?.minimo ?? 0), 0)
    return { i, porLocal, total, minimo, bajo: total < 0 || (minimo > 0 && total <= minimo), valor: valorStock(total, i), m: movs.get(i.id) }
  })
  if (!ings.length) return <Vacio>No hay ingredientes cargados.</Vacio>
  const valor = filas.reduce((s, f) => s + f.valor, 0)
  const varios = locales.length > 1
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta label="Valor del stock" valor={money(valor)} detalle="Con los costos actuales" />
        <Tarjeta label="Bajo el mínimo o en negativo" valor={filas.filter(f => f.bajo).length} tono={filas.some(f => f.bajo) ? 'mal' : undefined} />
      </div>
      <Seccion titulo="Stock actual y movimientos del período" csv={() => descargarCSV(archivo, [
        ['Ingrediente', 'Unidad', ...(varios ? locales.map(nombreLocal) : []), 'Stock', 'Mínimo', 'Ingresó', 'Vendido', 'Ajustes', 'Decomisos', 'Valor'],
        ...filas.map(f => {
          const fc = factorCompra(f.i.unidad)
          return [f.i.nombre, unidadCompra(f.i.unidad), ...(varios ? f.porLocal.map(x => x / fc) : []), f.total / fc, f.minimo / fc,
            (f.m?.ingreso ?? 0) / fc, -(f.m?.venta ?? 0) / fc, (f.m?.ajuste ?? 0) / fc, -(f.m?.decomiso ?? 0) / fc, f.valor]
        }),
      ])}>
        <Tabla cabecera={['Ingrediente', ...(varios ? locales.map(l => [nombreLocal(l), 'right'] as [string, 'right']) : []), ['Stock', 'right'], ['Ingresó', 'right'], ['Vendido', 'right'], ['Ajustes y decomisos', 'right'], ['Valor', 'right']]}
          ancho={varios ? 'min-w-[960px]' : 'min-w-[720px]'}>
          {filas.map(f => {
            const aj = (f.m?.ajuste ?? 0) + (f.m?.decomiso ?? 0)
            return (
              <tr key={f.i.id} className={f.bajo ? 'bg-tomate-claro/40' : ''}>
                <td className={`${td} font-semibold`}>{f.i.nombre}</td>
                {varios && f.porLocal.map((x, k) => <td key={k} className={`${tdr} text-gris`}>{formatCantidad(x, f.i.unidad)}</td>)}
                <td className={`${tdr} font-semibold ${f.bajo ? 'text-tomate' : ''}`}>{formatCantidad(f.total, f.i.unidad)}</td>
                <td className={`${tdr} text-albahaca`}>{f.m?.ingreso ? `+${formatCantidad(f.m.ingreso, f.i.unidad)}` : ''}</td>
                <td className={tdr}>{f.m?.venta ? formatCantidad(-f.m.venta, f.i.unidad) : ''}</td>
                <td className={`${tdr} ${aj < 0 ? 'text-tomate' : ''}`}>{aj ? `${aj > 0 ? '+' : ''}${formatCantidad(aj, f.i.unidad)}` : ''}</td>
                <td className={`${tdr} text-gris`}>{money(f.valor)}</td>
              </tr>
            )
          })}
        </Tabla>
        <p className="text-sm text-gris">El stock es el actual. Ingresó, vendido y ajustes corresponden al período elegido.</p>
      </Seccion>
    </div>
  )
}

