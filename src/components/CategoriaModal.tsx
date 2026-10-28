import { useMemo, useState } from 'react'
import type { Categoria, Coccion, Producto, Variante } from '../types'
import { useApp } from '../store/app'
import { itemProducto, itemPromo, usePedido } from '../store/pedido'
import { money } from '../lib/format'
import { Btn, Modal, Stepper } from './ui'

type Clave = `${string}|${Variante}|${Coccion | ''}`
const clave = (id: string, v: Variante, c?: Coccion): Clave => `${id}|${v}|${c ?? ''}`

/**
 * Selección de productos de una categoría. Se arma un borrador con las cantidades
 * y al confirmar se suma todo al pedido (como en el sistema actual).
 */
export function CategoriaModal({ categoria, onClose, onPromo }: {
  categoria: Categoria
  onClose: () => void
  onPromo: (p: Producto) => void
}) {
  const productos = useApp(s => s.catalogo.productos)
  const agregar = usePedido(s => s.agregar)
  const marcarAgotado = useApp(s => s.marcarAgotado)
  const [borrador, setBorrador] = useState<Record<Clave, number>>({})
  const [filtro, setFiltro] = useState('')

  const delCat = useMemo(() => productos.filter(p => p.categoriaId === categoria.id), [productos, categoria.id])
  const f = filtro.trim().toLowerCase()
  const visibles = f ? delCat.filter(p => (p.nombre + ' ' + (p.codigo ?? '') + ' ' + (p.descripcion ?? '')).toLowerCase().includes(f)) : delCat
  const extras = visibles.filter(p => p.tipo === 'extra')
  const principales = visibles.filter(p => p.tipo !== 'extra')

  const cant = (id: string, v: Variante, c?: Coccion) => borrador[clave(id, v, c)] ?? 0
  const setCant = (id: string, v: Variante, c: Coccion | undefined, n: number) =>
    setBorrador(b => ({ ...b, [clave(id, v, c)]: Math.max(0, n) }))

  const lista = Object.entries(borrador).filter(([, n]) => n > 0) as [Clave, number][]
  const totalUnidades = lista.reduce((s, [, n]) => s + n, 0)
  const totalPlata = lista.reduce((s, [k, n]) => {
    const [id, v] = k.split('|') as [string, Variante]
    const p = productos.find(x => x.id === id)
    if (!p) return s
    return s + n * (v === 'mitad' ? p.precioMitad ?? p.precio : p.precio)
  }, 0)

  const confirmar = () => {
    for (const [k, n] of lista) {
      const [id, v, c] = k.split('|') as [string, Variante, Coccion | '']
      const p = productos.find(x => x.id === id)
      if (!p) continue
      if (p.tipo === 'promo') agregar({ ...itemPromo(p, [], productos), cantidad: n })
      else agregar(itemProducto(p, v, n, c || undefined))
    }
    onClose()
  }

  const fila = (p: Producto) => {
    const tieneSlots = p.tipo === 'promo' && p.slots.length > 0
    return (
      <div key={p.id} className={`flex flex-col rounded-xl border border-linea p-3 ${p.agotado ? 'bg-harina' : 'bg-white'}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className={`font-cond text-xl font-bold leading-tight ${p.agotado ? 'text-gris line-through' : ''}`}>{p.nombre}</div>
            {p.descripcion && <div className="mt-0.5 text-sm leading-snug text-gris">{p.descripcion}</div>}
          </div>
          {p.codigo && <span className="rounded bg-harina px-1.5 py-0.5 text-xs font-semibold text-gris">{p.codigo}</span>}
        </div>

        <div className="mt-auto pt-3">
          {p.agotado ? (
            <div className="flex items-center justify-between gap-2">
              <span className="rounded bg-tomate px-2 py-0.5 text-sm font-bold text-white">Agotado</span>
              <button className="text-sm font-semibold text-pizarra hover:underline" onClick={() => marcarAgotado(p.id, false)}>Volver a disponible</button>
            </div>
          ) : tieneSlots ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-cond text-xl font-bold">{money(p.precio)}</span>
              <Btn tono="albahaca" onClick={() => { if (!totalUnidades) onClose(); onPromo(p) }}>Armar promo</Btn>
            </div>
          ) : p.precioMitad != null ? (
            <div className="space-y-2">
              {(['entera', 'mitad'] as const).map(v => (
                <div key={v} className="flex items-center justify-between gap-2">
                  <span className="text-[15px]"><span className="font-semibold capitalize">{v}</span> <span className="text-gris">{money(v === 'mitad' ? p.precioMitad! : p.precio)}</span></span>
                  <Stepper valor={cant(p.id, v)} onChange={n => setCant(p.id, v, undefined, n)} />
                </div>
              ))}
            </div>
          ) : p.admiteCoccion ? (
            <div className="space-y-2">
              <div className="text-sm text-gris">{money(p.precio)} c/u</div>
              {(['horno', 'frita'] as const).map(c => (
                <div key={c} className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold capitalize">{c}</span>
                  <Stepper valor={cant(p.id, 'unica', c)} onChange={n => setCant(p.id, 'unica', c, n)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="font-cond text-xl font-bold">{money(p.precio)}</span>
              <Stepper valor={cant(p.id, 'unica')} onChange={n => setCant(p.id, 'unica', undefined, n)} />
            </div>
          )}
          {!p.agotado && (
            <button className="mt-2 text-xs font-semibold text-gris hover:text-tomate hover:underline" onClick={() => marcarAgotado(p.id, true)}>Marcar agotado</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Modal
      titulo={categoria.nombre}
      onClose={onClose}
      ancho="max-w-5xl"
      alto
      pie={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-gris">
            {totalUnidades ? <><b className="text-tinta">{totalUnidades}</b> {totalUnidades === 1 ? 'unidad' : 'unidades'}, <b className="text-tinta">{money(totalPlata)}</b></> : 'Elegí cantidades con + y −'}
          </div>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" grande disabled={!totalUnidades} onClick={confirmar}>Agregar al pedido</Btn>
        </div>
      }
    >
      <div className="sticky top-0 z-10 bg-papel/95 px-5 pt-4 pb-3 backdrop-blur">
        <input
          autoFocus
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Filtrar por nombre o código"
          className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-[16px] outline-none focus:border-pizarra"
        />
      </div>
      <div className="px-5 pb-5">
        {extras.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 font-cond text-lg font-bold text-gris">Extras</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map(p => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border border-dashed border-linea bg-white/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.nombre}</div>
                    <div className="text-sm text-gris">{money(p.precio)}</div>
                  </div>
                  {p.agotado
                    ? <button className="text-sm font-bold text-tomate" title="Volver a disponible" onClick={() => marcarAgotado(p.id, false)}>Agotado</button>
                    : <Stepper tam="sm" valor={cant(p.id, 'unica')} onChange={n => setCant(p.id, 'unica', undefined, n)} />}
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {principales.map(fila)}
        </div>
        {!visibles.length && <p className="py-10 text-center text-gris">Nada coincide con “{filtro}”.</p>}
      </div>
    </Modal>
  )
}
