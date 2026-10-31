import { useState } from 'react'
import type { PrintJob } from '../types'
import { repo } from '../data'
import { useApp, useNombreLocal } from '../store/app'
import { hora } from '../lib/format'
import { Btn, Confirmar, Modal } from './ui'
import { TicketPreview } from './TicketPreview'
import { Comanderas } from './Comanderas'

const etiqueta: Record<PrintJob['estado'], string> = {
  pendiente: 'En cola',
  imprimiendo: 'Imprimiendo',
  impreso: 'Impreso',
  error: 'Error',
}

/** Comanderas y cola de impresión del local activo (pestaña de Administración) */
export function ImpresionPanel() {
  const { printJobs, impresoras, comandas, refrescar, avisar } = useApp()
  const local = useNombreLocal()
  const [ver, setVer] = useState<PrintJob | null>(null)
  const [borrar, setBorrar] = useState<{ ids: string[]; texto: string } | null>(null)
  const borrables = printJobs.filter(j => j.estado === 'pendiente' || j.estado === 'error')
  const nombreJob = (j: PrintJob) => {
    const c = comandas.find(x => x.id === j.comandaId)
    return `${j.tipo}${c ? ` #${c.numero}` : ''}`
  }
  const eliminar = async (ids: string[]) => {
    try {
      const n = await repo.eliminarPrintJobs(ids)
      avisar(n === 1 ? 'Se eliminó 1 trabajo de la cola' : `Se eliminaron ${n} trabajos de la cola`)
      await refrescar()
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error') }
  }
  const pendientes = printJobs.filter(j => j.estado === 'pendiente').length
  const conError = printJobs.filter(j => j.estado === 'error').length

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Impresión</h2>
          <p className="text-[15px] text-gris">Comanderas de {local} y lo que se mandó a imprimir.</p>
        </div>
        <span className="rounded-lg bg-muzza-claro px-3 py-1.5 font-semibold">{pendientes} en cola</span>
        {conError > 0 && <span className="rounded-lg bg-tomate px-3 py-1.5 font-semibold text-white">{conError} con error</span>}
      </div>
      {repo.modo === 'demo' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-muzza-claro p-3">
          <p className="flex-1 text-sm">Modo demo: no hay spool conectado. Podés simular que la comandera imprimió lo que está en cola.</p>
          <Btn tono="pizarra" disabled={!pendientes} onClick={async () => { await repo.simularSpool?.(); await refrescar() }}>
            Simular impresión ({pendientes})
          </Btn>
        </div>
      )}
      <div className="space-y-6">
        <Comanderas />

        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto font-cond text-2xl font-bold">Últimos trabajos</h3>
            {borrables.length > 0 && (
              <Btn tono="fantasma" className="text-tomate" onClick={() => setBorrar({
                ids: borrables.map(j => j.id),
                texto: `¿Eliminar ${borrables.length === 1 ? 'el trabajo' : `los ${borrables.length} trabajos`} sin imprimir?`,
              })}>Vaciar cola ({borrables.length})</Btn>
            )}
          </div>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl bg-superficie ring-1 ring-linea">
            {printJobs.map(j => {
              const c = comandas.find(x => x.id === j.comandaId)
              return (
                <li key={j.id} className="flex items-center hover:bg-harina">
                  <button onClick={() => setVer(j)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left">
                    <span className="w-14 text-sm tabular-nums text-gris">{hora(j.createdAt)}</span>
                    <span className="flex-1 capitalize">{j.tipo}{c ? ` #${c.numero}` : ''}</span>
                    <span className="text-sm text-gris">{impresoras.find(i => i.id === j.impresoraId)?.nombre}</span>
                    <span className={`w-24 text-right text-sm font-semibold ${j.estado === 'impreso' ? 'text-albahaca' : j.estado === 'error' ? 'text-tomate' : 'text-tinta'}`}>{etiqueta[j.estado]}</span>
                  </button>
                  <span className="w-12 shrink-0 text-center">
                    {(j.estado === 'pendiente' || j.estado === 'error') && (
                      <button onClick={() => setBorrar({ ids: [j.id], texto: `¿Eliminar ${nombreJob(j)} de la cola?` })}
                        aria-label={`Eliminar ${nombreJob(j)} de la cola`} title="Eliminar de la cola"
                        className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                    )}
                  </span>
                </li>
              )
            })}
            {!printJobs.length && <li className="px-4 py-6 text-center text-gris">Todavía no se mandó nada a imprimir.</li>}
          </ul>
        </section>
      </div>

      {borrar && (
        <Confirmar texto={borrar.texto} detalle="No se va a imprimir. La comanda no se toca: si hace falta, la podés reimprimir desde el pedido."
          accion="Eliminar" onNo={() => setBorrar(null)} onSi={async () => { const ids = borrar.ids; setBorrar(null); await eliminar(ids) }} />
      )}

      {ver && (
        <Modal titulo={`Trabajo ${etiqueta[ver.estado].toLowerCase()}`} onClose={() => setVer(null)} ancho="max-w-xl">
          <div className="overflow-x-auto p-5">
            {ver.error && <p className="mb-3 text-tomate">{ver.error}</p>}
            <TicketPreview lineas={ver.contenido} ancho={impresoras.find(i => i.id === ver.impresoraId)?.ancho ?? 48} />
          </div>
        </Modal>
      )}
    </div>
  )
}
