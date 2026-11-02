import { useCallback, useEffect, useMemo, useState } from 'react'
import { calcularTotales, TURNOS } from '../lib/caja'
import { fecha, hora, money } from '../lib/format'
import { isoDia } from '../lib/reportes'
import type { Caja, Categoria, Comanda, MovimientoCaja, Producto, Sucursal } from '../types'
import { useRepo } from './cuentas'
import {
  Aviso, BarraSegmentada, BotonRecargar, Cargando, Cifra, pct, SelectorLocal, selectCls, Tarjeta, useLocalElegido, useSucursales,
} from './comunes'

interface Datos {
  comandas: Comanda[]
  movimientos: MovimientoCaja[]
  cajasDia: (Caja & { local: string })[]
  /** Caja abierta ahora de cada local, con su efectivo calculado */
  abiertas: { local: string; caja: Caja; efectivo: number }[]
  categorias: Categoria[]
  productos: Producto[]
}

const fmtCant = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

export function Inicio() {
  const repo = useRepo()
  const { lista, error: errLocales } = useSucursales()
  const local = useLocalElegido(lista, true)
  const [dia, setDia] = useState(() => isoDia(new Date()))
  const [turno, setTurno] = useState('todos')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const idsKey = local.ids.join(',')

  const cargar = useCallback(async () => {
    if (!lista || !idsKey) return
    const ids = idsKey.split(',')
    setCargando(true); setError('')
    try {
      const nombre = (id: string) => lista.find((s: Sucursal) => s.id === id)?.nombre ?? ''
      const porLocal = await Promise.all(ids.map(async id => {
        const [cajas, menu] = await Promise.all([repo.listCajas(id, 40), repo.getMenu(id)])
        const delDia = cajas.filter(c => isoDia(new Date(c.abiertaAt)) === dia && (turno === 'todos' || c.turno === turno))
        const abierta = cajas.find(c => c.estado === 'abierta')
        const aCargar = [...new Set([...delDia, ...(abierta ? [abierta] : [])])]
        const detalle = await Promise.all(aCargar.map(async c => {
          const [comandas, movimientos] = await Promise.all([repo.listComandas(c.id), repo.listMovimientos(c.id)])
          return { caja: c, comandas, movimientos }
        }))
        const delDiaIds = new Set(delDia.map(c => c.id))
        const sel = detalle.filter(d => delDiaIds.has(d.caja.id))
        const ab = abierta && detalle.find(d => d.caja.id === abierta.id)
        return {
          comandas: sel.flatMap(d => d.comandas),
          movimientos: sel.flatMap(d => d.movimientos),
          cajasDia: delDia.map(c => ({ ...c, local: nombre(id) })),
          abiertas: ab ? [{ local: nombre(id), caja: ab.caja, efectivo: calcularTotales(ab.caja, ab.comandas, ab.movimientos).efectivoTeorico }] : [],
          menu,
        }
      }))
      const unico = <T extends { id: string }>(l: T[]) => [...new Map(l.map(x => [x.id, x])).values()]
      setDatos({
        comandas: porLocal.flatMap(p => p.comandas),
        movimientos: porLocal.flatMap(p => p.movimientos),
        cajasDia: porLocal.flatMap(p => p.cajasDia),
        abiertas: porLocal.flatMap(p => p.abiertas),
        categorias: unico(porLocal.flatMap(p => p.menu.categorias)),
        productos: unico(porLocal.flatMap(p => p.menu.productos)),
      })
    } catch (e) {
      setError((e as Error).message)
    } finally { setCargando(false) }
  }, [repo, lista, idsKey, dia, turno])

  useEffect(() => { void cargar() }, [cargar])

  const r = useMemo(() => (datos ? resumir(datos) : null), [datos])
  const hoy = isoDia(new Date())

  if (errLocales) return <Aviso>{errLocales}</Aviso>
  if (!lista) return <Cargando />

  return (
    <div className="space-y-3">
      <SelectorLocal lista={lista} valor={local.valor} onChange={local.elegir} permitirTodos />

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-[1.2]">
          <span className="sr-only">Día</span>
          <input type="date" value={dia} max={hoy} onChange={e => e.target.value && setDia(e.target.value)} className={`${selectCls} num`} />
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Turno</span>
          <select value={turno} onChange={e => setTurno(e.target.value)} className={selectCls}>
            <option value="todos">Todo el día</option>
            {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <BotonRecargar onClick={() => void cargar()} cargando={cargando} />
      </div>

      {error && <Aviso>{error}</Aviso>}
      {!r ? <Cargando /> : (
        <>
          <Tarjeta titulo="Facturación">
            <div className="text-center">
              <div className="num font-cond text-[40px] font-bold leading-none text-albahaca">{money(r.total)}</div>
              <div className="num mt-1.5 text-[14px] text-gris">Sin cobrar {money(r.sinCobrar)} · Total {money(r.total + r.sinCobrar)}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Cifra valor={r.cantidad} label="Comandas" detalle={r.anuladas ? `${r.anuladas} anuladas` : undefined} />
              <Cifra valor={money(Math.round(r.ticketPromedio))} label="Ticket promedio" />
              <Cifra valor={money(r.mov.gasto.total)} label={`Gastos (${r.mov.gasto.n})`} />
              <Cifra valor={money(r.mov.egreso.total)} label={`Retiros (${r.mov.egreso.n})`} />
              <Cifra valor={money(r.mov.ingreso.total)} label={`Ingresos (${r.mov.ingreso.n})`} />
              <Cifra valor={money(r.mov.sueldo.total)} label={`Sueldos (${r.mov.sueldo.n})`} />
            </div>
            {datos!.cajasDia.length === 0 && (
              <p className="mt-3 text-center text-[13px] text-gris">No hubo caja {turno === 'todos' ? '' : `de turno ${turno.toLowerCase()} `}ese día.</p>
            )}
          </Tarjeta>

          <Tarjeta titulo="Orígenes de pedidos">
            <div className="grid grid-cols-3 gap-2">
              {r.origenes.map(o => (
                <div key={o.key} className="rounded-xl border border-linea bg-papel px-2 py-2.5 text-center">
                  <div className="mx-auto mb-1 h-1 w-8 rounded-full" style={{ background: o.color }} />
                  <div className="num font-cond text-[26px] font-bold leading-none text-tinta">{o.valor}</div>
                  <div className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-gris">{o.corto}</div>
                  <div className="num text-[12px] text-gris">{pct(o.valor, r.cantidad)}%</div>
                  <div className="num text-[12px] font-semibold text-tinta">{money(o.monto)}</div>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Tipo de pedidos">
            <BarraSegmentada segmentos={r.origenes.map(o => ({ ...o, detalle: money(o.monto) }))} />
          </Tarjeta>

          <Tarjeta titulo="Estado de pedidos">
            <BarraSegmentada segmentos={r.estados} />
          </Tarjeta>

          <Tarjeta titulo="Cantidades vendidas">
            {r.cantidades.length === 0 ? <p className="py-3 text-center text-[14px] text-gris">Sin ventas</p> : (
              <div className="grid grid-cols-2 gap-2">
                {r.cantidades.map(c => (
                  <div key={c.nombre} className="rounded-xl border border-linea bg-papel px-2 py-3 text-center">
                    <div className="num font-cond text-[28px] font-bold leading-none text-tinta">{fmtCant(c.cantidad)}</div>
                    <div className="mt-1 text-[13px] font-semibold uppercase leading-tight tracking-wide text-gris">{c.nombre}</div>
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Estado de caja">
            {datos!.abiertas.length === 0 ? (
              <div className="text-center">
                <div className="font-cond text-[28px] font-bold text-gris">CAJA CERRADA</div>
                {r.ultimaCerrada && <p className="text-[14px] text-gris">Último cierre: {fecha(r.ultimaCerrada.cerradaAt!)} {hora(r.ultimaCerrada.cerradaAt!)}hs.</p>}
              </div>
            ) : datos!.abiertas.map(a => (
              <div key={a.caja.id} className="border-b border-linea pb-3 text-center last:border-0 last:pb-0 [&+&]:pt-3">
                {datos!.abiertas.length > 1 && <div className="text-[14px] font-semibold text-tinta">{a.local}</div>}
                <div className="font-cond text-[30px] font-bold leading-tight text-albahaca">CAJA ABIERTA</div>
                <p className="text-[14px] text-gris">
                  Turno {a.caja.turno.toLowerCase()} · apertura {fecha(a.caja.abiertaAt)} a las {hora(a.caja.abiertaAt)}hs.{a.caja.abiertaPor ? ` por ${a.caja.abiertaPor}` : ''}
                </p>
                <div className="mt-2 inline-block rounded-xl bg-papel px-4 py-2">
                  <div className="text-[13px] text-gris">Efectivo que debería haber</div>
                  <div className="num font-cond text-[24px] font-bold text-tinta">{money(a.efectivo)}</div>
                </div>
              </div>
            ))}
          </Tarjeta>
        </>
      )}
    </div>
  )
}

function resumir(d: Datos) {
  const validas = d.comandas.filter(c => c.estado !== 'anulada')
  const cobradas = validas.filter(c => c.cobrada)
  const total = cobradas.reduce((s, c) => s + c.total, 0)
  const sinCobrar = validas.filter(c => !c.cobrada).reduce((s, c) => s + c.total, 0)
  const bruto = validas.reduce((s, c) => s + c.total, 0)

  const mov = Object.fromEntries((['gasto', 'egreso', 'ingreso', 'sueldo'] as const).map(t => {
    const l = d.movimientos.filter(m => m.tipo === t)
    return [t, { n: l.length, total: l.reduce((s, m) => s + m.monto, 0) }]
  })) as Record<'gasto' | 'egreso' | 'ingreso' | 'sueldo', { n: number; total: number }>

  const grupo = (f: (c: Comanda) => boolean) => { const l = validas.filter(f); return { valor: l.length, monto: l.reduce((s, c) => s + c.total, 0) } }
  const origenes = [
    { key: 'mostrador', label: 'Mostrador', corto: 'Mostrador', color: 'var(--g-mostrador)', ...grupo(c => c.tipo === 'mostrador' && c.canal !== 'pedidosya') },
    { key: 'delivery', label: 'Delivery propio', corto: 'Delivery', color: 'var(--g-delivery)', ...grupo(c => c.tipo === 'delivery' && c.canal !== 'pedidosya') },
    { key: 'pedidosya', label: 'PedidosYa', corto: 'PedidosYa', color: 'var(--g-pedidosya)', ...grupo(c => c.canal === 'pedidosya') },
  ]

  const estados = [
    { key: 'entregado', label: 'Entregados', valor: d.comandas.filter(c => c.estado === 'entregado').length, color: 'var(--g-ok)' },
    { key: 'curso', label: 'En curso', valor: d.comandas.filter(c => c.estado !== 'entregado' && c.estado !== 'anulada').length, color: 'var(--g-curso)' },
    { key: 'anulada', label: 'Anulados', valor: d.comandas.length - validas.length, color: 'var(--g-anulada)' },
  ]

  // Cantidades por categoría del producto (la mitad de pizza cuenta 0,5)
  const prodPorId = new Map(d.productos.map(p => [p.id, p]))
  const prodPorNombre = new Map(d.productos.map(p => [p.nombre, p]))
  const catPorId = new Map(d.categorias.map(c => [c.id, c]))
  const porCat = new Map<string, { nombre: string; cantidad: number; orden: number }>()
  for (const c of validas) for (const it of c.items) {
    const p = (it.productoId && prodPorId.get(it.productoId)) || prodPorNombre.get(it.descripcion)
    const cat = p ? catPorId.get(p.categoriaId) : undefined
    const k = cat?.id ?? 'otros'
    const f = porCat.get(k) ?? { nombre: cat?.nombre ?? 'Otros', cantidad: 0, orden: cat?.orden ?? 999 }
    f.cantidad += it.cantidad * (it.variante === 'mitad' ? 0.5 : 1)
    porCat.set(k, f)
  }
  const cantidades = [...porCat.values()].sort((a, b) => a.orden - b.orden)

  const ultimaCerrada = d.cajasDia.filter(c => c.cerradaAt).sort((a, b) => b.cerradaAt!.localeCompare(a.cerradaAt!))[0]

  return {
    total, sinCobrar, cantidad: validas.length, anuladas: d.comandas.length - validas.length,
    ticketPromedio: validas.length ? bruto / validas.length : 0,
    mov, origenes, estados, cantidades, ultimaCerrada,
  }
}
