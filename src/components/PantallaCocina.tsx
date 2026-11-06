import { useEffect, useMemo, useRef, useState } from 'react'
import type { Comanda } from '../types'
import { repo } from '../data'
import { useApp, useLocalActivo } from '../store/app'
import { coccionLabel, hora, nombreConVariante } from '../lib/format'
import { BotonTema } from './ui'
import { esArmado } from '../store/pedido'

/**
 * Pantalla para la cocina: los pedidos "en cocina" en el orden en que entraron,
 * con un reloj que se pone amarillo y después rojo. "Pedido listo" imprime el ticket.
 */

const CLAVE_VISTA = 'cocina-vista'
const CLAVE_SONIDO = 'cocina-sonido'
const leer = (k: string, def: string) => { try { return localStorage.getItem(k) ?? def } catch { return def } }
const escribir = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin storage */ } }

export function pitido() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const tono = (frec: number, desde: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = frec; o.type = 'sine'
      g.gain.setValueAtTime(0.0001, ctx.currentTime + desde)
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + desde + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + desde + 0.25)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + desde); o.stop(ctx.currentTime + desde + 0.3)
    }
    tono(880, 0); tono(1175, 0.18)
    setTimeout(() => ctx.close(), 800)
  } catch { /* sin audio */ }
}


/** Que la pantalla no se apague mientras está abierta */
export function usePantallaEncendida() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const pedir = async () => {
      try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* no soportado */ }
    }
    pedir()
    const vis = () => { if (document.visibilityState === 'visible') pedir() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}) }
  }, [])
}

export function PantallaCocina({ onClose }: { onClose?: () => void }) {
  const { comandas, caja, marcarListo, volverACocina, refrescar, catalogo } = useApp()
  const idArmado = catalogo.productos.find(x => esArmado(x))?.id
  const local = useLocalActivo()
  const amarillo = local?.cocinaAmarillo ?? 7
  const rojo = local?.cocinaRojo ?? 15
  const [vista, setVista] = useState<'tipo' | 'orden'>(() => (leer(CLAVE_VISTA, 'tipo') === 'orden' ? 'orden' : 'tipo'))
  const [sonido, setSonido] = useState(() => leer(CLAVE_SONIDO, '1') === '1')
  const [ahora, setAhora] = useState(Date.now())
  const [desfase, setDesfase] = useState(0)
  const [marcando, setMarcando] = useState<string | null>(null)

  // Reloj de la base: así los minutos no dependen de la hora de esta PC
  useEffect(() => {
    const t0 = Date.now()
    repo.horaServidor().then(h => { const t1 = Date.now(); setDesfase(new Date(h).getTime() - (t0 + t1) / 2) }).catch(() => {})
  }, [])
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t) }, [])
  // Por si se pierde algún aviso en tiempo real
  useEffect(() => { const t = setInterval(() => { refrescar().catch(() => {}) }, 20_000); return () => clearInterval(t) }, [refrescar])

  usePantallaEncendida()

  const enCocina = useMemo(() => comandas
    .filter(c => c.estado === 'en_preparacion')
    .sort((a, b) => (a.cocinaAt ?? a.createdAt).localeCompare(b.cocinaAt ?? b.createdAt) || a.numero - b.numero), [comandas])

  // Aviso sonoro cuando entra un pedido nuevo
  const vistos = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(enCocina.map(c => c.id))
    if (vistos.current && sonido && [...ids].some(id => !vistos.current!.has(id))) pitido()
    vistos.current = ids
  }, [enCocina, sonido])

  const ahoraServidor = ahora + desfase
  const listos = comandas
    .filter(c => c.listoAt && c.estado !== 'en_preparacion' && c.estado !== 'anulada' && ahoraServidor - new Date(c.listoAt).getTime() < 30 * 60_000)
    .sort((a, b) => b.listoAt!.localeCompare(a.listoAt!))
    .slice(0, 8)

  const listo = async (c: Comanda) => {
    setMarcando(c.id)
    await marcarListo(c)
    setMarcando(null)
  }

  const tarjetas = (lista: Comanda[]) => (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
      {lista.map(c => (
        <TarjetaCocina key={c.id} c={idArmado ? { ...c, items: c.items.filter(i => i.productoId !== idArmado) } : c} orden={enCocina.indexOf(c) + 1} ahora={ahoraServidor} amarillo={amarillo} rojo={rojo}
          marcando={marcando === c.id} onListo={() => listo(c)} />
      ))}
    </div>
  )

  const columna = (tipo: 'delivery' | 'mostrador') => {
    const lista = enCocina.filter(c => c.tipo === tipo)
    return (
      <section className="min-w-0">
        <h2 className={`mb-3 flex items-baseline gap-3 font-cond text-4xl font-extrabold ${tipo === 'delivery' ? 'text-tomate' : 'text-pizarra'}`}>
          {tipo === 'delivery' ? 'Delivery' : 'Mostrador'}
          <span className="text-3xl text-gris tabular-nums">{lista.length}</span>
        </h2>
        {lista.length ? tarjetas(lista) : <p className="rounded-xl border-2 border-dashed border-linea py-10 text-center text-lg text-gris">Sin pedidos</p>}
      </section>
    )
  }

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-barra px-4 py-2.5 text-white">
        {onClose && <button onClick={onClose} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>}
        <h1 className="font-cond text-3xl font-extrabold leading-none">Cocina</h1>
        <span className="text-white/75">{local?.nombre}</span>
        <span className="rounded-full bg-white/15 px-3 py-1 font-cond text-xl font-bold tabular-nums">{enCocina.length} en preparación</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white/10 p-1" role="radiogroup" aria-label="Cómo ordenar">
            {([['tipo', 'Delivery / Mostrador'], ['orden', 'Todos en orden']] as const).map(([k, l]) => (
              <button key={k} role="radio" aria-checked={vista === k} onClick={() => { setVista(k); escribir(CLAVE_VISTA, k) }}
                className={`h-9 rounded-md px-3 font-semibold ${vista === k ? 'bg-albahaca text-sobre-albahaca' : 'text-white/85 hover:text-white'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => { const v = !sonido; setSonido(v); escribir(CLAVE_SONIDO, v ? '1' : '0'); if (v) pitido() }}
            aria-pressed={sonido} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">
            {sonido ? 'Sonido: sí' : 'Sonido: no'}
          </button>
          <button onClick={pantallaCompleta} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Pantalla completa</button>
          <BotonTema className="!border-white/20 !bg-white/15 !text-white hover:!bg-white/25" />
          <span className="font-cond text-3xl font-bold tabular-nums">{hora(new Date(ahoraServidor).toISOString())}</span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {!caja ? (
          <p className="mt-[20vh] text-center font-cond text-4xl font-bold text-gris">No hay caja abierta</p>
        ) : !enCocina.length ? (
          <p className="mt-[20vh] text-center font-cond text-4xl font-bold text-gris">No hay pedidos en cocina</p>
        ) : vista === 'tipo' ? (
          <div className="grid gap-6 xl:grid-cols-2">{columna('delivery')}{columna('mostrador')}</div>
        ) : tarjetas(enCocina)}
      </main>

      {listos.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-linea bg-papel px-4 py-2">
          <span className="mr-1 text-sm font-semibold text-gris">Listos recientes:</span>
          {listos.map(c => (
            <span key={c.id} className="flex items-center gap-2 rounded-lg bg-superficie py-1 pl-3 pr-1 ring-1 ring-linea">
              <b className="font-cond text-xl">#{c.numero}</b>
              <span className="max-w-[10rem] truncate text-sm">{c.clienteNombre ?? (c.tipo === 'delivery' ? 'Delivery' : 'Mostrador')}</span>
              <span className="text-xs text-gris">{hora(c.listoAt!)}</span>
              {c.estado === 'listo' && (
                <button onClick={() => volverACocina(c)} className="h-8 rounded-md px-2 text-sm font-semibold text-pizarra hover:bg-pizarra-claro">Volver a cocina</button>
              )}
            </span>
          ))}
        </footer>
      )}
    </div>
  )
}

function TarjetaCocina({ c, orden, ahora, amarillo, rojo, marcando, onListo }: {
  c: Comanda; orden: number; ahora: number; amarillo: number; rojo: number; marcando: boolean; onListo: () => void
}) {
  const seg = (ahora - new Date(c.cocinaAt ?? c.createdAt).getTime()) / 1000
  const nivel = seg >= rojo * 60 ? 'rojo' : seg >= amarillo * 60 ? 'amarillo' : 'ok'
  const fondo = nivel === 'rojo' ? 'bg-tomate-claro ring-2 ring-tomate' : nivel === 'amarillo' ? 'bg-muzza-claro ring-2 ring-muzza' : 'bg-superficie ring-1 ring-linea'
  return (
    <article className={`flex flex-col rounded-xl p-3 shadow-sm ${fondo}`} aria-label={`Comanda ${c.numero}`}>
      <div className="flex items-start gap-3">
        <div className="text-center">
          <div className="font-cond text-6xl font-extrabold leading-[0.85] tabular-nums">{c.numero}</div>
          <div className="mt-1 text-xs font-bold text-gris">{orden}º</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            <span className={`rounded px-2 py-0.5 font-cond text-lg font-extrabold uppercase leading-tight text-white ${c.tipo === 'delivery' ? 'bg-tomate' : 'bg-pizarra'}`}>
              {c.tipo === 'delivery' ? 'Delivery' : 'Mostrador'}
            </span>
            {c.canal === 'pedidosya' && <span className="rounded bg-tinta px-2 py-0.5 font-cond text-lg font-extrabold uppercase leading-tight text-papel">PedidosYa</span>}
          </div>
          <div className="mt-1 break-words text-xl font-bold leading-tight">{c.clienteNombre || 'Sin nombre'}</div>
          {c.horaEntrega && <div className="font-cond text-xl font-extrabold text-tomate">PARA LAS {c.horaEntrega}</div>}
        </div>
        <div className={`text-right font-cond text-4xl font-extrabold tabular-nums leading-none ${nivel === 'rojo' ? 'text-tomate' : 'text-tinta'}`}>
          {Math.floor(Math.max(0, seg) / 60)}<span className="text-2xl"> min</span>
          <div className="mt-1 text-xs font-semibold text-gris">entró {hora(c.cocinaAt ?? c.createdAt)}</div>
        </div>
      </div>

      <ul className="mt-3 flex-1 space-y-1.5 border-t border-dashed border-linea pt-3">
        {c.items.map(i => (
          <li key={i.id}>
            <div className="text-2xl leading-tight">
              <b className="tabular-nums">{i.cantidad}</b> <span className="font-semibold">{nombreConVariante(i.descripcion, i.variante)}</span>
              {i.coccion && <span className="font-bold text-pizarra"> · {coccionLabel(i.coccion)}</span>}
            </div>
            {i.componentes.map((comp, k) => (
              <div key={k} className="pl-6 text-xl leading-snug">
                → <b>{comp.cantidad}</b> {nombreConVariante(comp.descripcion, comp.variante)}{comp.coccion ? <b className="text-pizarra"> · {coccionLabel(comp.coccion)}</b> : ''}
              </div>
            ))}
            {i.nota && <div className="pl-6 text-xl font-bold text-tomate">* {i.nota}</div>}
          </li>
        ))}
      </ul>
      {c.observaciones && (
        <p className="mt-2 rounded-lg bg-papel px-3 py-2 text-xl font-extrabold text-tomate ring-1 ring-tomate">{c.observaciones}</p>
      )}

      <button onClick={onListo} disabled={marcando}
        className="mt-3 h-14 w-full rounded-xl bg-albahaca font-cond text-2xl font-extrabold text-sobre-albahaca hover:brightness-110 disabled:opacity-60">
        {marcando ? 'Imprimiendo…' : 'Pedido listo'}
      </button>
    </article>
  )
}
