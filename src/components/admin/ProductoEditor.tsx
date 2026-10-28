import { useState } from 'react'
import type { Categoria, Ingrediente, Producto, PromoSlot, RecetaItem, PromoFijo } from '../../types'
import type { ProductoEdicion } from '../../data/repo'
import { repo } from '../../data'
import { mensajeError } from '../../store/app'
import { costoProducto, divisorUnidad, margen, unidadCorta } from '../../lib/menu'
import { money } from '../../lib/format'
import { Btn, Campo, Modal, inputBase, inputCls } from '../ui'

const numero = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v.replace(',', '.')) || 0))

export function ProductoEditor({ producto, categoriaId, sucursalId, categorias, productos, ingredientes, onClose, onGuardado }: {
  /** null = producto nuevo */
  producto: Producto | null
  categoriaId?: string
  /** Para productos propios de un local */
  sucursalId?: string
  categorias: Categoria[]
  productos: Producto[]
  ingredientes: Ingrediente[]
  onClose: () => void
  onGuardado: (p: Producto) => void
}) {
  const [p, setP] = useState<ProductoEdicion>(() => producto ? structuredClone(producto) : {
    categoriaId: categoriaId ?? categorias[0]?.id ?? '', sucursalId, tipo: 'producto', nombre: '', precio: 0,
    admiteCoccion: false, incluyeEnvio: false, orden: productos.length, activo: true, receta: [], fijos: [], slots: [],
  })
  const [porMitad, setPorMitad] = useState(p.precioMitad != null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (x: Partial<ProductoEdicion>) => setP(prev => ({ ...prev, ...x }))

  const comoProducto = { ...p, id: p.id ?? 'nuevo', precioMitad: porMitad ? p.precioMitad : undefined } as Producto
  const costo = costoProducto(comoProducto, productos, ingredientes)
  const vendibles = productos.filter(x => x.tipo !== 'promo' && x.activo && x.id !== p.id)
  const esPromo = p.tipo === 'promo'

  // ---- Receta
  const setReceta = (receta: RecetaItem[]) => set({ receta })
  const disponibles = ingredientes.filter(i => i.activo && !p.receta.some(r => r.ingredienteId === i.id))

  // ---- Promo
  const setFijos = (fijos: PromoFijo[]) => set({ fijos })
  const setSlots = (slots: PromoSlot[]) => set({ slots })

  const guardar = async () => {
    setError('')
    if (!p.nombre.trim()) return setError('Poné un nombre al producto.')
    if (!p.categoriaId) return setError('Elegí una categoría.')
    if (porMitad && !p.precioMitad) return setError('Cargá el precio de la mitad o desactivá la venta por mitad.')
    if (esPromo && !p.fijos.length && !p.slots.length) return setError('Una promo tiene que incluir al menos un producto o un grupo para elegir.')
    if (esPromo && p.slots.some(s => !s.categoriaId || s.cantidad < 1)) return setError('Revisá los grupos de la promo: cada uno necesita categoría y cantidad.')
    setGuardando(true)
    try {
      const g = await repo.guardarProducto({
        ...p,
        nombre: p.nombre.trim(),
        precioMitad: porMitad && !esPromo ? p.precioMitad : undefined,
        receta: esPromo ? [] : p.receta.filter(r => r.cantidad > 0),
        fijos: esPromo ? p.fijos.filter(f => f.productoId) : [],
        slots: esPromo ? p.slots : [],
        admiteCoccion: esPromo ? false : p.admiteCoccion,
        incluyeEnvio: esPromo ? p.incluyeEnvio : false,
      })
      onGuardado(g)
    } catch (e) { setError(mensajeError(e)) }
    setGuardando(false)
  }

  return (
    <Modal
      titulo={producto ? `Editar ${producto.nombre}` : sucursalId ? 'Nuevo producto del local' : 'Nuevo producto'}
      onClose={onClose}
      ancho="max-w-3xl"
      alto
      pie={
        <div className="flex flex-wrap items-center gap-3">
          {error && <p className="w-full text-tomate">{error}</p>}
          <label className="mr-auto flex items-center gap-2 font-medium">
            <input type="checkbox" className="size-5 accent-albahaca" checked={p.activo} onChange={e => set({ activo: e.target.checked })} />
            Activo en el menú
          </label>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar producto'}</Btn>
        </div>
      }
    >
      <div className="space-y-6 p-5">
        <section className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Campo label="Nombre">
            <input id="prod-nombre" autoFocus value={p.nombre} onChange={e => set({ nombre: e.target.value })} className={inputCls} placeholder="Grande Muzzarella" />
          </Campo>
          <Campo label="Código (opcional)">
            <input id="prod-codigo" value={p.codigo ?? ''} onChange={e => set({ codigo: e.target.value.toUpperCase() })} className={inputCls} placeholder="JQ" />
          </Campo>
          <Campo label="Categoría">
            <select id="prod-categoria" value={p.categoriaId} onChange={e => set({ categoriaId: e.target.value })} className={inputCls}>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Tipo">
            <select id="prod-tipo" value={p.tipo} onChange={e => set({ tipo: e.target.value as Producto['tipo'] })} className={inputCls}>
              <option value="producto">Producto</option>
              <option value="extra">Extra</option>
              <option value="promo">Promo</option>
            </select>
          </Campo>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Campo label={porMitad ? 'Precio entera' : 'Precio'}>
            <input id="prod-precio" inputMode="decimal" value={p.precio || ''} onChange={e => set({ precio: numero(e.target.value) ?? 0 })} className={inputCls} />
          </Campo>
          {!esPromo && porMitad && (
            <Campo label="Precio mitad">
              <input id="prod-precio-mitad" inputMode="decimal" value={p.precioMitad ?? ''} onChange={e => set({ precioMitad: numero(e.target.value) })} className={inputCls} />
            </Campo>
          )}
          <div className="flex flex-col justify-end gap-2 sm:col-span-1">
            {!esPromo && (
              <label className="flex items-center gap-2"><input type="checkbox" className="size-5 accent-pizarra" checked={porMitad} onChange={e => setPorMitad(e.target.checked)} /> Se vende por mitad</label>
            )}
            {!esPromo && (
              <label className="flex items-center gap-2"><input type="checkbox" className="size-5 accent-pizarra" checked={p.admiteCoccion} onChange={e => set({ admiteCoccion: e.target.checked })} /> Horno o frita</label>
            )}
            {esPromo && (
              <label className="flex items-center gap-2"><input type="checkbox" className="size-5 accent-pizarra" checked={p.incluyeEnvio} onChange={e => set({ incluyeEnvio: e.target.checked })} /> Incluye el envío</label>
            )}
          </div>
        </section>

        {esPromo && (
          <Campo label="Descripción (se ve al cargar el pedido)">
            <input id="prod-descripcion" value={p.descripcion ?? ''} onChange={e => set({ descripcion: e.target.value })} className={inputCls} placeholder="GDE. MUZZARELLA + 4 EMPANADAS A ELECCIÓN" />
          </Campo>
        )}

        {/* ---- Receta */}
        {!esPromo && (
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="font-cond text-2xl font-bold">Receta</h3>
              <span className="text-sm text-gris">{porMitad ? 'Cantidades para la entera; la mitad usa la mitad' : 'Cantidades para una unidad'}</span>
            </div>
            {p.receta.length > 0 && (
              <ul className="divide-y divide-linea overflow-hidden rounded-xl bg-white ring-1 ring-linea">
                {p.receta.map((r, i) => {
                  const ing = ingredientes.find(x => x.id === r.ingredienteId)
                  const c = ing ? (r.cantidad * ing.costo) / divisorUnidad(ing.unidad) : 0
                  return (
                    <li key={r.ingredienteId} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{ing?.nombre ?? 'Ingrediente borrado'}</span>
                      <input aria-label={`Cantidad de ${ing?.nombre}`} inputMode="decimal" value={r.cantidad || ''}
                        onChange={e => setReceta(p.receta.map((x, j) => j === i ? { ...x, cantidad: numero(e.target.value) ?? 0 } : x))}
                        className={`${inputBase} h-9 w-24 text-right`} />
                      <span className="w-6 text-sm text-gris">{ing ? unidadCorta(ing.unidad) : ''}</span>
                      <span className="w-20 text-right text-sm tabular-nums text-gris">{money(c)}</span>
                      <button aria-label="Quitar ingrediente" onClick={() => setReceta(p.receta.filter((_, j) => j !== i))} className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select aria-label="Agregar ingrediente" value="" onChange={e => e.target.value && setReceta([...p.receta, { ingredienteId: e.target.value, cantidad: 0 }])}
                className={`${inputBase} h-10 max-w-xs`}>
                <option value="">+ Agregar ingrediente</option>
                {disponibles.map(i => <option key={i.id} value={i.id}>{i.nombre} ({unidadCorta(i.unidad)})</option>)}
              </select>
              {!ingredientes.length && <span className="text-sm text-gris">Primero cargá ingredientes en la pestaña Ingredientes.</span>}
            </div>
          </section>
        )}

        {/* ---- Promo */}
        {esPromo && (
          <>
            <section>
              <h3 className="mb-2 font-cond text-2xl font-bold">Incluye siempre</h3>
              <ul className="space-y-2">
                {p.fijos.map((f, i) => {
                  const prod = vendibles.find(x => x.id === f.productoId)
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-linea">
                      <input aria-label="Cantidad" inputMode="numeric" value={f.cantidad || ''} onChange={e => setFijos(p.fijos.map((x, j) => j === i ? { ...x, cantidad: Math.max(1, Math.round(numero(e.target.value) ?? 1)) } : x))}
                        className={`${inputBase} h-9 w-16 text-center`} />
                      <select aria-label="Producto" value={f.productoId} onChange={e => setFijos(p.fijos.map((x, j) => j === i ? { ...x, productoId: e.target.value } : x))}
                        className={`${inputBase} h-9 min-w-0 flex-1`}>
                        <option value="">Elegí un producto</option>
                        {vendibles.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      </select>
                      {prod?.precioMitad != null && (
                        <select aria-label="Variante" value={f.variante} onChange={e => setFijos(p.fijos.map((x, j) => j === i ? { ...x, variante: e.target.value as PromoFijo['variante'] } : x))}
                          className={`${inputBase} h-9 w-28`}>
                          <option value="entera">Entera</option>
                          <option value="mitad">Mitad</option>
                        </select>
                      )}
                      <button aria-label="Quitar" onClick={() => setFijos(p.fijos.filter((_, j) => j !== i))} className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                    </li>
                  )
                })}
              </ul>
              <Btn tono="fantasma" className="mt-1" onClick={() => setFijos([...p.fijos, { productoId: '', cantidad: 1, variante: 'entera' }])}>+ Agregar producto fijo</Btn>
            </section>

            <section>
              <h3 className="mb-2 font-cond text-2xl font-bold">Para elegir</h3>
              <ul className="space-y-2">
                {p.slots.map((s, i) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-linea">
                    <span className="text-gris">Elegí</span>
                    <input aria-label="Cantidad a elegir" inputMode="numeric" value={s.cantidad || ''} onChange={e => setSlots(p.slots.map((x, j) => j === i ? { ...x, cantidad: Math.max(1, Math.round(numero(e.target.value) ?? 1)) } : x))}
                      className={`${inputBase} h-9 w-16 text-center`} />
                    <span className="text-gris">de</span>
                    <select aria-label="Categoría a elegir" value={s.categoriaId} onChange={e => {
                      const cat = categorias.find(c => c.id === e.target.value)
                      setSlots(p.slots.map((x, j) => j === i ? { ...x, categoriaId: e.target.value, nombre: x.nombre || (cat ? cat.nombre.charAt(0) + cat.nombre.slice(1).toLowerCase() : '') } : x))
                    }} className={`${inputBase} h-9 min-w-0 flex-1`}>
                      <option value="">Elegí una categoría</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input aria-label="Nombre del grupo" value={s.nombre} onChange={e => setSlots(p.slots.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                      className={`${inputBase} h-9 w-36`} placeholder="Empanadas" />
                    <button aria-label="Quitar" onClick={() => setSlots(p.slots.filter((_, j) => j !== i))} className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                  </li>
                ))}
              </ul>
              <Btn tono="fantasma" className="mt-1" onClick={() => setSlots([...p.slots, { id: `nuevo-${Date.now()}`, nombre: '', categoriaId: '', cantidad: 1 }])}>+ Agregar grupo para elegir</Btn>
            </section>
          </>
        )}

        {/* ---- Costo y margen */}
        <section className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-linea sm:grid-cols-3">
          <div>
            <div className="text-sm text-gris">{esPromo ? 'Costo aproximado' : 'Costo'}</div>
            <div className="font-cond text-3xl font-bold tabular-nums">{money(costo)}</div>
          </div>
          <div>
            <div className="text-sm text-gris">Margen {porMitad && !esPromo ? 'entera' : ''}</div>
            <div className={`font-cond text-3xl font-bold tabular-nums ${margen(p.precio, costo) < 50 ? 'text-tomate' : 'text-albahaca'}`}>
              {p.precio ? `${Math.round(margen(p.precio, costo))}%` : '—'}
            </div>
          </div>
          {porMitad && !esPromo && p.precioMitad ? (
            <div>
              <div className="text-sm text-gris">Margen mitad</div>
              <div className={`font-cond text-3xl font-bold tabular-nums ${margen(p.precioMitad, costo / 2) < 50 ? 'text-tomate' : 'text-albahaca'}`}>
                {Math.round(margen(p.precioMitad, costo / 2))}%
              </div>
            </div>
          ) : null}
          {esPromo && p.slots.length > 0 && <p className="text-sm text-gris sm:col-span-3">En los grupos para elegir se toma el costo promedio de las opciones.</p>}
          {!esPromo && !p.receta.length && <p className="text-sm text-gris sm:col-span-3">Cargá la receta para ver el costo y el margen.</p>}
        </section>
      </div>
    </Modal>
  )
}
