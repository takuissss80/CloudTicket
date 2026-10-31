import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { Cupon, UsoCupon } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { money } from '../../lib/format'
import { descargarCSV } from '../../lib/reportes'
import { estadoCupon, generarCodigo, generarCodigos, normalizarCodigo, textoValor, type EstadoCupon } from '../../lib/descuentos'
import { Btn, Campo, Confirmar, Modal, inputBase, inputCls } from '../ui'

const ESTADOS: Record<EstadoCupon, { label: string; cls: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-albahaca-claro text-albahaca' },
  programado: { label: 'Todavía no empieza', cls: 'bg-pizarra-claro text-pizarra' },
  vencido: { label: 'Vencido', cls: 'bg-linea text-gris' },
  inactivo: { label: 'Desactivado', cls: 'bg-linea text-gris' },
  usado: { label: 'Usado', cls: 'bg-muzza-claro text-tinta' },
}
const fechaCorta = (s?: string) => (s ? s.split('-').reverse().join('/') : '')
const textoVigencia = (c: Pick<Cupon, 'desde' | 'hasta'>) =>
  !c.desde && !c.hasta ? 'Sin vencimiento'
    : c.desde && c.hasta ? `${fechaCorta(c.desde)} al ${fechaCorta(c.hasta)}`
    : c.hasta ? `Hasta el ${fechaCorta(c.hasta)}` : `Desde el ${fechaCorta(c.desde)}, sin vencimiento`
const textoUsos = (max?: number) => (!max ? 'Ilimitado' : max === 1 ? 'Un solo uso' : `Hasta ${max} usos`)

type Borrar = { ids: string[]; texto: string; detalle: string }

/** Cupones de descuento de la cuenta (solo admin). Valen en todos los locales. */
export function Cupones() {
  const avisar = useApp(s => s.avisar)
  const [cupones, setCupones] = useState<Cupon[] | null>(null)
  const [usos, setUsos] = useState<Record<string, UsoCupon>>({})
  const [editar, setEditar] = useState<Partial<Cupon> | null>(null)
  const [generarLote, setGenerarLote] = useState(false)
  const [borrar, setBorrar] = useState<Borrar | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')

  const cargar = useCallback(async () => {
    const [c, u] = await Promise.all([repo.listCupones(), repo.usoCupones()])
    setCupones(c); setUsos(u)
  }, [])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])

  const intentar = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) avisar(ok); await cargar(); return true } catch (e) { avisar(mensajeError(e), 'error'); return false }
  }
  const usosDe = (c: Cupon) => usos[c.id]?.usos ?? 0

  // Sueltos y lotes (en el orden en que se crearon)
  const { sueltos, lotes } = useMemo(() => {
    const sueltos: Cupon[] = []
    const lotes = new Map<string, Cupon[]>()
    for (const c of cupones ?? []) {
      if (c.lote) { const l = lotes.get(c.lote) ?? []; l.push(c); lotes.set(c.lote, l) } else sueltos.push(c)
    }
    return { sueltos, lotes: [...lotes] }
  }, [cupones])

  const q = normalizarCodigo(buscar)
  const encontrados = q ? (cupones ?? []).filter(c => c.codigo.includes(q)) : null

  const fila = (c: Cupon, enLote = false) => {
    const u = usos[c.id]
    const est = ESTADOS[estadoCupon(c, u?.usos ?? 0)]
    return (
      <tr key={c.id} className={enLote ? 'bg-harina/60' : ''}>
        <td className={`py-2.5 ${enLote ? 'pl-8 pr-3' : 'px-4'}`}>
          <div className="font-mono text-base font-semibold">{c.codigo}</div>
          {c.descripcion && !enLote && <div className="text-sm text-gris">{c.descripcion}</div>}
          {c.lote && !enLote && <div className="text-sm text-gris">Lote {c.lote}</div>}
        </td>
        <td className="px-3 py-2.5 font-semibold">{textoValor(c.tipo, c.valor, money)}</td>
        <td className="px-3 py-2.5 text-gris">{textoVigencia(c)}<div className="text-sm">{textoUsos(c.maxUsos)}</div></td>
        <td className="px-3 py-2.5"><span className={`rounded px-2 py-0.5 text-xs font-bold ${est.cls}`}>{est.label}</span></td>
        <td className="px-3 py-2.5 text-right tabular-nums">{u?.usos ?? 0}{c.maxUsos ? ` / ${c.maxUsos}` : ''}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{money(u?.descontado ?? 0)}</td>
        <td className="px-3 py-2.5">
          <div className="flex justify-end gap-1">
            <Btn tono="fantasma" className="h-9 px-3" onClick={() => intentar(() => repo.guardarCupon({ ...c, activo: !c.activo }), c.activo ? `${c.codigo} desactivado` : `${c.codigo} activado`)}>
              {c.activo ? 'Desactivar' : 'Activar'}
            </Btn>
            <Btn tono="fantasma" className="h-9 px-3" onClick={() => setEditar(c)}>Editar</Btn>
            <button aria-label={`Eliminar ${c.codigo}`} title="Eliminar" onClick={() => setBorrar({
              ids: [c.id], texto: `¿Eliminar el cupón ${c.codigo}?`,
              detalle: 'Ya no se va a poder usar. Las comandas donde se usó conservan el descuento y el código. Si solo querés pausarlo, usá Desactivar.',
            })} className="size-9 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
          </div>
        </td>
      </tr>
    )
  }

  const filaLote = (nombre: string, lista: Cupon[]) => {
    const c0 = lista[0]
    const usados = lista.filter(c => usosDe(c) > 0).length
    const descontado = lista.reduce((s, c) => s + (usos[c.id]?.descontado ?? 0), 0)
    const activos = lista.filter(c => c.activo).length
    const ids = lista.map(c => c.id)
    const ver = abierto === nombre
    return (
      <Fragment key={`lote-${nombre}`}>
        <tr className="bg-pizarra-claro/40">
          <td className="px-4 py-2.5">
            <button onClick={() => setAbierto(ver ? null : nombre)} aria-expanded={ver} className="flex items-center gap-2 text-left">
              <span className={`inline-block transition ${ver ? 'rotate-90' : ''}`} aria-hidden>▸</span>
              <span>
                <span className="block font-semibold">Lote {nombre}</span>
                <span className="block text-sm text-gris">{lista.length} cupones{c0.descripcion ? ` · ${c0.descripcion}` : ''}</span>
              </span>
            </button>
          </td>
          <td className="px-3 py-2.5 font-semibold">{textoValor(c0.tipo, c0.valor, money)}</td>
          <td className="px-3 py-2.5 text-gris">{textoVigencia(c0)}<div className="text-sm">{textoUsos(c0.maxUsos)}</div></td>
          <td className="px-3 py-2.5 text-sm">
            {activos === 0 ? <span className="rounded bg-linea px-2 py-0.5 text-xs font-bold text-gris">Desactivado</span>
              : <span className="text-gris">{activos === lista.length ? 'Todos activos' : `${activos} activos`}</span>}
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums">{usados} / {lista.length}<div className="text-xs text-gris">usados</div></td>
          <td className="px-3 py-2.5 text-right tabular-nums">{money(descontado)}</td>
          <td className="px-3 py-2.5">
            <div className="flex flex-wrap justify-end gap-1">
              <Btn tono="fantasma" className="h-9 px-3" onClick={() => descargarCSV(`cupones-${nombre}`, [
                ['Código', 'Descuento', 'Vigencia', 'Usos permitidos', 'Usado', 'Activo'],
                ...lista.map(c => [c.codigo, textoValor(c.tipo, c.valor, money), textoVigencia(c), textoUsos(c.maxUsos), usosDe(c), c.activo ? 'Sí' : 'No']),
              ])}>Descargar</Btn>
              <Btn tono="fantasma" className="h-9 px-3" onClick={() => intentar(() => repo.activarCupones(ids, activos === 0), activos === 0 ? 'Lote activado' : 'Lote desactivado')}>
                {activos === 0 ? 'Activar todos' : 'Desactivar todos'}
              </Btn>
              <button aria-label={`Eliminar el lote ${nombre}`} title="Eliminar lote" onClick={() => setBorrar({
                ids, texto: `¿Eliminar el lote ${nombre} (${lista.length} cupones)?`,
                detalle: 'Ninguno de estos códigos se va a poder usar. Las comandas donde se usaron conservan el descuento. Si solo querés pausarlos, usá Desactivar todos.',
              })} className="size-9 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
            </div>
          </td>
        </tr>
        {ver && lista.map(c => fila(c, true))}
      </Fragment>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Cupones</h2>
          <p className="text-[15px] text-gris">Sirven en todos los locales. Al cobrar se carga el código y se aplica el descuento sobre los productos.</p>
        </div>
        <Btn onClick={() => setGenerarLote(true)}>Generar varios</Btn>
        <Btn tono="albahaca" onClick={() => setEditar({ tipo: 'porc', activo: true })}>+ Nuevo cupón</Btn>
      </div>
      {(cupones?.length ?? 0) > 5 && (
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar código" aria-label="Buscar código"
          className={`${inputBase} mb-3 w-full max-w-xs font-mono uppercase placeholder:font-sans placeholder:normal-case`} />
      )}

      <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
        <table className="w-full min-w-[860px] text-[15px]">
          <thead className="border-b border-linea text-left text-sm text-gris">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descuento</th>
              <th className="px-3 py-2 font-medium">Vigencia y usos</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Usos</th>
              <th className="px-3 py-2 text-right font-medium">Descontado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {encontrados ? encontrados.map(c => fila(c)) : <>
              {lotes.map(([n, l]) => filaLote(n, l))}
              {sueltos.map(c => fila(c))}
            </>}
            {encontrados && !encontrados.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-gris">Ningún cupón tiene ese código.</td></tr>}
            {cupones && !cupones.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gris">Todavía no hay cupones. Creá uno con “Nuevo cupón” o muchos con “Generar varios”.</td></tr>
            )}
            {!cupones && <tr><td colSpan={7} className="px-4 py-8 text-center text-gris">Cargando…</td></tr>}
          </tbody>
        </table>
      </div>

      {editar && (
        <EditorCupon modo="uno" inicial={editar} existentes={new Set((cupones ?? []).filter(c => c.id !== editar.id).map(c => c.codigo))}
          onClose={() => setEditar(null)}
          onGuardar={async lista => { if (await intentar(() => repo.guardarCupon(lista[0]), `Cupón ${lista[0].codigo} guardado`)) setEditar(null) }} />
      )}
      {generarLote && (
        <EditorCupon modo="lote" inicial={{ tipo: 'porc', activo: true, maxUsos: 1 }} existentes={new Set((cupones ?? []).map(c => c.codigo))}
          lotesUsados={new Set(lotes.map(([n]) => n))}
          onClose={() => setGenerarLote(false)}
          onGuardar={async lista => {
            if (await intentar(() => repo.crearCupones(lista), `Se generaron ${lista.length} cupones`)) { setGenerarLote(false); setAbierto(lista[0]?.lote ?? null) }
          }} />
      )}
      {borrar && (
        <Confirmar texto={borrar.texto} detalle={borrar.detalle} accion="Eliminar" onNo={() => setBorrar(null)}
          onSi={() => { const b = borrar; setBorrar(null); intentar(() => b.ids.length === 1 ? repo.eliminarCupon(b.ids[0]) : repo.eliminarCupones(b.ids), b.ids.length === 1 ? 'Cupón eliminado' : `${b.ids.length} cupones eliminados`) }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Editor: un cupón o un lote con la misma configuración
// ---------------------------------------------------------------------
type ModoUsos = 'ilimitado' | 'unico' | 'cantidad'

function EditorCupon({ modo, inicial, existentes, lotesUsados, onClose, onGuardar }: {
  modo: 'uno' | 'lote'; inicial: Partial<Cupon>; existentes: Set<string>; lotesUsados?: Set<string>
  onClose: () => void; onGuardar: (lista: (Omit<Cupon, 'id'> & { id?: string })[]) => void
}) {
  const lote = modo === 'lote'
  const ahora = new Date()
  const loteSugerido = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`

  const [codigo, setCodigo] = useState(inicial.codigo ?? '')
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? '')
  const [tipo, setTipo] = useState<Cupon['tipo']>(inicial.tipo ?? 'porc')
  const [valor, setValor] = useState(inicial.valor ? String(inicial.valor) : '')
  const [vence, setVence] = useState(!!inicial.hasta)
  const [desde, setDesde] = useState(inicial.desde ?? '')
  const [hasta, setHasta] = useState(inicial.hasta ?? '')
  const [activo, setActivo] = useState(inicial.activo ?? true)
  const [modoUsos, setModoUsos] = useState<ModoUsos>(!inicial.maxUsos ? 'ilimitado' : inicial.maxUsos === 1 ? 'unico' : 'cantidad')
  const [maxUsos, setMaxUsos] = useState(inicial.maxUsos && inicial.maxUsos > 1 ? String(inicial.maxUsos) : '5')
  // lote
  const [cantidad, setCantidad] = useState('100')
  const [prefijo, setPrefijo] = useState('')
  const [largo, setLargo] = useState(6)
  const [nombreLote, setNombreLote] = useState(loteSugerido)
  const [guardando, setGuardando] = useState(false)

  const cod = normalizarCodigo(codigo)
  const num = Math.max(0, Number(valor.replace(',', '.')) || 0)
  const cant = Math.floor(Number(cantidad) || 0)
  const usosNum = modoUsos === 'ilimitado' ? undefined : modoUsos === 'unico' ? 1 : Math.floor(Number(maxUsos) || 0)
  const pre = normalizarCodigo(prefijo)
  const ejemplo = useMemo(() => generarCodigo(largo, pre), [largo, pre])

  const errores = [
    !lote && cod.length < 3 && 'El código tiene que tener al menos 3 letras o números.',
    !lote && existentes.has(cod) && `Ya existe un cupón ${cod}.`,
    lote && (cant < 1 || cant > 1000) && 'Se pueden generar de 1 a 1000 cupones por vez.',
    lote && pre.length > 12 && 'El prefijo puede tener hasta 12 letras o números.',
    lote && !nombreLote.trim() && 'Poné un nombre para el lote.',
    lote && lotesUsados?.has(nombreLote.trim()) && 'Ya hay un lote con ese nombre.',
    !(num > 0) && 'Poné cuánto descuenta.',
    tipo === 'porc' && num > 100 && 'El porcentaje va hasta 100.',
    modoUsos === 'cantidad' && !(usosNum! >= 2) && 'La cantidad de usos tiene que ser 2 o más.',
    vence && !hasta && 'Elegí hasta qué día vale.',
    vence && desde && hasta && desde > hasta && 'La fecha de inicio es posterior al vencimiento.',
  ].filter(Boolean) as string[]

  const guardar = () => {
    const base = {
      descripcion: descripcion.trim() || undefined, tipo, valor: num,
      desde: desde || undefined, hasta: vence ? hasta || undefined : undefined, activo, maxUsos: usosNum,
    }
    if (!lote) { onGuardar([{ ...base, id: inicial.id, codigo: cod, lote: inicial.lote }]); return }
    setGuardando(true)
    const codigos = generarCodigos(cant, largo, pre, existentes)
    onGuardar(codigos.map(c => ({ ...base, codigo: c, lote: nombreLote.trim() })))
  }

  const segmento = <T extends string>(valorActual: T, opciones: readonly (readonly [T, string])[], set: (v: T) => void, etiqueta: string) => (
    <div className="flex overflow-hidden rounded-lg border border-linea" role="group" aria-label={etiqueta}>
      {opciones.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={valorActual === k} onClick={() => set(k)}
          className={`h-11 flex-1 whitespace-nowrap px-3 font-semibold ${valorActual === k ? 'bg-primario text-sobre-primario' : 'bg-superficie hover:bg-harina'}`}>{l}</button>
      ))}
    </div>
  )

  return (
    <Modal titulo={lote ? 'Generar varios cupones' : inicial.id ? `Editar cupón ${inicial.codigo}` : 'Nuevo cupón'} onClose={onClose} ancho="max-w-xl" alto
      pie={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {errores.length > 0 && <p className="mr-auto text-sm text-tomate">{errores[0]}</p>}
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn tono="albahaca" disabled={errores.length > 0 || guardando} onClick={guardar}>
            {lote ? (guardando ? 'Generando…' : `Generar ${cant > 0 ? cant : ''} cupones`) : 'Guardar cupón'}
          </Btn>
        </div>
      }>
      <div className="space-y-4 p-5">
        {lote ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Cantidad de cupones">
                <input id="lote-cantidad" inputMode="numeric" value={cantidad} onChange={e => setCantidad(e.target.value.replace(/\D/g, ''))}
                  className={`${inputCls} text-right text-lg font-semibold`} />
              </Campo>
              <Campo label="Nombre del lote">
                <input id="lote-nombre" value={nombreLote} onChange={e => setNombreLote(e.target.value)} className={inputCls} placeholder="Volantes noviembre" />
              </Campo>
              <Campo label="Prefijo (opcional)">
                <input id="lote-prefijo" value={prefijo} onChange={e => setPrefijo(normalizarCodigo(e.target.value))} className={`${inputCls} font-mono uppercase`} placeholder="NAPO" maxLength={12} />
              </Campo>
              <Campo label="Largo del código">
                <select id="lote-largo" value={largo} onChange={e => setLargo(Number(e.target.value))} className={inputCls}>
                  {[4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n} caracteres</option>)}
                </select>
              </Campo>
            </div>
            <p className="-mt-1 rounded-lg bg-harina px-3 py-2 text-sm">
              Ejemplo: <span className="font-mono font-semibold">{ejemplo}</span>. Sin 0, O, 1, I ni L para que no se confundan al dictarlos.
            </p>
          </>
        ) : (
          <Campo label="Código (lo dice el cliente al pedir)">
            <div className="flex gap-2">
              <input id="cupon-codigo" autoFocus value={codigo} onChange={e => setCodigo(normalizarCodigo(e.target.value))} placeholder="VERANO10"
                className={`${inputBase} min-w-0 flex-1 font-mono text-lg uppercase`} maxLength={30} autoComplete="off" />
              <Btn type="button" onClick={() => setCodigo(generarCodigo(8))}>Generar al azar</Btn>
            </div>
          </Campo>
        )}

        <Campo label="Descripción (opcional, solo para vos)">
          <input id="cupon-descripcion" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: promo Instagram" className={inputCls} />
        </Campo>

        <div>
          <span className="mb-1 block text-sm font-medium text-gris">Descuento</span>
          <div className="flex gap-2">
            <input id="cupon-valor" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0"
              className={`${inputBase} min-w-0 flex-1 text-right text-lg font-semibold`} />
            {segmento(tipo, [['porc', '% del pedido'], ['monto', '$ fijo']] as const, setTipo, 'Tipo de descuento')}
          </div>
          <p className="mt-1 text-sm text-gris">
            {tipo === 'porc' ? 'Se descuenta ese porcentaje de los productos (sin el envío).' : 'Se descuenta ese monto, nunca más que lo que suman los productos.'}
          </p>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gris">Usos {lote ? 'de cada cupón' : ''}</span>
          {segmento(modoUsos, [['unico', 'Un solo uso'], ['cantidad', 'Cantidad'], ['ilimitado', 'Ilimitado']] as const, setModoUsos, 'Cantidad de usos')}
          {modoUsos === 'cantidad' && (
            <label className="mt-2 flex items-center gap-2 text-[15px]">
              Se puede usar hasta
              <input id="cupon-max-usos" inputMode="numeric" value={maxUsos} onChange={e => setMaxUsos(e.target.value.replace(/\D/g, ''))}
                className={`${inputBase} w-20 text-right`} />
              veces
            </label>
          )}
          <p className="mt-1 text-sm text-gris">
            {modoUsos === 'unico' ? 'Una vez usado no se puede volver a usar. Si se anula esa comanda, el cupón vuelve a quedar libre.'
              : modoUsos === 'ilimitado' ? 'Se puede usar todas las veces que quieras mientras esté vigente.'
              : 'Cuando llega a ese número de usos ya no se acepta.'}
          </p>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gris">Vigencia</span>
          {segmento(vence ? 'si' : 'no', [['no', 'Sin vencimiento'], ['si', 'Hasta una fecha']] as const, v => setVence(v === 'si'), 'Vigencia')}
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
