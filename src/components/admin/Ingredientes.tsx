import { useCallback, useEffect, useState } from 'react'
import type { Ingrediente, Producto, UnidadIngrediente } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { unidadCosto } from '../../lib/menu'
import { normalizar } from '../../lib/format'
import { Btn, inputBase, inputCls } from '../ui'

const UNIDADES: { key: UnidadIngrediente; label: string }[] = [
  { key: 'un', label: 'Unidades' },
  { key: 'g', label: 'Gramos' },
  { key: 'ml', label: 'Mililitros' },
]

/** Ingredientes de la cuenta: unidad de medida y costo de compra */
export function Ingredientes() {
  const { avisar, refrescarMenu } = useApp()
  const [ingredientes, setIngredientes] = useState<Ingrediente[] | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState({ nombre: '', unidad: 'g' as UnidadIngrediente, costo: '' })

  const cargar = useCallback(async () => {
    const m = await repo.getMenu(null)
    setIngredientes([...m.ingredientes].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setProductos(m.productos)
  }, [])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])

  const guardar = async (i: Ingrediente, cambios: Partial<Ingrediente>) => {
    try {
      await repo.guardarIngrediente({ ...i, ...cambios })
      await cargar()
      await refrescarMenu()
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  const agregar = async () => {
    if (!nuevo.nombre.trim()) return
    try {
      await repo.guardarIngrediente({ nombre: nuevo.nombre.trim(), unidad: nuevo.unidad, costo: Number(nuevo.costo.replace(',', '.')) || 0, activo: true })
      setNuevo({ nombre: '', unidad: nuevo.unidad, costo: '' })
      await cargar()
      avisar('Ingrediente agregado')
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  if (!ingredientes) return <p className="p-8 text-center text-gris">Cargando ingredientes…</p>

  const usos = (id: string) => productos.filter(p => p.receta.some(r => r.ingredienteId === id))
  const visibles = ingredientes.filter(i => !filtro || normalizar(i.nombre).includes(normalizar(filtro)))

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Ingredientes</h2>
          <p className="text-[15px] text-gris">El costo se carga como lo comprás: por kilo, por litro o por unidad. Al cambiarlo se recalcula el costo de todos los productos que lo usan.</p>
        </div>
        <input id="ing-buscar" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar ingrediente" className={`${inputBase} h-10 w-56`} />
      </div>

      <form onSubmit={e => { e.preventDefault(); agregar() }} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-superficie p-3 ring-1 ring-linea">
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-sm font-medium text-gris">Nuevo ingrediente</span>
          <input id="ing-nuevo-nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} className={inputCls} placeholder="Muzzarella" />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-gris">Se mide en</span>
          <select id="ing-nuevo-unidad" value={nuevo.unidad} onChange={e => setNuevo({ ...nuevo, unidad: e.target.value as UnidadIngrediente })} className={`${inputBase} w-36`}>
            {UNIDADES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-gris">Costo por {unidadCosto(nuevo.unidad)}</span>
          <input id="ing-nuevo-costo" inputMode="decimal" value={nuevo.costo} onChange={e => setNuevo({ ...nuevo, costo: e.target.value })} className={`${inputBase} w-32 text-right`} placeholder="0" />
        </label>
        <Btn tono="albahaca" className="h-11" disabled={!nuevo.nombre.trim()}>Agregar</Btn>
      </form>

      <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
        <table className="w-full min-w-[620px] text-left">
          <thead className="border-b border-linea text-sm text-gris">
            <tr>
              <th className="px-3 py-2 font-medium">Ingrediente</th>
              <th className="px-3 py-2 font-medium">Se mide en</th>
              <th className="px-3 py-2 text-right font-medium">Costo</th>
              <th className="px-3 py-2 font-medium">Se usa en</th>
              <th className="px-3 py-2 text-center font-medium">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {visibles.map(i => {
              const u = usos(i.id)
              return (
                <tr key={i.id} className={i.activo ? '' : 'text-gris'}>
                  <td className="px-3 py-2">
                    <CampoTexto valor={i.nombre} etiqueta="Nombre del ingrediente" onGuardar={v => v && guardar(i, { nombre: v })} />
                  </td>
                  <td className="px-3 py-2">
                    <select aria-label={`Unidad de ${i.nombre}`} value={i.unidad} onChange={e => guardar(i, { unidad: e.target.value as UnidadIngrediente })}
                      className="h-9 rounded-lg border border-linea bg-superficie px-2">
                      {UNIDADES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <CampoTexto valor={String(i.costo)} numerico etiqueta={`Costo de ${i.nombre}`}
                        onGuardar={v => guardar(i, { costo: Number(v.replace(',', '.')) || 0 })} />
                      <span className="w-14 text-left text-sm text-gris">por {unidadCosto(i.unidad)}</span>
                    </div>
                  </td>
                  <td className="max-w-56 px-3 py-2 text-sm text-gris">
                    {u.length ? <span title={u.map(p => p.nombre).join(', ')}>{u.length} {u.length === 1 ? 'producto' : 'productos'}</span> : 'Sin usar'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" aria-label={`${i.nombre} activo`} className="size-5 accent-albahaca" checked={i.activo} onChange={e => guardar(i, { activo: e.target.checked })} />
                  </td>
                </tr>
              )
            })}
            {!visibles.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-gris">{filtro ? `No hay ingredientes con “${filtro}”.` : 'Todavía no cargaste ingredientes.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Input que guarda al salir del campo o con Enter */
export function CampoTexto({ valor, etiqueta, numerico, onGuardar, className = '' }: {
  valor: string; etiqueta: string; numerico?: boolean; onGuardar: (v: string) => void; className?: string
}) {
  const [t, setT] = useState(valor)
  useEffect(() => setT(valor), [valor])
  return (
    <input aria-label={etiqueta} value={t} inputMode={numerico ? 'decimal' : undefined}
      onChange={e => setT(e.target.value)}
      onBlur={() => { if (t.trim() !== valor) onGuardar(t.trim()) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setT(valor); (e.target as HTMLInputElement).blur() } }}
      className={`h-9 rounded-lg border border-transparent bg-transparent px-2 outline-none hover:border-linea focus:border-pizarra focus:bg-superficie ${numerico ? 'w-28 text-right tabular-nums' : 'w-full font-medium'} ${className}`} />
  )
}
