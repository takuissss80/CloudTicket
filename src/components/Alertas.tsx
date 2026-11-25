import { useEffect, useState } from 'react'
import type { Caja } from '../types'

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
