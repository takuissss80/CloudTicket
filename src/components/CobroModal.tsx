import { useEffect, useMemo, useState } from 'react'
import type { Comanda } from '../types'
import { FORMAS_PAGO } from '../types'
import { useApp, useNombreLocal } from '../store/app'
import { totales, usePedido } from '../store/pedido'
import { construirTicket } from '../lib/ticket'
import { money } from '../lib/format'
import { Btn, Campo, Modal, inputBase, inputCls } from './ui'
import { TicketPreview } from './TicketPreview'

/** Revisar el pedido, cobrar y mandar a la comandera */
export function CobroModal({ onClose }: { onClose: () => void }) {
  const p = usePedido()
  const { catalogo, comandas, impresoras, guardarPedido } = useApp()
  const sucursal = useNombreLocal()
  const { subtotal, envio, total } = totales(p, catalogo.zonas, catalogo.productos)
  const [guardando, setGuardando] = useState(false)

  // Primera vez: un pago por el total y "cobrado" según el tipo
  useEffect(() => {
    if (!p.pagos.length && !p.editandoId) {
      p.set({ pagos: [{ forma: 'efectivo', monto: total }], cobrada: p.tipo === 'mostrador' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const envioIncluido = p.items.some(i => catalogo.productos.find(x => x.id === i.productoId)?.incluyeEnvio)
  const pagado = p.pagos.reduce((s, x) => s + (x.monto || 0), 0)
  const vuelto = pagado - total

  const vistaPrevia = useMemo(() => {
    const c: Comanda = {
      id: 'preview', cajaId: '', numero: p.editandoNumero ?? Math.max(0, ...comandas.map(x => x.numero)) + 1,
      tipo: p.tipo, estado: 'pendiente', clienteNombre: p.clienteNombre || undefined, clienteTel: p.clienteTel || undefined,
      direccion: p.direccion || undefined, entreCalles: p.entreCalles || undefined, zonaId: p.zonaId,
      costoEnvio: envio, subtotal, descuento: p.descuento || 0, adicional: p.adicional || 0, total,
      observaciones: p.observaciones || undefined, horaEntrega: p.horaEntrega || undefined,
      cobrada: p.cobrada, pagos: p.pagos.filter(x => x.monto > 0), items: p.items,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    return construirTicket(c, {
      ancho: impresoras[0]?.ancho ?? 48, tipo: p.editandoId ? 'reimpresion' : 'comanda',
      zonas: catalogo.zonas, nombreLocal: sucursal,
    })
  }, [p, envio, subtotal, total, comandas, impresoras, catalogo.zonas, sucursal])

  const guardar = async (imprimir: boolean) => {
    setGuardando(true)
    const ok = await guardarPedido(imprimir)
    setGuardando(false)
    if (ok) onClose()
  }

  const numero = (v: string) => (v === '' ? 0 : Math.max(0, Number(v.replace(',', '.')) || 0))

  return (
    <Modal
      titulo={p.editandoId ? `Guardar cambios de la comanda #${p.editandoNumero}` : 'Revisar y cobrar'}
      onClose={onClose}
      ancho="max-w-5xl"
      alto
      pie={
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto font-cond text-3xl font-bold">Total {money(total)}</div>
          <Btn onClick={onClose}>Seguir cargando</Btn>
          <Btn disabled={guardando} onClick={() => guardar(false)}>Guardar sin imprimir</Btn>
          <Btn tono="albahaca" grande disabled={guardando} onClick={() => guardar(true)}>
            {guardando ? 'Guardando…' : 'Guardar e imprimir'}
          </Btn>
        </div>
      }
    >
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo label="Para las">
              <input type="time" value={p.horaEntrega} onChange={e => p.set({ horaEntrega: e.target.value })} className={inputCls} />
            </Campo>
            {p.tipo === 'delivery' && (
              <Campo label="Envío">
                <input inputMode="decimal" value={envio || ''} placeholder="0" onChange={e => p.set({ envioManual: numero(e.target.value) })} className={inputCls} />
                {envioIncluido && p.envioManual == null && <span className="mt-1 block text-xs text-albahaca">Incluido en la promo</span>}
              </Campo>
            )}
            <Campo label="Descuento $">
              <input inputMode="decimal" value={p.descuento || ''} placeholder="0" onChange={e => p.set({ descuento: numero(e.target.value) })} className={inputCls} />
            </Campo>
            <Campo label="Adicional $">
              <input inputMode="decimal" value={p.adicional || ''} placeholder="0" onChange={e => p.set({ adicional: numero(e.target.value) })} className={inputCls} />
            </Campo>
          </section>

          <Campo label="Observaciones para cocina o delivery">
            <textarea rows={2} value={p.observaciones} onChange={e => p.set({ observaciones: e.target.value })}
              className={`${inputCls} h-auto py-2`} placeholder="Ej: tocar timbre del fondo" />
          </Campo>

          <section>
            <h3 className="mb-2 font-cond text-2xl font-bold">Pago</h3>
            <div className="space-y-2">
              {p.pagos.map((pg, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-linea bg-superficie p-2">
                  <div className="flex flex-wrap gap-1">
                    {FORMAS_PAGO.map(f => (
                      <button key={f.key} type="button" onClick={() => p.setPago(i, { forma: f.key })}
                        className={`h-10 rounded-lg px-3 font-semibold ${pg.forma === f.key ? 'bg-pizarra text-white' : 'bg-harina text-tinta hover:bg-linea'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm text-gris">{pg.forma === 'efectivo' ? 'Paga con' : 'Monto'}</span>
                    <input inputMode="decimal" value={pg.monto || ''} onChange={e => p.setPago(i, { monto: numero(e.target.value) })}
                      className={`${inputBase} w-32 text-right font-semibold`} />
                    {p.pagos.length > 1 && <Btn tono="fantasma" aria-label="Quitar pago" onClick={() => p.quitarPago(i)}>×</Btn>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Btn tono="fantasma" onClick={() => p.agregarPago('mercado_pago', Math.max(0, total - pagado))}>+ Dividir pago</Btn>
              <span className="ml-auto text-[15px]">
                {vuelto > 0.009 ? <>Vuelto <b className="font-cond text-2xl">{money(vuelto)}</b></>
                  : vuelto < -0.009 ? <span className="text-tomate">Falta {money(-vuelto)}</span>
                  : <span className="text-albahaca">Pago justo</span>}
              </span>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-linea bg-superficie px-4 py-3">
              <input type="checkbox" className="size-5 accent-albahaca" checked={p.cobrada} onChange={e => p.set({ cobrada: e.target.checked })} />
              <span className="font-semibold">Ya está cobrado</span>
              <span className="text-sm text-gris">{p.tipo === 'delivery' ? 'Dejalo sin marcar si cobra el repartidor' : 'Desmarcá si paga al retirar'}</span>
            </label>
          </section>

          <section className="rounded-xl bg-harina p-4 text-[15px]">
            <div className="flex justify-between"><span>Productos</span><span className="tabular-nums">{money(subtotal)}</span></div>
            {p.tipo === 'delivery' && <div className="flex justify-between"><span>Envío</span><span className="tabular-nums">{money(envio)}</span></div>}
            {!!p.adicional && <div className="flex justify-between"><span>Adicional</span><span className="tabular-nums">{money(p.adicional)}</span></div>}
            {!!p.descuento && <div className="flex justify-between"><span>Descuento</span><span className="tabular-nums">−{money(p.descuento)}</span></div>}
          </section>
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-2 text-sm font-medium text-gris">Así sale en la comandera</div>
          <div className="max-w-full overflow-x-auto pb-2">
            <TicketPreview lineas={vistaPrevia} ancho={impresoras[0]?.ancho ?? 48} />
          </div>
        </aside>
      </div>
    </Modal>
  )
}
