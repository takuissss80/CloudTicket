import { useMemo, useState } from 'react'
import type { Comanda } from '../types'
import { FORMAS_PAGO } from '../types'
import { accionPendiente, etiquetaEstado, minutosDelivery } from '../lib/estados'
import type { AccionTablero } from './Tablero'
import { useApp, useNombreLocal } from '../store/app'
import { usePedido } from '../store/pedido'
import { construirTicket } from '../lib/ticket'
import { hora, money } from '../lib/format'
import { Btn, Confirmar, Modal } from './ui'
import { TicketPreview } from './TicketPreview'

export function ComandaDetalle({ comanda, onClose, onAccion }: { comanda: Comanda; onClose: () => void; onAccion: (a: AccionTablero) => void }) {
  const { reimprimir, anular, marcarCobrada, impresoras, catalogo, printJobs } = useApp()
  const sucursal = useNombreLocal()
  const editar = usePedido(s => s.editar)
  const [confirmarAnular, setConfirmarAnular] = useState(false)
  const c = comanda
  const accion = accionPendiente(c)
  const viaje = minutosDelivery(c)
  const anulada = c.estado === 'anulada'

  const ticket = useMemo(() => construirTicket(c, {
    ancho: impresoras[0]?.ancho ?? 48, tipo: 'comanda', zonas: catalogo.zonas, nombreLocal: sucursal,
  }), [c, impresoras, catalogo.zonas, sucursal])

  const impresiones = printJobs.filter(j => j.comandaId === c.id)

  return (
    <Modal
      titulo={<span>Comanda #{c.numero} <span className="font-sans text-lg font-semibold capitalize text-gris">{c.tipo}, {hora(c.createdAt)}</span></span>}
      onClose={onClose}
      ancho="max-w-4xl"
      pie={
        <div className="flex flex-wrap items-center gap-2">
          {!anulada && <Btn tono="fantasma" className="text-tomate" onClick={() => setConfirmarAnular(true)}>Anular</Btn>}
          <div className="ml-auto flex flex-wrap gap-2">
            {!anulada && <Btn onClick={() => { editar(c); onClose() }}>Editar pedido</Btn>}
            <Btn onClick={() => reimprimir(c)}>Reimprimir</Btn>
            {c.tipo === 'delivery' && c.repartidorId && accion && (
              <Btn onClick={() => onAccion({ tipo: 'asignar', id: c.id })}>Cambiar moto</Btn>
            )}
            {accion && (
              <Btn tono={accion === 'asignar' ? 'tomate' : 'albahaca'} onClick={() => onAccion({ tipo: accion, id: c.id })}>
                {accion === 'asignar' ? 'Asignar delivery' : 'Entregar pedido'}
              </Btn>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <section className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${anulada ? 'bg-tomate text-white' : c.estado === 'entregado' ? 'bg-linea text-gris' : 'bg-primario text-sobre-primario'}`}>{etiquetaEstado(c)}</span>
            {c.repartidorNombre && (
              <span className="text-[15px]">
                Moto: <b>{c.repartidorNombre}</b>{c.asignadaAt ? `, salió ${hora(c.asignadaAt)}` : ''}
                {viaje != null && <>{c.entregadaAt ? `, tardó ${viaje} min` : `, hace ${viaje} min`}</>}
              </span>
            )}
            {c.entregadaAt && <span className="text-[15px] text-gris">Entregado {hora(c.entregadaAt)}</span>}
          </section>

          {(c.clienteNombre || c.direccion) && (
            <section className="rounded-xl border border-linea bg-superficie p-4">
              <div className="text-lg font-semibold">{c.clienteNombre}</div>
              {c.direccion && <div>{c.direccion}{c.entreCalles ? `, entre ${c.entreCalles}` : ''}</div>}
              {c.clienteTel && <a href={`tel:${c.clienteTel}`} className="text-pizarra underline">{c.clienteTel}</a>}
              {c.horaEntrega && <div className="mt-1 font-semibold text-tomate">Para las {c.horaEntrega}</div>}
            </section>
          )}

          <section className="rounded-xl border border-linea bg-superficie p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-cond text-3xl font-bold">{money(c.total)}</div>
                <div className="text-sm text-gris">
                  {c.pagos.map(p => `${FORMAS_PAGO.find(f => f.key === p.forma)?.label} ${money(p.monto)}`).join(' + ') || 'Sin forma de pago'}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input type="checkbox" className="size-5 accent-albahaca" checked={c.cobrada} disabled={anulada}
                  onChange={e => marcarCobrada(c, e.target.checked)} />
                Cobrada
              </label>
            </div>
          </section>

          {c.observaciones && (
            <section className="rounded-xl bg-muzza-claro p-4"><b>Obs:</b> {c.observaciones}</section>
          )}

          <section>
            <div className="mb-2 text-sm font-medium text-gris">Impresiones</div>
            {impresiones.length ? (
              <ul className="space-y-1 text-[15px]">
                {impresiones.map(j => (
                  <li key={j.id} className="flex justify-between gap-3">
                    <span className="capitalize">{j.tipo} en {impresoras.find(i => i.id === j.impresoraId)?.nombre ?? 'comandera'}</span>
                    <span className={j.estado === 'impreso' ? 'text-albahaca' : j.estado === 'error' ? 'text-tomate' : 'text-gris'}>
                      {j.estado === 'pendiente' ? 'Esperando al spool' : j.estado === 'impreso' ? `Impresa ${j.printedAt ? hora(j.printedAt) : ''}` : j.estado}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[15px] text-gris">Esta comanda no se mandó a imprimir.</p>}
          </section>
        </div>

        <div className="max-w-full overflow-x-auto">
          <TicketPreview lineas={ticket} ancho={impresoras[0]?.ancho ?? 48} />
        </div>
      </div>

      {confirmarAnular && (
        <Confirmar
          texto={`¿Anular la comanda #${c.numero}?`}
          detalle="Se marca como anulada y se imprime un aviso de anulación para la cocina."
          accion="Anular comanda"
          onNo={() => setConfirmarAnular(false)}
          onSi={() => { setConfirmarAnular(false); anular(c); onClose() }}
        />
      )}
    </Modal>
  )
}
