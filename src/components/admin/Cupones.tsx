import { useCallback, useEffect, useState } from 'react'
import type { Cupon, UsoCupon } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { money } from '../../lib/format'
import { estadoCupon, normalizarCodigo, textoValor, type EstadoCupon } from '../../lib/descuentos'
import { Btn, Campo, Confirmar, Modal, inputBase, inputCls } from '../ui'

const ESTADOS: Record<EstadoCupon, { label: string; cls: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-albahaca-claro text-albahaca' },
  programado: { label: 'Todavía no empieza', cls: 'bg-pizarra-claro text-pizarra' },
  vencido: { label: 'Vencido', cls: 'bg-linea text-gris' },
  inactivo: { label: 'Desactivado', cls: 'bg-linea text-gris' },
}
const fechaCorta = (s?: string) => (s ? s.split('-').reverse().join('/') : '')

/** Cupones de descuento de la cuenta (solo admin). Valen en todos los locales. */
export function Cupones() {
  const avisar = useApp(s => s.avisar)
  const [cupones, setCupones] = useState<Cupon[] | null>(null)
  const [usos, setUsos] = useState<Record<string, UsoCupon>>({})
  const [editar, setEditar] = useState<Partial<Cupon> | null>(null)
  const [borrar, setBorrar] = useState<Cupon | null>(null)

  const cargar = useCallback(async () => {
    const [c, u] = await Promise.all([repo.listCupones(), repo.usoCupones()])
    setCupones(c); setUsos(u)
  }, [])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])

  const intentar = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) avisar(ok); await cargar(); return true } catch (e) { avisar(mensajeError(e), 'error'); return false }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Cupones</h2>
          <p className="text-[15px] text-gris">Sirven en todos los locales. Al cobrar se carga el código y se aplica el descuento sobre los productos.</p>
        </div>
        <Btn tono="albahaca" onClick={() => setEditar({ tipo: 'porc', activo: true })}>+ Nuevo cupón</Btn>
      </div>

      <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
        <table className="w-full min-w-[720px] text-[15px]">
          <thead className="border-b border-linea text-left text-sm text-gris">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descuento</th>
              <th className="px-3 py-2 font-medium">Vigencia</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Usos</th>
              <th className="px-3 py-2 text-right font-medium">Descontado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {cupones?.map(c => {
              const est = ESTADOS[estadoCupon(c)]
              const u = usos[c.id]
              return (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-base font-semibold">{c.codigo}</div>
                    {c.descripcion && <div className="text-sm text-gris">{c.descripcion}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">{textoValor(c.tipo, c.valor, money)}</td>
                  <td className="px-3 py-2.5 text-gris">
                    {!c.desde && !c.hasta ? 'Sin vencimiento'
                      : c.desde && c.hasta ? `${fechaCorta(c.desde)} al ${fechaCorta(c.hasta)}`
                      : c.hasta ? `Hasta el ${fechaCorta(c.hasta)}` : `Desde el ${fechaCorta(c.desde)}, sin vencimiento`}
                  </td>
                  <td className="px-3 py-2.5"><span className={`rounded px-2 py-0.5 text-xs font-bold ${est.cls}`}>{est.label}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{u?.usos ?? 0}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(u?.descontado ?? 0)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Btn tono="fantasma" className="h-9 px-3" onClick={() => intentar(() => repo.guardarCupon({ ...c, activo: !c.activo }), c.activo ? `${c.codigo} desactivado` : `${c.codigo} activado`)}>
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </Btn>
                      <Btn tono="fantasma" className="h-9 px-3" onClick={() => setEditar(c)}>Editar</Btn>
                      <button aria-label={`Eliminar ${c.codigo}`} title="Eliminar" onClick={() => setBorrar(c)}
                        className="size-9 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {cupones && !cupones.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gris">Todavía no hay cupones. Creá el primero con “Nuevo cupón”.</td></tr>
            )}
            {!cupones && <tr><td colSpan={7} className="px-4 py-8 text-center text-gris">Cargando…</td></tr>}
          </tbody>
        </table>
      </div>

      {editar && (
        <EditorCupon inicial={editar} onClose={() => setEditar(null)}
          onGuardar={async c => { if (await intentar(() => repo.guardarCupon(c), `Cupón ${c.codigo} guardado`)) setEditar(null) }} />
      )}
      {borrar && (
        <Confirmar texto={`¿Eliminar el cupón ${borrar.codigo}?`}
          detalle="Ya no se va a poder usar. Las comandas donde se usó conservan el descuento y el código. Si solo querés pausarlo, usá Desactivar."
          accion="Eliminar" onNo={() => setBorrar(null)}
          onSi={() => { const c = borrar; setBorrar(null); intentar(() => repo.eliminarCupon(c.id), `Cupón ${c.codigo} eliminado`) }} />
      )}
    </div>
  )
}

function EditorCupon({ inicial, onClose, onGuardar }: { inicial: Partial<Cupon>; onClose: () => void; onGuardar: (c: Omit<Cupon, 'id'> & { id?: string }) => void }) {
  const [codigo, setCodigo] = useState(inicial.codigo ?? '')
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? '')
  const [tipo, setTipo] = useState<Cupon['tipo']>(inicial.tipo ?? 'porc')
  const [valor, setValor] = useState(inicial.valor ? String(inicial.valor) : '')
  const [vence, setVence] = useState(!!inicial.hasta)
  const [desde, setDesde] = useState(inicial.desde ?? '')
  const [hasta, setHasta] = useState(inicial.hasta ?? '')
  const [activo, setActivo] = useState(inicial.activo ?? true)

  const cod = normalizarCodigo(codigo)
  const num = Math.max(0, Number(valor.replace(',', '.')) || 0)
  const errores = [
    cod.length < 3 && 'El código tiene que tener al menos 3 letras o números.',
    !(num > 0) && 'Poné cuánto descuenta.',
    tipo === 'porc' && num > 100 && 'El porcentaje va hasta 100.',
    vence && !hasta && 'Elegí hasta qué día vale.',
    vence && desde && hasta && desde > hasta && 'La fecha de inicio es posterior al vencimiento.',
  ].filter(Boolean) as string[]

  return (
    <Modal titulo={inicial.id ? `Editar cupón ${inicial.codigo}` : 'Nuevo cupón'} onClose={onClose} ancho="max-w-lg"
      pie={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {errores.length > 0 && codigo && <p className="mr-auto text-sm text-tomate">{errores[0]}</p>}
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" disabled={errores.length > 0} onClick={() => onGuardar({
            id: inicial.id, codigo: cod, descripcion: descripcion.trim() || undefined, tipo, valor: num,
            desde: desde || undefined, hasta: vence ? hasta || undefined : undefined, activo,
          })}>Guardar cupón</Btn>
        </div>
      }>
      <div className="space-y-4 p-5">
        <Campo label="Código (lo dice el cliente al pedir)">
          <input id="cupon-codigo" autoFocus value={codigo} onChange={e => setCodigo(normalizarCodigo(e.target.value))} placeholder="VERANO10"
            className={`${inputCls} font-mono text-lg uppercase`} maxLength={30} autoComplete="off" />
        </Campo>
        <Campo label="Descripción (opcional, solo para vos)">
          <input id="cupon-descripcion" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: promo Instagram" className={inputCls} />
        </Campo>

        <div>
          <span className="mb-1 block text-sm font-medium text-gris">Descuento</span>
          <div className="flex gap-2">
            <input id="cupon-valor" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0"
              className={`${inputBase} min-w-0 flex-1 text-right text-lg font-semibold`} />
            <div className="flex overflow-hidden rounded-lg border border-linea" role="group" aria-label="Tipo de descuento">
              {([['porc', '% del pedido'], ['monto', '$ fijo']] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(k)}
                  className={`h-11 px-4 font-semibold ${tipo === k ? 'bg-primario text-sobre-primario' : 'bg-superficie hover:bg-harina'}`}>{l}</button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-sm text-gris">
            {tipo === 'porc' ? 'Se descuenta ese porcentaje de los productos (sin el envío).' : 'Se descuenta ese monto, nunca más que lo que suman los productos.'}
          </p>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gris">Vigencia</span>
          <div className="grid grid-cols-2 gap-2">
            {([[false, 'Sin vencimiento'], [true, 'Hasta una fecha']] as const).map(([v, l]) => (
              <button key={l} type="button" aria-pressed={vence === v} onClick={() => setVence(v)}
                className={`h-11 rounded-lg font-semibold ${vence === v ? 'bg-primario text-sobre-primario' : 'bg-harina hover:bg-linea'}`}>{l}</button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Campo label="Desde (opcional)">
              <input id="cupon-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
            </Campo>
            {vence && (
              <Campo label="Hasta (incluido)">
                <input id="cupon-hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />
              </Campo>
            )}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 accent-albahaca" checked={activo} onChange={e => setActivo(e.target.checked)} />
          <span className="font-semibold">Activo</span>
          <span className="text-sm text-gris">Desactivado no se puede usar, pero queda guardado</span>
        </label>
      </div>
    </Modal>
  )
}
