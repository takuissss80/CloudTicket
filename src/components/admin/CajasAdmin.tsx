import { useState } from 'react'
import { useApp } from '../../store/app'
import { HistorialPanel } from '../HistorialCajas'
import { inputBase } from '../ui'

/** Pestaña Caja de Administración: historial de cajas por local */
export function CajasAdmin() {
  const { sesion, sucursales, sucursalId } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  const [local, setLocal] = useState(esAdmin ? sucursalId : sesion?.sucursalId ?? null)

  return (
    <div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-3 px-4 pt-4">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Historial de cajas</h2>
          <p className="text-[15px] text-gris">Cada turno con sus ventas, el efectivo teórico, lo contado al cerrar y la diferencia. Tocá una caja para ver el detalle.</p>
        </div>
        {esAdmin && sucursales.length > 1 && (
          <select aria-label="Local" value={local ?? ''} onChange={e => setLocal(e.target.value)} className={`${inputBase} w-56`}>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
      </div>
      {local && <HistorialPanel sucursalId={local} />}
    </div>
  )
}
