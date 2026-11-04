import { useEffect, useState } from 'react'
import { repo } from '../../data'
import { mensajeError, useApp, useLocalActivo } from '../../store/app'
import { Btn, Campo, inputCls } from '../ui'

/** Activar la pantalla de cocina del local y los minutos de alerta */
export function Cocina() {
  const { avisar, refrescarMenu } = useApp()
  const local = useLocalActivo()
  const [activa, setActiva] = useState(false)
  const [amarillo, setAmarillo] = useState('7')
  const [rojo, setRojo] = useState('15')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!local) return
    setActiva(local.cocinaActiva); setAmarillo(String(local.cocinaAmarillo)); setRojo(String(local.cocinaRojo))
  }, [local])

  if (!local) return null
  const a = Math.round(Number(amarillo)), r = Math.round(Number(rojo))
  const error = !(a >= 1) ? 'Poné los minutos para el amarillo' : !(r > a) ? 'El rojo tiene que ser más minutos que el amarillo' : ''
  const cambios = activa !== local.cocinaActiva || a !== local.cocinaAmarillo || r !== local.cocinaRojo

  const guardar = async () => {
    setGuardando(true)
    try {
      await repo.configCocina(local.id, { activa, amarillo: a, rojo: r })
      await refrescarMenu()
      avisar(activa ? 'Pantalla de cocina activada' : 'Pantalla de cocina desactivada')
    } catch (e) { avisar(mensajeError(e), 'error') } finally { setGuardando(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <section className="rounded-xl bg-superficie p-5 ring-1 ring-linea">
        <h2 className="font-cond text-3xl font-bold">Pantalla para cocina · {local.nombre}</h2>
        <p className="mt-1 text-gris">
          Con la pantalla activa, los pedidos pasan por la cocina antes de entregarse: <b>Pasar a cocina</b> → la cocina lo prepara →
          <b> Pedido listo</b> (recién ahí se imprime el ticket para pegar en el pedido) → <b>Entregar pedido</b> o asignar la moto.
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg bg-harina px-4 py-3">
          <input type="checkbox" className="size-6 accent-albahaca" checked={activa} onChange={e => setActiva(e.target.checked)} />
          <span className="text-lg font-semibold">Usar pantalla de cocina en este local</span>
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Campo label="Se pone amarilla a los (minutos)">
            <input id="cocina-amarillo" inputMode="numeric" value={amarillo} onChange={e => setAmarillo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </Campo>
          <Campo label="Se pone roja a los (minutos)">
            <input id="cocina-rojo" inputMode="numeric" value={rojo} onChange={e => setRojo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </Campo>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-superficie px-3 py-1.5 ring-1 ring-linea">0 a {a || '?'} min: normal</span>
          <span className="rounded-lg bg-muzza-claro px-3 py-1.5 ring-2 ring-muzza">{a || '?'} a {r || '?'} min: amarilla</span>
          <span className="rounded-lg bg-tomate-claro px-3 py-1.5 ring-2 ring-tomate">más de {r || '?'} min: roja</span>
        </div>
        {error && <p className="mt-3 font-semibold text-tomate">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Btn tono="albahaca" disabled={!!error || !cambios || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
          {local.cocinaActiva && (
            <a href="#cocina" target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-lg bg-pizarra px-4 font-semibold text-white hover:brightness-110">
              Abrir pantalla de cocina
            </a>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-superficie p-5 text-[15px] ring-1 ring-linea">
        <h3 className="font-cond text-2xl font-bold">Cómo dejarla en la cocina</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>En la PC o tablet de la cocina, entrá a la web con un usuario del local (puede ser uno común).</li>
          <li>Tocá <b>Cocina</b> arriba, o entrá directo a <b>{location.host}/#cocina</b> y guardala en favoritos.</li>
          <li>Tocá <b>Pantalla completa</b> y dejá el sonido activado para escuchar cuando entra un pedido.</li>
        </ol>
        <p className="mt-2 text-gris">Los pedidos aparecen en el orden en que entraron a cocina. Si alguien marca "Pedido listo" por error, abajo aparece <b>Volver a cocina</b>.</p>
      </section>
    </div>
  )
}
