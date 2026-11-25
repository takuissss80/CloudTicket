import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrientacionPantalla, Pantalla, VideoPantalla } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp, useLocalActivo } from '../../store/app'
import { Btn, Confirmar, inputBase } from '../ui'
import { Cocina } from './Cocina'

/** Pestaña Pantallas (PRO): config de cocina y las teles del local, cada una con su enlace */
export function Pantallas() {
  const { avisar } = useApp()
  const local = useLocalActivo()
  const [teles, setTeles] = useState<Pantalla[] | null>(null)
  const cargar = useCallback(async () => {
    if (!local) return
    try { setTeles(await repo.listPantallas(local.id)) } catch (e) { avisar(mensajeError(e), 'error') }
  }, [local, avisar])
  useEffect(() => { cargar() }, [cargar])

  const crear = async (tipo: Pantalla['tipo']) => {
    if (!local) return
    const n = (teles ?? []).filter(t => t.tipo === tipo).length + 1
    try {
      await repo.crearPantalla(local.id, tipo, tipo === 'cocina' ? `Cocina ${n}` : `Pantalla mostrador ${n}`)
      await cargar()
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  if (!local) return null
  return (
    <div>
      <Cocina />
      <div className="mx-auto max-w-3xl space-y-4 p-4 pt-0">
        <section className="rounded-xl bg-superficie p-5 ring-1 ring-linea">
          <h2 className="font-cond text-3xl font-bold">Pantallas · {local.nombre}</h2>
          <p className="mt-1 text-gris">
            Cada pantalla tiene su propia dirección: abrila en la pantalla y queda andando, sin usuario ni contraseña.
            Se actualiza sola al instante cuando cambia un pedido. Si una dirección se filtra, generá una nueva y la anterior deja de andar.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn tono="albahaca" onClick={() => crear('clientes')}>+ Pantalla para clientes</Btn>
            <Btn tono="albahaca" onClick={() => crear('cocina')}>+ Pantalla para cocina</Btn>
          </div>
        </section>
        {teles === null ? <p className="p-6 text-center text-gris">Cargando…</p>
          : !teles.length ? <p className="rounded-xl bg-superficie p-6 text-center text-gris ring-1 ring-linea">Todavía no hay pantallas. Agregá una con los botones de arriba.</p>
          : teles.map(t => <Tele key={t.id} t={t} sucursalId={local.id} cocinaActiva={local.cocinaActiva} onCambio={cargar} />)}
      </div>
    </div>
  )
}

const ORIENTACIONES: { key: OrientacionPantalla; label: string; detalle: string }[] = [
  { key: 'horizontal', label: 'Horizontal', detalle: 'Acostada, como siempre' },
  { key: 'vertical_izquierda', label: 'Vertical izquierda', detalle: 'Parada, con el borde de arriba a la izquierda' },
  { key: 'vertical_derecha', label: 'Vertical derecha', detalle: 'Parada, con el borde de arriba a la derecha' },
]
const MAX_MB = 200

/** Dibujito de la tele para cada orientación (la rayita marca el borde de arriba) */
function IconoTele({ o }: { o: OrientacionPantalla }) {
  const v = o !== 'horizontal'
  return (
    <svg viewBox="0 0 48 48" className="size-10 shrink-0" aria-hidden>
      <rect x={v ? 14 : 4} y={v ? 4 : 12} width={v ? 20 : 40} height={v ? 40 : 24} rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      {o === 'horizontal' && <rect x="18" y="14" width="12" height="3" rx="1.5" fill="currentColor" />}
      {o === 'vertical_izquierda' && <rect x="16" y="18" width="3" height="12" rx="1.5" fill="currentColor" />}
      {o === 'vertical_derecha' && <rect x="29" y="18" width="3" height="12" rx="1.5" fill="currentColor" />}
    </svg>
  )
}

function conexion(ping?: string) {
  if (!ping) return { texto: 'Nunca se abrió', tono: 'text-gris' }
  const min = Math.round((Date.now() - new Date(ping).getTime()) / 60_000)
  // la tele revisa cada 2 minutos: hasta ~4 min sin noticias es normal
  if (min <= 4) return { texto: 'Conectada', tono: 'text-albahaca' }
  if (min < 60) return { texto: `Sin conexión hace ${min} min`, tono: 'text-tomate' }
  return { texto: `Última vez: ${new Date(ping).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, tono: 'text-gris' }
}

function Tele({ t, sucursalId, cocinaActiva, onCambio }: { t: Pantalla; sucursalId: string; cocinaActiva: boolean; onCambio: () => Promise<void> }) {
  const { avisar } = useApp()
  const [nombre, setNombre] = useState(t.nombre)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<'codigo' | 'eliminar' | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  useEffect(() => setNombre(t.nombre), [t.nombre])
  const enlace = `${location.origin}/p/${t.codigo}`
  const con = conexion(t.ultimoPing)

  const guardar = async (c: Partial<{ nombre: string; orientacion: OrientacionPantalla; videos: VideoPantalla[] }>, aviso?: string) => {
    setGuardando(true)
    try {
      await repo.guardarPantalla(t.id, { nombre: t.nombre, orientacion: t.orientacion, videos: t.videos, ...c })
      await onCambio()
      if (aviso) avisar(aviso)
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setGuardando(false) }
  }
  const accion = async (f: () => Promise<void>, aviso: string) => {
    try { await f(); await onCambio(); avisar(aviso) } catch (e) { avisar(mensajeError(e), 'error') }
  }
  const copiar = async () => {
    try { await navigator.clipboard.writeText(enlace); avisar('Dirección copiada') } catch { avisar(enlace) }
  }

  const subir = async (lista: FileList | null) => {
    if (!lista?.length) return
    let actuales = [...t.videos]
    for (const f of [...lista]) {
      if (f.size > MAX_MB * 1024 * 1024) { avisar(`${f.name} pesa más de ${MAX_MB} MB. Achicalo o cortalo antes de subirlo.`, 'error'); continue }
      setSubiendo(f.name)
      try {
        actuales = [...actuales, await repo.subirVideoPantalla(sucursalId, f)]
        await repo.guardarPantalla(t.id, { nombre: t.nombre, orientacion: t.orientacion, videos: actuales })
      } catch (e) { avisar(`No se pudo subir ${f.name}: ${mensajeError(e)}`, 'error') }
    }
    setSubiendo(null)
    if (archivo.current) archivo.current.value = ''
    await onCambio()
  }
  const quitar = async (v: VideoPantalla) => {
    await guardar({ videos: t.videos.filter(x => x.path !== v.path) }, 'Video quitado')
    repo.borrarVideoPantalla(v.path).catch(() => { /* ya no se muestra */ })
  }
  const mover = (i: number, d: number) => {
    const v = [...t.videos]; const [x] = v.splice(i, 1); v.splice(i + d, 0, x)
    guardar({ videos: v })
  }

  return (
    <section className="rounded-xl bg-superficie p-5 ring-1 ring-linea">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${t.tipo === 'cocina' ? 'bg-muzza-claro text-tinta' : 'bg-pizarra-claro text-pizarra'}`}>
          {t.tipo === 'cocina' ? 'Cocina' : 'Clientes'}
        </span>
        <input aria-label="Nombre de la pantalla" value={nombre} onChange={e => setNombre(e.target.value)}
          onBlur={() => nombre.trim() !== t.nombre && guardar({ nombre: nombre.trim() })}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={`${inputBase} h-10 min-w-0 flex-1 font-cond text-xl font-bold`} />
        <span className={`text-sm font-semibold ${con.tono}`}>{con.texto}</span>
      </div>

      <div className="mt-4 rounded-xl bg-harina p-4 ring-1 ring-linea">
        <div className="text-sm font-medium text-gris">Dirección para abrir en la pantalla</div>
        <div className="mt-1 break-all font-mono text-2xl font-bold tracking-wide">{enlace.replace(/^https?:\/\//, '')}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={copiar}>Copiar</Btn>
          <a href={enlace} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-lg bg-pizarra px-4 font-semibold text-white hover:brightness-110">Abrir</a>
          <Btn tono="fantasma" onClick={() => setConfirmar('codigo')}>Generar dirección nueva</Btn>
          <Btn tono="fantasma" className="text-tomate" onClick={() => setConfirmar('eliminar')}>Eliminar pantalla</Btn>
        </div>
        {t.tipo === 'cocina' && !cocinaActiva && (
          <p className="mt-3 text-sm font-semibold text-tomate">La pantalla de cocina está apagada en este local: activala arriba para que los pedidos pasen por cocina.</p>
        )}
      </div>

      {t.tipo === 'clientes' && (
        <>
          <h3 className="mt-5 font-cond text-xl font-bold">Orientación</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={`Orientación de ${t.nombre}`}>
            {ORIENTACIONES.map(o => (
              <button key={o.key} role="radio" aria-checked={t.orientacion === o.key} disabled={guardando}
                onClick={() => t.orientacion !== o.key && guardar({ orientacion: o.key }, 'Orientación guardada')}
                className={`flex items-center gap-3 rounded-xl p-3 text-left ring-1 ${t.orientacion === o.key ? 'bg-albahaca-claro ring-2 ring-albahaca' : 'bg-harina ring-linea hover:bg-superficie'}`}>
                <IconoTele o={o.key} />
                <span><span className="block font-semibold">{o.label}</span><span className="text-sm text-gris">{o.detalle}</span></span>
              </button>
            ))}
          </div>

          <h3 className="mt-5 font-cond text-xl font-bold">Videos</h3>
          <p className="text-[15px] text-gris">
            Uno detrás del otro, en loop y sin sonido, {t.orientacion === 'horizontal' ? 'a la izquierda' : 'arriba'} de los pedidos. MP4 de hasta {MAX_MB} MB.
            La pantalla los baja una sola vez y los guarda.
          </p>
          {t.videos.length > 0 && (
            <ul className="mt-3 divide-y divide-linea overflow-hidden rounded-xl bg-harina ring-1 ring-linea">
              {t.videos.map((v, i) => (
                <li key={v.path} className="flex items-center gap-3 px-3 py-2">
                  <video src={v.url} muted preload="metadata" className="h-14 w-24 shrink-0 rounded-md bg-black object-cover" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{v.nombre}</span>
                  <button aria-label={`Subir ${v.nombre}`} disabled={i === 0 || guardando} onClick={() => mover(i, -1)} className="size-9 rounded-lg text-lg text-gris hover:bg-superficie disabled:opacity-30">↑</button>
                  <button aria-label={`Bajar ${v.nombre}`} disabled={i === t.videos.length - 1 || guardando} onClick={() => mover(i, 1)} className="size-9 rounded-lg text-lg text-gris hover:bg-superficie disabled:opacity-30">↓</button>
                  <Btn tono="fantasma" className="text-tomate" disabled={guardando} onClick={() => quitar(v)}>Quitar</Btn>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <input ref={archivo} type="file" accept="video/mp4,video/webm,video/quicktime" multiple className="hidden" aria-label={`Video para ${t.nombre}`} onChange={e => subir(e.target.files)} />
            <Btn tono="albahaca" disabled={!!subiendo} onClick={() => archivo.current?.click()}>{subiendo ? `Subiendo ${subiendo}…` : '+ Subir video'}</Btn>
            {subiendo && <p className="mt-2 text-sm text-gris">Un video grande puede tardar unos minutos. No cierres esta ventana.</p>}
          </div>
        </>
      )}

      {confirmar === 'codigo' && (
        <Confirmar texto="¿Generar una dirección nueva?" detalle="La dirección actual deja de andar en el momento: hay que abrir la nueva en la pantalla." accion="Generar nueva"
          onNo={() => setConfirmar(null)} onSi={() => { setConfirmar(null); accion(() => repo.nuevoCodigoPantalla(t.id), 'Dirección nueva generada') }} />
      )}
      {confirmar === 'eliminar' && (
        <Confirmar texto={`¿Eliminar ${t.nombre || 'esta pantalla'}?`} detalle="Su dirección deja de andar y se borran sus videos." accion="Eliminar"
          onNo={() => setConfirmar(null)} onSi={() => { setConfirmar(null); accion(() => repo.eliminarPantalla(t.id), 'Pantalla eliminada') }} />
      )}
    </section>
  )
}
