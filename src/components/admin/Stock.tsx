import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Ingrediente, StockItem } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { factorCompra, formatCantidad, unidadCompra, valorStock } from '../../lib/stock'
import { money, normalizar } from '../../lib/format'
import { Btn, Campo, Modal, inputBase, inputCls } from '../ui'

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

  const cargar = useCallback(async () => {
    if (!local) return
    try {
      const [m, s] = await Promise.all([repo.getMenu(null), repo.getStock(local)])
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
    return { i, cantidad, minimo, bajo: cantidad < 0 || (minimo > 0 && cantidad <= minimo), valor: valorStock(cantidad, i) }
  })
  const visibles = filas.filter(f => (!filtro || normalizar(f.i.nombre).includes(normalizar(filtro))) && (!soloBajos || f.bajo))
  const valorTotal = filas.reduce((s, f) => s + f.valor, 0)
  const bajos = filas.filter(f => f.bajo).length

  const guardarMinimo = async (ing: Ingrediente, v: string) => {
    if (!local) return
    try { await repo.setStockMinimo(local, ing.id, numero(v) * factorCompra(ing.unidad)); await cargar() }
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
        <Btn tono="albahaca" onClick={() => setVerIngreso(true)} disabled={!ingredientes.length}>Ingresar mercadería</Btn>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 ring-1 ring-linea"><div className="text-sm text-gris">Valor del stock</div><div className="font-cond text-3xl font-bold tabular-nums">{money(valorTotal)}</div></div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-linea"><div className="text-sm text-gris">Ingredientes</div><div className="font-cond text-3xl font-bold tabular-nums">{filas.length}</div></div>
        <button onClick={() => setSoloBajos(!soloBajos)} aria-pressed={soloBajos}
          className={`rounded-xl p-4 text-left ring-1 ${bajos ? 'bg-tomate-claro ring-tomate' : 'bg-white ring-linea'} ${soloBajos ? 'ring-2' : ''}`}>
          <div className="text-sm text-gris">Bajo el mínimo o en negativo</div>
          <div className={`font-cond text-3xl font-bold tabular-nums ${bajos ? 'text-tomate' : ''}`}>{bajos}</div>
          <div className="text-xs text-gris">{soloBajos ? 'Mostrando solo estos. Tocá para ver todos' : 'Tocá para ver solo estos'}</div>
        </button>
      </div>

      <input aria-label="Buscar ingrediente" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar ingrediente" className={`${inputBase} w-full sm:w-72`} />

      {!stock ? <p className="p-8 text-center text-gris">Cargando…</p> : !ingredientes.length ? (
        <p className="rounded-xl bg-white p-8 text-center text-gris ring-1 ring-linea">No hay ingredientes cargados. El administrador los carga en la pestaña Ingredientes y les arma la receta a los productos.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-linea">
          <table className="w-full min-w-[680px] text-left text-[15px]">
            <thead className="border-b border-linea text-sm text-gris">
              <tr>
                <th className="px-3 py-2 font-medium">Ingrediente</th>
                <th className="px-3 py-2 text-right font-medium">Stock</th>
                <th className="px-3 py-2 text-right font-medium">Mínimo</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {visibles.map(f => (
                <tr key={f.i.id} className={f.bajo ? 'bg-tomate-claro/40' : ''}>
                  <td className="px-3 py-2 font-semibold">{f.i.nombre}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${f.bajo || f.cantidad < 0 ? 'text-tomate' : f.cantidad === 0 ? 'text-gris' : ''}`}>{formatCantidad(f.cantidad, f.i.unidad)}</td>
                  <td className="px-3 py-2 text-right">
                    <MinimoInput valor={f.minimo / factorCompra(f.i.unidad)} unidad={unidadCompra(f.i.unidad)} etiqueta={`Mínimo de ${f.i.nombre}`} onGuardar={v => guardarMinimo(f.i, v)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gris">{money(f.valor)}</td>
                  <td className="px-3 py-2 text-right"><Btn onClick={() => setAjustar(f.i)}>Ajustar</Btn></td>
                </tr>
              ))}
              {!visibles.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-gris">Nada para mostrar con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {verIngreso && local && (
        <IngresoModal sucursalId={local} ingredientes={ingredientes} onClose={() => setVerIngreso(false)}
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
        className="h-9 w-20 rounded-lg border border-linea bg-white px-2 text-right tabular-nums outline-none focus:border-pizarra" />
      <span className="w-6 text-left text-sm text-gris">{unidad}</span>
    </span>
  )
}

interface FilaIngreso { ingredienteId: string; cantidad: string; costo: string }

function IngresoModal({ sucursalId, ingredientes, onClose, onListo }: { sucursalId: string; ingredientes: Ingrediente[]; onClose: () => void; onListo: () => void }) {
  const { avisar, caja, sucursalId: localActivo } = useApp()
  const [filas, setFilas] = useState<FilaIngreso[]>([{ ingredienteId: '', cantidad: '', costo: '' }])
  const [proveedor, setProveedor] = useState('')
  const [comprobante, setComprobante] = useState('')
  const [obs, setObs] = useState('')
  const [actualizarCosto, setActualizarCosto] = useState(true)
  const [pagarConCaja, setPagarConCaja] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const hayCaja = sucursalId === localActivo && !!caja
  const total = filas.reduce((s, f) => s + numero(f.costo), 0)
  const validas = filas.filter(f => f.ingredienteId && numero(f.cantidad) > 0)

  const set = (i: number, x: Partial<FilaIngreso>) => setFilas(fs => {
    const n = fs.map((f, j) => j === i ? { ...f, ...x } : f)
    // siempre una fila vacía al final
    return n[n.length - 1].ingredienteId ? [...n, { ingredienteId: '', cantidad: '', costo: '' }] : n
  })

  const guardar = async () => {
    setEnviando(true)
    try {
      await repo.registrarIngreso(sucursalId, {
        items: validas.map(f => {
          const ing = ingredientes.find(x => x.id === f.ingredienteId)!
          return { ingredienteId: f.ingredienteId, cantidad: numero(f.cantidad) * factorCompra(ing.unidad), costo: numero(f.costo) }
        }),
        proveedor, comprobante, observaciones: obs, actualizarCosto, pagarConCaja: hayCaja && pagarConCaja,
      })
      onListo()
    } catch (e) { avisar(mensajeError(e), 'error') }
    setEnviando(false)
  }

  return (
    <Modal titulo="Ingreso de mercadería" onClose={onClose} ancho="max-w-3xl" alto
      pie={
        <div className="flex flex-wrap items-center gap-3">
          <span className="mr-auto font-cond text-3xl font-bold">Total {money(total)}</span>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" disabled={enviando || !validas.length} onClick={guardar}>{enviando ? 'Guardando…' : 'Guardar ingreso'}</Btn>
        </div>
      }>
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Proveedor"><input id="ing-proveedor" value={proveedor} onChange={e => setProveedor(e.target.value)} className={inputCls} placeholder="Lácteos del Oeste" /></Campo>
          <Campo label="Remito o factura"><input id="ing-comprobante" value={comprobante} onChange={e => setComprobante(e.target.value)} className={inputCls} placeholder="R 0001-00012345" /></Campo>
        </div>
        <div>
          <div className="mb-1 grid grid-cols-[1fr_7rem_8rem_2rem] gap-2 text-sm font-medium text-gris">
            <span>Ingrediente</span><span className="text-right">Cantidad</span><span className="text-right">Pagaste $</span><span />
          </div>
          <div className="space-y-2">
            {filas.map((f, i) => {
              const ing = ingredientes.find(x => x.id === f.ingredienteId)
              return (
                <div key={i} className="grid grid-cols-[1fr_7rem_8rem_2rem] items-center gap-2">
                  <select aria-label={`Ingrediente ${i + 1}`} value={f.ingredienteId} onChange={e => set(i, { ingredienteId: e.target.value })} className={`${inputBase} min-w-0`}>
                    <option value="">{i === filas.length - 1 ? '+ Agregar ingrediente' : 'Elegí'}</option>
                    {ingredientes.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                  <span className="relative">
                    <input aria-label={`Cantidad ${i + 1}`} inputMode="decimal" value={f.cantidad} disabled={!ing} onChange={e => set(i, { cantidad: e.target.value })}
                      className={`${inputBase} w-full pr-9 text-right`} />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gris">{ing ? unidadCompra(ing.unidad) : ''}</span>
                  </span>
                  <input aria-label={`Costo ${i + 1}`} inputMode="decimal" value={f.costo} disabled={!ing} onChange={e => set(i, { costo: e.target.value })} className={`${inputBase} w-full text-right`} />
                  {ing ? <button aria-label="Quitar" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button> : <span />}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-sm text-gris">La cantidad va en kilos o litros para lo que se mide en gramos o mililitros.</p>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" className="size-5 accent-pizarra" checked={actualizarCosto} onChange={e => setActualizarCosto(e.target.checked)} /> Actualizar el costo de los ingredientes con estos precios</label>
        <label className={`flex items-center gap-2 ${hayCaja ? '' : 'text-gris'}`}>
          <input type="checkbox" className="size-5 accent-pizarra" disabled={!hayCaja} checked={hayCaja && pagarConCaja} onChange={e => setPagarConCaja(e.target.checked)} />
          Se pagó con la plata de la caja {hayCaja ? '(queda como gasto "Pago remito")' : '(necesita la caja de este local abierta)'}
        </label>
        <Campo label="Observaciones (opcional)"><input id="ing-obs" value={obs} onChange={e => setObs(e.target.value)} className={inputCls} /></Campo>
      </div>
    </Modal>
  )
}

function AjusteModal({ sucursalId, ingrediente, actual, onClose, onListo }: { sucursalId: string; ingrediente: Ingrediente; actual: number; onClose: () => void; onListo: () => void }) {
  const avisar = useApp(s => s.avisar)
  const [tipo, setTipo] = useState<'ajuste' | 'decomiso'>('ajuste')
  const [cant, setCant] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const f = factorCompra(ingrediente.unidad)
  const base = numero(cant) * f
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
              className={`h-10 flex-1 rounded-lg font-semibold ${tipo === t ? 'bg-white shadow-sm' : 'text-gris'}`}>
              {t === 'ajuste' ? 'Conté el stock' : 'Decomiso (se tiró)'}
            </button>
          ))}
        </div>
        <Campo label={tipo === 'ajuste' ? `Cantidad real contada (${unidadCompra(ingrediente.unidad)})` : `Cantidad que se tiró (${unidadCompra(ingrediente.unidad)})`}>
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
