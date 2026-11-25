import { useEffect, useMemo, useRef, useState } from 'react'
import type { Comanda, OrientacionPantalla, VideoPantalla } from '../types'
import type { CSSProperties } from 'react'
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

/** publica: tele abierta con su enlace (las revisiones las maneja PantallaPublica) */
export function PantallaMostrador({ onClose, publica }: { onClose?: () => void; publica?: boolean }) {
  const { comandas, caja, refrescar, refrescarMenu } = useApp()
  const local = useLocalActivo()
  const [sonido, setSonido] = useState(() => { try { return localStorage.getItem(CLAVE_SONIDO) !== '0' } catch { return true } })
  const [ahora, setAhora] = useState(Date.now())
  const [controles, setControles] = useState(true)
  usePantallaEncendida()

  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 15_000); return () => clearInterval(t) }, [])
  // Respaldo por si se pierde un aviso en tiempo real (la tele con enlace tiene el suyo)
  useEffect(() => {
    if (publica) return
    const t = setInterval(() => { refrescar().catch(() => {}); refrescarMenu().catch(() => {}) }, 60_000)
    return () => clearInterval(t)
  }, [refrescar, refrescarMenu, publica])
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

  const orientacion: OrientacionPantalla = local?.pantallaOrientacion ?? 'horizontal'
  const vertical = orientacion !== 'horizontal'
  const videos = local?.pantallaVideos ?? []

  const listas = (
    <>
      <section className="flex min-h-0 flex-col rounded-2xl bg-superficie p-6 ring-1 ring-linea">
        <h2 className="font-cond text-5xl font-extrabold leading-none text-gris">En preparación</h2>
        <p className="mb-5 mt-1 text-xl font-semibold text-gris tabular-nums">{enProceso.length === 1 ? '1 pedido' : `${enProceso.length} pedidos`}</p>
        <ul className="min-h-0 flex-1 space-y-3 overflow-hidden">
          {enProceso.map(c => (
            <li key={c.id} className="nombre-entra truncate font-cond text-5xl font-bold leading-tight text-tinta">{nombre(c)}</li>
          ))}
          {!enProceso.length && <li className="font-cond text-3xl text-gris">—</li>}
        </ul>
      </section>

      <section className="flex min-h-0 flex-col rounded-2xl bg-albahaca-claro p-6 ring-2 ring-albahaca">
        <h2 className="font-cond text-5xl font-extrabold leading-none text-tinta">Listo para retirar</h2>
        <p className="mb-5 mt-1 text-xl font-semibold text-tinta/70 tabular-nums">{listos.length === 1 ? '1 pedido' : `${listos.length} pedidos`}</p>
        <ul className="min-h-0 flex-1 space-y-3 overflow-hidden">
          {listos.map(c => (
            <li key={c.id} className={`truncate rounded-xl px-4 py-2 font-cond text-6xl font-extrabold leading-tight ${nuevos.has(c.id) ? 'nombre-listo bg-albahaca text-sobre-albahaca' : 'nombre-entra text-tinta'}`}>
              {nombre(c)}
            </li>
          ))}
          {!listos.length && <li className="font-cond text-3xl text-gris">—</li>}
        </ul>
      </section>
    </>
  )

  return (
    <div style={giro(orientacion)} className="fixed left-0 top-0 z-40 overflow-hidden">
    <div className="absolute inset-0 flex flex-col bg-harina" onMouseMove={() => setControles(true)} onClick={() => setControles(true)}>
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
      ) : videos.length ? (
        // Con videos: al costado (horizontal) o arriba (vertical) y los pedidos al lado
        <main className={`grid min-h-0 flex-1 gap-6 p-6 ${vertical ? 'grid-rows-[minmax(0,5fr)_minmax(0,6fr)]' : 'grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'}`}>
          <Videos videos={videos} />
          <div className={`grid min-h-0 gap-6 ${vertical ? 'grid-cols-2' : 'grid-rows-2'}`}>{listas}</div>
        </main>
      ) : (
        <main className={`grid min-h-0 flex-1 gap-6 p-6 ${vertical ? 'grid-rows-2' : 'grid-cols-1 md:grid-cols-2'}`}>{listas}</main>
      )}
    </div>
    </div>
  )
}

/** Gira toda la pantalla cuando la tele está parada (la PC la sigue viendo acostada) */
function giro(o: OrientacionPantalla): CSSProperties {
  if (o === 'horizontal') return { width: '100vw', height: '100vh' }
  return {
    width: '100vh', height: '100vw', transformOrigin: 'top left',
    // izquierda: el borde de arriba de la tele quedó a la izquierda, se gira el contenido 90° a la derecha
    transform: o === 'vertical_izquierda' ? 'rotate(90deg) translateY(-100%)' : 'rotate(-90deg) translateX(-100%)',
  }
}

/** Videos en loop, uno detrás del otro, sin sonido */
function Videos({ videos }: { videos: VideoPantalla[] }) {
  const [i, setI] = useState(0)
  const actual = videos[i % videos.length]
  const siguiente = () => setI(n => (n + 1) % videos.length)
  return (
    <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-black">
      <video key={actual.path + i} src={actual.url} autoPlay muted playsInline loop={videos.length === 1}
        onEnded={siguiente} onError={() => videos.length > 1 && setTimeout(siguiente, 1000)}
        className="h-full w-full object-contain" />
    </div>
  )
}
