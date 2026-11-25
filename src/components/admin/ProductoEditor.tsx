import { useState } from 'react'
import type { Categoria, Ingrediente, Producto, PromoSlot, RecetaItem, PromoFijo } from '../../types'
import type { ProductoEdicion } from '../../data/repo'
import { repo } from '../../data'
import { mensajeError } from '../../store/app'
import { nombreCategoria, ordenArbol, unidadCorta } from '../../lib/menu'
import { money, normalizar } from '../../lib/format'
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
    if (esPromo && p.slots.some(s => (s.productos ? !s.productos.length : !s.categoriaId) || s.cantidad < 1)) return setError('Revisá los grupos de la promo: cada uno necesita cantidad y una categoría o productos elegidos.')
    if (esPromo && p.slots.some(s => s.minimo != null && s.minimo > s.cantidad)) return setError('En un grupo con rango, el mínimo no puede ser mayor que el máximo.')
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
              {ordenArbol(categorias).map(({ c }) => <option key={c.id} value={c.id}>{nombreCategoria(c, categorias)}</option>)}
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
              <ul className="divide-y divide-linea overflow-hidden rounded-xl bg-superficie ring-1 ring-linea">
                {p.receta.map((r, i) => {
                  const ing = ingredientes.find(x => x.id === r.ingredienteId)
                  return (
                    <li key={r.ingredienteId} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{ing?.nombre ?? 'Ingrediente borrado'}</span>
                      <input aria-label={`Cantidad de ${ing?.nombre}`} inputMode="decimal" value={r.cantidad || ''}
                        onChange={e => setReceta(p.receta.map((x, j) => j === i ? { ...x, cantidad: numero(e.target.value) ?? 0 } : x))}
                        className={`${inputBase} h-9 w-24 text-right`} />
                      <span className="w-6 text-sm text-gris">{ing ? unidadCorta(ing.unidad) : ''}</span>
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
                  const prod = productos.find(x => x.id === f.productoId)
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-superficie p-2 ring-1 ring-linea">
                      <input aria-label="Cantidad" inputMode="numeric" value={f.cantidad || ''} onChange={e => setFijos(p.fijos.map((x, j) => j === i ? { ...x, cantidad: Math.max(1, Math.round(numero(e.target.value) ?? 1)) } : x))}
                        className={`${inputBase} h-9 w-16 text-center`} />
                      <ElegirProducto producto={prod} productos={vendibles} categorias={categorias} abrirAlInicio={!f.productoId}
                        onElegir={id => setFijos(p.fijos.map((x, j) => j === i ? { ...x, productoId: id } : x))} />
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
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-superficie p-2 ring-1 ring-linea">
                    <span className="text-gris">Elegí</span>
                    {s.minimo != null && <>
                      <input aria-label="Mínimo a elegir" inputMode="numeric" value={s.minimo || ''} onChange={e => setSlots(p.slots.map((x, j) => j === i ? { ...x, minimo: Math.max(1, Math.round(numero(e.target.value) ?? 1)) } : x))}
                        className={`${inputBase} h-9 w-16 text-center`} />
                      <span className="text-gris">a</span>
                    </>}
                    <input aria-label={s.minimo != null ? 'Máximo a elegir' : 'Cantidad a elegir'} inputMode="numeric" value={s.cantidad || ''} onChange={e => setSlots(p.slots.map((x, j) => j === i ? { ...x, cantidad: Math.max(1, Math.round(numero(e.target.value) ?? 1)) } : x))}
                      className={`${inputBase} h-9 w-16 text-center`} />
                    <label className="flex items-center gap-1 text-sm text-gris" title="Ej.: de 1 a 4 sabores">
                      <input type="checkbox" className="size-4 accent-albahaca" checked={s.minimo != null}
                        onChange={e => setSlots(p.slots.map((x, j) => j === i ? { ...x, minimo: e.target.checked ? 1 : undefined } : x))} />
                      rango
                    </label>
                    <span className="text-gris">de</span>
                    <select aria-label="Categoría a elegir" value={s.productos ? LISTA : s.categoriaId} onChange={e => {
                      if (e.target.value === LISTA) return setSlots(p.slots.map((x, j) => j === i ? { ...x, categoriaId: '', productos: x.productos ?? [] } : x))
                      const cat = categorias.find(c => c.id === e.target.value)
                      setSlots(p.slots.map((x, j) => j === i ? { ...x, categoriaId: e.target.value, productos: undefined, nombre: x.nombre || (cat ? cat.nombre.charAt(0) + cat.nombre.slice(1).toLowerCase() : '') } : x))
                    }} className={`${inputBase} h-9 min-w-0 flex-1`}>
                      <option value="">Elegí una categoría</option>
                      <option value={LISTA}>Productos que elijo (de cualquier categoría)</option>
                      {ordenArbol(categorias).map(({ c }) => <option key={c.id} value={c.id}>{nombreCategoria(c, categorias)}</option>)}
                    </select>
                    <input aria-label="Nombre del grupo" value={s.nombre} onChange={e => setSlots(p.slots.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                      className={`${inputBase} h-9 w-36`} placeholder="Empanadas" />
                    <button aria-label="Quitar" onClick={() => setSlots(p.slots.filter((_, j) => j !== i))} className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                    {s.productos && (
                      <div className="w-full pl-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.productos.map(id => {
                            const x = productos.find(y => y.id === id)
                            return (
                              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-harina py-1 pl-3 pr-1 text-sm font-semibold ring-1 ring-linea">
                                {x ? x.nombre : 'Producto borrado'}
                                <button aria-label={`Sacar ${x?.nombre ?? 'producto'}`} onClick={() => setSlots(p.slots.map((y, j) => j === i ? { ...y, productos: y.productos!.filter(z => z !== id) } : y))}
                                  className="size-6 rounded-full text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                              </span>
                            )
                          })}
                          <ElegirVarios elegidos={s.productos} productos={vendibles} categorias={categorias} abrirAlInicio={!s.productos.length}
                            onCambiar={ids => setSlots(p.slots.map((y, j) => j === i ? { ...y, productos: ids } : y))} />
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <Btn tono="fantasma" className="mt-1" onClick={() => setSlots([...p.slots, { id: `nuevo-${Date.now()}`, nombre: '', categoriaId: '', cantidad: 1 }])}>+ Agregar grupo para elegir</Btn>
            </section>
          </>
        )}

      </div>
    </Modal>
  )
}

/** Botón que abre un buscador de productos por nombre o código, filtrable por categoría */
function ElegirProducto({ producto, productos, categorias, abrirAlInicio, onElegir }: {
  producto?: Producto; productos: Producto[]; categorias: Categoria[]; abrirAlInicio?: boolean; onElegir: (id: string) => void
}) {
  const [abierto, setAbierto] = useState(!!abrirAlInicio)
  const [busqueda, setBusqueda] = useState('')
  const [cat, setCat] = useState('')
  const q = normalizar(busqueda.trim())
  const nombreCat = (id: string) => categorias.find(c => c.id === id)?.nombre ?? ''
  const filtrados = productos.filter(x => (!cat || x.categoriaId === cat)
    && (!q || normalizar(`${x.nombre} ${x.codigo ?? ''} ${nombreCat(x.categoriaId)}`).includes(q)))
  const grupos = [...categorias].sort((a, b) => a.orden - b.orden)
    .map(c => ({ c, productos: filtrados.filter(x => x.categoriaId === c.id).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)) }))
    .filter(g => g.productos.length)
  const conProductos = categorias.filter(c => productos.some(x => x.categoriaId === c.id)).sort((a, b) => a.orden - b.orden)
  const elegir = (id: string) => { onElegir(id); setAbierto(false); setBusqueda('') }

  return (
    <>
      <button type="button" aria-label="Producto" onClick={() => setAbierto(true)}
        className={`${inputBase} flex h-9 min-w-0 flex-1 items-center justify-between gap-2 text-left`}>
        {producto
          ? <span className="truncate">{producto.nombre}<span className="text-sm text-gris"> · {nombreCat(producto.categoriaId)}{producto.activo ? '' : ' · desactivado'}</span></span>
          : <span className="text-gris">Elegí un producto</span>}
        <span className="text-gris">▾</span>
      </button>
      {abierto && (
        <Modal titulo="Elegí un producto" onClose={() => setAbierto(false)} ancho="max-w-2xl" alto>
          <div className="space-y-3 p-4">
            <input autoFocus aria-label="Buscar producto" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && filtrados.length === 1) elegir(filtrados[0].id) }}
              placeholder="Buscar por nombre o código (ej.: pepsi, fugazzeta)" className={`${inputBase} h-11 w-full`} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorías">
              {[{ id: '', nombre: 'Todas' }, ...conProductos].map(c => (
                <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
                  className={`h-8 rounded-full px-3 text-sm font-semibold ring-1 ${cat === c.id ? 'bg-primario text-sobre-primario ring-primario' : 'bg-superficie ring-linea hover:bg-harina'}`}>
                  {c.nombre}
                </button>
              ))}
            </div>
            {grupos.map(g => (
              <section key={g.c.id}>
                <h4 className="mb-1 text-sm font-bold uppercase text-gris">{g.c.nombre}</h4>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {g.productos.map(x => (
                    <li key={x.id}>
                      <button type="button" onClick={() => elegir(x.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left ring-1 hover:bg-albahaca-claro ${x.id === producto?.id ? 'bg-albahaca-claro ring-albahaca' : 'bg-superficie ring-linea'}`}>
                        <span>{x.nombre}{x.codigo && <span className="text-sm text-gris"> · {x.codigo}</span>}</span>
                        <span className="text-sm tabular-nums text-gris">{money(x.precio)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!grupos.length && <p className="p-6 text-center text-gris">Ningún producto coincide.</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

const LISTA = '__productos'

/** Selector de varios productos (de cualquier categoría) para un grupo de promo */
function ElegirVarios({ elegidos, productos, categorias, abrirAlInicio, onCambiar }: {
  elegidos: string[]; productos: Producto[]; categorias: Categoria[]; abrirAlInicio?: boolean; onCambiar: (ids: string[]) => void
}) {
  const [abierto, setAbierto] = useState(!!abrirAlInicio)
  const [busqueda, setBusqueda] = useState('')
  const [cat, setCat] = useState('')
  const q = normalizar(busqueda.trim())
  const nombreCat = (id: string) => categorias.find(c => c.id === id)?.nombre ?? ''
  const filtrados = productos.filter(x => (!cat || x.categoriaId === cat)
    && (!q || normalizar(`${x.nombre} ${x.codigo ?? ''} ${nombreCat(x.categoriaId)}`).includes(q)))
  const grupos = [...categorias].sort((a, b) => a.orden - b.orden)
    .map(c => ({ c, productos: filtrados.filter(x => x.categoriaId === c.id).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)) }))
    .filter(g => g.productos.length)
  const conProductos = categorias.filter(c => productos.some(x => x.categoriaId === c.id)).sort((a, b) => a.orden - b.orden)
  const sel = new Set(elegidos)
  const alternar = (id: string) => onCambiar(sel.has(id) ? elegidos.filter(x => x !== id) : [...elegidos, id])
  const todosVisibles = filtrados.length > 0 && filtrados.every(x => sel.has(x.id))
  const marcarVisibles = () => onCambiar(todosVisibles
    ? elegidos.filter(id => !filtrados.some(x => x.id === id))
    : [...elegidos, ...filtrados.filter(x => !sel.has(x.id)).map(x => x.id)])

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className="h-8 rounded-full px-3 text-sm font-semibold text-albahaca ring-1 ring-albahaca hover:bg-albahaca-claro">
        {elegidos.length ? '+ Agregar o sacar productos' : '+ Elegir productos'}
      </button>
      {abierto && (
        <Modal titulo={`Productos para elegir (${elegidos.length})`} onClose={() => setAbierto(false)} ancho="max-w-2xl" alto
          pie={<div className="flex justify-end"><Btn tono="albahaca" onClick={() => { setAbierto(false); setBusqueda('') }}>Listo</Btn></div>}>
          <div className="space-y-3 p-4">
            <input autoFocus aria-label="Buscar producto" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código (ej.: completo, pepsi)" className={`${inputBase} h-11 w-full`} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorías">
              {[{ id: '', nombre: 'Todas' }, ...conProductos].map(c => (
                <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
                  className={`h-8 rounded-full px-3 text-sm font-semibold ring-1 ${cat === c.id ? 'bg-primario text-sobre-primario ring-primario' : 'bg-superficie ring-linea hover:bg-harina'}`}>
                  {c.nombre}
                </button>
              ))}
            </div>
            {(cat || q) && filtrados.length > 1 && (
              <button type="button" onClick={marcarVisibles} className="text-sm font-semibold text-albahaca hover:underline">
                {todosVisibles ? 'Sacar todos los que se ven' : `Marcar todos los que se ven (${filtrados.length})`}
              </button>
            )}
            {grupos.map(g => (
              <section key={g.c.id}>
                <h4 className="mb-1 text-sm font-bold uppercase text-gris">{g.c.nombre}</h4>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {g.productos.map(x => (
                    <li key={x.id}>
                      <label className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ring-1 hover:bg-albahaca-claro ${sel.has(x.id) ? 'bg-albahaca-claro ring-albahaca' : 'bg-superficie ring-linea'}`}>
                        <input type="checkbox" className="size-5 accent-albahaca" checked={sel.has(x.id)} onChange={() => alternar(x.id)} />
                        <span className="flex-1">{x.nombre}{x.codigo && <span className="text-sm text-gris"> · {x.codigo}</span>}</span>
                        <span className="text-sm tabular-nums text-gris">{money(x.precio)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!grupos.length && <p className="p-6 text-center text-gris">Ningún producto coincide.</p>}
          </div>
        </Modal>
      )}
    </>
  )
}
