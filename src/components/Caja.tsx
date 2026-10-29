import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Caja, Comanda, MovimientoCaja, TipoMovimiento, TotalesCaja } from '../types'
import { FORMAS_PAGO, TIPOS_MOVIMIENTO } from '../types'
import { repo } from '../data'
import { useApp } from '../store/app'
import { calcularTotales, cobradoPorForma, TURNOS, turnoSugerido } from '../lib/caja'
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
  const { abrirCaja, reabrirCaja, sucursalId } = useApp()
  const [turno, setTurno] = useState(turnoSugerido())
  const [ultima, setUltima] = useState<Caja | null | undefined>(undefined)
  const [inicial, setInicial] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const [confirmarReabrir, setConfirmarReabrir] = useState(false)

  useEffect(() => {
    if (!sucursalId) return
    repo.listCajas(sucursalId, 1).then(l => {
      const u = l[0] ?? null
      setUltima(u)
      // Arranca con lo que quedó contado al cerrar la anterior
      if (u?.dineroCierre != null) setInicial(String(u.dineroCierre))
    }).catch(() => setUltima(null))
  }, [sucursalId])

  return (
    <div className="mx-auto mt-[8vh] max-w-md space-y-6 px-4 pb-10">
      <div className="text-center">
        <h1 className="font-cond text-5xl font-bold">La caja está cerrada</h1>
        <p className="mt-2 text-gris">Abrí la caja del turno para tomar pedidos. Las comandas se numeran desde 1 en cada caja.</p>
      </div>

      <section className="space-y-4 rounded-2xl bg-superficie p-5 ring-1 ring-linea">
        <div className="flex justify-center gap-2">
          {TURNOS.map(t => (
            <button key={t} onClick={() => setTurno(t)} aria-pressed={turno === t}
              className={`h-12 flex-1 rounded-xl font-semibold ${turno === t ? 'bg-primario text-sobre-primario' : 'bg-harina hover:bg-linea'}`}>{t}</button>
          ))}
        </div>
        <Campo label="Dinero al inicio (efectivo en la caja)">
          <input id="caja-inicial" inputMode="decimal" value={inicial} onChange={e => setInicial(e.target.value)} placeholder="0"
            className={`${inputCls} text-right font-cond text-2xl font-bold`} />
        </Campo>
        {ultima?.dineroCierre != null && (
          <p className="-mt-2 text-sm text-gris">La caja anterior cerró con {money(ultima.dineroCierre)} contados.</p>
        )}
        <Btn tono="albahaca" grande className="w-full" onClick={() => abrirCaja(turno, numero(inicial))}>Abrir caja {turno.toLowerCase()}</Btn>
      </section>

      {ultima && ultima.estado === 'cerrada' && (
        <section className="rounded-2xl bg-superficie p-5 ring-1 ring-linea">
          <div className="text-sm font-medium text-gris">Última caja</div>
          <div className="mt-1 font-cond text-2xl font-bold">{fechaLarga(ultima.abiertaAt)}, turno {ultima.turno.toLowerCase()}</div>
          <p className="text-[15px] text-gris">
            Cerrada {ultima.cerradaAt ? `a las ${hora(ultima.cerradaAt)}` : ''}{ultima.cerradaPor ? ` por ${ultima.cerradaPor}` : ''}
            {ultima.totales ? `. ${ultima.totales.cantComandas} comandas, ${money(ultima.totales.totalVentas)}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={() => setConfirmarReabrir(true)}>Reabrir esta caja</Btn>
            <Btn tono="fantasma" onClick={() => setVerHistorial(true)}>Ver historial de cajas</Btn>
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

// ---------------------------------------------------------------------
// Resumen de movimientos (como en Datalive)
// ---------------------------------------------------------------------
export function ResumenCaja({ caja, totales, comandas }: { caja: Caja; totales: TotalesCaja; comandas?: Comanda[] }) {
  const t = totales
  const online = t.totalVentas - t.ventasEfectivo
  const porForma = comandas ? cobradoPorForma(comandas) : null
  const motos = new Map<string, { viajes: number; minutos: number }>()
  for (const c of comandas ?? []) {
    const m = c.entregadaAt && c.estado !== 'anulada' ? minutosDelivery(c) : null
    if (!c.repartidorNombre || m == null) continue
    const x = motos.get(c.repartidorNombre) ?? { viajes: 0, minutos: 0 }
    motos.set(c.repartidorNombre, { viajes: x.viajes + 1, minutos: x.minutos + m })
  }
  const fila = (label: string, monto: number, signo: '+' | '-' | '', extra?: ReactNode) => (
    <tr className="border-b border-linea">
      <td className="py-2.5 pr-3 align-top"><div className="font-semibold">{label}</div>{extra}</td>
      <td className={`py-2.5 text-right align-top font-semibold tabular-nums ${signo === '-' && monto ? 'text-tomate' : signo === '+' && monto ? 'text-albahaca' : ''}`}>
        {signo === '-' && monto ? '−' : ''}{money(monto)}
      </td>
    </tr>
  )
  return (
    <div className="space-y-4">
      <table className="w-full text-[15px]">
        <tbody>
          {fila('Dinero al inicio', caja.dineroInicial || 0, '+')}
          {fila('Ventas en efectivo', t.ventasEfectivo, '+', (
            <div className="text-sm text-gris">
              {t.cantComandas} {t.cantComandas === 1 ? 'comanda' : 'comandas'} por {money(t.totalVentas)}
              {t.cantAnuladas ? `, ${t.cantAnuladas} anuladas` : ''}. Online y otros medios: {money(online)}
            </div>
          ))}
          {fila('Ingresos', t.totalIngresos, '+')}
          {fila('Gastos', t.totalGastos, '-')}
          {fila('Retiros (egresos)', t.totalEgresos, '-')}
          {fila('Sueldos', t.totalSueldos, '-')}
        </tbody>
      </table>
      <div className="flex items-end justify-between rounded-xl bg-harina p-4">
        <div>
          <div className="font-semibold">Total teórico en caja</div>
          <div className="text-sm text-gris">Efectivo que debería haber (sin lo cobrado online)</div>
        </div>
        <div className="font-cond text-4xl font-bold tabular-nums">{money(t.efectivoTeorico)}</div>
      </div>
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
                <span>{FORMAS_PAGO.find(f => f.key === forma)?.label ?? forma}</span>
                <b className="tabular-nums">{money(monto)}</b>
              </li>
            ))}
          </ul>
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
      ancho="max-w-2xl"
      alto
      pie={
        <div className="flex flex-wrap items-center gap-2">
          <Btn tono="fantasma" onClick={() => setVerHistorial(true)}>Historial de cajas</Btn>
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
          ? <ResumenCaja caja={caja} totales={totales} comandas={comandas} />
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
  const { caja, comandas, cerrarCaja } = useApp()
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!caja) return null
  const real = numero(contado)
  const diferencia = real - totales.efectivoTeorico
  const validas = comandas.filter(c => c.estado !== 'anulada')
  const sinCobrar = validas.filter(c => !c.cobrada)
  const sinEntregar = validas.filter(c => c.estado !== 'entregado')

  const cerrar = async () => {
    setEnviando(true)
    const ok = await cerrarCaja(real, obs)
    setEnviando(false)
    if (ok) { onClose(); onCerrada() }
  }

  return (
    <Modal titulo={`Cerrar caja ${caja.turno.toLowerCase()}`} onClose={onClose} ancho="max-w-lg"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onClose}>Volver</Btn><Btn tono="tomate" disabled={enviando || contado.trim() === ''} onClick={cerrar}>Cerrar caja</Btn></div>}>
      <div className="space-y-4 p-5">
        {(sinCobrar.length > 0 || sinEntregar.length > 0) && (
          <div className="rounded-xl bg-muzza-claro p-4 text-[15px]">
            {sinEntregar.length > 0 && <p><b>{sinEntregar.length}</b> sin entregar: {sinEntregar.map(c => `#${c.numero}`).join(', ')}</p>}
            {sinCobrar.length > 0 && <p><b>{sinCobrar.length}</b> sin cobrar ({money(sinCobrar.reduce((s, c) => s + c.total, 0))}): no suman al efectivo.</p>}
          </div>
        )}
        <div className="flex items-end justify-between rounded-xl bg-harina p-4">
          <span className="font-semibold">Total teórico en caja</span>
          <span className="font-cond text-3xl font-bold tabular-nums">{money(totales.efectivoTeorico)}</span>
        </div>
        <Campo label="Efectivo contado (dinero real en la caja)">
          <input id="caja-contado" autoFocus inputMode="decimal" value={contado} onChange={e => setContado(e.target.value)} placeholder="0"
            className={`${inputCls} h-14 text-right font-cond text-3xl font-bold`} />
        </Campo>
        {contado.trim() !== '' && (
          <div className={`flex items-center justify-between rounded-xl p-4 font-semibold ${Math.abs(diferencia) < 0.01 ? 'bg-albahaca-claro text-albahaca' : 'bg-tomate-claro text-tomate'}`}>
            <span>{Math.abs(diferencia) < 0.01 ? 'Sin diferencia' : diferencia > 0 ? 'Sobra' : 'Falta'}</span>
            <span className="font-cond text-3xl font-bold tabular-nums">{diferencia > 0 ? '+' : diferencia < 0 ? '−' : ''}{money(Math.abs(diferencia))}</span>
          </div>
        )}
        <Campo label="Observaciones (opcional)">
          <textarea id="caja-obs" rows={2} value={obs} onChange={e => setObs(e.target.value)} className={`${inputCls} h-auto py-2`} placeholder="Ej: faltante por vuelto mal dado" />
        </Campo>
        <p className="text-sm text-gris">Lo contado queda como dinero al inicio sugerido para la próxima caja.</p>
      </div>
    </Modal>
  )
}

