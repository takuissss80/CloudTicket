import { useState } from 'react'
import type { Comanda, Pago } from '../types'
import { FORMAS_PAGO } from '../types'
import { useApp } from '../store/app'
import { repo } from '../data'
import { mensajeError } from '../store/app'
import { hora, money } from '../lib/format'
import { minutosDelivery } from '../lib/estados'
import { Btn, Modal, inputBase } from './ui'

const numero = (v: string) => (v.trim() === '' ? 0 : Math.max(0, Number(v.replace(',', '.')) || 0))

/** Delivery: elegir la moto. Al asignarla arranca el contador. */
export function AsignarRepartidorModal({ comanda, onClose }: { comanda: Comanda; onClose: () => void }) {
  const { repartidores, asignarRepartidor, cargarRepartidores, sucursalId, avisar } = useApp()
  const [nuevo, setNuevo] = useState<{ nombre: string; dni: string; telefono: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const activos = repartidores.filter(r => r.activo)

  const asignar = async (id: string) => {
    setEnviando(true)
    const ok = await asignarRepartidor(comanda, id)
    setEnviando(false)
    if (ok) onClose()
  }

  const crear = async () => {
    if (!nuevo || !sucursalId) return
    try {
      const r = await repo.guardarRepartidor(sucursalId, { ...nuevo, activo: true })
      await cargarRepartidores()
      setNuevo(null)
      avisar(`${r.nombre} agregado`)
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  return (
    <Modal titulo={`Asignar delivery a la #${comanda.numero}`} onClose={onClose} ancho="max-w-lg">
      <div className="space-y-4 p-5">
        {comanda.direccion && <p className="text-[15px] text-gris">{comanda.clienteNombre}, {comanda.direccion}{comanda.entreCalles ? `, entre ${comanda.entreCalles}` : ''}</p>}

        {activos.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {activos.map(r => (
              <button key={r.id} disabled={enviando} onClick={() => asignar(r.id)}
                className="flex flex-col items-start rounded-xl bg-white px-4 py-3 text-left ring-1 ring-linea hover:bg-tomate-claro hover:ring-tomate disabled:opacity-50">
                <span className="font-cond text-2xl font-bold">{r.nombre}</span>
                <span className="text-sm text-gris">{[r.telefono, r.dni && `DNI ${r.dni}`].filter(Boolean).join(', ') || 'Sin datos de contacto'}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-muzza-claro p-4">Este local todavía no tiene repartidores. Cargá el primero para poder asignarlo.</p>
        )}

        {nuevo ? (
          <form className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-linea" onSubmit={e => { e.preventDefault(); crear() }}>
            <div className="font-semibold">Nuevo repartidor</div>
            <input autoFocus aria-label="Nombre" placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} className={`${inputBase} w-full`} />
            <div className="flex gap-2">
              <input aria-label="DNI" inputMode="numeric" placeholder="DNI" value={nuevo.dni} onChange={e => setNuevo({ ...nuevo, dni: e.target.value.replace(/\D/g, '') })} className={`${inputBase} min-w-0 flex-1`} />
              <input aria-label="Teléfono" inputMode="tel" placeholder="Teléfono" value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} className={`${inputBase} min-w-0 flex-1`} />
            </div>
            <div className="flex justify-end gap-2">
              <Btn type="button" onClick={() => setNuevo(null)}>Cancelar</Btn>
              <Btn tono="albahaca" disabled={!nuevo.nombre.trim()}>Guardar repartidor</Btn>
            </div>
          </form>
        ) : (
          <Btn tono="fantasma" onClick={() => setNuevo({ nombre: '', dni: '', telefono: '' })}>+ Nuevo repartidor</Btn>
        )}
      </div>
    </Modal>
  )
}

/** Entregar el pedido: confirmar o cambiar la forma de pago */
export function EntregarModal({ comanda, onClose }: { comanda: Comanda; onClose: () => void }) {
  const entregar = useApp(s => s.entregar)
  const [pagos, setPagos] = useState<Pago[]>(() => comanda.pagos.length ? comanda.pagos.map(p => ({ ...p })) : [{ forma: 'efectivo', monto: comanda.total }])
  const [cobrada, setCobrada] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const pagado = pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const vuelto = pagado - comanda.total
  const mins = minutosDelivery(comanda)

  const setPago = (i: number, p: Partial<Pago>) => setPagos(ps => ps.map((x, j) => j === i ? { ...x, ...p } : x))

  const confirmar = async () => {
    setEnviando(true)
    const ok = await entregar(comanda, pagos, cobrada)
    setEnviando(false)
    if (ok) onClose()
  }

  return (
    <Modal
      titulo={`Entregar pedido #${comanda.numero}`}
      onClose={onClose}
      ancho="max-w-lg"
      pie={
        <div className="flex items-center gap-2">
          <span className="mr-auto font-cond text-3xl font-bold">{money(comanda.total)}</span>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" grande disabled={enviando || (cobrada && vuelto < -0.009)} onClick={confirmar}>Entregar pedido</Btn>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        {comanda.tipo === 'delivery' && comanda.repartidorNombre && (
          <p className="rounded-xl bg-white p-3 ring-1 ring-linea">
            Salió con <b>{comanda.repartidorNombre}</b>{comanda.asignadaAt ? ` a las ${hora(comanda.asignadaAt)}` : ''}
            {mins != null && <>, hace <b>{mins} min</b></>}
          </p>
        )}
        <div>
          <div className="mb-2 text-sm font-medium text-gris">¿Cómo pagó?</div>
          <div className="space-y-2">
            {pagos.map((pg, i) => (
              <div key={i} className="rounded-xl bg-white p-2 ring-1 ring-linea">
                <div className="flex flex-wrap gap-1">
                  {FORMAS_PAGO.map(f => (
                    <button key={f.key} type="button" onClick={() => setPago(i, { forma: f.key })}
                      className={`h-10 rounded-lg px-3 font-semibold ${pg.forma === f.key ? 'bg-pizarra text-white' : 'bg-harina hover:bg-linea'}`}>{f.label}</button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="text-sm text-gris">{pg.forma === 'efectivo' ? 'Paga con' : 'Monto'}</span>
                  <input aria-label="Monto" inputMode="decimal" value={pg.monto || ''} onChange={e => setPago(i, { monto: numero(e.target.value) })}
                    className={`${inputBase} w-32 text-right font-semibold`} />
                  {pagos.length > 1 && <Btn tono="fantasma" aria-label="Quitar pago" onClick={() => setPagos(pagos.filter((_, j) => j !== i))}>×</Btn>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center">
            <Btn tono="fantasma" onClick={() => setPagos([...pagos, { forma: 'mercado_pago', monto: Math.max(0, comanda.total - pagado) }])}>+ Dividir pago</Btn>
            <span className="ml-auto text-[15px]">
              {vuelto > 0.009 ? <>Vuelto <b className="font-cond text-2xl">{money(vuelto)}</b></>
                : vuelto < -0.009 ? <span className="text-tomate">Falta {money(-vuelto)}</span>
                : <span className="text-albahaca">Pago justo</span>}
            </span>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-linea">
          <input type="checkbox" className="size-5 accent-albahaca" checked={cobrada} onChange={e => setCobrada(e.target.checked)} />
          <span className="font-semibold">Cobrado</span>
          <span className="text-sm text-gris">Desmarcalo si queda debiendo</span>
        </label>
      </div>
    </Modal>
  )
}
