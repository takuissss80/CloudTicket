import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Ingrediente, Producto, StockItem } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { formatCantidad, unidadCantidad } from '../../lib/stock'
import { normalizar } from '../../lib/format'
import { Btn, Campo, Modal, inputBase, inputCls } from '../ui'
import { HistorialIngresos } from './HistorialIngresos'

const numero = (v: string) => (v.trim() === '' ? 0 : Math.max(0, Number(v.replace(',', '.')) || 0))

/** Stock de ingredientes de un local: ingreso de mercadería, ajustes, decomisos y mínimos */
export function Stock() {
  const { sesion, sucursales, sucursalId, avisar, refrescarMenu } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  const [local, setLocal] = useState(esAdmin ? sucursalId : sesion?.sucursalId ?? null)
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [stock, setStock] = useState<StockItem[] | null>(null)
  const [filtro, setFiltro] = useState('')
  const [soloBajos, setSoloBajos] = useState(false)
  const [verIngreso, setVerIngreso] = useState(false)
  const [ajustar, setAjustar] = useState<Ingrediente | null>(null)
  const [verHistorial, setVerHistorial] = useState(false)
  // Todos, también los desactivados: para mostrar nombres en el historial
  const [todos, setTodos] = useState<Ingrediente[]>([])
  // Productos con receta: al ingresarlos se suma el stock de sus ingredientes
  const [productos, setProductos] = useState<Producto[]>([])

  const cargar = useCallback(async () => {
    if (!local) return
    try {
      const [m, s] = await Promise.all([repo.getMenu(null), repo.getStock(local)])
      setTodos(m.ingredientes)
      setProductos(m.productos.filter(p => p.tipo !== 'promo' && p.receta.length > 0))
      setIngredientes(m.ingredientes.filter(i => i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setStock(s)
    } catch (e) { avisar(mensajeError(e), 'error') }
  }, [local, avisar])
  useEffect(() => { setStock(null); cargar() }, [cargar])

  const de = useMemo(() => new Map((stock ?? []).map(s => [s.ingredienteId, s])), [stock])
  const filas = ingredientes.map(i => {
    const s = de.get(i.id)
    const cantidad = s?.cantidad ?? 0
    const minimo = s?.minimo ?? 0
    return { i, cantidad, minimo, bajo: cantidad < 0 || (minimo > 0 && cantidad <= minimo) }
  })
  const visibles = filas.filter(f => (!filtro || normalizar(f.i.nombre).includes(normalizar(filtro))) && (!soloBajos || f.bajo))
  const bajos = filas.filter(f => f.bajo).length

  const guardarMinimo = async (ing: Ingrediente, v: string) => {
    if (!local) return
    try { await repo.setStockMinimo(local, ing.id, numero(v)); await cargar() }
    catch (e) { avisar(mensajeError(e), 'error') }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Stock</h2>
          <p className="text-[15px] text-gris">Se descuenta solo al vender, según la receta de cada producto. Sumá lo que entra con el ingreso de mercadería.</p>
        </div>
        {esAdmin && sucursales.length > 1 && (
          <select aria-label="Local del stock" value={local ?? ''} onChange={e => setLocal(e.target.value)} className={`${inputBase} w-56`}>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        <Btn onClick={() => setVerHistorial(true)} disabled={!local}>Historial de ingresos</Btn>
        <Btn tono="albahaca" onClick={() => setVerIngreso(true)} disabled={!ingredientes.length}>Ingresar mercadería</Btn>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-superficie p-4 ring-1 ring-linea"><div className="text-sm text-gris">Ingredientes</div><div className="font-cond text-3xl font-bold tabular-nums">{filas.length}</div></div>
        <button onClick={() => setSoloBajos(!soloBajos)} aria-pressed={soloBajos}
          className={`rounded-xl p-4 text-left ring-1 ${bajos ? 'bg-tomate-claro ring-tomate' : 'bg-superficie ring-linea'} ${soloBajos ? 'ring-2' : ''}`}>
          <div className="text-sm text-gris">Bajo el mínimo o en negativo</div>
          <div className={`font-cond text-3xl font-bold tabular-nums ${bajos ? 'text-tomate' : ''}`}>{bajos}</div>
          <div className="text-xs text-gris">{soloBajos ? 'Mostrando solo estos. Tocá para ver todos' : 'Tocá para ver solo estos'}</div>
        </button>
      </div>

      <input aria-label="Buscar ingrediente" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar ingrediente" className={`${inputBase} w-full sm:w-72`} />

      {!stock ? <p className="p-8 text-center text-gris">Cargando…</p> : !ingredientes.length ? (
        <p className="rounded-xl bg-superficie p-8 text-center text-gris ring-1 ring-linea">No hay ingredientes cargados. El administrador los carga en la pestaña Ingredientes y les arma la receta a los productos.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <thead className="border-b border-linea text-sm text-gris">
              <tr>
                <th className="px-3 py-2 font-medium">Ingrediente</th>
                <th className="px-3 py-2 text-right font-medium">Stock</th>
                <th className="px-3 py-2 text-right font-medium">Mínimo</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {visibles.map(f => (
                <tr key={f.i.id} className={f.bajo ? 'bg-tomate-claro/40' : ''}>
                  <td className="px-3 py-2 font-semibold">{f.i.nombre}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${f.bajo || f.cantidad < 0 ? 'text-tomate' : f.cantidad === 0 ? 'text-gris' : ''}`}>{formatCantidad(f.cantidad, f.i.unidad)}</td>
                  <td className="px-3 py-2 text-right">
                    <MinimoInput valor={f.minimo} unidad={unidadCantidad(f.i.unidad)} etiqueta={`Mínimo de ${f.i.nombre}`} onGuardar={v => guardarMinimo(f.i, v)} />
                  </td>
                  <td className="px-3 py-2 text-right"><Btn onClick={() => setAjustar(f.i)}>Ajustar</Btn></td>
                </tr>
              ))}
              {!visibles.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-gris">Nada para mostrar con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {verHistorial && local && (
        <HistorialIngresos sucursalId={local} nombreLocal={sucursales.find(s => s.id === local)?.nombre ?? ''} ingredientes={todos} onClose={() => setVerHistorial(false)} />
      )}
      {verIngreso && local && (
        <IngresoModal sucursalId={local} ingredientes={ingredientes} productos={productos} onClose={() => setVerIngreso(false)}
          onListo={async () => { setVerIngreso(false); avisar('Mercadería ingresada'); await cargar(); await refrescarMenu() }} />
      )}
      {ajustar && local && (
        <AjusteModal sucursalId={local} ingrediente={ajustar} actual={de.get(ajustar.id)?.cantidad ?? 0} onClose={() => setAjustar(null)}
          onListo={async () => { setAjustar(null); avisar('Stock actualizado'); await cargar() }} />
      )}
    </div>
  )
}

function MinimoInput({ valor, unidad, etiqueta, onGuardar }: { valor: number; unidad: string; etiqueta: string; onGuardar: (v: string) => void }) {
  const inicial = valor ? String(Math.round(valor * 1000) / 1000).replace('.', ',') : ''
  const [t, setT] = useState(inicial)
  useEffect(() => setT(inicial), [inicial])
  return (
    <span className="inline-flex items-center gap-1">
      <input aria-label={etiqueta} inputMode="decimal" value={t} placeholder="0" onChange={e => setT(e.target.value)}
        onBlur={() => { if (t !== inicial) onGuardar(t) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="h-9 w-20 rounded-lg border border-linea bg-superficie px-2 text-right tabular-nums outline-none focus:border-pizarra" />
      <span className="w-6 text-left text-sm text-gris">{unidad}</span>
    </span>
  )
}

/** Fila del ingreso: un ingrediente ('i:id') o un producto con receta ('p:id') */
interface FilaIngreso { clave: string; cantidad: string }

function IngresoModal({ sucursalId, ingredientes, productos, onClose, onListo }: {
  sucursalId: string; ingredientes: Ingrediente[]; productos: Producto[]; onClose: () => void; onListo: () => void
}) {
  const { avisar } = useApp()
  const [filas, setFilas] = useState<FilaIngreso[]>([])
  const [proveedor, setProveedor] = useState('')
  const [comprobante, setComprobante] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ingDe = useMemo(() => new Map(ingredientes.map(i => [i.id, i])), [ingredientes])
  const prodDe = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])
  const validas = filas.filter(f => numero(f.cantidad) > 0)

  const agregar = (clave: string) => setFilas(fs => fs.some(f => f.clave === clave) ? fs : [...fs, { clave, cantidad: '' }])
  const set = (i: number, cantidad: string) => setFilas(fs => fs.map((f, j) => j === i ? { ...f, cantidad } : f))

  const guardar = async () => {
    // Los productos se pasan a sus ingredientes según la receta (ej.: 24 latas Pepsi = 24 u. del ingrediente Lata Pepsi)
    const suma = new Map<string, number>()
    for (const f of validas) {
      const [tipo, id] = [f.clave.slice(0, 1), f.clave.slice(2)]
      const n = numero(f.cantidad)
      if (tipo === 'i') suma.set(id, (suma.get(id) ?? 0) + n)
      else for (const r of prodDe.get(id)?.receta ?? []) suma.set(r.ingredienteId, (suma.get(r.ingredienteId) ?? 0) + r.cantidad * n)
    }
    setEnviando(true)
    try {
      await repo.registrarIngreso(sucursalId, {
        items: [...suma].map(([ingredienteId, cantidad]) => ({ ingredienteId, cantidad, costo: 0 })),
        proveedor, comprobante, observaciones: obs, actualizarCosto: false, pagarConCaja: false,
      })
      onListo()
    } catch (e) { avisar(mensajeError(e), 'error') }
    setEnviando(false)
  }

  return (
    <Modal titulo="Ingreso de mercadería" onClose={onClose} ancho="max-w-3xl" alto
      pie={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" disabled={enviando || !validas.length} onClick={guardar}>{enviando ? 'Guardando…' : 'Guardar ingreso'}</Btn>
        </div>
      }>
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Proveedor"><input id="ing-proveedor" value={proveedor} onChange={e => setProveedor(e.target.value)} className={inputCls} placeholder="Lácteos del Oeste" /></Campo>
          <Campo label="Remito o factura"><input id="ing-comprobante" value={comprobante} onChange={e => setComprobante(e.target.value)} className={inputCls} placeholder="R 0001-00012345" /></Campo>
        </div>
        <BuscarMercaderia ingredientes={ingredientes} productos={productos} elegidos={new Set(filas.map(f => f.clave))} onElegir={agregar} />
        {filas.length > 0 && (
          <div>
            <div className="mb-1 grid grid-cols-[1fr_9rem_2rem] gap-2 text-sm font-medium text-gris">
              <span>Producto o ingrediente</span><span className="text-right">Cantidad</span><span />
            </div>
            <div className="space-y-2">
              {filas.map((f, i) => {
                const esProd = f.clave.startsWith('p:')
                const ing = esProd ? undefined : ingDe.get(f.clave.slice(2))
                const prod = esProd ? prodDe.get(f.clave.slice(2)) : undefined
                const nombre = prod?.nombre ?? ing?.nombre ?? '—'
                return (
                  <div key={f.clave} className="grid grid-cols-[1fr_9rem_2rem] items-center gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{nombre}</div>
                      {prod && <div className="truncate text-sm text-gris">Suma: {prod.receta.map(r => ingDe.get(r.ingredienteId)?.nombre).filter(Boolean).join(', ')}</div>}
                    </div>
                    <span className="relative">
                      <input autoFocus={i === filas.length - 1} aria-label={`Cantidad de ${nombre}`} inputMode="decimal" value={f.cantidad} onChange={e => set(i, e.target.value)}
                        className={`${inputBase} w-full pr-9 text-right`} />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gris">{prod ? 'u.' : ing ? unidadCantidad(ing.unidad) : ''}</span>
                    </span>
                    <button aria-label={`Quitar ${nombre}`} onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-sm text-gris">Los ingredientes van en su unidad: gramos, mililitros o unidades (25 kg de muzzarella = 25000). Los productos, en unidades.</p>
          </div>
        )}
        <Campo label="Observaciones (opcional)"><input id="ing-obs" value={obs} onChange={e => setObs(e.target.value)} className={inputCls} /></Campo>
      </div>
    </Modal>
  )
}

/** Buscador de ingredientes y productos para el ingreso de mercadería */
function BuscarMercaderia({ ingredientes, productos, elegidos, onElegir }: {
  ingredientes: Ingrediente[]; productos: Producto[]; elegidos: Set<string>; onElegir: (clave: string) => void
}) {
  const [q, setQ] = useState('')
  const [activo, setActivo] = useState(0)
  const t = normalizar(q.trim())
  const opciones = useMemo(() => {
    const todas = [
      ...ingredientes.map(i => ({ clave: `i:${i.id}`, nombre: i.nombre, tipo: 'Ingrediente' })),
      ...productos.map(p => ({ clave: `p:${p.id}`, nombre: p.nombre, tipo: 'Producto' })),
    ]
    return (t ? todas.filter(o => t.split(/\s+/).every(w => normalizar(o.nombre).includes(w))) : todas)
      .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'Ingrediente' ? -1 : 1) || a.nombre.localeCompare(b.nombre)).slice(0, 40)
  }, [ingredientes, productos, t])
  const elegir = (clave: string) => { onElegir(clave); setQ(''); setActivo(0) }
  return (
    <div>
      <label htmlFor="ing-buscar" className="mb-1 block text-sm font-medium text-gris">Agregar producto o ingrediente</label>
      <input id="ing-buscar" value={q} onChange={e => { setQ(e.target.value); setActivo(0) }} autoComplete="off"
        placeholder="Buscá por nombre (ej.: muzzarella, pepsi, cajas)"
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(a + 1, opciones.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && opciones[activo]) { e.preventDefault(); elegir(opciones[activo].clave) }
        }}
        className={`${inputBase} h-11 w-full`} />
      {t && (
        <ul role="listbox" aria-label="Resultados" className="mt-1 max-h-64 overflow-y-auto rounded-lg bg-superficie ring-1 ring-linea">
          {opciones.map((o, i) => (
            <li key={o.clave} role="option" aria-selected={i === activo}>
              <button type="button" onClick={() => elegir(o.clave)} onMouseEnter={() => setActivo(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === activo ? 'bg-albahaca-claro' : ''}`}>
                <span className="font-semibold">{o.nombre}{elegidos.has(o.clave) && <span className="text-sm font-normal text-gris"> · ya agregado</span>}</span>
                <span className="text-sm text-gris">{o.tipo}</span>
              </button>
            </li>
          ))}
          {!opciones.length && <li className="px-3 py-3 text-gris">No hay nada con ese nombre.</li>}
        </ul>
      )}
    </div>
  )
}

function AjusteModal({ sucursalId, ingrediente, actual, onClose, onListo }: { sucursalId: string; ingrediente: Ingrediente; actual: number; onClose: () => void; onListo: () => void }) {
  const avisar = useApp(s => s.avisar)
  const [tipo, setTipo] = useState<'ajuste' | 'decomiso'>('ajuste')
  const [cant, setCant] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const base = numero(cant)
  const resultado = tipo === 'ajuste' ? base : actual - base

  const guardar = async () => {
    setEnviando(true)
    try { await repo.ajustarStock(sucursalId, ingrediente.id, tipo, base, motivo); onListo() }
    catch (e) { avisar(mensajeError(e), 'error') }
    setEnviando(false)
  }

  return (
    <Modal titulo={`Ajustar ${ingrediente.nombre}`} onClose={onClose} ancho="max-w-md"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn tono="albahaca" disabled={enviando || cant.trim() === '' || (tipo === 'decomiso' && !base)} onClick={guardar}>Guardar</Btn></div>}>
      <div className="space-y-4 p-5">
        <p>Stock actual: <b>{formatCantidad(actual, ingrediente.unidad)}</b></p>
        <div className="flex gap-1 rounded-xl bg-harina p-1">
          {(['ajuste', 'decomiso'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)} aria-pressed={tipo === t}
              className={`h-10 flex-1 rounded-lg font-semibold ${tipo === t ? 'bg-superficie shadow-sm' : 'text-gris'}`}>
              {t === 'ajuste' ? 'Conté el stock' : 'Decomiso (se tiró)'}
            </button>
          ))}
        </div>
        <Campo label={tipo === 'ajuste' ? `Cantidad real contada (${unidadCantidad(ingrediente.unidad)})` : `Cantidad que se tiró (${unidadCantidad(ingrediente.unidad)})`}>
          <input id="ajuste-cant" autoFocus inputMode="decimal" value={cant} onChange={e => setCant(e.target.value)} className={`${inputCls} text-right font-semibold`} />
        </Campo>
        <Campo label="Motivo (opcional)">
          <input id="ajuste-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls} placeholder={tipo === 'ajuste' ? 'Conteo de fin de mes' : 'Vencida'} />
        </Campo>
        {cant.trim() !== '' && <p className="text-[15px]">Queda en <b>{formatCantidad(resultado, ingrediente.unidad)}</b>.</p>}
      </div>
    </Modal>
  )
}
