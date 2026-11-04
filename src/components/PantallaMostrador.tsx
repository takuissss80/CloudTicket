import { useEffect, useMemo, useRef, useState } from 'react'
import type { Comanda } from '../types'
import { useApp, useLocalActivo } from '../store/app'
import { hora } from '../lib/format'
import { pitido, usePantallaEncendida } from './PantallaCocina'
import { BotonTema } from './ui'

/**
 * Pantalla para los clientes del mostrador: solo nombres, en dos listas
 * (en preparación / listos para retirar). Pensada para una tele o monitor mirando al público.
 */

const CLAVE_SONIDO = 'mostrador-sonido'
const nombre = (c: Comanda) => c.clienteNombre?.trim() || `Pedido ${c.numero}`

export function PantallaMostrador({ onClose }: { onClose?: () => void }) {
  const { comandas, caja, refrescar } = useApp()
  const local = useLocalActivo()
  const [sonido, setSonido] = useState(() => { try { return localStorage.getItem(CLAVE_SONIDO) !== '0' } catch { return true } })
  const [ahora, setAhora] = useState(Date.now())
  const [controles, setControles] = useState(true)
  usePantallaEncendida()

  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 15_000); return () => clearInterval(t) }, [])
  useEffect(() => { const t = setInterval(() => { refrescar().catch(() => {}) }, 20_000); return () => clearInterval(t) }, [refrescar])
  // Los botones se esconden solos para que la pantalla quede limpia
  useEffect(() => {
    if (!controles) return
    const t = setTimeout(() => setControles(false), 8000)
    return () => clearTimeout(t)
  }, [controles])

  const mostrador = comandas.filter(c => c.tipo === 'mostrador' && c.canal !== 'pedidosya')
  const enProceso = mostrador
    .filter(c => c.estado === 'pendiente' || c.estado === 'en_preparacion')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const listos = useMemo(() => mostrador
    .filter(c => c.estado === 'listo')
    .sort((a, b) => (b.listoAt ?? b.updatedAt ?? '').localeCompare(a.listoAt ?? a.updatedAt ?? '')), [mostrador])

  // Sonido y resaltado cuando un pedido queda listo
  const vistos = useRef<Set<string> | null>(null)
  const [nuevos, setNuevos] = useState<Set<string>>(new Set())
  useEffect(() => {
    const ids = new Set(listos.map(c => c.id))
    if (vistos.current) {
      const recien = [...ids].filter(id => !vistos.current!.has(id))
      if (recien.length) {
        if (sonido) pitido()
        setNuevos(n => new Set([...n, ...recien]))
        setTimeout(() => setNuevos(n => { const x = new Set(n); recien.forEach(id => x.delete(id)); return x }), 12_000)
      }
    }
    vistos.current = ids
  }, [listos, sonido])

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-harina" onMouseMove={() => setControles(true)} onClick={() => setControles(true)}>
      <header className="flex items-center gap-4 bg-barra px-6 py-3 text-white">
        <h1 className="font-cond text-4xl font-extrabold leading-none">{local?.nombre ?? 'Pedidos'}</h1>
        <div className={`ml-auto flex flex-wrap items-center gap-2 transition-opacity ${controles ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          {onClose && <button onClick={onClose} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>}
          <button onClick={() => { const v = !sonido; setSonido(v); try { localStorage.setItem(CLAVE_SONIDO, v ? '1' : '0') } catch { /* */ } if (v) pitido() }}
            aria-pressed={sonido} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">{sonido ? 'Sonido: sí' : 'Sonido: no'}</button>
          <button onClick={pantallaCompleta} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Pantalla completa</button>
          <BotonTema className="!border-white/20 !bg-white/15 !text-white hover:!bg-white/25" />
        </div>
        <span className="font-cond text-4xl font-bold tabular-nums">{hora(new Date(ahora).toISOString())}</span>
      </header>

      {!caja ? (
        <p className="m-auto font-cond text-5xl font-bold text-gris">Cerrado</p>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-2">
          <section className="flex min-h-0 flex-col rounded-2xl bg-superficie p-6 ring-1 ring-linea">
            <h2 className="mb-4 flex items-baseline gap-3 font-cond text-5xl font-extrabold text-gris">
              En preparación <span className="text-4xl tabular-nums">{enProceso.length}</span>
            </h2>
            <ul className="min-h-0 flex-1 space-y-3 overflow-hidden">
              {enProceso.map(c => (
                <li key={c.id} className="truncate font-cond text-5xl font-bold leading-tight text-tinta">{nombre(c)}</li>
              ))}
              {!enProceso.length && <li className="font-cond text-3xl text-gris">—</li>}
            </ul>
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl bg-albahaca-claro p-6 ring-2 ring-albahaca">
            <h2 className="mb-4 flex items-baseline gap-3 font-cond text-5xl font-extrabold text-tinta">
              ¡Listo para retirar! <span className="text-4xl tabular-nums">{listos.length}</span>
            </h2>
            <ul className="min-h-0 flex-1 space-y-3 overflow-hidden">
              {listos.map(c => (
                <li key={c.id} className={`truncate rounded-xl px-4 py-2 font-cond text-6xl font-extrabold leading-tight ${nuevos.has(c.id) ? 'animate-pulse bg-albahaca text-sobre-albahaca' : 'text-tinta'}`}>
                  {nombre(c)}
                </li>
              ))}
              {!listos.length && <li className="font-cond text-3xl text-gris">—</li>}
            </ul>
          </section>
        </main>
      )}
    </div>
  )
}
