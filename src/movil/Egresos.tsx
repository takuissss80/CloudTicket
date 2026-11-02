import { useCallback, useEffect, useMemo, useState } from 'react'
import { hora, money } from '../lib/format'
import { diaDe, isoDia, PERIODOS_RAPIDOS, rangoISO, type Periodo } from '../lib/reportes'
import type { MovimientoReporte, TipoMovimiento } from '../types'
import { useRepo } from './cuentas'
import {
  Aviso, mayuscula, BarrasHorizontales, BotonRecargar, Cargando, SelectorLocal, selectCls, Tarjeta, useLocalElegido, useSucursales,
} from './comunes'

const TIPOS: { key: TipoMovimiento; label: string; plural: string }[] = [
  { key: 'gasto', label: 'Gasto', plural: 'Gastos' },
  { key: 'sueldo', label: 'Sueldo', plural: 'Sueldos' },
  { key: 'egreso', label: 'Retiro', plural: 'Retiros' },
]
type Filtro = 'todos' | TipoMovimiento

const etiquetaDia = (d: string) => mayuscula(new Date(`${d}T12:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))

export function Egresos() {
  const repo = useRepo()
  const { lista, error: errLocales } = useSucursales()
  const local = useLocalElegido(lista, true)
  const [rapido, setRapido] = useState('mes')
  const [periodo, setPeriodo] = useState<Periodo>(() => PERIODOS_RAPIDOS.find(p => p.key === 'mes')!.calc(new Date()))
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [movs, setMovs] = useState<MovimientoReporte[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const idsKey = local.ids.join(',')

  const cargar = useCallback(async () => {
    if (!lista || !idsKey) return
    if (periodo.desde > periodo.hasta) { setError('La fecha "desde" es posterior a "hasta"'); return }
    setCargando(true); setError('')
    try {
      const { desde, hasta } = rangoISO(periodo)
      const l = await repo.reporteMovimientosCaja(idsKey.split(','), desde, hasta)
      setMovs(l.filter(m => m.tipo !== 'ingreso'))
    } catch (e) {
      setError((e as Error).message)
    } finally { setCargando(false) }
  }, [repo, lista, idsKey, periodo])

  useEffect(() => { setMovs(null); void cargar() }, [cargar])

  const elegirRapido = (k: string) => {
    setRapido(k)
    const p = PERIODOS_RAPIDOS.find(x => x.key === k)
    if (p) setPeriodo(p.calc(new Date()))
  }

  const r = useMemo(() => {
    if (!movs) return null
    const totales = Object.fromEntries(TIPOS.map(t => {
      const l = movs.filter(m => m.tipo === t.key)
      return [t.key, { n: l.length, total: l.reduce((s, m) => s + m.monto, 0) }]
    })) as Record<string, { n: number; total: number }>
    const lista = movs.filter(m => filtro === 'todos' || m.tipo === filtro)
    const cat = new Map<string, { valor: number; n: number }>()
    for (const m of lista) {
      const k = m.tipo === 'sueldo' ? 'Sueldos' : m.tipo === 'egreso' ? 'Retiros' : m.tipoGastoNombre ?? 'Sin tipo'
      const x = cat.get(k) ?? { valor: 0, n: 0 }
      cat.set(k, { valor: x.valor + m.monto, n: x.n + 1 })
    }
    const porDia = new Map<string, MovimientoReporte[]>()
    for (const m of [...lista].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const d = diaDe(m.createdAt)
      porDia.set(d, [...(porDia.get(d) ?? []), m])
    }
    return {
      totales,
      total: lista.reduce((s, m) => s + m.monto, 0),
      cantidad: lista.length,
      categorias: [...cat].map(([label, x]) => ({ label, valor: x.valor, detalle: `${x.n}` })).sort((a, b) => b.valor - a.valor),
      porDia: [...porDia],
    }
  }, [movs, filtro])

  const nombreLocal = (id: string) => lista?.find(s => s.id === id)?.nombre ?? ''

  if (errLocales) return <Aviso>{errLocales}</Aviso>
  if (!lista) return <Cargando />

  return (
    <div className="space-y-3">
      <SelectorLocal lista={lista} valor={local.valor} onChange={local.elegir} permitirTodos />

      <div className="flex gap-2">
        <select value={rapido} onChange={e => elegirRapido(e.target.value)} className={selectCls} aria-label="Período">
          {PERIODOS_RAPIDOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          <option value="otro">Elegir fechas…</option>
        </select>
        <BotonRecargar onClick={() => void cargar()} cargando={cargando} />
      </div>
      {rapido === 'otro' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[13px] text-gris">Desde</span>
            <input type="date" value={periodo.desde} max={isoDia(new Date())} onChange={e => e.target.value && setPeriodo(p => ({ ...p, desde: e.target.value }))} className={`${selectCls} num`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] text-gris">Hasta</span>
            <input type="date" value={periodo.hasta} max={isoDia(new Date())} onChange={e => e.target.value && setPeriodo(p => ({ ...p, hasta: e.target.value }))} className={`${selectCls} num`} />
          </label>
        </div>
      )}

      {error && <Aviso>{error}</Aviso>}
      {!r ? <Cargando /> : (
        <>
          <Tarjeta>
            <div className="text-center">
              <div className="text-[14px] text-gris">{filtro === 'todos' ? 'Total de egresos' : TIPOS.find(t => t.key === filtro)!.plural}</div>
              <div className="num font-cond text-[40px] font-bold leading-tight text-tomate">{money(r.total)}</div>
              <div className="num text-[13px] text-gris">{r.cantidad} movimientos · {new Date(`${periodo.desde}T12:00`).toLocaleDateString('es-AR')} al {new Date(`${periodo.hasta}T12:00`).toLocaleDateString('es-AR')}</div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-1.5" role="tablist" aria-label="Filtrar por tipo">
              {([{ key: 'todos', plural: 'Todos' }, ...TIPOS] as { key: Filtro; plural: string }[]).map(t => {
                const activo = filtro === t.key
                const tot = t.key === 'todos' ? { n: movs!.length } : r.totales[t.key]
                return (
                  <button key={t.key} type="button" role="tab" aria-selected={activo} onClick={() => setFiltro(t.key)}
                    className={`rounded-xl border px-1 py-2 text-center ${activo ? 'border-pizarra bg-pizarra-claro' : 'border-linea bg-papel'}`}>
                    <div className="text-[13px] font-semibold text-tinta">{t.plural}</div>
                    {tot && <div className="num text-[11px] text-gris">{tot.n}</div>}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 rounded-xl bg-papel px-3 py-1">
              {TIPOS.map(t => (
                <div key={t.key} className="flex justify-between py-1 text-[14px]">
                  <span className="text-gris">{t.plural} ({r.totales[t.key].n})</span>
                  <span className="num font-semibold text-tinta">{money(r.totales[t.key].total)}</span>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Por categoría">
            <BarrasHorizontales filas={r.categorias} />
          </Tarjeta>

          <Tarjeta titulo="Detalle">
            {r.porDia.length === 0 ? <p className="py-3 text-center text-[14px] text-gris">No hubo egresos en el período</p> : (
              <div className="space-y-4">
                {r.porDia.map(([dia, l]) => (
                  <div key={dia}>
                    <div className="mb-1 flex justify-between border-b border-linea pb-1 text-[13px] font-semibold text-gris">
                      <span>{etiquetaDia(dia)}</span>
                      <span className="num">{money(l.reduce((s, m) => s + m.monto, 0))}</span>
                    </div>
                    <ul>
                      {l.map(m => (
                        <li key={m.id} className="flex items-start justify-between gap-3 py-1.5">
                          <div className="min-w-0">
                            <div className="text-[15px] text-tinta">{m.concepto}</div>
                            <div className="text-[12px] text-gris">
                              {TIPOS.find(t => t.key === m.tipo)?.label}{m.tipo === 'gasto' && m.tipoGastoNombre ? ` · ${m.tipoGastoNombre}` : ''} · {hora(m.createdAt)}hs · turno {m.cajaTurno.toLowerCase()}
                              {local.valor === 'todos' ? ` · ${nombreLocal(m.sucursalId)}` : ''}{m.creadoPor ? ` · ${m.creadoPor}` : ''}
                            </div>
                          </div>
                          <span className="num shrink-0 text-[15px] font-semibold text-tinta">{money(m.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>
        </>
      )}
    </div>
  )
}
