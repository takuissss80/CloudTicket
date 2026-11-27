import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AjusteLocal, Categoria, ColorCategoria, Producto } from '../../types'
import { COLORES_CATEGORIA, colorCategoria } from '../../lib/colores'
import type { MenuData } from '../../data/repo'
import { repo } from '../../data'
import type { ModoCategoriaLocal } from '../../data/repo'
import { mensajeError, useApp } from '../../store/app'
import { importarMenuEjemplo, nombreCategoria, ordenArbol, precioEnLocal } from '../../lib/menu'
import { money, normalizar } from '../../lib/format'
import { Btn, Campo, Modal, inputBase, inputCls } from '../ui'
import { ProductoEditor } from './ProductoEditor'
import { CODIGO_ARMADO, esArmado } from '../../store/pedido'


const numero = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v.replace(',', '.')) || 0))

/**
 * Menú madre (admin) o menú de un local: precio propio, agotado, oculto y productos propios.
 */
export function MenuAdmin() {
  const { sesion, sucursales, sucursalId, refrescarMenu, avisar } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  // El encargado general edita el menú de cualquier local, nunca el madre
  const esGeneral = sesion?.rol === 'general'
  // null = menú madre
  const [vista, setVista] = useState<string | null>(esAdmin ? null : esGeneral ? sucursalId ?? sesion?.sucursalId ?? null : sesion?.sucursalId ?? null)
  const [menu, setMenu] = useState<MenuData | null>(null)
  const [catSel, setCatSel] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Producto | null | 'nuevo'>(null)
  const [catEdit, setCatEdit] = useState<Categoria | 'nueva' | null>(null)
  const [copiando, setCopiando] = useState<Categoria | null>(null)
  const [verAumento, setVerAumento] = useState(false)
  const [importando, setImportando] = useState('')
  // Edición de varios precios a la vez: cambios pendientes por producto (sobreviven al cambiar de categoría)
  const [masivo, setMasivo] = useState(false)
  const [borrador, setBorrador] = useState<Record<string, { precio: string; mitad: string; activo: boolean }>>({})
  const [guardandoMasivo, setGuardandoMasivo] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const m = await repo.getMenu(vista)
      setMenu(m)
      setCatSel(sel => sel && m.categorias.some(c => c.id === sel) ? sel : m.categorias.filter(c => c.activa)[0]?.id ?? m.categorias[0]?.id ?? null)
    } catch (e) { avisar(mensajeError(e), 'error') }
  }, [vista, avisar])

  useEffect(() => { setMenu(null); cargar() }, [cargar])

  const despuesDeGuardar = async () => { await cargar(); await refrescarMenu() }

  const enLocal = vista !== null
  const local = sucursales.find(s => s.id === vista)
  const ajustes = useMemo(() => new Map((menu?.ajustes ?? []).map(a => [a.productoId, a])), [menu])
  const categorias = useMemo(() => [...(menu?.categorias ?? [])].sort((a, b) => a.orden - b.orden), [menu])
  const cat = categorias.find(c => c.id === catSel)
  const ocultas = useMemo(() => new Set(menu?.categoriasOcultas ?? []), [menu])
  const sueltas = useMemo(() => new Set(menu?.categoriasSueltas ?? []), [menu])
  const modoEnLocal = async (c: Categoria, modo: ModoCategoriaLocal) => {
    if (!vista) return
    setCambiandoCat(true)
    try {
      await repo.setModoCategoriaLocal(vista, c.id, modo)
      avisar(`${c.nombre} en ${local?.nombre ?? 'este local'}: ${modo === 'normal' ? 'agrupada' : modo === 'suelta' ? 'categorías sueltas' : 'oculta'}`)
      await despuesDeGuardar()
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setCambiandoCat(false) }
  }
  // Categorías contenedoras abiertas en la lista (se recuerda en este navegador)
  const [abiertas, setAbiertas] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ct-menu-abiertas') ?? '[]')) } catch { return new Set() }
  })
  const alternar = (id: string, abrir?: boolean) => setAbiertas(prev => {
    const n = new Set(prev)
    if (abrir ?? !n.has(id)) n.add(id); else n.delete(id)
    try { localStorage.setItem('ct-menu-abiertas', JSON.stringify([...n])) } catch { /* sin storage */ }
    return n
  })
  // Si la categoría elegida está dentro de otra (ej.: recién creada), se abre su contenedora
  const padreSel = categorias.find(c => c.id === catSel)?.padreId
  useEffect(() => { if (padreSel && !abiertas.has(padreSel)) alternar(padreSel, true) }, [padreSel]) // eslint-disable-line react-hooks/exhaustive-deps
  const [cambiandoCat, setCambiandoCat] = useState(false)
  const mostrarEnLocal = async (c: Categoria, mostrar: boolean) => {
    if (!vista) return
    setCambiandoCat(true)
    try {
      await repo.mostrarCategoriaEnLocal(vista, c.id, mostrar)
      avisar(`${c.nombre} ${mostrar ? 'se muestra' : 'ya no se muestra'} en ${local?.nombre ?? 'este local'}`)
      await despuesDeGuardar()
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setCambiandoCat(false) }
  }
  const q = normalizar(busqueda.trim())
  const productos = (menu?.productos ?? [])
    .filter(p => q ? normalizar(`${p.nombre} ${p.codigo ?? ''}`).includes(q) : p.categoriaId === catSel)
    .sort((a, b) => (a.tipo === 'extra' ? 0 : 1) - (b.tipo === 'extra' ? 0 : 1) || a.orden - b.orden)

  const puedeEditar = (p: { sucursalId?: string }) => esAdmin ? (!enLocal || !!p.sucursalId) : !!p.sucursalId

  const guardarAjuste = async (p: Producto, cambios: Partial<AjusteLocal>) => {
    if (!vista) return
    const actual = ajustes.get(p.id) ?? { productoId: p.id, oculto: false, agotado: false }
    const nuevo = { ...actual, ...cambios }
    try {
      const vacio = nuevo.precio == null && nuevo.precioMitad == null && !nuevo.oculto && !nuevo.agotado
      if (vacio) await repo.quitarAjuste(vista, p.id)
      else await repo.guardarAjuste(vista, nuevo)
      await despuesDeGuardar()
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  const valorBorrador = (p: Producto) => borrador[p.id] ?? { precio: String(p.precio), mitad: p.precioMitad != null ? String(p.precioMitad) : '', activo: p.activo }
  const cambiarBorrador = (p: Producto, c: Partial<{ precio: string; mitad: string; activo: boolean }>) =>
    setBorrador(b => ({ ...b, [p.id]: { ...valorBorrador(p), ...c } }))
  const cambiosMasivos = (menu?.productos ?? []).flatMap(p => {
    const b = borrador[p.id]
    if (!b) return []
    const precio = numero(b.precio) ?? 0
    const precioMitad = p.precioMitad != null || b.mitad.trim() ? numero(b.mitad) : undefined
    if (precio === p.precio && precioMitad === p.precioMitad && b.activo === p.activo) return []
    return [{ id: p.id, precio, precioMitad, activo: b.activo }]
  })
  const salirMasivo = () => { setMasivo(false); setBorrador({}) }
  const guardarMasivo = async () => {
    setGuardandoMasivo(true)
    try {
      await repo.actualizarProductos(cambiosMasivos)
      avisar(`${cambiosMasivos.length} producto${cambiosMasivos.length === 1 ? '' : 's'} actualizado${cambiosMasivos.length === 1 ? '' : 's'}`)
      salirMasivo()
      await despuesDeGuardar()
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setGuardandoMasivo(false) }
  }
  /** Enter pasa al próximo precio, como en una planilla */
  const siguiente = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const todos = [...document.querySelectorAll<HTMLInputElement>('input[data-masivo]')]
    todos[todos.indexOf(e.currentTarget) + 1]?.focus()
  }

  const cargarEjemplo = async () => {
    try {
      await importarMenuEjemplo(repo, setImportando)
      setImportando('')
      avisar('Menú de ejemplo cargado')
      await despuesDeGuardar()
    } catch (e) { setImportando(''); avisar(mensajeError(e), 'error') }
  }

  if (!menu) return <p className="p-8 text-center text-gris">Cargando menú…</p>

  return (
    <div className="mx-auto max-w-[1400px] p-4">
      {/* ---- Qué menú se edita */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {esAdmin || (esGeneral && sucursales.length > 1) ? (
          <div className="flex flex-wrap gap-1 rounded-xl bg-superficie p-1 ring-1 ring-linea" role="tablist" aria-label="Menú a editar">
            {esAdmin && <button role="tab" aria-selected={vista === null} onClick={() => setVista(null)}
              className={`h-10 rounded-lg px-4 font-semibold ${vista === null ? 'bg-primario text-sobre-primario' : 'hover:bg-harina'}`}>Menú madre</button>}
            {sucursales.map(s => (
              <button key={s.id} role="tab" aria-selected={vista === s.id} onClick={() => setVista(s.id)}
                className={`h-10 rounded-lg px-4 font-semibold ${vista === s.id ? 'bg-primario text-sobre-primario' : 'hover:bg-harina'}`}>{s.nombre}</button>
            ))}
          </div>
        ) : <h2 className="font-cond text-3xl font-bold">{local?.nombre}</h2>}
        <p className="text-[15px] text-gris">
          {enLocal
            ? 'Lo del menú madre se hereda. Acá podés poner un precio distinto para este local, marcar agotados, ocultar productos o sumar productos propios.'
            : 'Lo que cambies acá se aplica a todos los locales, salvo donde un local tenga su propio precio.'}
        </p>
      </div>

      {!categorias.length ? (
        <div className="mx-auto max-w-md rounded-2xl bg-superficie p-8 text-center ring-1 ring-linea">
          <h3 className="font-cond text-3xl font-bold">El menú está vacío</h3>
          <p className="mt-2 text-gris">Creá una categoría para empezar{esAdmin && !enLocal ? ' o cargá el menú de ejemplo de la pizzería, con ingredientes y recetas, para editarlo después' : ''}.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Btn tono="albahaca" onClick={() => setCatEdit('nueva')}>Crear categoría</Btn>
            {esAdmin && !enLocal && <Btn disabled={!!importando} onClick={cargarEjemplo}>{importando || 'Cargar menú de ejemplo'}</Btn>}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* ---- Categorías */}
          <aside className="space-y-1">
            {ordenArbol(categorias).filter(({ c, nivel }) => !nivel || (c.padreId && abiertas.has(c.padreId))).map(({ c, nivel }) => {
              const idsHijas = new Set(categorias.filter(h => h.padreId === c.id).map(h => h.id))
              const hijas = idsHijas.size
              const n = menu.productos.filter(p => p.categoriaId === c.id || idsHijas.has(p.categoriaId)).length
              const padre = c.padreId ? categorias.find(x => x.id === c.padreId) : undefined
              const apagada = !c.activa || ocultas.has(c.id) || (!!padre && (!padre.activa || ocultas.has(padre.id)))
              const abierta = abiertas.has(c.id)
              return (
                <button key={c.id} aria-expanded={hijas ? abierta : undefined}
                  onClick={() => { setCatSel(c.id); setBusqueda(''); if (hijas) alternar(c.id) }}
                  className={`flex w-full items-center gap-3 rounded-lg py-2.5 pr-3 text-left ${nivel ? 'pl-8' : 'pl-3'} ${catSel === c.id && !busqueda ? 'bg-superficie shadow-sm ring-1 ring-linea' : 'hover:bg-superficie/60'} ${apagada ? 'opacity-50' : ''}`}>
                  <span className={`${nivel ? 'h-5 w-1' : 'h-6 w-1.5'} rounded-full`} style={{ background: colorCategoria(c.color).fondo }} />
                  <span className={`min-w-0 flex-1 truncate ${nivel ? 'font-medium' : 'font-semibold'}`}>{c.nombre}{hijas > 0 && <span className="ml-1.5 text-xs font-normal text-gris">{hijas} cat.</span>}</span>
                  {hijas > 0 && <span aria-hidden className={`text-gris transition-transform ${abierta ? 'rotate-90' : ''}`}>›</span>}
                  {c.sucursalId && <span className="rounded bg-muzza-claro px-1.5 text-xs font-semibold">Propia</span>}
                  {ocultas.has(c.id) && <span className="rounded bg-tomate-claro px-1.5 text-xs font-semibold text-tomate">Oculta</span>}
                  {sueltas.has(c.id) && <span className="rounded bg-muzza-claro px-1.5 text-xs font-semibold" title="En este local sus categorías aparecen sueltas">Sueltas</span>}
                  <span className="text-sm tabular-nums text-gris">{n}</span>
                </button>
              )
            })}
            <Btn tono="fantasma" className="w-full justify-start" onClick={() => setCatEdit('nueva')}>
              + Nueva categoría{enLocal ? ' del local' : ''}
            </Btn>
          </aside>

          {/* ---- Productos */}
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-cond text-3xl font-bold">{busqueda ? 'Resultados' : cat?.nombre}</h2>
              <input id="menu-buscar" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en todo el menú" className={`${inputBase} h-10 w-56`} />
              {cat && !busqueda && enLocal && !cat.sucursalId && categorias.some(h => h.padreId === cat.id) && (
                <label className={`flex h-10 items-center gap-2 rounded-lg pl-3 font-semibold ring-1 ${ocultas.has(cat.id) ? 'bg-tomate-claro text-tomate ring-tomate' : 'bg-superficie ring-linea'}`}
                  title="Solo para este local: en los demás locales sigue igual">
                  En {local?.nombre ?? 'este local'}:
                  <select aria-label={`Cómo se ve ${cat.nombre} en este local`} disabled={cambiandoCat}
                    value={ocultas.has(cat.id) ? 'oculta' : sueltas.has(cat.id) ? 'suelta' : 'normal'}
                    onChange={e => modoEnLocal(cat, e.target.value as ModoCategoriaLocal)}
                    className="h-full rounded-r-lg border-l border-linea bg-superficie px-2 font-semibold text-tinta">
                    <option value="normal">Agrupada</option>
                    <option value="suelta">Categorías sueltas</option>
                    <option value="oculta">Oculta</option>
                  </select>
                </label>
              )}
              {cat && !busqueda && enLocal && !cat.sucursalId && !categorias.some(h => h.padreId === cat.id) && (
                <label className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3 font-semibold ring-1 ${ocultas.has(cat.id) ? 'bg-tomate-claro text-tomate ring-tomate' : 'bg-superficie ring-linea'}`}
                  title="Solo para este local: en los demás locales la categoría sigue igual">
                  <input type="checkbox" className="size-5 accent-albahaca" disabled={cambiandoCat} checked={!ocultas.has(cat.id)}
                    onChange={e => mostrarEnLocal(cat, e.target.checked)} />
                  Mostrar en {local?.nombre ?? 'este local'}
                </label>
              )}
              {cat && !busqueda && puedeEditar(cat) && <Btn onClick={() => setCatEdit(cat)}>Editar categoría</Btn>}
              {cat && !busqueda && !masivo && <Btn onClick={() => setCopiando(cat)}>Copiar categoría</Btn>}
              {cat && !busqueda && !masivo && <Btn onClick={() => setVerAumento(true)}>Aumentar precios</Btn>}
              {!masivo && productos.some(puedeEditar) && <Btn onClick={() => setMasivo(true)}>Editar precios</Btn>}
              <Btn tono="albahaca" onClick={() => setEditando('nuevo')}>+ Nuevo producto{enLocal ? ' propio' : ''}</Btn>
            </div>

            <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
              <table className="w-full min-w-[720px] text-left">
                <thead className="border-b border-linea text-sm text-gris">
                  <tr>
                    <th className="px-3 py-2 font-medium">Producto</th>
                    {enLocal && <th className="px-3 py-2 text-right font-medium">Menú madre</th>}
                    <th className="px-3 py-2 text-right font-medium">{enLocal ? 'Precio en el local' : 'Precio'}</th>
                    {enLocal && <th className="px-3 py-2 text-center font-medium">Agotado</th>}
                    {enLocal && <th className="px-3 py-2 text-center font-medium">Visible</th>}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {productos.map(p => {
                    const a = ajustes.get(p.id)
                    const propio = !!p.sucursalId
                    return (
                      <tr key={p.id} className={p.activo && !a?.oculto ? '' : 'bg-harina/60 text-gris'}>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold">{p.codigo && <span className="mr-1.5 text-tomate">{p.codigo}</span>}{p.nombre}</div>
                          <div className="flex flex-wrap gap-1 pt-0.5 text-xs font-semibold">
                            {p.tipo === 'promo' && <span className="rounded bg-pizarra-claro px-1.5 text-pizarra">Promo</span>}
                            {p.tipo === 'extra' && <span className="rounded bg-harina px-1.5 text-gris">Extra</span>}
                            {propio && <span className="rounded bg-muzza-claro px-1.5">Propio del local</span>}
                            {!p.activo && <span className="rounded bg-linea px-1.5">Inactivo</span>}
                            {busqueda && <span className="text-gris">{nombreCategoria(categorias.find(c => c.id === p.categoriaId), categorias)}</span>}
                          </div>
                        </td>
                        {enLocal && (
                          <td className="px-3 py-2.5 text-right tabular-nums text-gris">
                            {propio ? '' : <>{money(p.precio)}{p.precioMitad != null && <div className="text-xs">½ {money(p.precioMitad)}</div>}</>}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {masivo && puedeEditar(p) ? (() => {
                            const b = valorBorrador(p)
                            const tocado = (v: string, orig?: number) => (numero(v) ?? (orig == null ? undefined : 0)) !== orig
                            const cls = (t: boolean) => `h-9 rounded-lg border px-2 text-right tabular-nums outline-none focus:border-pizarra ${t ? 'border-muzza bg-muzza-claro font-semibold' : 'border-linea bg-superficie'}`
                            return (
                              <div className="flex flex-col items-end gap-1">
                                <input data-masivo aria-label={`Precio de ${p.nombre}`} inputMode="decimal" value={b.precio} onFocus={e => e.target.select()}
                                  onChange={e => cambiarBorrador(p, { precio: e.target.value })} onKeyDown={siguiente} className={`${cls(tocado(b.precio, p.precio))} w-28`} />
                                {(p.precioMitad != null || cat?.nombre.toUpperCase().includes('GRANDE')) && p.tipo !== 'promo' && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gris">½</span>
                                    <input data-masivo aria-label={`Precio mitad de ${p.nombre}`} inputMode="decimal" value={b.mitad} placeholder="sin mitad" onFocus={e => e.target.select()}
                                      onChange={e => cambiarBorrador(p, { mitad: e.target.value })} onKeyDown={siguiente} className={`${cls(tocado(b.mitad, p.precioMitad))} w-24 text-sm`} />
                                  </div>
                                )}
                              </div>
                            )
                          })() : enLocal && !propio ? (
                            <div className="flex flex-col items-end gap-1">
                              <PrecioLocal valor={a?.precio} base={p.precio} etiqueta={`Precio de ${p.nombre} en el local`}
                                onGuardar={v => guardarAjuste(p, { precio: v })} />
                              {p.precioMitad != null && (
                                <PrecioLocal valor={a?.precioMitad} base={p.precioMitad} etiqueta={`Precio mitad de ${p.nombre} en el local`} mitad
                                  onGuardar={v => guardarAjuste(p, { precioMitad: v })} />
                              )}
                            </div>
                          ) : (
                            <>
                              <span className="font-semibold">{money(p.precio)}</span>
                              {p.precioMitad != null && <div className="text-xs text-gris">½ {money(p.precioMitad)}</div>}
                            </>
                          )}
                        </td>
                        {enLocal && (
                          <td className="px-3 py-2.5 text-center">
                            <input type="checkbox" aria-label={`${p.nombre} agotado`} className="size-5 accent-tomate" checked={!!a?.agotado}
                              onChange={e => guardarAjuste(p, { agotado: e.target.checked })} />
                          </td>
                        )}
                        {enLocal && (
                          <td className="px-3 py-2.5 text-center">
                            <input type="checkbox" aria-label={`${p.nombre} visible en el local`} className="size-5 accent-albahaca" checked={!a?.oculto}
                              onChange={e => guardarAjuste(p, { oculto: !e.target.checked })} />
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right">
                          {masivo && puedeEditar(p) ? (
                            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
                              <input type="checkbox" className="size-5 accent-albahaca" checked={valorBorrador(p).activo}
                                onChange={e => cambiarBorrador(p, { activo: e.target.checked })} />
                              Activo
                            </label>
                          ) : !masivo && puedeEditar(p) && <Btn onClick={() => setEditando(p)}>Editar</Btn>}
                        </td>
                      </tr>
                    )
                  })}
                  {!productos.length && (
                    <tr><td colSpan={8} className="px-3 py-10 text-center text-gris">
                      {busqueda ? `Nada coincide con “${busqueda}”.`
                        : cat && categorias.some(h => h.padreId === cat.id) ? (
                          <>
                            <p className="mb-3">{cat.nombre} agrupa estas categorías. Elegí una para ver sus productos:</p>
                            <div className="flex flex-wrap justify-center gap-2">
                              {categorias.filter(h => h.padreId === cat.id).sort((a, b) => a.orden - b.orden).map(h => (
                                <Btn key={h.id} onClick={() => setCatSel(h.id)}>{h.nombre}</Btn>
                              ))}
                            </div>
                          </>
                        ) : 'Esta categoría no tiene productos. Agregá el primero con “Nuevo producto”.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {masivo && (
              <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-barra px-4 py-3 text-white shadow-lg">
                <span className="mr-auto text-[15px]">
                  {cambiosMasivos.length ? <><b>{cambiosMasivos.length}</b> producto{cambiosMasivos.length === 1 ? '' : 's'} con cambios</> : 'Cambiá los precios (Enter pasa al siguiente). Podés recorrer varias categorías y guardar todo junto.'}
                </span>
                {productos.some(x => puedeEditar(x) && !valorBorrador(x).activo) && (
                  <button onClick={() => productos.filter(puedeEditar).forEach(x => cambiarBorrador(x, { activo: true }))}
                    className="h-10 rounded-lg bg-white/15 px-4 font-semibold hover:bg-white/25">Activar todos {busqueda ? 'los de la búsqueda' : 'los de la categoría'}</button>
                )}
                <button onClick={salirMasivo} className="h-10 rounded-lg bg-white/15 px-4 font-semibold hover:bg-white/25">Cancelar</button>
                <button onClick={guardarMasivo} disabled={!cambiosMasivos.length || guardandoMasivo}
                  className="h-10 rounded-lg bg-albahaca px-4 font-semibold text-sobre-albahaca disabled:opacity-50">
                  {guardandoMasivo ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {editando && (
        <ProductoEditor
          producto={editando === 'nuevo' ? null : editando}
          categoriaId={catSel ?? undefined}
          sucursalId={enLocal ? vista! : undefined}
          categorias={categorias}
          productos={menu.productos}
          ingredientes={menu.ingredientes}
          onClose={() => setEditando(null)}
          onGuardado={async g => { setEditando(null); avisar(`${g.nombre} guardado`); await despuesDeGuardar() }}
        />
      )}
      {catEdit && (
        <CategoriaEditor
          categoria={catEdit === 'nueva' ? null : catEdit}
          sucursalId={enLocal ? vista! : undefined}
          orden={categorias.length}
          menu={menu}
          onClose={() => setCatEdit(null)}
          onGuardado={async c => { setCatEdit(null); setCatSel(c.id); await despuesDeGuardar() }}
          onEliminada={async (c, n) => {
            setCatEdit(null); setCatSel(null)
            avisar(`Categoría ${c.nombre} eliminada${n ? ` con sus ${n} producto${n === 1 ? '' : 's'}` : ''}`)
            await despuesDeGuardar()
          }}
        />
      )}
      {copiando && (
        <CopiarCategoriaModal categoria={copiando} menu={menu} vista={vista} esAdmin={esAdmin} sucursales={esAdmin || esGeneral ? sucursales : sucursales.filter(s => s.id === vista)}
          onClose={() => setCopiando(null)}
          onListo={async (c, n) => {
            setCopiando(null)
            avisar(`Categoría copiada: ${c.nombre} (${n} producto${n === 1 ? '' : 's'})`)
            setCatSel(c.id); setBusqueda('')
            const destino = c.sucursalId ?? null
            if (destino !== vista) { await refrescarMenu(); setVista(destino) } else await despuesDeGuardar()
          }} />
      )}
      {verAumento && cat && (
        <AumentoModal categoria={cat} sucursalId={vista} localNombre={local?.nombre}
          onClose={() => setVerAumento(false)}
          onListo={async n => { setVerAumento(false); avisar(`Precios actualizados (${n})`); await despuesDeGuardar() }} />
      )}
    </div>
  )
}

/** Precio propio del local: vacío = usa el del menú madre */
function PrecioLocal({ valor, base, etiqueta, mitad, onGuardar }: {
  valor?: number; base: number; etiqueta: string; mitad?: boolean; onGuardar: (v: number | undefined) => void
}) {
  const [texto, setTexto] = useState(valor != null ? String(valor) : '')
  useEffect(() => { setTexto(valor != null ? String(valor) : '') }, [valor])
  const guardar = () => {
    const v = numero(texto)
    const final = v === base ? undefined : v
    if (final !== valor) onGuardar(final)
  }
  return (
    <div className="flex items-center gap-1">
      {mitad && <span className="text-xs text-gris">½</span>}
      <input aria-label={etiqueta} inputMode="decimal" value={texto} placeholder={String(base)}
        onChange={e => setTexto(e.target.value)} onBlur={guardar} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={`h-9 rounded-lg border px-2 text-right tabular-nums outline-none focus:border-pizarra ${mitad ? 'w-24 text-sm' : 'w-28'} ${valor != null ? 'border-muzza bg-muzza-claro font-semibold' : 'border-linea bg-superficie'}`} />
    </div>
  )
}

function CategoriaEditor({ categoria, sucursalId, orden, menu, onClose, onGuardado, onEliminada }: {
  categoria: Categoria | null; sucursalId?: string; orden: number; menu: MenuData; onClose: () => void
  onGuardado: (c: Categoria) => void; onEliminada: (c: Categoria, productos: number) => void
}) {
  const avisar = useApp(s => s.avisar)
  const [borrar, setBorrar] = useState(false)
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [color, setColor] = useState<ColorCategoria>(categoria?.color ?? 'blue')
  const [pos, setPos] = useState(categoria?.orden ?? orden)
  const [activa, setActiva] = useState(categoria?.activa ?? true)
  const ambito = categoria ? categoria.sucursalId : sucursalId
  const todas = menu.categorias
  const tieneHijas = !!categoria && todas.some(c => c.padreId === categoria.id)
  // Dentro de qué categoría va: una del menú madre o del mismo local, que no esté dentro de otra
  const padres = todas.filter(c => c.id !== categoria?.id && !c.padreId && (!c.sucursalId || c.sucursalId === ambito)).sort((a, b) => a.orden - b.orden)
  const [padre, setPadre] = useState(categoria?.padreId ?? '')
  // Qué categorías van adentro de esta (si esta no va dentro de otra)
  const candidatas = todas.filter(c => c.id !== categoria?.id && c.sucursalId === ambito && !todas.some(h => h.padreId === c.id)
    && (!c.padreId || c.padreId === categoria?.id)).sort((a, b) => a.orden - b.orden)
  const [adentro, setAdentro] = useState<Set<string>>(() => new Set(categoria ? todas.filter(c => c.padreId === categoria.id).map(c => c.id) : []))
  const [guardando, setGuardando] = useState(false)
  const [envio, setEnvio] = useState(!!categoria?.incluyeEnvio)
  // Contenedora del menú madre: cómo se ve en cada local (agrupada, sueltas u oculta)
  const sucursales = useApp(s => s.sucursales)
  const [modos, setModos] = useState<Record<string, ModoCategoriaLocal>>({})
  const [modosOrig, setModosOrig] = useState<Record<string, ModoCategoriaLocal>>({})
  useEffect(() => {
    if (!categoria || ambito) return
    repo.modosCategoria(categoria.id).then(m => { setModos(m); setModosOrig(m) }).catch(() => {})
  }, [categoria, ambito])
  const esContenedora = !ambito && !padre && (adentro.size > 0 || tieneHijas)
  const guardar = async () => {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      const c = await repo.guardarCategoria({
        id: categoria?.id, nombre: nombre.trim().toUpperCase(), color, orden: pos, activa,
        sucursalId: ambito,
        ...(envio !== !!categoria?.incluyeEnvio ? { incluyeEnvio: envio } : {}),
        ...((padre || undefined) !== categoria?.padreId ? { padreId: padre || null } : {}),
      })
      if (!padre) {
        for (const x of candidatas) {
          const va = adentro.has(x.id), estaba = x.padreId === c.id
          if (va !== estaba) await repo.guardarCategoria({ ...x, padreId: va ? c.id : null })
        }
      }
      if (esContenedora) {
        for (const s of sucursales) {
          const m = modos[s.id] ?? 'normal', o = modosOrig[s.id] ?? 'normal'
          if (m !== o) await repo.setModoCategoriaLocal(s.id, c.id, m)
        }
      }
      onGuardado(c)
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setGuardando(false) }
  }
  return (
    <Modal titulo={categoria ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose} ancho="max-w-md"
      pie={<div className="flex justify-end gap-2">
        {categoria && <Btn tono="fantasma" className="mr-auto text-tomate" onClick={() => setBorrar(true)}>Eliminar categoría</Btn>}
        <Btn onClick={onClose}>Cancelar</Btn><Btn tono="albahaca" disabled={!nombre.trim() || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
      </div>}>
      <div className="space-y-4 p-5">
        <Campo label="Nombre">
          <input id="cat-nombre" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} placeholder="PIZZAS GRANDES"
            onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
        </Campo>
        <div>
          <span className="mb-1 block text-sm font-medium text-gris">Color del botón</span>
          <div className="flex flex-wrap gap-2">
            {COLORES_CATEGORIA.map(c => (
              <button key={c.key} type="button" onClick={() => setColor(c.key)} aria-pressed={color === c.key}
                className={`flex h-10 items-center gap-2 rounded-lg px-3 ring-1 ${color === c.key ? 'bg-superficie ring-2 ring-tinta' : 'bg-superficie ring-linea'}`}>
                <span className="size-4 rounded-full ring-1 ring-tinta/30" style={{ background: c.fondo }} />{c.label}
              </button>
            ))}
          </div>
        </div>
        <Campo label="Posición">
          <input id="cat-orden" inputMode="numeric" value={pos} onChange={e => setPos(Math.max(0, Math.round(Number(e.target.value) || 0)))} className={`${inputBase} w-24`} />
        </Campo>
        {categoria && (
          <label className="flex items-center gap-2"><input type="checkbox" className="size-5 accent-albahaca" checked={activa} onChange={e => setActiva(e.target.checked)} /> Visible en la pantalla de pedidos</label>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 size-5 accent-albahaca" checked={envio} onChange={e => setEnvio(e.target.checked)} />
          <span>Envío gratis <span className="block text-sm text-gris">En delivery, si el pedido tiene un producto de esta categoría (o de las de adentro), no se cobra el envío. Ej.: promos con envío incluido.</span></span>
        </label>
        <Campo label="Dentro de">
          <select id="cat-padre" value={padre} disabled={tieneHijas} onChange={e => setPadre(e.target.value)} className={inputCls}>
            <option value="">Ninguna (va suelta en la pantalla de pedidos)</option>
            {padres.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        {tieneHijas && <p className="-mt-2 text-sm text-gris">Tiene categorías adentro, así que no puede ir dentro de otra.</p>}
        {!padre && candidatas.length > 0 && (
          <div>
            <span className="mb-1 block text-sm font-medium text-gris">Categorías que van adentro de esta</span>
            <p className="mb-2 text-sm text-gris">Sirve para agrupar, por ejemplo por marca: en la pantalla de pedidos se toca {nombre.trim().toUpperCase() || 'esta'} y aparecen sus categorías.</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="h-8 rounded-full px-3 text-sm font-semibold text-pizarra hover:underline"
                onClick={() => setAdentro(adentro.size === candidatas.length ? new Set() : new Set(candidatas.map(x => x.id)))}>
                {adentro.size === candidatas.length ? 'Ninguna' : 'Todas'}
              </button>
              {candidatas.map(x => (
                <button key={x.id} type="button" aria-pressed={adentro.has(x.id)}
                  onClick={() => setAdentro(s => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n })}
                  className={`h-8 rounded-full px-3 text-sm font-semibold ring-1 ${adentro.has(x.id) ? 'bg-primario text-sobre-primario ring-primario' : 'bg-superficie ring-linea hover:bg-harina'}`}>
                  {x.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
        {esContenedora && sucursales.length > 0 && (
          <div>
            <span className="mb-1 block text-sm font-medium text-gris">En cada local</span>
            <p className="mb-2 text-sm text-gris">
              <b>Agrupada</b>: se toca {nombre.trim().toUpperCase() || 'esta'} y aparecen sus categorías. <b>Sueltas</b>: sus categorías aparecen sueltas, como si no estuvieran agrupadas. <b>Oculta</b>: no se ve nada de lo que tiene adentro.
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5 text-sm">
              <span className="self-center text-gris">Todos:</span>
              {(['normal', 'suelta', 'oculta'] as const).map(m => (
                <button key={m} type="button" className="h-8 rounded-full px-3 font-semibold text-pizarra ring-1 ring-linea hover:bg-harina"
                  onClick={() => setModos(Object.fromEntries(sucursales.map(s => [s.id, m])))}>
                  {m === 'normal' ? 'Agrupada' : m === 'suelta' ? 'Sueltas' : 'Oculta'}
                </button>
              ))}
            </div>
            <ul className="max-h-64 divide-y divide-linea overflow-y-auto rounded-lg ring-1 ring-linea">
              {sucursales.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0 truncate">{s.nombre}</span>
                  <select aria-label={`${nombre} en ${s.nombre}`} value={modos[s.id] ?? 'normal'}
                    onChange={e => setModos(m => ({ ...m, [s.id]: e.target.value as ModoCategoriaLocal }))}
                    className={`${inputBase} h-8 w-auto py-0 text-sm`}>
                    <option value="normal">Agrupada</option>
                    <option value="suelta">Sueltas</option>
                    <option value="oculta">Oculta</option>
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {borrar && categoria && <EliminarCategoria categoria={categoria} menu={menu} onNo={() => setBorrar(false)} onListo={n => onEliminada(categoria, n)} />}
    </Modal>
  )
}

/** Confirmación para borrar una categoría con todos sus productos */
function EliminarCategoria({ categoria, menu, onNo, onListo }: { categoria: Categoria; menu: MenuData; onNo: () => void; onListo: (n: number) => void }) {
  const avisar = useApp(s => s.avisar)
  const [borrando, setBorrando] = useState(false)
  const productos = menu.productos.filter(p => p.categoriaId === categoria.id)
  const ids = new Set(productos.map(p => p.id))
  const armado = productos.find(p => esArmado(p))
  // Promos de otras categorías que usan algo de esta: pierden esa parte
  const promos = menu.productos.filter(p => !ids.has(p.id) && p.tipo === 'promo'
    && (p.fijos.some(f => ids.has(f.productoId)) || p.slots.some(s => s.categoriaId === categoria.id)))
  const eliminar = async () => {
    setBorrando(true)
    try { await repo.eliminarCategoria(categoria.id); onListo(productos.length) }
    catch (e) { avisar(mensajeError(e), 'error'); setBorrando(false) }
  }
  return (
    <Modal titulo={`¿Eliminar ${categoria.nombre}?`} onClose={onNo} ancho="max-w-md"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onNo}>Volver</Btn>{!armado && <Btn tono="tomate" disabled={borrando} onClick={eliminar}>{borrando ? 'Eliminando…' : `Eliminar${productos.length ? ` con ${productos.length} producto${productos.length === 1 ? '' : 's'}` : ''}`}</Btn>}</div>}>
      <div className="space-y-3 px-5 py-4">
        {armado ? (
          <p className="font-semibold text-tomate">Esta categoría tiene el producto <b>{armado.nombre}</b>, que se usa para cobrar las pizzas mitad y mitad. Pasalo a otra categoría (editándolo) antes de borrarla.</p>
        ) : <>
          <p>{productos.length
            ? <>Se borran la categoría y sus <b>{productos.length} producto{productos.length === 1 ? '' : 's'}</b>, con sus recetas y los precios propios de cada local. No se puede deshacer.</>
            : 'La categoría está vacía. No se puede deshacer.'}</p>
          {productos.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-lg bg-harina px-3 py-2 text-[15px] ring-1 ring-linea">
              {productos.map(p => <li key={p.id}>{p.nombre}</li>)}
            </ul>
          )}
          {promos.length > 0 && (
            <p className="rounded-lg bg-muzza-claro px-3 py-2 text-[15px] ring-1 ring-muzza">
              Ojo: {promos.length === 1 ? 'esta promo usa' : 'estas promos usan'} productos de la categoría y {promos.length === 1 ? 'se queda' : 'se quedan'} sin esa parte: <b>{promos.map(p => p.nombre).join(', ')}</b>. Revisalas después.
            </p>
          )}
          <p className="text-sm text-gris">Las comandas y reportes viejos no cambian: el historial de ventas queda igual.</p>
        </>}
      </div>
    </Modal>
  )
}

/** Duplica una categoría con todos sus productos (precios, recetas, armado de promos) en el menú madre o en un local */
function CopiarCategoriaModal({ categoria, menu, vista, esAdmin, sucursales, onClose, onListo }: {
  categoria: Categoria; menu: MenuData; vista: string | null; esAdmin: boolean; sucursales: { id: string; nombre: string }[]
  onClose: () => void; onListo: (c: Categoria, productos: number) => void
}) {
  const avisar = useApp(s => s.avisar)
  const [nombre, setNombre] = useState(`${categoria.nombre} (COPIA)`)
  // '' = menú madre
  const [destino, setDestino] = useState(vista ?? '')
  const [copiando, setCopiando] = useState('')
  const productos = menu.productos.filter(p => p.categoriaId === categoria.id).sort((a, b) => a.orden - b.orden)
  const ajustes = new Map((menu.ajustes ?? []).map(a => [a.productoId, a]))
  const opciones = esAdmin ? [{ id: '', nombre: 'Menú madre (todos los locales)' }, ...sucursales] : sucursales

  const copiar = async () => {
    if (!nombre.trim()) return
    setCopiando('Creando categoría…')
    try {
      const sucursalId = destino || undefined
      const orden = Math.max(-1, ...menu.categorias.map(c => c.orden)) + 1
      const nueva = await repo.guardarCategoria({ nombre: nombre.trim().toUpperCase(), color: categoria.color, orden, activa: categoria.activa, sucursalId })
      let n = 0
      for (const p of productos) {
        setCopiando(`Copiando productos… ${n + 1} de ${productos.length}`)
        // Visto desde un local: se copia con el precio que tiene en ese local
        const a = vista ? ajustes.get(p.id) : undefined
        const ef = precioEnLocal(p, a)
        await repo.guardarProducto({
          categoriaId: nueva.id, tipo: p.tipo,
          codigo: p.codigo === CODIGO_ARMADO ? undefined : p.codigo,
          nombre: p.nombre, descripcion: p.descripcion, precio: ef.precio, precioMitad: ef.precioMitad,
          admiteCoccion: p.admiteCoccion, incluyeEnvio: p.incluyeEnvio, orden: p.orden,
          activo: p.activo && !a?.oculto, sucursalId,
          receta: p.receta.map(r => ({ ...r })),
          fijos: p.fijos.map(f => ({ ...f })),
          // Si la promo elige productos de la misma categoría, la copia elige de la categoría nueva
          slots: p.slots.map(s => ({ ...s, categoriaId: s.categoriaId === categoria.id ? nueva.id : s.categoriaId })),
        })
        n++
      }
      onListo(nueva, n)
    } catch (e) { avisar(mensajeError(e), 'error'); setCopiando('') }
  }

  return (
    <Modal titulo={`Copiar ${categoria.nombre}`} onClose={copiando ? () => {} : onClose} ancho="max-w-md"
      pie={<div className="flex justify-end gap-2"><Btn disabled={!!copiando} onClick={onClose}>Cancelar</Btn><Btn tono="albahaca" disabled={!nombre.trim() || !!copiando} onClick={copiar}>{copiando || 'Copiar'}</Btn></div>}>
      <div className="space-y-4 p-5">
        <p className="text-gris">
          Se crea una categoría nueva con {productos.length === 1 ? 'el producto' : `los ${productos.length} productos`} de {categoria.nombre}: precios, recetas y armado de promos.
          Después podés cambiarle lo que quieras sin tocar la original.
        </p>
        <Campo label="Nombre de la categoría nueva">
          <input id="copiar-nombre" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls}
            onKeyDown={e => { if (e.key === 'Enter') copiar() }} />
        </Campo>
        {opciones.length > 1 ? (
          <Campo label="Copiar a">
            <select id="copiar-destino" value={destino} onChange={e => setDestino(e.target.value)} className={inputCls}>
              {opciones.map(o => <option key={o.id} value={o.id}>{o.id ? `${o.nombre} (categoría propia del local)` : o.nombre}</option>)}
            </select>
          </Campo>
        ) : opciones[0] && <p className="text-[15px]">Se copia como categoría propia de <b>{opciones[0].nombre}</b>.</p>}
      </div>
    </Modal>
  )
}

function AumentoModal({ categoria, sucursalId, localNombre, onClose, onListo }: {
  categoria: Categoria; sucursalId: string | null; localNombre?: string; onClose: () => void; onListo: (n: number) => void
}) {
  const avisar = useApp(s => s.avisar)
  const [pct, setPct] = useState('10')
  const [redondeo, setRedondeo] = useState(100)
  const [enviando, setEnviando] = useState(false)
  const valor = Number(pct.replace(',', '.'))
  const aplicar = async () => {
    setEnviando(true)
    try { onListo(await repo.aumentarPrecios(categoria.id, valor, sucursalId, redondeo)) }
    catch (e) { avisar(mensajeError(e), 'error') }
    setEnviando(false)
  }
  const ejemplo = 18800
  return (
    <Modal titulo={`Aumentar precios de ${categoria.nombre}`} onClose={onClose} ancho="max-w-md"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn tono="tomate" disabled={!valor || enviando} onClick={aplicar}>Aplicar {valor ? `${valor > 0 ? '+' : ''}${valor}%` : ''}</Btn></div>}>
      <div className="space-y-4 p-5">
        <p className="text-gris">
          {sucursalId
            ? `Cambia los precios propios de ${localNombre} en esta categoría. Los que usan el precio del menú madre no se tocan.`
            : 'Cambia el precio base de todos los productos de la categoría (no las promos). Se aplica a todos los locales, salvo donde un local tenga su propio precio.'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Porcentaje">
            <input id="aumento-pct" autoFocus inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Redondear a">
            <select id="aumento-redondeo" value={redondeo} onChange={e => setRedondeo(Number(e.target.value))} className={inputCls}>
              {[1, 10, 50, 100, 500].map(r => <option key={r} value={r}>${r}</option>)}
            </select>
          </Campo>
        </div>
        {!!valor && <p className="text-[15px]">Ejemplo: {money(ejemplo)} pasa a <b>{money(Math.round(ejemplo * (1 + valor / 100) / redondeo) * redondeo)}</b>.</p>}
      </div>
    </Modal>
  )
}
