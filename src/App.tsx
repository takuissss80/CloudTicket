import { useCallback, useEffect, useState } from 'react'
import { repo } from './data'
import type { EstadoSesion } from './data/repo'
import { resetDemo } from './data/localRepo'
import { useApp } from './store/app'
import { usePedido } from './store/pedido'
import { hora } from './lib/format'
import { Tablero } from './components/Tablero'
import { TomarPedido } from './components/TomarPedido'
import { CajaCerrada, CajaPanel } from './components/Caja'
import { ColaImpresion } from './components/ColaImpresion'
import { CrearCuenta, Login } from './components/Login'
import { Administracion } from './components/admin/Administracion'
import { Btn, Confirmar, Toasts } from './components/ui'

function Principal({ onSalir }: { onSalir: () => void }) {
  const { cargando, error, caja, sesion, sucursales, sucursalId, printJobs, cambiarLocal, refrescar, refrescarMenu, salir } = useApp()
  const pedidoAbierto = usePedido(s => s.abierto)
  const [verCola, setVerCola] = useState(false)
  const [verCierre, setVerCierre] = useState(false)
  const [verAdmin, setVerAdmin] = useState(false)
  const [verReset, setVerReset] = useState(false)

  // Cambios en tiempo real: otras PCs, el spool, cambios de menú
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout> | undefined
    let t2: ReturnType<typeof setTimeout> | undefined
    const off = repo.subscribe(tabla => {
      if (tabla === 'menu') { clearTimeout(t2); t2 = setTimeout(() => refrescarMenu(), 300) }
      else { clearTimeout(t1); t1 = setTimeout(() => refrescar(), 150) }
    })
    return () => { clearTimeout(t1); clearTimeout(t2); off() }
  }, [refrescar, refrescarMenu])

  if (cargando) return <div className="grid h-full place-items-center font-cond text-2xl text-gris">Cargando…</div>
  if (error) return (
    <div className="mx-auto mt-[15vh] max-w-lg px-4">
      <h1 className="font-cond text-4xl font-bold text-tomate">No se pudo cargar</h1>
      <p className="mt-2">{error}</p>
      <div className="mt-6 flex gap-2">
        <Btn onClick={() => location.reload()}>Reintentar</Btn>
        <Btn tono="fantasma" onClick={async () => { await salir(); onSalir() }}>Salir</Btn>
      </div>
    </div>
  )

  const enCola = printJobs.filter(j => j.estado === 'pendiente').length
  const conError = printJobs.filter(j => j.estado === 'error').length
  const esAdmin = sesion?.rol === 'admin'
  const local = sucursales.find(s => s.id === sucursalId)

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-linea bg-papel/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {esAdmin && sucursales.length > 1 ? (
              <label className="flex items-center">
                <span className="sr-only">Local</span>
                <select id="local-activo" value={sucursalId ?? ''} onChange={e => cambiarLocal(e.target.value)}
                  className="h-10 max-w-[60vw] rounded-lg border border-linea bg-white pl-2 pr-8 font-cond text-xl font-extrabold">
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
            ) : (
              <span className="truncate font-cond text-2xl font-extrabold">{local?.nombre}</span>
            )}
            {caja && <span className="hidden text-[15px] text-gris sm:inline">Caja {caja.turno.toLowerCase()} desde las {hora(caja.abiertaAt)}</span>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {repo.modo === 'demo' && (
              <button onClick={() => setVerReset(true)} className="h-10 rounded-lg bg-muzza-claro px-3 text-sm font-semibold hover:bg-muzza">Modo demo</button>
            )}
            <Btn onClick={() => setVerAdmin(true)}>{esAdmin ? 'Administración' : 'Administración del local'}</Btn>
            <button onClick={() => setVerCola(true)}
              className={`h-10 rounded-lg px-3 font-semibold ring-1 ${conError ? 'bg-tomate text-white ring-tomate' : 'bg-white ring-linea hover:bg-harina'}`}>
              Impresión{enCola ? <span className="ml-2 rounded-full bg-muzza px-2 text-tinta">{enCola} en cola</span> : null}
              {conError ? <span className="ml-2">{conError} con error</span> : null}
            </button>
            {caja && <Btn onClick={() => setVerCierre(true)}>Caja</Btn>}
            <Btn tono="fantasma" title={`Usuario: ${sesion?.usuario}`} onClick={async () => { await salir(); onSalir() }}>
              Salir <span className="hidden text-sm font-normal text-gris md:inline">({sesion?.usuario})</span>
            </Btn>
          </div>
        </div>
      </header>

      {caja ? <Tablero /> : <CajaCerrada />}

      {pedidoAbierto && <TomarPedido />}
      {verAdmin && <Administracion onClose={() => setVerAdmin(false)} />}
      {verCola && <ColaImpresion onClose={() => setVerCola(false)} />}
      {verCierre && <CajaPanel onClose={() => setVerCierre(false)} />}
      {verReset && (
        <Confirmar
          texto="Estás en modo demo"
          detalle="Todo se guarda solo en este navegador y la impresión es simulada. Para usar la base real configurá Supabase (ver README). ¿Querés borrar los datos de prueba y volver al estado inicial?"
          accion="Borrar datos de prueba"
          onNo={() => setVerReset(false)}
          onSi={async () => { setVerReset(false); resetDemo(); await salir(); onSalir() }}
        />
      )}
    </div>
  )
}

export default function App() {
  const [estado, setEstado] = useState<EstadoSesion | null>(null)
  const iniciar = useApp(s => s.iniciar)

  const revisar = useCallback(async () => {
    const e = await repo.estadoSesion().catch(() => ({ estado: 'sin_login' as const }))
    setEstado(e)
    if (e.estado === 'ok') iniciar(e.sesion)
  }, [iniciar])

  useEffect(() => { revisar() }, [revisar])

  return (
    <>
      {!estado ? <div className="grid h-full place-items-center font-cond text-2xl text-gris">Cargando…</div>
        : estado.estado === 'sin_login' ? <Login onListo={revisar} />
        : estado.estado === 'sin_cuenta' ? <CrearCuenta email={estado.email} onListo={revisar} />
        : <Principal onSalir={revisar} />}
      <Toasts />
    </>
  )
}
