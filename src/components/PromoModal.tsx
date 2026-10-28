import { useState } from 'react'
import type { Coccion, Componente, Producto } from '../types'
import { useApp } from '../store/app'
import { itemPromo, usePedido } from '../store/pedido'
import { money } from '../lib/format'
import { Btn, Modal, Stepper, inputBase } from './ui'

/** Armado de una promo: productos fijos + grupos "elegí N" */
export function PromoModal({ promo, onClose }: { promo: Producto; onClose: () => void }) {
  const productos = useApp(s => s.catalogo.productos)
  const agregar = usePedido(s => s.agregar)
  // slotId -> "productoId|coccion" -> cantidad
  const [sel, setSel] = useState<Record<string, Record<string, number>>>({})
  const [nota, setNota] = useState('')

  const elegidosEn = (slotId: string) => Object.values(sel[slotId] ?? {}).reduce((s, n) => s + n, 0)
  const completo = promo.slots.every(s => elegidosEn(s.id) === s.cantidad)

  const setCant = (slotId: string, k: string, n: number) =>
    setSel(s => ({ ...s, [slotId]: { ...(s[slotId] ?? {}), [k]: Math.max(0, n) } }))

  const confirmar = () => {
    const elegidos: Componente[] = []
    for (const slot of promo.slots) {
      for (const [k, n] of Object.entries(sel[slot.id] ?? {})) {
        if (!n) continue
        const [id, c] = k.split('|')
        const p = productos.find(x => x.id === id)
        if (p) elegidos.push({ productoId: p.id, descripcion: p.nombre, cantidad: n, coccion: (c || undefined) as Coccion | undefined })
      }
    }
    agregar(itemPromo(promo, elegidos, productos, nota))
    onClose()
  }

  return (
    <Modal
      titulo={<span>{promo.nombre} <span className="text-gris">{money(promo.precio)}</span></span>}
      onClose={onClose}
      ancho="max-w-4xl"
      alto
      pie={
        <div className="flex flex-wrap items-center gap-3">
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota para cocina (opcional)" className={`${inputBase} min-w-48 flex-1`} />
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" grande disabled={!completo} onClick={confirmar}>Agregar promo</Btn>
        </div>
      }
    >
      <div className="space-y-6 p-5">
        {promo.descripcion && <p className="text-gris">{promo.descripcion}</p>}

        {promo.slots.map(slot => {
          const elegidos = elegidosEn(slot.id)
          const faltan = slot.cantidad - elegidos
          const opciones = productos.filter(p => p.categoriaId === slot.categoriaId && p.tipo === 'producto' && !p.agotado)
          return (
            <section key={slot.id}>
              <div className="mb-3 flex items-baseline gap-3">
                <h3 className="font-cond text-2xl font-bold">{slot.nombre}</h3>
                <span className={`rounded-full px-3 py-0.5 font-semibold ${faltan ? 'bg-muzza-claro text-tinta' : 'bg-albahaca-claro text-albahaca'}`}>
                  {faltan ? `Elegí ${faltan} más (${elegidos} de ${slot.cantidad})` : `Listo: ${slot.cantidad} de ${slot.cantidad}`}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {opciones.map(p => {
                  const variantes: (Coccion | '')[] = p.admiteCoccion ? ['horno', 'frita'] : ['']
                  return (
                    <div key={p.id} className="rounded-xl border border-linea bg-white p-3">
                      <div className="flex items-baseline gap-2">
                        {p.codigo && <span className="font-cond text-lg font-bold text-tomate">{p.codigo}</span>}
                        <span className="font-semibold">{p.nombre}</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {variantes.map(c => {
                          const k = `${p.id}|${c}`
                          const v = sel[slot.id]?.[k] ?? 0
                          return (
                            <div key={c} className="flex items-center justify-between">
                              <span className="text-sm font-medium capitalize text-gris">{c || 'Cantidad'}</span>
                              <Stepper tam="sm" valor={v} max={v + faltan} onChange={n => setCant(slot.id, k, n)} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        {promo.fijos.length > 0 && (
          <section>
            <h3 className="mb-2 font-cond text-2xl font-bold">Incluye</h3>
            <ul className="flex flex-wrap gap-2">
              {promo.fijos.map((f, i) => {
                const p = productos.find(x => x.id === f.productoId)
                return (
                  <li key={i} className="rounded-lg bg-pizarra-claro px-3 py-2 font-semibold text-pizarra">
                    {f.cantidad} × {p?.nombre}{f.variante === 'mitad' ? ' (mitad)' : ''}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
