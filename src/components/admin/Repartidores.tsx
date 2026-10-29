import { useCallback, useEffect, useState } from 'react'
import type { Repartidor } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { Btn, inputBase } from '../ui'
import { CampoTexto } from './Ingredientes'

/** Motos de cada local: nombre, DNI y teléfono */
export function Repartidores() {
  const { sesion, sucursales, sucursalId, avisar, cargarRepartidores } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  const [local, setLocal] = useState(esAdmin ? sucursalId : sesion?.sucursalId ?? null)
  const [lista, setLista] = useState<Repartidor[] | null>(null)
  const [nuevo, setNuevo] = useState({ nombre: '', dni: '', telefono: '' })

  const cargar = useCallback(async () => { if (local) setLista(await repo.listRepartidores(local)) }, [local])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])

  const guardar = async (r: Omit<Repartidor, 'id'> & { id?: string }, ok?: string) => {
    if (!local) return
    try {
      await repo.guardarRepartidor(local, r)
      await cargar()
      if (local === sucursalId) await cargarRepartidores()
      if (ok) avisar(ok)
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Repartidores</h2>
          <p className="text-[15px] text-gris">Las motos que se pueden asignar a los pedidos de delivery de cada local.</p>
        </div>
        {esAdmin && sucursales.length > 1 && (
          <select aria-label="Local" value={local ?? ''} onChange={e => setLocal(e.target.value)} className={`${inputBase} w-56`}>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); guardar({ ...nuevo, activo: true }, `${nuevo.nombre} agregado`).then(() => setNuevo({ nombre: '', dni: '', telefono: '' })) }}
        className="flex flex-wrap items-end gap-2 rounded-xl bg-superficie p-3 ring-1 ring-linea">
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-sm font-medium text-gris">Nombre</span>
          <input id="rep-nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} className={`${inputBase} w-full`} placeholder="Ariel" />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-gris">DNI</span>
          <input id="rep-dni" inputMode="numeric" value={nuevo.dni} onChange={e => setNuevo({ ...nuevo, dni: e.target.value.replace(/\D/g, '') })} className={`${inputBase} w-36`} />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-gris">Teléfono</span>
          <input id="rep-tel" inputMode="tel" value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} className={`${inputBase} w-40`} />
        </label>
        <Btn tono="albahaca" className="h-11" disabled={!nuevo.nombre.trim()}>Agregar</Btn>
      </form>

      <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
        <table className="w-full min-w-[520px] text-left">
          <thead className="border-b border-linea text-sm text-gris">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">DNI</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 text-center font-medium">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {(lista ?? []).map(r => (
              <tr key={r.id} className={r.activo ? '' : 'text-gris'}>
                <td className="px-3 py-1.5"><CampoTexto valor={r.nombre} etiqueta="Nombre" onGuardar={v => v && guardar({ ...r, nombre: v })} /></td>
                <td className="px-3 py-1.5"><CampoTexto valor={r.dni ?? ''} etiqueta={`DNI de ${r.nombre}`} onGuardar={v => guardar({ ...r, dni: v.replace(/\D/g, '') })} /></td>
                <td className="px-3 py-1.5"><CampoTexto valor={r.telefono ?? ''} etiqueta={`Teléfono de ${r.nombre}`} onGuardar={v => guardar({ ...r, telefono: v })} /></td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" aria-label={`${r.nombre} activo`} className="size-5 accent-albahaca" checked={r.activo} onChange={e => guardar({ ...r, activo: e.target.checked })} />
                </td>
              </tr>
            ))}
            {lista && !lista.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-gris">Todavía no hay repartidores en este local.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
