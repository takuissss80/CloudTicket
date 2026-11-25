import { useRef, useState } from 'react'
import type { OrientacionPantalla, VideoPantalla } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp, useLocalActivo } from '../../store/app'
import { Btn } from '../ui'
import { Cocina } from './Cocina'

/** Pestaña Pantallas (PRO): la de cocina y la de clientes */
export function Pantallas() {
  return (
    <div>
      <Cocina />
      <PantallaClientes />
    </div>
  )
}

const ORIENTACIONES: { key: OrientacionPantalla; label: string; detalle: string }[] = [
  { key: 'horizontal', label: 'Horizontal', detalle: 'La tele está acostada, como siempre' },
  { key: 'vertical_izquierda', label: 'Vertical izquierda', detalle: 'Parada, con el borde de arriba de la tele a la izquierda' },
  { key: 'vertical_derecha', label: 'Vertical derecha', detalle: 'Parada, con el borde de arriba de la tele a la derecha' },
]
const MAX_MB = 200

/** Dibujito de la tele para cada orientación (el punto marca el borde de arriba) */
function Tele({ o }: { o: OrientacionPantalla }) {
  const v = o !== 'horizontal'
  return (
    <svg viewBox="0 0 48 48" className="size-12 shrink-0" aria-hidden>
      <rect x={v ? 14 : 4} y={v ? 4 : 12} width={v ? 20 : 40} height={v ? 40 : 24} rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      {o === 'horizontal' && <rect x="18" y="14" width="12" height="3" rx="1.5" fill="currentColor" />}
      {o === 'vertical_izquierda' && <rect x="16" y="18" width="3" height="12" rx="1.5" fill="currentColor" />}
      {o === 'vertical_derecha' && <rect x="29" y="18" width="3" height="12" rx="1.5" fill="currentColor" />}
    </svg>
  )
}

/** Pantalla para clientes del mostrador: orientación de la tele y videos en loop */
function PantallaClientes() {
  const { avisar, refrescarMenu } = useApp()
  const local = useLocalActivo()
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  if (!local) return null
  const orientacion = local.pantallaOrientacion ?? 'horizontal'
  const videos = local.pantallaVideos ?? []

  const guardar = async (o: OrientacionPantalla, v: VideoPantalla[], aviso?: string) => {
    setGuardando(true)
    try {
      await repo.configPantallaClientes(local.id, { orientacion: o, videos: v })
      await refrescarMenu()
      if (aviso) avisar(aviso)
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setGuardando(false) }
  }

  const subir = async (lista: FileList | null) => {
    if (!lista?.length) return
    let actuales = [...videos]
    for (const f of [...lista]) {
      if (f.size > MAX_MB * 1024 * 1024) { avisar(`${f.name} pesa más de ${MAX_MB} MB. Achicalo o cortalo antes de subirlo.`, 'error'); continue }
      setSubiendo(f.name)
      try {
        const v = await repo.subirVideoPantalla(local.id, f)
        actuales = [...actuales, v]
        await repo.configPantallaClientes(local.id, { orientacion, videos: actuales })
      } catch (e) { avisar(`No se pudo subir ${f.name}: ${mensajeError(e)}`, 'error') }
    }
    setSubiendo(null)
    if (archivo.current) archivo.current.value = ''
    await refrescarMenu()
  }

  const quitar = async (v: VideoPantalla) => {
    await guardar(orientacion, videos.filter(x => x.path !== v.path), 'Video quitado')
    repo.borrarVideoPantalla(v.path).catch(() => { /* si no se pudo borrar el archivo, igual ya no se muestra */ })
  }
  const mover = (i: number, d: number) => {
    const v = [...videos]; const [x] = v.splice(i, 1); v.splice(i + d, 0, x)
    guardar(orientacion, v)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pt-0">
      <section className="rounded-xl bg-superficie p-5 ring-1 ring-linea">
        <h2 className="font-cond text-3xl font-bold">Pantalla para clientes · {local.nombre}</h2>
        <p className="mt-1 text-gris">La tele del mostrador muestra los pedidos <b>en preparación</b> y los <b>listos para retirar</b>, con los nombres de los clientes.</p>

        <h3 className="mt-5 font-cond text-2xl font-bold">Orientación de la tele</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Orientación de la tele">
          {ORIENTACIONES.map(o => (
            <button key={o.key} role="radio" aria-checked={orientacion === o.key} disabled={guardando}
              onClick={() => orientacion !== o.key && guardar(o.key, videos, 'Orientación guardada')}
              className={`flex items-center gap-3 rounded-xl p-3 text-left ring-1 ${orientacion === o.key ? 'bg-albahaca-claro ring-2 ring-albahaca' : 'bg-harina ring-linea hover:bg-superficie'}`}>
              <Tele o={o.key} />
              <span><span className="block font-semibold">{o.label}</span><span className="text-sm text-gris">{o.detalle}</span></span>
            </button>
          ))}
        </div>

        <h3 className="mt-6 font-cond text-2xl font-bold">Videos</h3>
        <p className="text-[15px] text-gris">
          Se pasan uno detrás del otro, en loop y sin sonido, al costado de la lista de pedidos
          {orientacion === 'horizontal' ? ' (a la izquierda)' : ' (arriba)'}. MP4 de hasta {MAX_MB} MB cada uno.
        </p>
        {videos.length > 0 && (
          <ul className="mt-3 divide-y divide-linea overflow-hidden rounded-xl bg-harina ring-1 ring-linea">
            {videos.map((v, i) => (
              <li key={v.path} className="flex items-center gap-3 px-3 py-2">
                <video src={v.url} muted preload="metadata" className="h-14 w-24 shrink-0 rounded-md bg-black object-cover" />
                <span className="min-w-0 flex-1 truncate font-semibold">{v.nombre}</span>
                <button aria-label={`Subir ${v.nombre}`} disabled={i === 0 || guardando} onClick={() => mover(i, -1)} className="size-9 rounded-lg text-lg text-gris hover:bg-superficie disabled:opacity-30">↑</button>
                <button aria-label={`Bajar ${v.nombre}`} disabled={i === videos.length - 1 || guardando} onClick={() => mover(i, 1)} className="size-9 rounded-lg text-lg text-gris hover:bg-superficie disabled:opacity-30">↓</button>
                <Btn tono="fantasma" className="text-tomate" disabled={guardando} onClick={() => quitar(v)}>Quitar</Btn>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={archivo} type="file" accept="video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={e => subir(e.target.files)} />
          <Btn tono="albahaca" disabled={!!subiendo} onClick={() => archivo.current?.click()}>{subiendo ? `Subiendo ${subiendo}…` : '+ Subir video'}</Btn>
          <a href="#mostrador" target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-lg bg-pizarra px-4 font-semibold text-white hover:brightness-110">
            Abrir pantalla para clientes
          </a>
        </div>
        {subiendo && <p className="mt-2 text-sm text-gris">Un video grande puede tardar unos minutos en subir. No cierres esta ventana.</p>}
      </section>
    </div>
  )
}
