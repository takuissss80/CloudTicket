import { useEffect, useState } from 'react'
import type { Cliente } from '../types'
import { repo } from '../data'
import { useApp } from '../store/app'
import { usePedido } from '../store/pedido'
import { Btn, Campo, Modal, inputCls } from './ui'

/**
 * Datos del cliente de delivery. Lo que se escribe sirve para buscar
 * clientes anteriores; si no aparece, los mismos datos crean uno nuevo.
 */
export function ClienteModal({ onClose }: { onClose: () => void }) {
  const zonas = useApp(s => s.catalogo.zonas)
  const p = usePedido()
  const [d, setD] = useState({
    clienteId: p.clienteId,
    nombre: p.clienteNombre,
    telefono: p.clienteTel,
    direccion: p.direccion,
    entreCalles: p.entreCalles,
    zonaId: p.zonaId ?? '',
  })
  const [resultados, setResultados] = useState<Cliente[]>([])

  const busqueda = { nombre: d.nombre, telefono: d.telefono, direccion: d.direccion }
  const hayBusqueda = !d.clienteId && (d.telefono.replace(/\D/g, '').length >= 3 || d.nombre.trim().length >= 2 || d.direccion.trim().length >= 3)

  useEffect(() => {
    if (!hayBusqueda) { setResultados([]); return }
    const t = setTimeout(() => {
      repo.buscarClientes({
        telefono: busqueda.telefono.replace(/\D/g, '').length >= 3 ? busqueda.telefono : undefined,
        nombre: busqueda.nombre.trim().length >= 2 ? busqueda.nombre.trim() : undefined,
        direccion: busqueda.direccion.trim().length >= 3 ? busqueda.direccion.trim() : undefined,
      }).then(setResultados).catch(() => setResultados([]))
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.nombre, d.telefono, d.direccion, d.clienteId])

  const elegir = (c: Cliente) => {
    setD({
      clienteId: c.id, nombre: c.nombre, telefono: c.telefono ?? '', direccion: c.direccion ?? '',
      entreCalles: c.entreCalles ?? '', zonaId: c.zonaId ?? '',
    })
    setResultados([])
  }

  const cambio = (k: keyof typeof d, v: string) =>
    // si edita nombre/tel/dirección de un cliente elegido, sigue siendo ese cliente (se actualiza al guardar)
    setD(x => ({ ...x, [k]: v }))

  const listo = d.nombre.trim() && d.direccion.trim()

  const aceptar = () => {
    p.set({
      clienteId: d.clienteId,
      clienteNombre: d.nombre.trim(),
      clienteTel: d.telefono.trim(),
      direccion: d.direccion.trim(),
      entreCalles: d.entreCalles.trim(),
      zonaId: d.zonaId || undefined,
      envioManual: undefined,
    })
    onClose()
  }

  return (
    <Modal
      titulo="Cliente del delivery"
      onClose={onClose}
      ancho="max-w-xl"
      pie={
        <div className="flex items-center justify-end gap-2">
          {d.clienteId && <Btn tono="fantasma" onClick={() => setD({ clienteId: undefined, nombre: '', telefono: '', direccion: '', entreCalles: '', zonaId: '' })}>Otro cliente</Btn>}
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" disabled={!listo} onClick={aceptar}>Usar este cliente</Btn>
        </div>
      }
    >
      <form className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (listo) aceptar() }}>
        <Campo label="Teléfono">
          <input autoFocus inputMode="tel" value={d.telefono} onChange={e => cambio('telefono', e.target.value)} className={inputCls} placeholder="Buscá por teléfono" />
        </Campo>
        <Campo label="Nombre">
          <input value={d.nombre} onChange={e => cambio('nombre', e.target.value)} className={inputCls} />
        </Campo>

        {resultados.length > 0 && (
          <div className="sm:col-span-2">
            <div className="mb-1 text-sm font-medium text-gris">Clientes anteriores</div>
            <ul className="divide-y divide-linea overflow-hidden rounded-lg border border-linea bg-white">
              {resultados.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => elegir(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-pizarra-claro">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{c.nombre}</div>
                      <div className="truncate text-sm text-gris">{c.direccion}{c.entreCalles ? `, entre ${c.entreCalles}` : ''}</div>
                    </div>
                    <span className="text-sm tabular-nums text-gris">{c.telefono}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Campo label="Dirección" className="sm:col-span-2">
          <input value={d.direccion} onChange={e => cambio('direccion', e.target.value)} className={inputCls} placeholder="Calle y número" />
        </Campo>
        <Campo label="Entre calles">
          <input value={d.entreCalles} onChange={e => cambio('entreCalles', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Zona de envío">
          <select value={d.zonaId} onChange={e => cambio('zonaId', e.target.value)} className={inputCls}>
            <option value="">Sin zona</option>
            {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre} (${z.costo})</option>)}
          </select>
        </Campo>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
