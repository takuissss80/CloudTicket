import { useEffect, useMemo, useState } from 'react'
import type { Ingrediente, IngresoMercaderia, PedidoFabrica } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { formatCantidad } from '../../lib/stock'
import { fecha, hora, money, normalizar } from '../../lib/format'
import { isoDia, rangoISO } from '../../lib/reportes'
import { Modal, inputBase } from '../ui'
import { cantidadFabrica } from './PedidoFabrica'

/** Un ingreso al stock: compra cargada a mano o pedido a fábrica recibido */
interface Entrada {
  id: string
  origen: 'compra' | 'fabrica'
  titulo: string
  cuando: string
  creadoPor?: string
  proveedor?: string
  comprobante?: string
  observaciones?: string
  total?: number
  pagadoConCaja?: boolean
  items: { nombre: string; cantidad: string; costo?: number; falta?: boolean }[]
}

const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDia(d) }

/** Historial de todo lo que entró al stock de un local */
export function HistorialIngresos({ sucursalId, nombreLocal, ingredientes, onClose }: {
  sucursalId: string; nombreLocal: string; ingredientes: Ingrediente[]; onClose: () => void
}) {
  const avisar = useApp(s => s.avisar)
  const [desde, setDesde] = useState(() => haceDias(30))
  const [hasta, setHasta] = useState(() => isoDia(new Date()))
  const [origen, setOrigen] = useState<'' | 'compra' | 'fabrica'>('')
  const [filtro, setFiltro] = useState('')
  const [datos, setDatos] = useState<{ ingresos: IngresoMercaderia[]; pedidos: PedidoFabrica[] } | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    if (!desde || !hasta || desde > hasta) return
    let vivo = true
    setDatos(null)
    const r = rangoISO({ desde, hasta })
    Promise.all([repo.reporteIngresos([sucursalId], r.desde, r.hasta), repo.listPedidosFabrica([sucursalId], 500).catch(() => [] as PedidoFabrica[])])
      .then(([ingresos, pedidos]) => {
        if (!vivo) return
        setDatos({ ingresos, pedidos: pedidos.filter(p => p.estado === 'recibido' && p.recibidoAt && p.recibidoAt >= r.desde && p.recibidoAt < r.hasta) })
      })
      .catch(e => avisar(mensajeError(e), 'error'))
    return () => { vivo = false }
  }, [sucursalId, desde, hasta, avisar])

  const entradas = useMemo<Entrada[]>(() => {
    if (!datos) return []
    const ing = new Map(ingredientes.map(i => [i.id, i]))
    const compras: Entrada[] = datos.ingresos.map(x => ({
      id: x.id, origen: 'compra', titulo: x.proveedor || 'Compra', cuando: x.createdAt, creadoPor: x.creadoPor,
      proveedor: x.proveedor, comprobante: x.comprobante, observaciones: x.observaciones, total: x.total, pagadoConCaja: x.pagadoConCaja,
      items: x.items.map(it => {
        const i = ing.get(it.ingredienteId)
        return { nombre: i?.nombre ?? 'Ingrediente borrado', cantidad: i ? formatCantidad(it.cantidad, i.unidad) : String(it.cantidad), costo: it.costo || undefined }
      }),
    }))
    const fabrica: Entrada[] = datos.pedidos.map(p => ({
      id: p.id, origen: 'fabrica', titulo: `Pedido a fábrica #${p.numero}`, cuando: p.recibidoAt!, creadoPor: p.recibidoPor, observaciones: p.notas,
      items: p.items.map(i => ({
        nombre: i.nombre,
        cantidad: (i.recibido ?? 0) > 0 ? cantidadFabrica(i.recibido ?? 0, i) : 'No llegó',
        falta: (i.recibido ?? 0) < i.cantidad,
      })),
    }))
    const q = normalizar(filtro.trim())
    return [...compras, ...fabrica]
      .filter(e => !origen || e.origen === origen)
      .filter(e => !q || normalizar([e.titulo, e.comprobante, e.creadoPor, ...e.items.map(i => i.nombre)].join(' ')).includes(q))
      .sort((a, b) => b.cuando.localeCompare(a.cuando))
  }, [datos, ingredientes, origen, filtro])

  const totalCompras = entradas.reduce((s, e) => s + (e.total ?? 0), 0)
  const cantCompras = entradas.filter(e => e.origen === 'compra').length

  return (
    <Modal titulo={`Historial de ingresos · ${nombreLocal}`} onClose={onClose} ancho="max-w-4xl" alto>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm"><span className="mb-0.5 block text-gris">Desde</span>
            <input type="date" aria-label="Desde" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} className={`${inputBase} h-10`} /></label>
          <label className="text-sm"><span className="mb-0.5 block text-gris">Hasta</span>
            <input type="date" aria-label="Hasta" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} className={`${inputBase} h-10`} /></label>
          <select aria-label="Origen" value={origen} onChange={e => setOrigen(e.target.value as typeof origen)} className={`${inputBase} h-10 w-auto`}>
            <option value="">Compras y fábrica</option>
            <option value="compra">Solo compras</option>
            <option value="fabrica">Solo pedidos a fábrica</option>
          </select>
          <input aria-label="Buscar en ingresos" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar proveedor, ingrediente…" className={`${inputBase} h-10 min-w-0 flex-1`} />
        </div>

        {datos && (
          <p className="text-[15px] text-gris">
            {entradas.length} ingreso{entradas.length === 1 ? '' : 's'}
            {cantCompras > 0 && <> · {cantCompras} compra{cantCompras === 1 ? '' : 's'} por <b className="text-tinta">{money(totalCompras)}</b></>}
          </p>
        )}

        {!datos ? <p className="p-8 text-center text-gris">Cargando…</p>
          : !entradas.length ? <p className="rounded-xl bg-harina p-8 text-center text-gris ring-1 ring-linea">No hay ingresos de mercadería en esas fechas.</p>
          : (
            <ul className="space-y-2">
              {entradas.map(e => {
                const ab = abierto === e.id
                return (
                  <li key={e.origen + e.id} className="rounded-xl bg-superficie ring-1 ring-linea">
                    <button onClick={() => setAbierto(ab ? null : e.id)} aria-expanded={ab}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-harina">
                      <span className="w-36 whitespace-nowrap text-sm tabular-nums text-gris">{fecha(e.cuando)} {hora(e.cuando)}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${e.origen === 'compra' ? 'bg-pizarra-claro' : 'bg-albahaca-claro'}`}>
                        {e.origen === 'compra' ? 'Compra' : 'Fábrica'}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{e.titulo}{e.comprobante ? <span className="font-normal text-gris"> · {e.comprobante}</span> : ''}</span>
                      <span className="text-sm text-gris">{e.items.length} ítem{e.items.length === 1 ? '' : 's'}</span>
                      {e.total != null && <b className="w-28 text-right tabular-nums">{money(e.total)}</b>}
                    </button>
                    {ab && (
                      <div className="border-t border-linea px-4 py-3">
                        <table className="w-full text-[15px]">
                          <thead className="text-sm text-gris">
                            <tr><th className="py-1 text-left font-medium">Ingrediente / producto</th><th className="py-1 text-right font-medium">Cantidad</th>{e.origen === 'compra' && <th className="py-1 text-right font-medium">Costo</th>}</tr>
                          </thead>
                          <tbody className="divide-y divide-linea">
                            {e.items.map((i, k) => (
                              <tr key={k}>
                                <td className="py-1.5">{i.nombre}</td>
                                <td className={`py-1.5 text-right tabular-nums ${i.falta ? 'font-semibold text-tomate' : ''}`}>{i.cantidad}</td>
                                {e.origen === 'compra' && <td className="py-1.5 text-right tabular-nums text-gris">{i.costo ? money(i.costo) : '—'}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-2 space-y-0.5 text-sm text-gris">
                          {e.observaciones && <p><b className="text-tinta">{e.origen === 'compra' ? 'Observaciones' : 'Notas'}:</b> {e.observaciones}</p>}
                          {e.pagadoConCaja && <p>Se pagó con la caja (quedó como gasto).</p>}
                          {e.creadoPor && <p>{e.origen === 'compra' ? 'Cargado' : 'Recibido'} por {e.creadoPor}.</p>}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
      </div>
    </Modal>
  )
}
