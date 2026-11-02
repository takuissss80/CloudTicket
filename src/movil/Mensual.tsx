import { useCallback, useEffect, useMemo, useState } from 'react'
import { fecha, money } from '../lib/format'
import { rangoISO, reporteGastos, reporteVentas, type Periodo } from '../lib/reportes'
import { FORMAS_PAGO, type Caja, type Comanda, type MovimientoReporte } from '../types'
import { useRepo } from './cuentas'
import {
  Aviso, mayuscula, BarraSegmentada, BarrasHorizontales, BotonRecargar, Cargando, Cifra, ColumnasDia, Fila, SelectorLocal, Tarjeta,
  useLocalElegido, useSucursales,
} from './comunes'

const conSigno = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n))
const pad = (n: number) => String(n).padStart(2, '0')
const nombreMes = (y: number, m: number) => mayuscula(new Date(y, m, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))

export function periodoMes(y: number, m: number): Periodo {
  const ultimo = new Date(y, m + 1, 0).getDate()
  return { desde: `${y}-${pad(m + 1)}-01`, hasta: `${y}-${pad(m + 1)}-${pad(ultimo)}` }
}

interface Datos { comandas: Comanda[]; movs: MovimientoReporte[]; cajas: (Caja & { local: string })[] }

export function Mensual() {
  const repo = useRepo()
  const { lista, error: errLocales } = useSucursales()
  const local = useLocalElegido(lista, true)
  const hoy = new Date()
  const [mes, setMes] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() })
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [todasCajas, setTodasCajas] = useState(false)
  const idsKey = local.ids.join(',')
  const periodo = useMemo(() => {
    const p = periodoMes(mes.y, mes.m)
    // El mes en curso se corta en hoy (para no mostrar días futuros en cero)
    const h = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`
    return p.hasta > h && p.desde <= h ? { ...p, hasta: h } : p
  }, [mes.y, mes.m]) // eslint-disable-line react-hooks/exhaustive-deps
  const esActual = mes.y === hoy.getFullYear() && mes.m === hoy.getMonth()

  const cargar = useCallback(async () => {
    if (!lista || !idsKey) return
    const ids = idsKey.split(',')
    setCargando(true); setError('')
    try {
      const { desde, hasta } = rangoISO(periodo)
      const [comandas, movs, cajas] = await Promise.all([
        repo.reporteComandas(ids, desde, hasta),
        repo.reporteMovimientosCaja(ids, desde, hasta),
        Promise.all(ids.map(async id => (await repo.listCajas(id, 120))
          .filter(c => c.abiertaAt >= desde && c.abiertaAt < hasta)
          .map(c => ({ ...c, local: lista.find(s => s.id === id)?.nombre ?? '' })))),
      ])
      setDatos({ comandas, movs, cajas: cajas.flat().sort((a, b) => b.abiertaAt.localeCompare(a.abiertaAt)) })
    } catch (e) {
      setError((e as Error).message)
    } finally { setCargando(false) }
  }, [repo, lista, idsKey, periodo])

  useEffect(() => { setDatos(null); void cargar() }, [cargar])

  const r = useMemo(() => {
    if (!datos) return null
    const v = reporteVentas(datos.comandas, periodo)
    const g = reporteGastos(datos.movs)
    const suma = (t: string) => datos.movs.filter(m => m.tipo === t).reduce((s, m) => s + m.monto, 0)
    const gastos = suma('gasto'), sueldos = suma('sueldo'), retiros = suma('egreso'), ingresos = suma('ingreso')
    const validas = datos.comandas.filter(c => c.estado !== 'anulada')
    const grupo = (f: (c: Comanda) => boolean) => { const l = validas.filter(f); return { valor: l.length, monto: l.reduce((s, c) => s + c.total, 0) } }
    const cerradas = datos.cajas.filter(c => c.estado === 'cerrada' && c.diferencia != null)
    return {
      v, g, gastos, sueldos, retiros, ingresos,
      resultado: v.total - gastos - sueldos,
      origenes: [
        { key: 'mostrador', label: 'Mostrador', color: 'var(--g-mostrador)', ...grupo(c => c.tipo === 'mostrador' && c.canal !== 'pedidosya') },
        { key: 'delivery', label: 'Delivery propio', color: 'var(--g-delivery)', ...grupo(c => c.tipo === 'delivery' && c.canal !== 'pedidosya') },
        { key: 'pedidosya', label: 'PedidosYa', color: 'var(--g-pedidosya)', ...grupo(c => c.canal === 'pedidosya') },
      ],
      diferencias: cerradas.reduce((s, c) => s + (c.diferencia ?? 0), 0),
      porLocal: lista && local.valor === 'todos' ? lista.map(s => {
        const cajasLocal = new Set(datos.cajas.filter(c => c.local === s.nombre).map(c => c.id))
        const l = validas.filter(c => cajasLocal.has(c.cajaId))
        return { label: s.nombre, valor: l.reduce((a, c) => a + c.total, 0), detalle: `${l.length} com.` }
      }).sort((a, b) => b.valor - a.valor) : [],
    }
  }, [datos, periodo, lista, local.valor])

  const mover = (d: number) => setMes(x => { const n = new Date(x.y, x.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() } })

  if (errLocales) return <Aviso>{errLocales}</Aviso>
  if (!lista) return <Cargando />

  return (
    <div className="space-y-3">
      <SelectorLocal lista={lista} valor={local.valor} onChange={local.elegir} permitirTodos />

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior" className="grid size-11 place-items-center rounded-xl border border-linea bg-superficie">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <div className="flex h-11 flex-1 items-center justify-center rounded-xl border border-linea bg-superficie font-semibold text-tinta">
          {nombreMes(mes.y, mes.m)}
        </div>
        <button type="button" onClick={() => mover(1)} disabled={esActual} aria-label="Mes siguiente" className="grid size-11 place-items-center rounded-xl border border-linea bg-superficie disabled:opacity-35">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <BotonRecargar onClick={() => void cargar()} cargando={cargando} />
      </div>

      {error && <Aviso>{error}</Aviso>}
      {!r ? <Cargando /> : (
        <>
          <Tarjeta titulo={esActual ? 'Ventas del mes (hasta hoy)' : 'Ventas del mes'}>
            <div className="text-center">
              <div className="num font-cond text-[40px] font-bold leading-none text-albahaca">{money(r.v.total)}</div>
              {r.v.sinCobrar > 0 && <div className="num mt-1.5 text-[14px] text-gris">Incluye {money(r.v.sinCobrar)} sin cobrar ({r.v.cantSinCobrar})</div>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Cifra valor={r.v.cantidad} label="Comandas" detalle={r.v.anuladas ? `${r.v.anuladas} anuladas` : undefined} />
              <Cifra valor={money(Math.round(r.v.ticketPromedio))} label="Ticket promedio" />
              <Cifra valor={money(r.v.descuentos)} label="Descuentos" />
              <Cifra valor={money(r.v.envios)} label="Envíos cobrados" />
            </div>
          </Tarjeta>

          <Tarjeta titulo="Ventas por día">
            <ColumnasDia dias={r.v.porDia} />
          </Tarjeta>

          <Tarjeta titulo="Resultado del mes">
            <Fila label="Ventas" valor={money(r.v.total)} />
            <Fila label="Gastos" valor={`− ${money(r.gastos)}`} />
            <Fila label="Sueldos" valor={`− ${money(r.sueldos)}`} />
            <Fila fuerte label="Resultado" valor={money(r.resultado)} tono={r.resultado >= 0 ? 'ok' : 'mal'} />
            <div className="mt-3 rounded-xl bg-papel px-3 py-1.5">
              <Fila sub label="Retiros de efectivo" valor={money(r.retiros)} />
              <Fila sub label="Ingresos de efectivo" valor={money(r.ingresos)} />
              <Fila sub label={`Diferencias de caja (${datos!.cajas.filter(c => c.diferencia != null).length} cajas)`}
                valor={conSigno(r.diferencias)} tono={r.diferencias < 0 ? 'mal' : r.diferencias > 0 ? 'ok' : undefined} />
            </div>
            <p className="mt-2 text-[12px] text-gris">Los retiros no se restan: es plata que sale de la caja, no un gasto.</p>
          </Tarjeta>

          {r.porLocal.length > 0 && (
            <Tarjeta titulo="Por local"><BarrasHorizontales filas={r.porLocal} /></Tarjeta>
          )}

          <Tarjeta titulo="Tipo de pedidos">
            <BarraSegmentada segmentos={r.origenes.map(o => ({ ...o, detalle: money(o.monto) }))} />
          </Tarjeta>

          <Tarjeta titulo="Cobrado por forma de pago">
            <BarrasHorizontales filas={r.v.porForma.map(([k, v]) => ({ label: FORMAS_PAGO.find(f => f.key === k)?.label ?? k, valor: v }))} />
          </Tarjeta>

          <Tarjeta titulo="Gastos por tipo">
            <BarrasHorizontales filas={r.g.porTipo.map(([k, v]) => ({ label: k, valor: v }))} />
          </Tarjeta>

          <Tarjeta titulo={`Cajas del mes (${datos!.cajas.length})`}>
            {datos!.cajas.length === 0 ? <p className="py-3 text-center text-[14px] text-gris">No hubo cajas</p> : (
              <>
              <p className="mb-1 text-[13px] text-gris">
                {(() => {
                  const f = datos!.cajas.filter(c => (c.diferencia ?? 0) < 0).length, so = datos!.cajas.filter(c => (c.diferencia ?? 0) > 0).length
                  return `${f} con faltante · ${so} con sobrante · ${datos!.cajas.length - f - so} justas o abiertas`
                })()}
              </p>
              <ul className="divide-y divide-linea">
                {datos!.cajas.filter(c => todasCajas || c.estado === 'abierta' || (c.diferencia ?? 0) !== 0).map(c => {
                  const d = c.diferencia
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-tinta">{fecha(c.abiertaAt)} · {c.turno}</div>
                        <div className="truncate text-[13px] text-gris">
                          {local.valor === 'todos' ? `${c.local} · ` : ''}{c.estado === 'abierta' ? 'Abierta' : `Ventas ${money(c.totales?.totalVentas ?? 0)}`}
                        </div>
                      </div>
                      {c.estado === 'abierta' ? (
                        <span className="rounded-full bg-albahaca-claro px-2.5 py-1 text-[12px] font-bold text-tinta">ABIERTA</span>
                      ) : d == null ? <span className="text-[13px] text-gris">—</span> : (
                        <div className="text-right">
                          <div className={`num text-[15px] font-bold ${d < 0 ? 'text-tomate' : d > 0 ? 'text-albahaca' : 'text-tinta'}`}>{conSigno(d)}</div>
                          <div className="text-[12px] text-gris">{d < 0 ? 'faltó' : d > 0 ? 'sobró' : 'justa'}</div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              <button type="button" onClick={() => setTodasCajas(v => !v)} className="mt-2 h-10 w-full rounded-xl border border-linea text-[14px] font-semibold text-tinta">
                {todasCajas ? 'Ver solo las que tuvieron diferencia' : `Ver las ${datos!.cajas.length} cajas`}
              </button>
              </>
            )}
          </Tarjeta>
        </>
      )}
    </div>
  )
}
