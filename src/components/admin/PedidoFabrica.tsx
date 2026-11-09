import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Categoria, Ingrediente, PedidoFabrica as Pedido, Producto, StockItem, UnidadIngrediente } from '../../types'
import { PREFIJO_PRODUCTO, productoDePlanilla } from '../../data/repo'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { formatCantidad, unidadCantidad } from '../../lib/stock'
import { fecha, hora, normalizar } from '../../lib/format'
import { Btn, Campo, Confirmar, Modal, inputBase, inputCls } from '../ui'

const numero = (v: string) => (v.trim() === '' ? 0 : Math.max(0, Number(v.replace(',', '.')) || 0))
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const fechaPedido = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

export const ESTADO_PEDIDO: Record<Pedido['estado'], { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente de recibir', cls: 'bg-muzza-claro text-tinta ring-1 ring-muzza' },
  recibido: { label: 'Recibido', cls: 'bg-albahaca-claro text-tinta ring-1 ring-albahaca' },
  anulado: { label: 'Anulado', cls: 'bg-linea text-gris' },
}

/** Lo que se puede pedir a fábrica: un ingrediente o un producto del menú madre */
interface Pedible { clave: string; nombre: string; unidad: UnidadIngrediente; ingrediente?: Ingrediente; producto?: Producto; categoria?: string }
interface Catalogo { ingredientes: Ingrediente[]; productos: Producto[]; categorias: Categoria[] }

function resolver(clave: string, c: Catalogo): Pedible | undefined {
  const prodId = productoDePlanilla(clave)
  if (prodId) {
    const p = c.productos.find(x => x.id === prodId)
    return p && p.activo ? { clave, nombre: p.nombre, unidad: 'un', producto: p, categoria: c.categorias.find(x => x.id === p.categoriaId)?.nombre } : undefined
  }
  const i = c.ingredientes.find(x => x.id === clave)
  return i && i.activo ? { clave, nombre: i.nombre, unidad: i.unidad, ingrediente: i } : undefined
}

/** Pedido a la fábrica: armar el pedido con la planilla, historial y recepción (suma al stock) */
export function PedidoFabrica() {
  const { sesion, sucursales, sucursalId, avisar } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  const [local, setLocal] = useState(esAdmin ? sucursalId : sesion?.sucursalId ?? null)
  const [vista, setVista] = useState<'nuevo' | 'historial'>('nuevo')
  const [catalogo, setCatalogo] = useState<Catalogo>({ ingredientes: [], productos: [], categorias: [] })
  const [planilla, setPlanilla] = useState<string[] | null>(null)
  const [stock, setStock] = useState<StockItem[]>([])
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [editarPlanilla, setEditarPlanilla] = useState(false)

  const cargar = useCallback(async () => {
    if (!local) return
    try {
      const [m, p, s, ped] = await Promise.all([repo.getMenu(null), repo.getPlanillaFabrica(), repo.getStock(local), repo.listPedidosFabrica([local])])
      setCatalogo({ ingredientes: m.ingredientes, productos: m.productos.filter(x => !x.sucursalId && x.tipo !== 'promo'), categorias: m.categorias.filter(x => !x.sucursalId) })
      setPlanilla(p)
      setStock(s)
      setPedidos(ped)
    } catch (e) { avisar(mensajeError(e), 'error') }
  }, [local, avisar])
  useEffect(() => { setPedidos(null); cargar() }, [cargar])

  const pendientes = (pedidos ?? []).filter(p => p.estado === 'pendiente').length
  const nombreLocal = sucursales.find(s => s.id === local)?.nombre ?? ''

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Pedido a fábrica</h2>
          <p className="text-gris">Armá el pedido con la planilla, y cuando llega controlalo: lo que llegó se suma solo al stock.</p>
        </div>
        {esAdmin && sucursales.length > 1 && (
          <select aria-label="Local" value={local ?? ''} onChange={e => setLocal(e.target.value)} className={`${inputBase} h-10 w-auto`}>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        {esAdmin && <Btn onClick={() => setEditarPlanilla(true)}>Personalizar planilla</Btn>}
      </div>

      <div className="flex gap-1 rounded-xl bg-superficie p-1 ring-1 ring-linea" role="tablist">
        {([['nuevo', 'Nuevo pedido'], ['historial', `Pedidos realizados${pendientes ? ` (${pendientes} por recibir)` : ''}`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`h-10 flex-1 rounded-lg font-semibold ${vista === k ? 'bg-primario text-sobre-primario' : 'hover:bg-harina'}`}>{l}</button>
        ))}
      </div>

      {!planilla || !pedidos ? <p className="p-8 text-center text-gris">Cargando…</p>
        : vista === 'nuevo' ? (
          <NuevoPedido local={local!} nombreLocal={nombreLocal} catalogo={catalogo} planilla={planilla} stock={stock} esAdmin={esAdmin}
            onPersonalizar={() => setEditarPlanilla(true)}
            onGuardado={async () => { await cargar(); setVista('historial') }} />
        ) : (
          <ListaPedidosFabrica pedidos={pedidos} onCambio={cargar} puedeOperar />
        )}

      {editarPlanilla && (
        <EditorPlanilla catalogo={catalogo} planilla={planilla ?? []} onClose={() => setEditarPlanilla(false)}
          onGuardada={async () => { setEditarPlanilla(false); await cargar() }} />
      )}
    </div>
  )
}

function NuevoPedido({ local, nombreLocal, catalogo, planilla, stock, esAdmin, onPersonalizar, onGuardado }: {
  local: string; nombreLocal: string; catalogo: Catalogo; planilla: string[]; stock: StockItem[]; esAdmin: boolean
  onPersonalizar: () => void; onGuardado: () => void
}) {
  const avisar = useApp(s => s.avisar)
  const [fechaP, setFechaP] = useState(hoyISO)
  const [notas, setNotas] = useState('')
  const [cant, setCant] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const filas = useMemo(() => planilla.map(k => resolver(k, catalogo)).filter((i): i is Pedible => !!i).map(i => {
    const s = i.ingrediente ? stock.find(x => x.ingredienteId === i.clave) : undefined
    const cantidad = s?.cantidad ?? 0, minimo = s?.minimo ?? 0
    return { i, cantidad, minimo, sugerido: minimo > 0 ? Math.max(0, Math.ceil(minimo - cantidad)) : 0 }
  }), [planilla, catalogo, stock])
  const cargados = filas.filter(f => numero(cant[f.i.clave] ?? '') > 0)
  const haySugeridos = filas.some(f => f.sugerido > 0)

  const guardar = async () => {
    setGuardando(true)
    try {
      await repo.crearPedidoFabrica(local, { fecha: fechaP, notas, items: cargados.map(f => ({ ...(f.i.producto ? { productoId: f.i.producto.id } : { ingredienteId: f.i.clave }), cantidad: numero(cant[f.i.clave]) })) })
      avisar('Pedido a fábrica guardado')
      setCant({}); setNotas(''); setConfirmar(false)
      onGuardado()
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setGuardando(false) }
  }

  if (!filas.length) return (
    <div className="rounded-xl bg-superficie p-8 text-center ring-1 ring-linea">
      <p className="text-lg font-semibold">La planilla de pedido está vacía</p>
      <p className="mt-1 text-gris">{esAdmin ? 'Elegí qué ingredientes y productos se le piden a la fábrica.' : 'El administrador tiene que armar la planilla con lo que se pide a la fábrica.'}</p>
      {esAdmin && <Btn tono="albahaca" className="mt-4" onClick={onPersonalizar}>Armar la planilla</Btn>}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-xl bg-superficie p-4 ring-1 ring-linea sm:grid-cols-[12rem_1fr]">
        <Campo label="Fecha del pedido">
          <input type="date" value={fechaP} onChange={e => setFechaP(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Notas para la fábrica (opcional)">
          <input value={notas} onChange={e => setNotas(e.target.value)} className={inputCls} placeholder="Ej: entregar antes de las 18" />
        </Campo>
      </div>

      <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
        <table className="w-full min-w-[620px] text-left text-[15px]">
          <thead className="border-b border-linea text-sm text-gris">
            <tr>
              <th className="px-3 py-2 font-medium">Ingrediente / producto</th>
              <th className="px-3 py-2 text-right font-medium">Stock ahora</th>
              <th className="px-3 py-2 text-right font-medium">Mínimo</th>
              <th className="px-3 py-2 text-right font-medium">Pedir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {filas.map(f => (
              <tr key={f.i.clave} className={numero(cant[f.i.clave] ?? '') > 0 ? 'bg-albahaca-claro/40' : ''}>
                <td className="px-3 py-2 font-semibold">
                  {f.i.nombre}
                  {f.i.producto && <span className="ml-2 rounded bg-pizarra-claro px-1.5 py-0.5 text-xs font-semibold text-tinta">Producto{f.i.categoria ? ` · ${f.i.categoria}` : ''}</span>}
                </td>
                {f.i.producto ? <><td className="px-3 py-2 text-right text-gris">—</td><td className="px-3 py-2 text-right text-gris">—</td></> : <>
                  <td className={`px-3 py-2 text-right tabular-nums ${f.minimo > 0 && f.cantidad <= f.minimo ? 'font-semibold text-tomate' : 'text-gris'}`}>{formatCantidad(f.cantidad, f.i.unidad)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gris">{f.minimo ? formatCantidad(f.minimo, f.i.unidad) : '—'}</td>
                </>}
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <input inputMode="decimal" aria-label={`Cantidad de ${f.i.nombre}`} value={cant[f.i.clave] ?? ''} placeholder={f.sugerido ? String(f.sugerido) : '0'}
                      onChange={e => setCant(c => ({ ...c, [f.i.clave]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const t = [...document.querySelectorAll<HTMLInputElement>('input[aria-label^="Cantidad de "]')]; t[t.indexOf(e.currentTarget) + 1]?.focus() } }}
                      className={`${inputBase} h-9 w-28 text-right tabular-nums`} />
                    <span className="w-6 text-left text-sm text-gris">{unidadCantidad(f.i.unidad)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {haySugeridos && (
          <Btn onClick={() => setCant(c => { const n = { ...c }; filas.forEach(f => { if (f.sugerido > 0 && !numero(n[f.i.clave] ?? '')) n[f.i.clave] = String(f.sugerido) }); return n })}>
            Completar hasta el mínimo
          </Btn>
        )}
        <span className="ml-auto text-gris">{cargados.length} de {filas.length} con cantidad</span>
        <Btn tono="albahaca" disabled={!cargados.length || !fechaP || guardando} onClick={() => setConfirmar(true)}>Guardar pedido</Btn>
      </div>

      {confirmar && (
        <Modal titulo="Confirmar pedido a fábrica" onClose={() => setConfirmar(false)}
          pie={<div className="flex gap-2"><Btn onClick={() => setConfirmar(false)}>Volver</Btn><Btn tono="albahaca" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Confirmar pedido'}</Btn></div>}>
          <div className="space-y-2 p-5">
            <p><b>{nombreLocal}</b> · {fechaPedido(fechaP)}{notas.trim() ? ` · ${notas.trim()}` : ''}</p>
            <ul className="divide-y divide-linea rounded-xl bg-harina ring-1 ring-linea">
              {cargados.map(f => (
                <li key={f.i.clave} className="flex justify-between px-4 py-2"><span>{f.i.nombre}</span><b className="tabular-nums">{formatCantidad(numero(cant[f.i.clave]), f.i.unidad)}</b></li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Historial de pedidos (lo usan el local y la pantalla de Producción) */
export function ListaPedidosFabrica({ pedidos, onCambio, puedeOperar, mostrarLocal }: {
  pedidos: Pedido[]; onCambio: () => void; puedeOperar?: boolean; mostrarLocal?: boolean
}) {
  const { sucursales, avisar } = useApp()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [recibir, setRecibir] = useState<Pedido | null>(null)
  const [anular, setAnular] = useState<Pedido | null>(null)

  if (!pedidos.length) return <p className="rounded-xl bg-superficie p-8 text-center text-gris ring-1 ring-linea">Todavía no hay pedidos a fábrica.</p>

  return (
    <>
      <ul className="space-y-2">
        {pedidos.map(p => {
          const e = ESTADO_PEDIDO[p.estado]
          const faltantes = p.estado === 'recibido' ? p.items.filter(i => (i.recibido ?? 0) < i.cantidad).length : 0
          return (
            <li key={p.id} className="rounded-xl bg-superficie ring-1 ring-linea">
              <button onClick={() => setAbierto(a => (a === p.id ? null : p.id))} aria-expanded={abierto === p.id}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-harina">
                <span className="font-cond text-2xl font-bold tabular-nums">#{p.numero}</span>
                {mostrarLocal && <span className="font-semibold">{sucursales.find(s => s.id === p.sucursalId)?.nombre ?? ''}</span>}
                <span className="text-gris">{fechaPedido(p.fecha)} · {p.items.length} {p.items.length === 1 ? 'ítem' : 'ítems'}{p.creadoPor ? ` · ${p.creadoPor}` : ''}</span>
                <span className={`ml-auto rounded-full px-3 py-1 text-sm font-bold ${e.cls}`}>{e.label}</span>
                {faltantes > 0 && <span className="rounded-full bg-tomate-claro px-3 py-1 text-sm font-bold ring-1 ring-tomate">{faltantes} con faltante</span>}
              </button>
              {abierto === p.id && (
                <div className="border-t border-linea px-4 py-3">
                  {p.notas && <p className="mb-2 rounded-lg bg-muzza-claro px-3 py-2"><b>Notas:</b> {p.notas}</p>}
                  <table className="w-full text-[15px]">
                    <thead className="text-sm text-gris">
                      <tr><th className="py-1 text-left font-medium">Ingrediente / producto</th><th className="py-1 text-right font-medium">Pedido</th>{p.estado === 'recibido' && <th className="py-1 text-right font-medium">Llegó</th>}</tr>
                    </thead>
                    <tbody className="divide-y divide-linea">
                      {p.items.map(i => {
                        const falta = p.estado === 'recibido' && (i.recibido ?? 0) !== i.cantidad
                        return (
                          <tr key={i.id}>
                            <td className="py-1.5">{i.nombre}</td>
                            <td className="py-1.5 text-right tabular-nums">{formatCantidad(i.cantidad, i.unidad)}</td>
                            {p.estado === 'recibido' && (
                              <td className={`py-1.5 text-right font-semibold tabular-nums ${falta ? 'text-tomate' : 'text-albahaca'}`}>
                                {(i.recibido ?? 0) === 0 ? 'No llegó' : formatCantidad(i.recibido ?? 0, i.unidad)}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {p.recibidoAt && <p className="mt-2 text-sm text-gris">Recibido el {fecha(p.recibidoAt)} a las {hora(p.recibidoAt)}{p.recibidoPor ? ` por ${p.recibidoPor}` : ''}.</p>}
                  {puedeOperar && p.estado === 'pendiente' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn tono="albahaca" onClick={() => setRecibir(p)}>Recibir pedido</Btn>
                      <Btn tono="fantasma" className="text-tomate" onClick={() => setAnular(p)}>Anular</Btn>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {recibir && <RecibirPedido pedido={recibir} onClose={() => setRecibir(null)} onListo={() => { setRecibir(null); onCambio() }} />}
      {anular && (
        <Confirmar texto={`¿Anular el pedido #${anular.numero}?`} detalle="Queda en el historial como anulado y no suma nada al stock." accion="Anular pedido"
          onNo={() => setAnular(null)}
          onSi={async () => { const p = anular; setAnular(null); try { await repo.anularPedidoFabrica(p.id); avisar(`Pedido #${p.numero} anulado`); onCambio() } catch (e) { avisar(mensajeError(e), 'error') } }} />
      )}
    </>
  )
}

/** Control de lo que llegó: check en cada ítem y la cantidad real */
function RecibirPedido({ pedido, onClose, onListo }: { pedido: Pedido; onClose: () => void; onListo: () => void }) {
  const avisar = useApp(s => s.avisar)
  const [filas, setFilas] = useState(() => pedido.items.map(i => ({ ...i, ok: false, valor: String(i.cantidad) })))
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const cambiar = (id: string, c: Partial<{ ok: boolean; valor: string }>) => setFilas(fs => fs.map(f => (f.id === id ? { ...f, ...c } : f)))
  const recibido = (f: typeof filas[number]) => (f.ok ? numero(f.valor) : 0)
  const sinCheck = filas.filter(f => !f.ok).length
  const distintos = filas.filter(f => f.ok && numero(f.valor) !== f.cantidad).length

  const guardar = async () => {
    setGuardando(true)
    try {
      await repo.recibirPedidoFabrica(pedido.id, filas.map(f => ({ id: f.id, recibido: recibido(f) })))
      avisar(`Pedido #${pedido.numero} recibido: lo que llegó ya está en el stock`)
      onListo()
    } catch (e) { avisar(mensajeError(e), 'error'); setConfirmar(false) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo={`Recibir pedido #${pedido.numero}`} onClose={onClose} ancho="max-w-3xl"
      pie={
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-gris">{filas.length - sinCheck} de {filas.length} controlados</span>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" disabled={guardando} onClick={() => setConfirmar(true)}>Guardar</Btn>
        </div>
      }>
      <div className="space-y-3 p-5">
        <p className="text-gris">Tildá cada cosa que llegó. Si llegó otra cantidad, cambiala. Lo que quede <b>sin tildar</b> se toma como que <b>no llegó</b>.</p>
        <Btn onClick={() => setFilas(fs => fs.map(f => ({ ...f, ok: true })))}>Llegó todo</Btn>
        <ul className="divide-y divide-linea rounded-xl bg-superficie ring-1 ring-linea">
          {filas.map(f => {
            const distinto = f.ok && numero(f.valor) !== f.cantidad
            return (
              <li key={f.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${f.ok ? '' : 'bg-harina'}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="size-6 shrink-0 accent-albahaca" checked={f.ok} onChange={e => cambiar(f.id, { ok: e.target.checked })} />
                  <span className="min-w-0">
                    <span className={`block font-semibold ${f.ok ? '' : 'text-gris'}`}>{f.nombre}</span>
                    <span className="text-sm text-gris">Pedido: {formatCantidad(f.cantidad, f.unidad)}</span>
                  </span>
                </label>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-sm text-gris">Llegó</span>
                  <input inputMode="decimal" aria-label={`Cantidad recibida de ${f.nombre}`} value={f.valor}
                    onChange={e => cambiar(f.id, { valor: e.target.value, ok: true })}
                    className={`${inputBase} h-9 w-28 text-right tabular-nums ${distinto ? 'border-muzza bg-muzza-claro font-semibold' : ''} ${f.ok ? '' : 'opacity-50'}`} />
                  <span className="w-6 text-sm text-gris">{unidadCantidad(f.unidad)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {confirmar && (
        <Confirmar tono="albahaca" texto={`¿Guardar la recepción del pedido #${pedido.numero}?`}
          detalle={[
            filas.some(f => f.productoId) ? 'Los ingredientes que llegaron se suman al stock (los productos no llevan stock) y el pedido queda como recibido.' : 'Lo que llegó se suma al stock y el pedido queda como recibido.',
            sinCheck ? `${sinCheck} sin tildar: se toman como que no llegaron.` : '',
            distintos ? `${distintos} llegaron con otra cantidad.` : '',
          ].filter(Boolean).join(' ')}
          accion={guardando ? 'Guardando…' : 'Guardar y sumar al stock'} onNo={() => setConfirmar(false)} onSi={guardar} />
      )}
    </Modal>
  )
}

/** Qué ingredientes y productos aparecen en la planilla de pedido y en qué orden (para toda la cuenta) */
function EditorPlanilla({ catalogo, planilla, onClose, onGuardada }: {
  catalogo: Catalogo; planilla: string[]; onClose: () => void; onGuardada: () => void
}) {
  const avisar = useApp(s => s.avisar)
  const [orden, setOrden] = useState<string[]>(() => planilla.filter(k => resolver(k, catalogo)))
  const [guardando, setGuardando] = useState(false)
  const [lista, setLista] = useState<'ingredientes' | 'productos'>('ingredientes')
  const [filtro, setFiltro] = useState('')
  const q = normalizar(filtro.trim())
  const coincide = (n: string) => !q || normalizar(n).includes(q)
  const enPlanilla = new Set(orden)
  const ingFuera = catalogo.ingredientes.filter(i => i.activo && !enPlanilla.has(i.id) && coincide(i.nombre)).sort((a, b) => a.nombre.localeCompare(b.nombre))
  const nombreCat = (id: string) => catalogo.categorias.find(c => c.id === id)?.nombre ?? ''
  const prodFuera = catalogo.productos.filter(p => p.activo && !enPlanilla.has(PREFIJO_PRODUCTO + p.id) && coincide(`${p.nombre} ${nombreCat(p.categoriaId)}`))
  const grupos = [...catalogo.categorias].sort((a, b) => a.orden - b.orden)
    .map(c => ({ c, productos: prodFuera.filter(p => p.categoriaId === c.id).sort((a, b) => a.orden - b.orden) }))
    .filter(g => g.productos.length)
  const item = (k: string) => resolver(k, catalogo)
  const agregar = (claves: string[]) => setOrden(o => [...o, ...claves.filter(k => !o.includes(k))])
  const mover = (k: number, d: -1 | 1) => setOrden(o => { const n = [...o]; const j = k + d; if (j < 0 || j >= n.length) return o; [n[k], n[j]] = [n[j], n[k]]; return n })

  const guardar = async () => {
    setGuardando(true)
    try { await repo.guardarPlanillaFabrica(orden); avisar('Planilla guardada'); onGuardada() }
    catch (e) { avisar(mensajeError(e), 'error') } finally { setGuardando(false) }
  }

  const boton = (clave: string, nombre: string, detalle: string) => (
    <li key={clave}>
      <button onClick={() => agregar([clave])} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left ring-1 ring-linea hover:bg-albahaca-claro">
        <span className="font-bold text-albahaca">+</span><span className="flex-1">{nombre}</span><span className="text-sm text-gris">{detalle}</span>
      </button>
    </li>
  )

  return (
    <Modal titulo="Planilla de pedido a fábrica" onClose={onClose} ancho="max-w-4xl"
      pie={<div className="flex gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn tono="albahaca" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar planilla'}</Btn></div>}>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <section>
          <h3 className="mb-1 font-semibold">En la planilla ({orden.length})</h3>
          <p className="mb-2 text-sm text-gris">Es la misma planilla para todos los locales. Ordenala como la lee la fábrica.</p>
          <ul className="space-y-1">
            {orden.map((k, n) => {
              const it = item(k)
              const nombre = it?.nombre ?? ''
              return (
                <li key={k} className="flex items-center gap-2 rounded-lg bg-harina px-3 py-1.5 ring-1 ring-linea">
                  <span className="w-6 text-right text-sm text-gris tabular-nums">{n + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{nombre}{it?.producto && <span className="ml-1.5 text-xs font-normal text-gris">producto</span>}</span>
                  <button aria-label={`Subir ${nombre}`} disabled={n === 0} onClick={() => mover(n, -1)} className="grid size-8 place-items-center rounded-md hover:bg-superficie disabled:opacity-30">↑</button>
                  <button aria-label={`Bajar ${nombre}`} disabled={n === orden.length - 1} onClick={() => mover(n, 1)} className="grid size-8 place-items-center rounded-md hover:bg-superficie disabled:opacity-30">↓</button>
                  <button aria-label={`Sacar ${nombre}`} onClick={() => setOrden(o => o.filter(x => x !== k))} className="grid size-8 place-items-center rounded-md text-tomate hover:bg-tomate-claro">✕</button>
                </li>
              )
            })}
            {!orden.length && <li className="rounded-lg border-2 border-dashed border-linea p-4 text-center text-gris">Agregá ingredientes o productos de la lista</li>}
          </ul>
        </section>
        <section>
          <div className="mb-2 flex gap-1 rounded-lg bg-harina p-1 ring-1 ring-linea" role="tablist">
            {([['ingredientes', 'Ingredientes'], ['productos', 'Productos del menú']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={lista === k} onClick={() => setLista(k)}
                className={`h-9 flex-1 rounded-md text-sm font-semibold ${lista === k ? 'bg-superficie shadow-sm ring-1 ring-linea' : 'text-gris hover:text-tinta'}`}>{l}</button>
            ))}
          </div>
          <input aria-label="Buscar para agregar" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder={lista === 'ingredientes' ? 'Buscar ingrediente' : 'Buscar producto'} className={`${inputBase} mb-2 h-10 w-full`} />
          {lista === 'ingredientes' ? (
            <>
              {ingFuera.length > 0 && <button className="mb-1 text-sm font-semibold text-pizarra hover:underline" onClick={() => agregar(ingFuera.map(i => i.id))}>Agregar todos{q ? ' los de la búsqueda' : ''}</button>}
              <ul className="space-y-1">
                {ingFuera.map(i => boton(i.id, i.nombre, unidadCantidad(i.unidad)))}
                {!ingFuera.length && <li className="text-sm text-gris">{q ? 'Nada coincide.' : 'Están todos en la planilla.'}</li>}
              </ul>
            </>
          ) : (
            <div className="space-y-3">
              {grupos.map(g => (
                <div key={g.c.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <h4 className="text-sm font-bold uppercase text-gris">{g.c.nombre}</h4>
                    <button className="text-sm font-semibold text-pizarra hover:underline" onClick={() => agregar(g.productos.map(p => PREFIJO_PRODUCTO + p.id))}>Agregar los {g.productos.length}</button>
                  </div>
                  <ul className="space-y-1">{g.productos.map(p => boton(PREFIJO_PRODUCTO + p.id, p.nombre, 'u.'))}</ul>
                </div>
              ))}
              {!grupos.length && <p className="text-sm text-gris">{q ? 'Nada coincide.' : 'Están todos en la planilla.'}</p>}
              <p className="text-xs text-gris">Los productos se piden por unidad. Al recibirlos no suman al stock, porque el stock se lleva por ingrediente.</p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
