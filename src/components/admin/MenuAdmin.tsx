import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AjusteLocal, Categoria, ColorCategoria, Producto } from '../../types'
import type { MenuData } from '../../data/repo'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { costoProducto, importarMenuEjemplo, margen, precioEnLocal } from '../../lib/menu'
import { money, normalizar } from '../../lib/format'
import { Btn, Campo, Modal, inputBase, inputCls } from '../ui'
import { ProductoEditor } from './ProductoEditor'

const COLORES: { key: ColorCategoria; label: string; cls: string }[] = [
  { key: 'blue', label: 'Pizarra', cls: 'bg-pizarra' },
  { key: 'red', label: 'Tomate', cls: 'bg-tomate' },
  { key: 'amber', label: 'Muzza', cls: 'bg-muzza' },
  { key: 'green', label: 'Albahaca', cls: 'bg-albahaca' },
]
const bordeColor: Record<ColorCategoria, string> = { blue: 'bg-pizarra', red: 'bg-tomate', amber: 'bg-muzza', green: 'bg-albahaca' }

const numero = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v.replace(',', '.')) || 0))

/**
 * Menú madre (admin) o menú de un local: precio propio, agotado, oculto y productos propios.
 */
export function MenuAdmin() {
  const { sesion, sucursales, refrescarMenu, avisar } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  // null = menú madre
  const [vista, setVista] = useState<string | null>(esAdmin ? null : sesion?.sucursalId ?? null)
  const [menu, setMenu] = useState<MenuData | null>(null)
  const [catSel, setCatSel] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Producto | null | 'nuevo'>(null)
  const [catEdit, setCatEdit] = useState<Categoria | 'nueva' | null>(null)
  const [verAumento, setVerAumento] = useState(false)
  const [importando, setImportando] = useState('')

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
        {esAdmin ? (
          <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-linea" role="tablist" aria-label="Menú a editar">
            <button role="tab" aria-selected={vista === null} onClick={() => setVista(null)}
              className={`h-10 rounded-lg px-4 font-semibold ${vista === null ? 'bg-tinta text-white' : 'hover:bg-harina'}`}>Menú madre</button>
            {sucursales.map(s => (
              <button key={s.id} role="tab" aria-selected={vista === s.id} onClick={() => setVista(s.id)}
                className={`h-10 rounded-lg px-4 font-semibold ${vista === s.id ? 'bg-tinta text-white' : 'hover:bg-harina'}`}>{s.nombre}</button>
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
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center ring-1 ring-linea">
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
            {categorias.map(c => {
              const n = menu.productos.filter(p => p.categoriaId === c.id).length
              return (
                <button key={c.id} onClick={() => { setCatSel(c.id); setBusqueda('') }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${catSel === c.id && !busqueda ? 'bg-white shadow-sm ring-1 ring-linea' : 'hover:bg-white/60'} ${c.activa ? '' : 'opacity-50'}`}>
                  <span className={`h-6 w-1.5 rounded-full ${bordeColor[c.color]}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.nombre}</span>
                  {c.sucursalId && <span className="rounded bg-muzza-claro px-1.5 text-xs font-semibold">Propia</span>}
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
              {cat && !busqueda && puedeEditar(cat) && <Btn onClick={() => setCatEdit(cat)}>Editar categoría</Btn>}
              {cat && !busqueda && <Btn onClick={() => setVerAumento(true)}>Aumentar precios</Btn>}
              <Btn tono="albahaca" onClick={() => setEditando('nuevo')}>+ Nuevo producto{enLocal ? ' propio' : ''}</Btn>
            </div>

            <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-linea">
              <table className="w-full min-w-[720px] text-left">
                <thead className="border-b border-linea text-sm text-gris">
                  <tr>
                    <th className="px-3 py-2 font-medium">Producto</th>
                    {enLocal && <th className="px-3 py-2 text-right font-medium">Menú madre</th>}
                    <th className="px-3 py-2 text-right font-medium">{enLocal ? 'Precio en el local' : 'Precio'}</th>
                    <th className="px-3 py-2 text-right font-medium">Costo</th>
                    <th className="px-3 py-2 text-right font-medium">Margen</th>
                    {enLocal && <th className="px-3 py-2 text-center font-medium">Agotado</th>}
                    {enLocal && <th className="px-3 py-2 text-center font-medium">Visible</th>}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {productos.map(p => {
                    const a = ajustes.get(p.id)
                    const ef = precioEnLocal(p, a)
                    const costo = costoProducto(p, menu.productos, menu.ingredientes)
                    const m = margen(ef.precio, costo)
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
                            {busqueda && <span className="text-gris">{categorias.find(c => c.id === p.categoriaId)?.nombre}</span>}
                          </div>
                        </td>
                        {enLocal && (
                          <td className="px-3 py-2.5 text-right tabular-nums text-gris">
                            {propio ? '' : <>{money(p.precio)}{p.precioMitad != null && <div className="text-xs">½ {money(p.precioMitad)}</div>}</>}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {enLocal && !propio ? (
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
                        <td className="px-3 py-2.5 text-right tabular-nums text-gris">{costo ? money(costo) : '—'}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${!costo ? 'text-gris' : m < 50 ? 'text-tomate' : 'text-albahaca'}`}>
                          {costo ? `${Math.round(m)}%` : '—'}
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
                          {puedeEditar(p) && <Btn onClick={() => setEditando(p)}>Editar</Btn>}
                        </td>
                      </tr>
                    )
                  })}
                  {!productos.length && (
                    <tr><td colSpan={8} className="px-3 py-10 text-center text-gris">
                      {busqueda ? `Nada coincide con “${busqueda}”.` : 'Esta categoría no tiene productos. Agregá el primero con “Nuevo producto”.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
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
          onClose={() => setCatEdit(null)}
          onGuardado={async c => { setCatEdit(null); setCatSel(c.id); await despuesDeGuardar() }}
        />
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
        className={`h-9 rounded-lg border px-2 text-right tabular-nums outline-none focus:border-pizarra ${mitad ? 'w-24 text-sm' : 'w-28'} ${valor != null ? 'border-muzza bg-muzza-claro font-semibold' : 'border-linea bg-white'}`} />
    </div>
  )
}

function CategoriaEditor({ categoria, sucursalId, orden, onClose, onGuardado }: {
  categoria: Categoria | null; sucursalId?: string; orden: number; onClose: () => void; onGuardado: (c: Categoria) => void
}) {
  const avisar = useApp(s => s.avisar)
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [color, setColor] = useState<ColorCategoria>(categoria?.color ?? 'blue')
  const [pos, setPos] = useState(categoria?.orden ?? orden)
  const [activa, setActiva] = useState(categoria?.activa ?? true)
  const guardar = async () => {
    if (!nombre.trim()) return
    try {
      const c = await repo.guardarCategoria({
        id: categoria?.id, nombre: nombre.trim().toUpperCase(), color, orden: pos, activa,
        sucursalId: categoria ? categoria.sucursalId : sucursalId,
      })
      onGuardado(c)
    } catch (e) { avisar(mensajeError(e), 'error') }
  }
  return (
    <Modal titulo={categoria ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose} ancho="max-w-md"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn tono="albahaca" disabled={!nombre.trim()} onClick={guardar}>Guardar</Btn></div>}>
      <div className="space-y-4 p-5">
        <Campo label="Nombre">
          <input id="cat-nombre" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} placeholder="PIZZAS GRANDES"
            onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
        </Campo>
        <div>
          <span className="mb-1 block text-sm font-medium text-gris">Color del botón</span>
          <div className="flex gap-2">
            {COLORES.map(c => (
              <button key={c.key} type="button" onClick={() => setColor(c.key)} aria-pressed={color === c.key}
                className={`flex h-10 items-center gap-2 rounded-lg px-3 ring-1 ${color === c.key ? 'bg-white ring-2 ring-tinta' : 'bg-white ring-linea'}`}>
                <span className={`size-4 rounded-full ${c.cls}`} />{c.label}
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
