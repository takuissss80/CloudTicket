import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Ingrediente, PedidoFabrica, StockItem, Sucursal } from '../types'
import { repo } from '../data'
import { mensajeError, useApp } from '../store/app'
import { formatCantidad } from '../lib/stock'
import { normalizar } from '../lib/format'
import { BotonTema, inputBase } from './ui'
import { ESTADO_PEDIDO, ListaPedidosFabrica, fechaPedido } from './admin/PedidoFabrica'

/**
 * Pantalla del usuario Producción (fábrica): solo lectura.
 * Pedidos de todos los locales (y el total a preparar), historial y stock de cada local.
 */
export function Produccion({ usuario, cuenta, onSalir }: { usuario: string; cuenta: string; onSalir: () => void }) {
  const avisar = useApp(s => s.avisar)
  const [vista, setVista] = useState<'pendientes' | 'historial' | 'stock'>('pendientes')
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [pedidos, setPedidos] = useState<PedidoFabrica[] | null>(null)
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [s, p, m] = await Promise.all([repo.listSucursales(), repo.listPedidosFabrica(null, 300), repo.getMenu(null)])
      setSucursales(s)
      useApp.setState({ sucursales: s })
      setPedidos(p)
      setIngredientes(m.ingredientes.filter(i => i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)))
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setCargando(false) }
  }, [avisar])
  useEffect(() => { cargar() }, [cargar])
  // Se actualiza solo cada minuto
  useEffect(() => { const t = setInterval(cargar, 60_000); return () => clearInterval(t) }, [cargar])

  const pendientes = (pedidos ?? []).filter(p => p.estado === 'pendiente')

  return (
    <div className="flex min-h-full flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-barra px-4 py-3 text-white">
        <h1 className="font-cond text-3xl font-extrabold leading-none">Producción</h1>
        <span className="text-white/75">{cuenta}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={cargar} disabled={cargando} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25 disabled:opacity-50">{cargando ? 'Actualizando…' : 'Actualizar'}</button>
          <BotonTema className="!border-white/20 !bg-white/15 !text-white hover:!bg-white/25" />
          <button onClick={async () => { await repo.logout(); onSalir() }} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">
            Salir <span className="text-white/60">({usuario})</span>
          </button>
        </div>
      </header>

      <nav className="mx-auto mt-4 flex w-full max-w-6xl gap-1 px-4" role="tablist">
        {([['pendientes', `Pedidos por preparar${pendientes.length ? ` (${pendientes.length})` : ''}`], ['historial', 'Pedidos realizados'], ['stock', 'Stock de los locales']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`h-11 flex-1 rounded-lg font-semibold ring-1 ring-linea ${vista === k ? 'bg-primario text-sobre-primario' : 'bg-superficie hover:bg-harina'}`}>{l}</button>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-6xl flex-1 p-4">
        {!pedidos ? <p className="p-8 text-center text-gris">Cargando…</p>
          : vista === 'pendientes' ? <PorPreparar pedidos={pendientes} sucursales={sucursales} />
          : vista === 'historial' ? <Historial pedidos={pedidos} sucursales={sucursales} onCambio={cargar} />
          : <StockLocales sucursales={sucursales} ingredientes={ingredientes} />}
      </main>
    </div>
  )
}

function PorPreparar({ pedidos, sucursales }: { pedidos: PedidoFabrica[]; sucursales: Sucursal[] }) {
  // Total a preparar: suma de todos los pedidos pendientes, por ingrediente
  const total = useMemo(() => {
    const m = new Map<string, { nombre: string; unidad: PedidoFabrica['items'][number]['unidad']; cantidad: number; locales: number }>()
    for (const p of pedidos) for (const i of p.items) {
      const k = i.ingredienteId ?? `${i.nombre}|${i.unidad}`
      const x = m.get(k) ?? { nombre: i.nombre, unidad: i.unidad, cantidad: 0, locales: 0 }
      x.cantidad += i.cantidad; x.locales += 1
      m.set(k, x)
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [pedidos])
  const nombre = (id: string) => sucursales.find(s => s.id === id)?.nombre ?? ''
  const ordenados = [...pedidos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.createdAt.localeCompare(b.createdAt))

  if (!pedidos.length) return <p className="rounded-xl bg-superficie p-10 text-center text-lg text-gris ring-1 ring-linea">No hay pedidos pendientes de los locales.</p>

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <section className="h-fit rounded-xl bg-superficie p-4 ring-1 ring-linea lg:sticky lg:top-4">
        <h2 className="font-cond text-2xl font-bold">Total a preparar</h2>
        <p className="mb-2 text-sm text-gris">Suma de los {pedidos.length} pedidos pendientes</p>
        <ul className="divide-y divide-linea">
          {total.map(t => (
            <li key={t.nombre + t.unidad} className="flex items-baseline justify-between gap-3 py-1.5">
              <span>{t.nombre}{t.locales > 1 && <span className="text-sm text-gris"> · {t.locales} locales</span>}</span>
              <b className="tabular-nums">{formatCantidad(t.cantidad, t.unidad)}</b>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {ordenados.map(p => (
          <article key={p.id} className="rounded-xl bg-superficie p-4 ring-1 ring-linea">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-cond text-2xl font-bold leading-tight">{nombre(p.sucursalId)}</h3>
              <span className="font-cond text-xl font-bold text-gris">#{p.numero}</span>
            </div>
            <p className="text-sm text-gris">{fechaPedido(p.fecha)}{p.creadoPor ? ` · ${p.creadoPor}` : ''}</p>
            {p.notas && <p className="mt-2 rounded-lg bg-muzza-claro px-3 py-1.5 text-sm font-semibold">{p.notas}</p>}
            <ul className="mt-2 divide-y divide-linea text-[15px]">
              {p.items.map(i => (
                <li key={i.id} className="flex justify-between gap-2 py-1"><span>{i.nombre}</span><b className="tabular-nums">{formatCantidad(i.cantidad, i.unidad)}</b></li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  )
}

function Historial({ pedidos, sucursales, onCambio }: { pedidos: PedidoFabrica[]; sucursales: Sucursal[]; onCambio: () => void }) {
  const [local, setLocal] = useState('')
  const [estado, setEstado] = useState('')
  const lista = pedidos.filter(p => (!local || p.sucursalId === local) && (!estado || p.estado === estado))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Local" value={local} onChange={e => setLocal(e.target.value)} className={`${inputBase} h-10 w-auto`}>
          <option value="">Todos los locales</option>
          {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select aria-label="Estado" value={estado} onChange={e => setEstado(e.target.value)} className={`${inputBase} h-10 w-auto`}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <ListaPedidosFabrica pedidos={lista} onCambio={onCambio} mostrarLocal />
    </div>
  )
}

function StockLocales({ sucursales, ingredientes }: { sucursales: Sucursal[]; ingredientes: Ingrediente[] }) {
  const avisar = useApp(s => s.avisar)
  const [local, setLocal] = useState(sucursales[0]?.id ?? '')
  const [stock, setStock] = useState<StockItem[] | null>(null)
  const [filtro, setFiltro] = useState('')
  useEffect(() => {
    if (!local) return
    setStock(null)
    repo.getStock(local).then(setStock).catch(e => avisar(mensajeError(e), 'error'))
  }, [local, avisar])
  const filas = ingredientes
    .filter(i => !filtro || normalizar(i.nombre).includes(normalizar(filtro)))
    .map(i => {
      const s = stock?.find(x => x.ingredienteId === i.id)
      const cantidad = s?.cantidad ?? 0, minimo = s?.minimo ?? 0
      return { i, cantidad, minimo, bajo: cantidad < 0 || (minimo > 0 && cantidad <= minimo) }
    })
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Local" value={local} onChange={e => setLocal(e.target.value)} className={`${inputBase} h-10 w-auto`}>
          {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <input aria-label="Buscar ingrediente" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar ingrediente" className={`${inputBase} h-10 w-64`} />
        <span className="ml-auto self-center text-sm text-gris">{filas.filter(f => f.bajo).length} bajo el mínimo</span>
      </div>
      {!stock ? <p className="p-8 text-center text-gris">Cargando…</p> : (
        <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
          <table className="w-full min-w-[480px] text-left text-[15px]">
            <thead className="border-b border-linea text-sm text-gris">
              <tr><th className="px-3 py-2 font-medium">Ingrediente</th><th className="px-3 py-2 text-right font-medium">Stock</th><th className="px-3 py-2 text-right font-medium">Mínimo</th></tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {filas.map(f => (
                <tr key={f.i.id} className={f.bajo ? 'bg-tomate-claro/40' : ''}>
                  <td className="px-3 py-2 font-semibold">{f.i.nombre}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${f.bajo ? 'text-tomate' : f.cantidad === 0 ? 'text-gris' : ''}`}>{formatCantidad(f.cantidad, f.i.unidad)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gris">{f.minimo ? formatCantidad(f.minimo, f.i.unidad) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
