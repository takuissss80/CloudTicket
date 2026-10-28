import { useState } from 'react'
import { FORMAS_PAGO } from '../types'
import { useApp } from '../store/app'
import { fecha, hora, money } from '../lib/format'
import { minutosDelivery } from '../lib/estados'
import { Btn, Modal } from './ui'

const TURNOS = ['Mañana', 'Tarde', 'Noche']

const turnoSugerido = () => {
  const h = new Date().getHours()
  return h >= 6 && h < 14 ? 'Mañana' : h >= 14 && h < 19 ? 'Tarde' : 'Noche'
}

/** Pantalla cuando no hay caja abierta */
export function CajaCerrada() {
  const abrirCaja = useApp(s => s.abrirCaja)
  const [turno, setTurno] = useState(turnoSugerido())
  return (
    <div className="mx-auto mt-[12vh] max-w-md px-4 text-center">
      <h1 className="font-cond text-5xl font-bold">La caja está cerrada</h1>
      <p className="mt-2 text-gris">Abrí la caja del turno para empezar a tomar pedidos. Las comandas se numeran desde 1 en cada caja.</p>
      <div className="mt-8 flex justify-center gap-2">
        {TURNOS.map(t => (
          <button key={t} onClick={() => setTurno(t)}
            className={`h-12 rounded-xl px-5 font-semibold ${turno === t ? 'bg-tinta text-white' : 'bg-white ring-1 ring-linea hover:bg-papel'}`}>
            {t}
          </button>
        ))}
      </div>
      <Btn tono="albahaca" grande className="mt-6 w-full" onClick={() => abrirCaja(turno)}>Abrir caja {turno.toLowerCase()}</Btn>
    </div>
  )
}

/** Resumen y cierre de caja */
export function CerrarCajaModal({ onClose }: { onClose: () => void }) {
  const { caja, comandas, cerrarCaja } = useApp()
  if (!caja) return null
  const validas = comandas.filter(c => c.estado !== 'anulada')
  const total = validas.reduce((s, c) => s + c.total, 0)
  const sinCobrar = validas.filter(c => !c.cobrada)
  const abiertas = validas.filter(c => c.estado !== 'entregado')
  const porForma = FORMAS_PAGO.map(f => ({
    ...f,
    monto: validas.filter(c => c.cobrada).reduce((s, c) => {
      // Lo cobrado por forma de pago, sin contar el vuelto
      const pagado = c.pagos.reduce((a, p) => a + p.monto, 0)
      const factor = pagado > c.total && pagado > 0 ? c.total / pagado : 1
      return s + c.pagos.filter(p => p.forma === f.key).reduce((a, p) => a + p.monto * factor, 0)
    }, 0),
  })).filter(f => f.monto > 0)
  // Viajes por moto: cantidad y tiempo promedio
  const motos = new Map<string, { viajes: number; minutos: number }>()
  for (const c of validas) {
    const m = c.entregadaAt ? minutosDelivery(c) : null
    if (!c.repartidorNombre || m == null) continue
    const x = motos.get(c.repartidorNombre) ?? { viajes: 0, minutos: 0 }
    motos.set(c.repartidorNombre, { viajes: x.viajes + 1, minutos: x.minutos + m })
  }

  return (
    <Modal
      titulo={`Cerrar caja ${caja.turno.toLowerCase()}`}
      onClose={onClose}
      ancho="max-w-lg"
      pie={
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Volver</Btn>
          <Btn tono="tomate" onClick={async () => { await cerrarCaja(); onClose() }}>Cerrar caja</Btn>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-gris">Abierta el {fecha(caja.abiertaAt)} a las {hora(caja.abiertaAt)}.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 ring-1 ring-linea">
            <div className="font-cond text-4xl font-bold">{validas.length}</div>
            <div className="text-gris">comandas</div>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-linea">
            <div className="font-cond text-4xl font-bold">{money(total)}</div>
            <div className="text-gris">vendido</div>
          </div>
        </div>
        {porForma.length > 0 && (
          <ul className="divide-y divide-linea rounded-xl bg-white ring-1 ring-linea">
            {porForma.map(f => (
              <li key={f.key} className="flex justify-between px-4 py-2.5"><span>{f.label}</span><b className="tabular-nums">{money(f.monto)}</b></li>
            ))}
          </ul>
        )}
        {motos.size > 0 && (
          <ul className="divide-y divide-linea rounded-xl bg-white ring-1 ring-linea">
            {[...motos].map(([nombre, m]) => (
              <li key={nombre} className="flex justify-between px-4 py-2.5">
                <span>{nombre}: {m.viajes} {m.viajes === 1 ? 'viaje' : 'viajes'}</span>
                <span className="tabular-nums text-gris">promedio {Math.round(m.minutos / m.viajes)} min</span>
              </li>
            ))}
          </ul>
        )}
        {(sinCobrar.length > 0 || abiertas.length > 0) && (
          <div className="rounded-xl bg-muzza-claro p-4">
            {sinCobrar.length > 0 && <p><b>{sinCobrar.length}</b> {sinCobrar.length === 1 ? 'comanda sin cobrar' : 'comandas sin cobrar'} ({money(sinCobrar.reduce((s, c) => s + c.total, 0))}): {sinCobrar.map(c => `#${c.numero}`).join(', ')}</p>}
            {abiertas.length > 0 && <p><b>{abiertas.length}</b> sin entregar: {abiertas.map(c => `#${c.numero}`).join(', ')}</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
