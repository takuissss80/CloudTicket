import { useEffect, useState } from 'react'
import type { Caja } from '../types'
import { pitido } from './PantallaCocina'

/** Horas después de la medianoche a partir de las que se avisa que la caja quedó abierta */
export const HORAS_CAJA_SIN_CERRAR = 2

function useAhora(cada: number) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), cada); return () => clearInterval(t) }, [cada])
  return ahora
}

/** Barra roja fija: la caja sigue abierta pasada la medianoche (+ unas horas) del día en que se abrió */
export function CajaSinCerrar({ caja, onAbrir }: { caja: Caja | null; onAbrir: () => void }) {
  const ahora = useAhora(60_000)
  if (!caja) return null
  const abierta = new Date(caja.abiertaAt)
  const limite = new Date(abierta.getFullYear(), abierta.getMonth(), abierta.getDate() + 1, HORAS_CAJA_SIN_CERRAR).getTime()
  if (ahora < limite) return null
  const dd = (n: number) => String(n).padStart(2, '0')
  const fecha = `${abierta.toLocaleDateString('es-AR', { weekday: 'long' })} ${dd(abierta.getDate())}/${dd(abierta.getMonth() + 1)}`
  return (
    <div role="alert" className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-tomate px-4 py-2.5 text-center text-lg font-bold text-white shadow-[0_-4px_16px_rgba(0,0,0,.25)]">
      <span>⚠ Caja {caja.turno.toLowerCase()} del {fecha} aún sin cerrar</span>
      <button onClick={onAbrir} className="rounded-lg bg-white/20 px-3 py-1 text-base font-semibold hover:bg-white/30">Cerrar caja</button>
    </div>
  )
}

const CLAVE_VISTO = 'ct-aviso-py-visto'
/** Cuánto dura la alarma después del último recordatorio de GoWin (los repite cada minuto mientras no se confirme) */
const DURA_MS = 3 * 60_000

/**
 * Alarma de PedidosYa: GoWin imprime "tenés el pedido X sin confirmar", el programa de impresión lo avisa
 * y acá se prende una luz que late en toda la pantalla hasta que lo confirmen (o toquen "Ya lo confirmé").
 */
export function AlarmaPedidosYa({ aviso }: { aviso: { at: string; texto?: string } | null }) {
  const ahora = useAhora(5_000)
  const [visto, setVisto] = useState(() => { try { return localStorage.getItem(CLAVE_VISTO) ?? '' } catch { return '' } })
  const activa = !!aviso && ahora - new Date(aviso.at).getTime() < DURA_MS && visto < aviso.at
  // Suena al prenderse y cada 30 s mientras siga
  useEffect(() => {
    if (!activa) return
    pitido()
    const t = setInterval(pitido, 30_000)
    return () => clearInterval(t)
  }, [activa, aviso?.at])
  if (!activa) return null
  const listo = () => { try { localStorage.setItem(CLAVE_VISTO, aviso!.at) } catch { /* sin storage */ } setVisto(aviso!.at) }
  const numero = aviso!.texto?.match(/pedido\s+#?(\d+)/i)?.[1]
  return (
    <>
      <div aria-hidden className="alarma-py-luz pointer-events-none fixed inset-0 z-[65]" />
      <div role="alert" className="alarma-py-cartel fixed left-1/2 top-3 z-[66] flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl px-5 py-3 text-white shadow-2xl">
        <div className="min-w-0 flex-1">
          <div className="font-cond text-2xl font-extrabold leading-tight">PEDIDOSYA: PEDIDO SIN CONFIRMAR{numero ? ` (#${numero})` : ''}</div>
          <div className="text-[15px] font-semibold">Confirmalo en GoWin. GoWin lo sigue recordando hasta que lo aceptes.</div>
        </div>
        <button onClick={listo} className="h-10 rounded-lg bg-white px-4 font-bold text-tomate hover:bg-white/90">Ya lo confirmé</button>
      </div>
    </>
  )
}
