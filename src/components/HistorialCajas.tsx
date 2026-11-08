import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Caja, Comanda, MovimientoCaja } from '../types'
import { FORMAS_PAGO } from '../types'
import { repo } from '../data'
import { mensajeError, useApp, useNombreLocal } from '../store/app'
import { calcularTotales } from '../lib/caja'
import { etiquetaEstado } from '../lib/estados'
import { hora, money } from '../lib/format'
import { Btn, Confirmar, Modal } from './ui'
import { construirTicket } from '../lib/ticket'
import { TicketPreview } from './TicketPreview'
import { ListaMovimientos, ResumenCaja, fechaLarga } from './Caja'

const colorDif = (d?: number) => (d == null ? 'text-gris' : d > -0.01 ? 'text-albahaca' : 'text-tomate') // sobra o justo: verde; falta: rojo
const textoDif = (d?: number) => (d == null ? '—' : Math.abs(d) < 0.01 ? '$0' : `${d > 0 ? '+' : '−'}${money(Math.abs(d))}`)

/** Historial de cajas de un local: lista y detalle (sin encabezado propio) */
export function HistorialPanel({ sucursalId, onReabierta }: { sucursalId: string; onReabierta?: () => void }) {
  const sucursalActual = useApp(s => s.sucursalId)
  const { avisar, refrescar, sucursalId: localActivo } = useApp()
  const [cajas, setCajas] = useState<Caja[] | null>(null)
  const [sel, setSel] = useState<Caja | null>(null)

  const cargar = useCallback(async () => {
    try { setCajas(await repo.listCajas(sucursalId, 90)) } catch (e) { avisar(mensajeError(e), 'error') }
  }, [sucursalId, avisar])
  useEffect(() => { setCajas(null); setSel(null); cargar() }, [cargar])

  const reabrir = async (c: Caja) => {
    try {
      await repo.reabrirCaja(c.id)
      avisar('Caja reabierta: seguís con la misma numeración')
      if (sucursalId === localActivo) await refrescar()
      setSel(null)
      await cargar()
      onReabierta?.()
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  if (sel) {
    return (
      <div>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-4">
          <Btn onClick={() => setSel(null)}>Volver a la lista</Btn>
          <h2 className="font-cond text-2xl font-bold">Caja {sel.turno.toLowerCase()}, {fechaLarga(sel.abiertaAt)}</h2>
        </div>
        <DetalleCaja caja={sel} delLocalActual={sucursalId === sucursalActual} esUltima={cajas?.[0]?.id === sel.id} hayAbierta={!!cajas?.some(c => c.estado === 'abierta')}
          onReabrir={() => reabrir(sel)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      {!cajas ? <p className="p-8 text-center text-gris">Cargando…</p> : !cajas.length ? (
        <p className="p-8 text-center text-gris">Todavía no hay cajas en este local.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
          <table className="w-full min-w-[860px] text-left text-[15px]">
            <thead className="border-b border-linea text-sm text-gris">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Turno</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Usuario</th>
                <th className="px-3 py-2 text-right font-medium">Comandas</th>
                <th className="px-3 py-2 text-right font-medium">Ventas</th>
                <th className="px-3 py-2 text-right font-medium">Teórico</th>
                <th className="px-3 py-2 text-right font-medium">Contado</th>
                <th className="px-3 py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {cajas.map(c => (
                <tr key={c.id} onClick={() => setSel(c)} className="cursor-pointer hover:bg-harina">
                  <td className="px-3 py-2.5 font-semibold">{fechaLarga(c.abiertaAt)}</td>
                  <td className="px-3 py-2.5">{c.turno}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${c.estado === 'abierta' ? 'bg-albahaca text-sobre-albahaca' : 'bg-linea text-gris'}`}>{c.estado === 'abierta' ? 'Abierta' : 'Cerrada'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gris">{c.cerradaPor ?? c.abiertaPor ?? ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.totales?.cantComandas ?? ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.totales ? money(c.totales.totalVentas) : ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.totales ? money(c.totales.efectivoTeorico) : ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.dineroCierre != null ? money(c.dineroCierre) : ''}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${colorDif(c.diferencia)}`}>{c.estado === 'cerrada' ? textoDif(c.diferencia) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Historial a pantalla completa (desde la caja) */
export function HistorialCajas({ onClose }: { onClose: () => void }) {
  const sucursalId = useApp(s => s.sucursalId)
  const local = useNombreLocal()
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-barra px-4 py-3 text-white">
        <button onClick={onClose} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>
        <h1 className="font-cond text-3xl font-bold leading-none">Historial de cajas de {local}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sucursalId && <HistorialPanel sucursalId={sucursalId} onReabierta={onClose} />}
      </div>
    </div>
  )
}

function DetalleCaja({ caja, esUltima, hayAbierta, onReabrir, delLocalActual }: { caja: Caja; esUltima: boolean; hayAbierta: boolean; onReabrir: () => void; delLocalActual: boolean }) {
  const avisar = useApp(s => s.avisar)
  const imprimirCierre = useApp(s => s.imprimirCierre)
  const hayImpresoras = useApp(s => s.impresoras.length > 0)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [comandas, setComandas] = useState<Comanda[] | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [pestana, setPestana] = useState<'resumen' | 'comandas' | 'movimientos'>('resumen')
  const [viendo, setViendo] = useState<Comanda | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => {
    Promise.all([repo.listComandas(caja.id), repo.listMovimientos(caja.id)])
      .then(([c, m]) => { setComandas(c); setMovimientos(m) })
      .catch(e => avisar(mensajeError(e), 'error'))
  }, [caja.id, avisar])

  if (!comandas) return <p className="p-8 text-center text-gris">Cargando…</p>
  // Cerrada: la foto guardada al cerrar. Abierta: en vivo.
  const totales = caja.totales ?? calcularTotales(caja, comandas, movimientos)
  const puedeReabrir = caja.estado === 'cerrada' && esUltima && !hayAbierta

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <section className="space-y-1 rounded-xl bg-superficie p-4 text-[15px] ring-1 ring-linea">
        <p>Abierta a las <b>{hora(caja.abiertaAt)}</b>{caja.abiertaPor ? ` por ${caja.abiertaPor}` : ''}.</p>
        {caja.estado === 'cerrada' ? (
          <>
            <p>Cerrada {caja.cerradaAt ? <>el {fechaLarga(caja.cerradaAt)} a las <b>{hora(caja.cerradaAt)}</b></> : ''}{caja.cerradaPor ? ` por ${caja.cerradaPor}` : ''}.</p>
            <p>Dinero real de cierre <b>{money(caja.dineroCierre ?? 0)}</b>. Diferencia <b className={colorDif(caja.diferencia)}>{textoDif(caja.diferencia)}</b></p>
            {caja.observaciones && <p className="rounded-lg bg-muzza-claro p-2"><b>Obs:</b> {caja.observaciones}</p>}
          </>
        ) : <p className="font-semibold text-albahaca">La caja sigue abierta.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {delLocalActual && hayImpresoras && (
            <Btn className="mt-1" disabled={imprimiendo} onClick={async () => { setImprimiendo(true); await imprimirCierre(caja); setImprimiendo(false) }}>
              {imprimiendo ? 'Enviando…' : caja.estado === 'cerrada' ? 'Imprimir cierre' : 'Imprimir parcial'}
            </Btn>
          )}
          {puedeReabrir && <Btn className="mt-1" onClick={() => setConfirmar(true)}>Reabrir esta caja</Btn>}
        </div>
      </section>

      <div className="flex gap-1 rounded-xl bg-superficie p-1 ring-1 ring-linea" role="tablist">
        {([['resumen', 'Resumen'], ['comandas', `Comandas (${comandas.length})`], ['movimientos', `Gastos y retiros (${movimientos.length})`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
            className={`h-10 flex-1 rounded-lg font-semibold ${pestana === k ? 'bg-primario text-sobre-primario' : 'text-gris hover:bg-harina'}`}>{l}</button>
        ))}
      </div>

      {pestana === 'resumen' && <ResumenCaja caja={caja} totales={totales} comandas={comandas} />}
      {pestana === 'movimientos' && <ListaMovimientos movimientos={movimientos} />}
      {pestana === 'comandas' && (
        comandas.length ? (
          <ul className="divide-y divide-linea rounded-xl bg-superficie ring-1 ring-linea">
            {[...comandas].sort((a, b) => a.numero - b.numero).map(c => (
              <li key={c.id} role="button" tabIndex={0} onClick={() => setViendo(c)} onKeyDown={e => { if (e.key === 'Enter') setViendo(c) }}
                title="Ver el pedido"
                className={`flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-harina focus:bg-harina focus:outline-none ${c.estado === 'anulada' ? 'text-gris line-through' : ''}`}>
                <span className="w-10 font-cond text-2xl font-bold tabular-nums">{c.numero}</span>
                <span className="w-20 text-sm capitalize text-gris">{c.tipo}, {hora(c.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">{c.clienteNombre || '—'}{c.repartidorNombre ? <span className="text-sm text-gris"> (moto {c.repartidorNombre})</span> : null}</span>
                <span className="text-sm text-gris">{c.pagos.map(p => FORMAS_PAGO.find(f => f.key === p.forma)?.label).join(' + ')}</span>
                <span className="text-xs font-bold">{etiquetaEstado(c)}{!c.cobrada && c.estado !== 'anulada' ? ', sin cobrar' : ''}</span>
                <b className="w-24 text-right tabular-nums">{money(c.total)}</b>
              </li>
            ))}
          </ul>
        ) : <p className="py-6 text-center text-gris">Esta caja no tuvo comandas.</p>
      )}

      {viendo && <VerComanda c={viendo} onClose={() => setViendo(null)} />}

      {confirmar && (
        <Confirmar texto="¿Reabrir esta caja?" detalle="Seguís en la misma caja con la misma numeración. El cierre se borra y lo hacés de nuevo al terminar."
          accion="Reabrir caja" tono="pizarra" onNo={() => setConfirmar(false)}
          onSi={() => { setConfirmar(false); onReabrir() }} />
      )}
    </div>
  )
}

/** El pedido de una caja ya cerrada: solo para ver (sin editar ni cambiar estados) */
function VerComanda({ c, onClose }: { c: Comanda; onClose: () => void }) {
  const { impresoras, catalogo } = useApp()
  const sucursal = useNombreLocal()
  const imp = impresoras[0]
  const ticket = useMemo(() => construirTicket(c, {
    ancho: imp?.ancho ?? 48, tipo: 'comanda', zonas: catalogo.zonas, nombreLocal: sucursal,
    formato: imp?.formato, mostrarPrecios: true,
  }), [c, imp, catalogo.zonas, sucursal])
  const fila = (label: string, valor?: string | null) => valor ? (
    <div className="flex justify-between gap-3 py-1"><span className="text-gris">{label}</span><span className="text-right font-semibold">{valor}</span></div>
  ) : null
  return (
    <Modal
      titulo={<span>Comanda #{c.numero} <span className="font-sans text-lg font-semibold capitalize text-gris">{c.tipo}, {hora(c.createdAt)}</span></span>}
      onClose={onClose} ancho="max-w-4xl"
      pie={<Btn onClick={onClose}>Cerrar</Btn>}
    >
      <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto]">
        <div className="space-y-3 text-[15px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${c.estado === 'anulada' ? 'bg-tomate text-white' : 'bg-harina ring-1 ring-linea'}`}>{etiquetaEstado(c)}</span>
            {c.canal === 'pedidosya' && <span className="rounded-full bg-tomate-claro px-3 py-1 text-sm font-bold">PedidosYa</span>}
            {!c.cobrada && c.estado !== 'anulada' && <span className="rounded-full bg-muzza-claro px-3 py-1 text-sm font-bold">Sin cobrar</span>}
          </div>
          <div className="rounded-xl bg-harina px-4 py-2 ring-1 ring-linea">
            {fila('Cliente', c.clienteNombre)}
            {fila('Teléfono', c.clienteTel)}
            {fila('Dirección', c.direccion)}
            {fila('Moto', c.repartidorNombre)}
            {fila('Salió', c.asignadaAt ? hora(c.asignadaAt) : null)}
            {fila('Entregado', c.entregadaAt ? hora(c.entregadaAt) : null)}
            {fila('Cupón', c.cuponCodigo)}
          </div>
          <div className="rounded-xl bg-harina px-4 py-2 ring-1 ring-linea">
            {c.pagos.length ? c.pagos.map(p => fila(FORMAS_PAGO.find(f => f.key === p.forma)?.label ?? p.forma, money(p.monto))).map((x, i) => <div key={i}>{x}</div>)
              : <p className="py-1 text-gris">Sin pagos registrados</p>}
            <div className="flex justify-between border-t border-linea pt-2 font-cond text-2xl font-bold"><span>Total</span><span>{money(c.total)}</span></div>
          </div>
          {c.observaciones && <p className="rounded-xl bg-muzza-claro px-4 py-2"><b>Obs:</b> {c.observaciones}</p>}
        </div>
        <TicketPreview lineas={ticket} ancho={imp?.ancho ?? 48} />
      </div>
    </Modal>
  )
}
