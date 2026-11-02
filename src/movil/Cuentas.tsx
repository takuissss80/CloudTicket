import { useState } from 'react'
import { esDemo, useCuentas } from './cuentas'
import { Aviso, Tarjeta } from './comunes'

export function Cuentas({ onAgregar, onElegida }: { onAgregar: () => void; onElegida: () => void }) {
  const { cuentas, activaId, cambiar, quitar } = useCuentas()
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function elegir(id: string) {
    setError('')
    try { await cambiar(id); onElegida() } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <Tarjeta titulo="Cuentas en este celular">
        <p className="mb-3 text-[14px] text-gris">
          Si tenés otros negocios con su propia cuenta de CloudTicket, agregalos acá y pasá de uno a otro sin volver a escribir la contraseña.
          Los locales de una misma cuenta se eligen arriba de cada pantalla.
        </p>
        <ul className="space-y-2">
          {cuentas.map(c => {
            const activa = c.id === activaId
            return (
              <li key={c.id} className={`rounded-xl border p-3 ${activa ? 'border-pizarra bg-pizarra-claro' : 'border-linea bg-papel'}`}>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => void elegir(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-full font-cond text-[18px] font-bold ${activa ? 'bg-pizarra text-white' : 'bg-superficie text-tinta ring-1 ring-linea'}`}>
                      {(c.nombre || c.usuario).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-semibold text-tinta">{c.nombre || 'Sin nombre'}</span>
                      <span className="block truncate text-[13px] text-gris">{c.usuario} · {c.rol === 'admin' ? 'Administrador' : 'Local'}</span>
                    </span>
                  </button>
                  {activa
                    ? <span className="text-[12px] font-bold uppercase text-pizarra">En uso</span>
                    : <button type="button" onClick={() => void elegir(c.id)} className="h-9 rounded-lg border border-linea bg-superficie px-3 text-[14px] font-semibold">Usar</button>}
                </div>
                {confirmar === c.id ? (
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-linea pt-3">
                    <span className="text-[14px] text-tinta">¿Cerrar sesión y quitarla?</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmar(null)} className="h-9 rounded-lg border border-linea bg-superficie px-3 text-[14px]">No</button>
                      <button type="button" onClick={() => { setConfirmar(null); void quitar(c.id) }} className="h-9 rounded-lg bg-tomate px-3 text-[14px] font-semibold text-white">Quitar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmar(c.id)} className="mt-2 text-[13px] font-semibold text-tomate">Cerrar sesión</button>
                )}
              </li>
            )
          })}
        </ul>
        {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
        <button type="button" onClick={onAgregar} disabled={esDemo}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primario text-[16px] font-bold text-sobre-primario disabled:opacity-50">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Agregar cuenta
        </button>
        {esDemo && <p className="mt-2 text-center text-[12px] text-gris">En la demo hay una sola cuenta.</p>}
      </Tarjeta>
    </div>
  )
}
