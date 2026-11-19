import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Caja, Comanda, MovimientoCaja, TipoMovimiento, TotalesCaja } from '../types'
import { FORMAS_PAGO, TIPOS_MOVIMIENTO } from '../types'
import { repo } from '../data'
import { useApp, useCierreCiegas, useLocalActivo } from '../store/app'
import { calcularTotales, cobradoPorForma, TURNOS_DEFECTO, turnoQueBloquea, turnoSugerido, ventasPorGrupo } from '../lib/caja'
import { fecha, hora, money } from '../lib/format'
import { minutosDelivery } from '../lib/estados'
import { Btn, Campo, Confirmar, Modal, inputBase, inputCls } from './ui'
import { HistorialCajas } from './HistorialCajas'

const numero = (v: string) => (v.trim() === '' ? 0 : Math.max(0, Number(v.replace(/\./g, '').replace(',', '.')) || 0))
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const fechaLarga = (iso: string) => `${DIAS[new Date(iso).getDay()]} ${fecha(iso)}`

// ---------------------------------------------------------------------
// Caja cerrada: abrir (con dinero inicial) o reabrir la última
// ---------------------------------------------------------------------
export function CajaCerrada() {
  const { abrirCaja, reabrirCaja, sucursalId, sesion } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  const ciegas = useCierreCiegas()
  const turnos = useLocalActivo()?.turnos ?? TURNOS_DEFECTO
  const nombres = turnos.map(t => t.nombre)
  const [turno, setTurno] = useState(() => turnoSugerido(turnos))
  const [ultima, setUltima] = useState<Caja | null | undefined>(undefined)
  const [recientes, setRecientes] = useState<Caja[]>([])
  const [inicial, setInicial] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const [confirmarReabrir, setConfirmarReabrir] = useState(false)

  useEffect(() => {
    if (!sucursalId) return
    repo.listCajas(sucursalId, 10).then(l => {
      const u = l[0] ?? null
      setUltima(u)
      setRecientes(l)
      // Si el turno sugerido ya no se puede abrir, se pasa al siguiente que sí
      if (!esAdmin) setTurno(t => turnoQueBloquea(t, l, turnos) ? nombres.find(x => !turnoQueBloquea(x, l, turnos)) ?? t : t)
      // Arranca con lo que quedó contado al cerrar la anterior
      if (u?.dineroCierre != null) setInicial(String(u.dineroCierre))
    }).catch(() => setUltima(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId])

  // Si cambian los turnos del local y el elegido ya no existe, se sugiere de nuevo
  useEffect(() => { if (!nombres.includes(turno)) setTurno(turnoSugerido(turnos)) }, [nombres.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const bloquea = turnoQueBloquea(turno, recientes, turnos)
  const bloqueado = !!bloquea && !esAdmin

  return (
    <div className="mx-auto mt-[8vh] max-w-md space-y-6 px-4 pb-10">
      <div className="text-center">
        <h1 className="font-cond text-5xl font-bold">La caja está cerrada</h1>
        <p className="mt-2 text-gris">Abrí la caja del turno para tomar pedidos. Las comandas se numeran desde 1 en cada caja.</p>
      </div>

      <section className="space-y-4 rounded-2xl bg-superficie p-5 ring-1 ring-linea">
        <div className="flex flex-wrap justify-center gap-2">
          {nombres.map(t => {
            const fuera = !!turnoQueBloquea(t, recientes, turnos)
            return (
              <button key={t} onClick={() => setTurno(t)} aria-pressed={turno === t} disabled={fuera && !esAdmin}
                title={fuera ? 'Hoy ya se abrió este turno o uno posterior' : undefined}
                className={`h-12 flex-1 rounded-xl font-semibold disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through ${turno === t ? 'bg-primario text-sobre-primario' : 'bg-harina hover:bg-linea'}`}>{t}</button>
            )
          })}
        </div>
        {bloquea && (
          <p className={`-mt-1 rounded-lg px-3 py-2 text-sm ${esAdmin ? 'bg-muzza-claro' : 'bg-tomate-claro text-tomate'}`}>
            Hoy ya se abrió la caja {bloquea.toLowerCase()}.{' '}
            {esAdmin ? 'Como administrador podés abrir este turno igual.' : `Los turnos van en orden: ${nombres.map(n => n.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' y $1')}. Solo el administrador puede abrir un turno anterior o repetirlo.`}
          </p>
        )}
        <Campo label="Dinero al inicio (efectivo en la caja)">
          <input id="caja-inicial" inputMode="decimal" value={inicial} onChange={e => setInicial(e.target.value)} placeholder="0"
            className={`${inputCls} text-right font-cond text-2xl font-bold`} />
        </Campo>
        {ultima?.dineroCierre != null && (
          <p className="-mt-2 text-sm text-gris">La caja anterior cerró con {money(ultima.dineroCierre)} contados.</p>
        )}
        <Btn tono="albahaca" grande className="w-full" disabled={bloqueado} onClick={() => abrirCaja(turno, numero(inicial))}>Abrir caja {turno.toLowerCase()}</Btn>
      </section>

      {ultima && ultima.estado === 'cerrada' && (
        <section className="rounded-2xl bg-superficie p-5 ring-1 ring-linea">
          <div className="text-sm font-medium text-gris">Última caja</div>
          <div className="mt-1 font-cond text-2xl font-bold">{fechaLarga(ultima.abiertaAt)}, turno {ultima.turno.toLowerCase()}</div>
          <p className="text-[15px] text-gris">
            Cerrada {ultima.cerradaAt ? `a las ${hora(ultima.cerradaAt)}` : ''}{ultima.cerradaPor ? ` por ${ultima.cerradaPor}` : ''}
            {ultima.totales && !ciegas ? `. ${ultima.totales.cantComandas} comandas, ${money(ultima.totales.totalVentas)}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={() => setConfirmarReabrir(true)}>Reabrir esta caja</Btn>
            {!ciegas && <Btn tono="fantasma" onClick={() => setVerHistorial(true)}>Ver historial de cajas</Btn>}
          </div>
        </section>
      )}

      {confirmarReabrir && ultima && (
        <Confirmar
          texto="¿Reabrir la última caja?"
          detalle="Seguís en la misma caja, con la misma numeración de comandas. Se borra el cierre que hiciste y lo volvés a hacer al terminar."
          accion="Reabrir caja"
          tono="pizarra"
          onNo={() => setConfirmarReabrir(false)}
          onSi={() => { setConfirmarReabrir(false); reabrirCaja(ultima.id) }}
        />
      )}
      {verHistorial && <HistorialCajas onClose={() => setVerHistorial(false)} />}
    </div>
  )
}

/** Dinero al inicio: el admin o el encargado lo pueden corregir mientras la caja está abierta */
function DineroInicio({ caja, compacto }: { caja: Caja; compacto?: boolean }) {
  const { sesion, cambiarDineroInicial } = useApp()
  const cajaAbierta = useApp(s => s.caja)
  const puede = (sesion?.rol === 'admin' || !!sesion?.puedeDescontar) && caja.estado === 'abierta' && cajaAbierta?.id === caja.id
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setGuardando(true)
    if (await cambiarDineroInicial(numero(valor))) setEditando(false)
    setGuardando(false)
  }
  return (
    <li className={`flex items-start justify-between gap-3 ${compacto ? 'py-1.5' : 'py-2.5'}`}>
      <div className="min-w-0">
        <div className="font-semibold">Dinero al inicio</div>
        {puede && !editando && (
          <button onClick={() => { setValor(String(caja.dineroInicial || 0)); setEditando(true) }}
            className="text-sm font-semibold text-albahaca underline-offset-2 hover:underline">Cambiar</button>
        )}
      </div>
      {editando ? (
        <div className="flex shrink-0 items-center gap-2">
          <input autoFocus inputMode="decimal" aria-label="Dinero al inicio" value={valor} onFocus={e => e.target.select()}
            onChange={e => setValor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }}
            className={`${inputBase} h-10 w-32 text-right font-semibold`} />
          <Btn onClick={() => setEditando(false)} disabled={guardando}>Cancelar</Btn>
          <Btn tono="albahaca" onClick={guardar} disabled={guardando || valor.trim() === ''}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      ) : (
        <span className="shrink-0 font-semibold tabular-nums">{money(caja.dineroInicial || 0)}</span>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------
// Resumen de movimientos (como en Datalive)
// ---------------------------------------------------------------------
/** Lo que suma a la caja a la izquierda, lo que resta a la derecha, y el teórico abajo */
export function ColumnasCaja({ caja, totales: t, detalleVentas, compacto }: { caja: Caja; totales: TotalesCaja; detalleVentas?: ReactNode; compacto?: boolean }) {
  const entra = (caja.dineroInicial || 0) + t.ventasEfectivo + t.totalIngresos
  const sale = t.totalGastos + t.totalEgresos + t.totalSueldos
  const fila = (label: string, monto: number, extra?: ReactNode) => (
    <li className={`flex items-start justify-between gap-3 ${compacto ? 'py-1.5' : 'py-2.5'}`}>
      <div className="min-w-0"><div className="font-semibold">{label}</div>{extra && <div className="text-sm text-gris">{extra}</div>}</div>
      <span className="shrink-0 font-semibold tabular-nums">{money(monto)}</span>
    </li>
  )
  const columna = (titulo: string, signo: '+' | '−', total: number, tono: string, filas: ReactNode) => (
    <section className="flex flex-col rounded-xl bg-superficie ring-1 ring-linea">
      <h4 className={`flex items-center gap-2 border-b border-linea px-4 py-2 text-sm font-bold uppercase tracking-wide ${tono}`}>
        <span className="font-cond text-xl leading-none">{signo}</span>{titulo}
      </h4>
      <ul className="flex-1 divide-y divide-linea px-4 text-[15px]">{filas}</ul>
      <div className={`flex justify-between border-t border-linea px-4 py-2.5 font-bold ${tono}`}>
        <span>Total</span><span className="tabular-nums">{signo === '−' && total ? '−' : ''}{money(total)}</span>
      </div>
    </section>
  )
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {columna('Entra a la caja', '+', entra, 'text-albahaca', <>
          <DineroInicio caja={caja} compacto={compacto} />
          {fila('Ventas en efectivo', t.ventasEfectivo, detalleVentas)}
          {fila('Ingresos de dinero', t.totalIngresos)}
        </>)}
        {columna('Sale de la caja', '−', sale, 'text-tomate', <>
          {fila('Gastos', t.totalGastos)}
          {fila('Retiros (egresos)', t.totalEgresos)}
          {fila('Sueldos', t.totalSueldos)}
        </>)}
      </div>
      <div className="flex items-end justify-between gap-3 rounded-xl bg-harina p-4">
        <div>
          <div className="font-semibold">Total teórico en caja</div>
          <div className="text-sm text-gris">{money(entra)} − {money(sale)}. Sin lo cobrado online.</div>
        </div>
        <div className="font-cond text-4xl font-bold tabular-nums">{money(t.efectivoTeorico)}</div>
      </div>
    </div>
  )
}

export function ResumenCaja({ caja, totales, comandas }: { caja: Caja; totales: TotalesCaja; comandas?: Comanda[] }) {
  const t = totales
  const online = t.totalVentas - t.ventasEfectivo
  const porForma = comandas ? cobradoPorForma(comandas) : null
  const menu = useApp(s => s.menu)
  const porGrupo = useMemo(() => (comandas ? ventasPorGrupo(comandas, menu.categorias, menu.productos) : []), [comandas, menu])
  const nombreForma = (forma: string) => FORMAS_PAGO.find(f => f.key === forma)?.label ?? forma
  const motos = new Map<string, { viajes: number; minutos: number }>()
  for (const c of comandas ?? []) {
    const m = c.entregadaAt && c.estado !== 'anulada' ? minutosDelivery(c) : null
    if (!c.repartidorNombre || m == null) continue
    const x = motos.get(c.repartidorNombre) ?? { viajes: 0, minutos: 0 }
    motos.set(c.repartidorNombre, { viajes: x.viajes + 1, minutos: x.minutos + m })
  }
  return (
    <div className="space-y-4">
      <ColumnasCaja caja={caja} totales={t} detalleVentas={
        <>
          {t.cantComandas} {t.cantComandas === 1 ? 'comanda' : 'comandas'} por {money(t.totalVentas)}
          {t.cantAnuladas ? `, ${t.cantAnuladas} anuladas` : ''}. Online y otros medios: {money(online)}
        </>
      } />
      {motos.size > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium text-gris">Viajes por moto</div>
          <ul className="divide-y divide-linea rounded-xl bg-superficie ring-1 ring-linea">
            {[...motos].map(([nombre, m]) => (
              <li key={nombre} className="flex justify-between px-4 py-2">
                <span>{nombre}: {m.viajes} {m.viajes === 1 ? 'viaje' : 'viajes'}</span>
                <span className="tabular-nums text-gris">promedio {Math.round(m.minutos / m.viajes)} min</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {porForma && porForma.size > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium text-gris">Cobrado por forma de pago</div>
          <ul className="divide-y divide-linea rounded-xl bg-superficie ring-1 ring-linea">
            {[...porForma].map(([forma, monto]) => (
              <li key={forma} className="flex justify-between px-4 py-2">
                <span>{nombreForma(forma)}</span>
                <b className="tabular-nums">{money(monto)}</b>
              </li>
            ))}
            <li className="flex justify-between bg-harina px-4 py-2 font-bold">
              <span>Total cobrado (todos los medios)</span>
              <span className="tabular-nums">{money([...porForma.values()].reduce((s, v) => s + v, 0))}</span>
            </li>
          </ul>
        </div>
      )}
      {porGrupo.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium text-gris">Venta por marca</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {porGrupo.map(g => (
              <section key={g.nombre} className="rounded-xl bg-superficie ring-1 ring-linea">
                <div className="flex items-baseline justify-between gap-2 border-b border-linea px-4 py-2.5">
                  <h4 className="font-cond text-xl font-bold">{g.nombre}</h4>
                  <span className="text-sm text-gris">{g.comandas} {g.comandas === 1 ? 'comanda' : 'comandas'}</span>
                </div>
                <ul className="divide-y divide-linea">
                  <li className="flex justify-between px-4 py-2 font-bold"><span>Venta total</span><span className="tabular-nums">{money(g.total)}</span></li>
                  {[...g.porForma].map(([forma, monto]) => (
                    <li key={forma} className="flex justify-between px-4 py-1.5 text-[15px]"><span>{nombreForma(forma)}</span><span className="tabular-nums">{money(monto)}</span></li>
                  ))}
                  {g.total - g.cobrado > 0.5 && (
                    <li className="flex justify-between px-4 py-1.5 text-[15px] text-gris"><span>Sin cobrar</span><span className="tabular-nums">{money(g.total - g.cobrado)}</span></li>
                  )}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-1 text-sm text-gris">El efectivo es una sola caja: esto es solo para ver cuánto vendió cada marca. Un pedido con productos de dos marcas se reparte según lo que suma cada una.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Movimientos del turno: gastos, retiros, ingresos, sueldos
// ---------------------------------------------------------------------
export function ListaMovimientos({ movimientos, onEliminar }: { movimientos: MovimientoCaja[]; onEliminar?: (m: MovimientoCaja) => void }) {
  if (!movimientos.length) return <p className="py-6 text-center text-gris">No hay movimientos en esta caja.</p>
  return (
    <ul className="divide-y divide-linea rounded-xl bg-superficie ring-1 ring-linea">
      {movimientos.map(m => {
        const tipo = TIPOS_MOVIMIENTO.find(t => t.key === m.tipo)
        return (
          <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-12 text-sm tabular-nums text-gris">{hora(m.createdAt)}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${m.tipo === 'ingreso' ? 'bg-albahaca-claro text-albahaca' : 'bg-tomate-claro text-tomate'}`}>
              {tipo?.label}{m.tipoGastoNombre ? `: ${m.tipoGastoNombre}` : ''}
            </span>
            <span className="min-w-0 flex-1 truncate">{m.concepto}{m.creadoPor && <span className="text-sm text-gris"> ({m.creadoPor})</span>}</span>
            <b className="tabular-nums">{m.tipo === 'ingreso' ? '' : '−'}{money(m.monto)}</b>
            {onEliminar && <button aria-label={`Borrar ${m.concepto}`} onClick={() => onEliminar(m)} className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>}
          </li>
        )
      })}
    </ul>
  )
}

function NuevoMovimiento() {
  const { tiposGasto, agregarMovimiento } = useApp()
  const [tipo, setTipo] = useState<TipoMovimiento>('gasto')
  const [tipoGastoId, setTipoGastoId] = useState('')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ayuda = TIPOS_MOVIMIENTO.find(t => t.key === tipo)?.ayuda

  const guardar = async () => {
    setEnviando(true)
    const ok = await agregarMovimiento({ tipo, tipoGastoId: tipo === 'gasto' ? tipoGastoId || undefined : undefined, concepto, monto: numero(monto) })
    setEnviando(false)
    if (ok) { setConcepto(''); setMonto('') }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); guardar() }} className="space-y-3 rounded-xl bg-superficie p-4 ring-1 ring-linea">
      <div className="flex flex-wrap gap-1">
        {TIPOS_MOVIMIENTO.map(t => (
          <button key={t.key} type="button" onClick={() => setTipo(t.key)} aria-pressed={tipo === t.key}
            className={`h-10 rounded-lg px-4 font-semibold ${tipo === t.key ? 'bg-primario text-sobre-primario' : 'bg-harina hover:bg-linea'}`}>{t.label}</button>
        ))}
      </div>
      <p className="text-sm text-gris">{ayuda}</p>
      <div className="flex flex-wrap gap-2">
        {tipo === 'gasto' && (
          <select aria-label="Tipo de gasto" value={tipoGastoId} onChange={e => setTipoGastoId(e.target.value)} className={`${inputBase} w-48`}>
            <option value="">Tipo de gasto</option>
            {tiposGasto.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        )}
        <input aria-label="Concepto" value={concepto} onChange={e => setConcepto(e.target.value)} className={`${inputBase} min-w-48 flex-1`}
          placeholder={tipo === 'gasto' ? 'Ariel delivery 9 viajes' : tipo === 'egreso' ? 'Retiro turno noche' : tipo === 'sueldo' ? 'Adelanto Juan' : 'Cambio inicial'} />
        <input aria-label="Monto" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} className={`${inputBase} w-32 text-right font-semibold`} placeholder="$" />
        <Btn tono="albahaca" className="h-11" disabled={enviando || !concepto.trim() || !numero(monto)}>Agregar</Btn>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// Panel de la caja abierta
// ---------------------------------------------------------------------
export function CajaPanel({ onClose }: { onClose: () => void }) {
  const { caja, comandas, movimientos, eliminarMovimiento } = useApp()
  const ciegas = useCierreCiegas()
  const [pestana, setPestana] = useState<'resumen' | 'movimientos'>('resumen')
  const [cerrando, setCerrando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [borrar, setBorrar] = useState<MovimientoCaja | null>(null)
  const totales = useMemo(() => caja ? calcularTotales(caja, comandas, movimientos) : null, [caja, comandas, movimientos])
  if (!caja || !totales) return null

  return (
    <Modal
      titulo={<span>Caja {caja.turno.toLowerCase()} <span className="font-sans text-lg font-semibold text-gris">{fechaLarga(caja.abiertaAt)}</span></span>}
      onClose={onClose}
      ancho="max-w-3xl"
      alto
      pie={
        <div className="flex flex-wrap items-center gap-2">
          {!ciegas && <Btn tono="fantasma" onClick={() => setVerHistorial(true)}>Historial de cajas</Btn>}
          <Btn tono="tomate" className="ml-auto" onClick={() => setCerrando(true)}>Cerrar caja</Btn>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-[15px] text-gris">Abierta a las {hora(caja.abiertaAt)}{caja.abiertaPor ? ` por ${caja.abiertaPor}` : ''}.</p>
        <div className="flex gap-1 rounded-xl bg-harina p-1" role="tablist">
          {(['resumen', 'movimientos'] as const).map(p => (
            <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
              className={`h-10 flex-1 rounded-lg font-semibold ${pestana === p ? 'bg-superficie shadow-sm' : 'text-gris'}`}>
              {p === 'resumen' ? 'Resumen' : `Gastos, retiros e ingresos (${movimientos.length})`}
            </button>
          ))}
        </div>
        {pestana === 'resumen'
          ? ciegas
            ? <p className="rounded-xl bg-harina p-6 text-center text-gris">Este local cierra la caja <b className="text-tinta">a ciegas</b>: al cerrar, contá el efectivo y ponelo sin ver lo vendido. El detalle lo ve el encargado.</p>
            : <ResumenCaja caja={caja} totales={totales} comandas={comandas} />
          : <div className="space-y-4"><NuevoMovimiento /><ListaMovimientos movimientos={movimientos} onEliminar={setBorrar} /></div>}
      </div>
      {cerrando && <CierreCaja totales={totales} onClose={() => setCerrando(false)} onCerrada={onClose} />}
      {verHistorial && <HistorialCajas onClose={() => setVerHistorial(false)} />}
      {borrar && (
        <Confirmar texto="¿Borrar este movimiento?" detalle={`${borrar.concepto}: ${money(borrar.monto)}`} accion="Borrar"
          onNo={() => setBorrar(null)} onSi={() => { eliminarMovimiento(borrar.id); setBorrar(null) }} />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------
// Cierre: efectivo contado y diferencia
// ---------------------------------------------------------------------
function CierreCaja({ totales, onClose, onCerrada }: { totales: TotalesCaja; onClose: () => void; onCerrada: () => void }) {
  const { caja, comandas, cerrarCaja, impresoras, imprimirCierre, sesion } = useApp()
  const ciegas = useCierreCiegas()
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Imprimir el cierre para guardarlo con las comandas (se recuerda en esta PC)
  const [imprimir, setImprimir] = useState(() => { try { return localStorage.getItem('cierre-imprimir') !== '0' } catch { return true } })
  const [impresoraId, setImpresoraId] = useState(() => (impresoras.find(i => i.imprimeMostrador) ?? impresoras[0])?.id ?? '')
  if (!caja) return null
  const real = numero(contado)
  const diferencia = real - totales.efectivoTeorico
  const validas = comandas.filter(c => c.estado !== 'anulada')
  const sinCobrar = validas.filter(c => !c.cobrada)
  const sinEntregar = validas.filter(c => c.estado !== 'entregado')

  const cerrar = async () => {
    setEnviando(true)
    const cerrada: Caja = {
      ...caja, estado: 'cerrada', cerradaAt: new Date().toISOString(), cerradaPor: sesion?.usuario,
      dineroCierre: real, diferencia: real - totales.efectivoTeorico, observaciones: obs.trim() || undefined, totales,
    }
    const ok = await cerrarCaja(real, obs)
    if (ok && imprimir && impresoras.length) await imprimirCierre(cerrada, impresoraId)
    setEnviando(false)
    if (ok) { onClose(); onCerrada() }
  }

  return (
    <Modal titulo={`Cerrar caja ${caja.turno.toLowerCase()}`} onClose={onClose} ancho="max-w-3xl"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onClose}>Volver</Btn><Btn tono="tomate" disabled={enviando || contado.trim() === ''} onClick={cerrar}>Cerrar caja</Btn></div>}>
      <div className="space-y-4 p-5">
        {(sinCobrar.length > 0 || sinEntregar.length > 0) && (
          <div className="rounded-xl bg-muzza-claro p-4 text-[15px]">
            {sinEntregar.length > 0 && <p><b>{sinEntregar.length}</b> sin entregar: {sinEntregar.map(c => `#${c.numero}`).join(', ')}</p>}
            {sinCobrar.length > 0 && <p><b>{sinCobrar.length}</b> sin cobrar{ciegas ? '' : ` (${money(sinCobrar.reduce((s, c) => s + c.total, 0))})`}: no suman al efectivo.</p>}
          </div>
        )}
        {ciegas
          ? <p className="rounded-xl bg-harina px-4 py-3 text-[15px]">Cierre <b>a ciegas</b>: contá todo el efectivo de la caja (incluido el cambio del inicio) y ponelo abajo.</p>
          : <ColumnasCaja caja={caja} totales={totales} compacto />}
        <Campo label="Efectivo contado (dinero real en la caja)">
          <input id="caja-contado" autoFocus inputMode="decimal" value={contado} onChange={e => setContado(e.target.value)} placeholder="0"
            className={`${inputCls} h-14 text-right font-cond text-3xl font-bold`} />
        </Campo>
        {contado.trim() !== '' && (
          <div className={`flex items-center justify-between rounded-xl p-4 font-semibold ${diferencia > -0.01 ? 'bg-albahaca-claro text-albahaca' : 'bg-tomate-claro text-tomate'}`}>
            {ciegas ? (
              <span className="text-lg">{Math.abs(diferencia) < 0.01 ? '✓ El efectivo está correcto' : diferencia > 0 ? 'Hay un sobrante: volvé a contar antes de cerrar' : 'Hay un faltante: volvé a contar antes de cerrar'}</span>
            ) : <>
              <span>{Math.abs(diferencia) < 0.01 ? 'Sin diferencia' : diferencia > 0 ? 'Sobra' : 'Falta'}</span>
              <span className="font-cond text-3xl font-bold tabular-nums">{diferencia > 0 ? '+' : diferencia < 0 ? '−' : ''}{money(Math.abs(diferencia))}</span>
            </>}
          </div>
        )}
        <Campo label="Observaciones (opcional)">
          <textarea id="caja-obs" rows={2} value={obs} onChange={e => setObs(e.target.value)} className={`${inputCls} h-auto py-2`} placeholder="Ej: faltante por vuelto mal dado" />
        </Campo>
        {impresoras.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-harina px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 font-semibold">
              <input type="checkbox" className="size-5 accent-albahaca" checked={imprimir}
                onChange={e => { setImprimir(e.target.checked); try { localStorage.setItem('cierre-imprimir', e.target.checked ? '1' : '0') } catch { /* */ } }} />
              Imprimir el cierre de caja
            </label>
            {imprimir && impresoras.length > 1 && (
              <select aria-label="Comandera para el cierre" value={impresoraId} onChange={e => setImpresoraId(e.target.value)} className={`${inputBase} h-10 w-auto`}>
                {impresoras.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            )}
          </div>
        ) : <p className="text-sm text-gris">Para imprimir el cierre, configurá una comandera en Administración → Impresión.</p>}
        <p className="text-sm text-gris">Lo contado queda como dinero al inicio sugerido para la próxima caja.</p>
      </div>
    </Modal>
  )
}

