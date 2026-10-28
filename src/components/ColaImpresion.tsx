import { useState } from 'react'
import type { PrintJob } from '../types'
import { repo } from '../data'
import { useApp } from '../store/app'
import { hora } from '../lib/format'
import { Btn, Modal } from './ui'
import { TicketPreview } from './TicketPreview'

const etiqueta: Record<PrintJob['estado'], string> = {
  pendiente: 'En cola',
  imprimiendo: 'Imprimiendo',
  impreso: 'Impreso',
  error: 'Error',
}

/** Cola de impresión: lo que el spool de cada local tiene que imprimir */
export function ColaImpresion({ onClose }: { onClose: () => void }) {
  const { printJobs, impresoras, comandas, imprimirPrueba, refrescar } = useApp()
  const [ver, setVer] = useState<PrintJob | null>(null)
  const pendientes = printJobs.filter(j => j.estado === 'pendiente').length

  return (
    <Modal
      titulo="Comanderas e impresión"
      onClose={onClose}
      ancho="max-w-3xl"
      pie={repo.modo === 'demo' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-gris">Modo demo: no hay spool conectado. Podés simular que la comandera imprimió lo que está en cola.</p>
          <Btn tono="pizarra" disabled={!pendientes} onClick={async () => { await repo.simularSpool?.(); await refrescar() }}>
            Simular impresión ({pendientes})
          </Btn>
        </div>
      ) : undefined}
    >
      <div className="space-y-6 p-5">
        <section>
          <h3 className="mb-2 font-cond text-2xl font-bold">Comanderas</h3>
          <ul className="space-y-2">
            {impresoras.map(i => {
              const online = i.ultimoPing && Date.now() - new Date(i.ultimoPing).getTime() < 60_000
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-linea">
                  <span className={`size-3 rounded-full ${online ? 'bg-albahaca' : 'bg-linea'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{i.nombre}</div>
                    <div className="text-sm text-gris">
                      {[i.imprimeMostrador && 'mostrador', i.imprimeDelivery && 'delivery'].filter(Boolean).join(' y ')}, {i.ancho === 32 ? '58 mm' : '80 mm'}
                      {repo.modo === 'supabase' && (online ? ', spool conectado' : i.ultimoPing ? `, spool visto a las ${hora(i.ultimoPing)}` : ', spool sin vincular')}
                    </div>
                  </div>
                  <Btn onClick={() => imprimirPrueba(i)}>Imprimir prueba</Btn>
                </li>
              )
            })}
            {!impresoras.length && <li className="text-gris">No hay comanderas cargadas para este local.</li>}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-cond text-2xl font-bold">Últimos trabajos</h3>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl bg-white ring-1 ring-linea">
            {printJobs.map(j => {
              const c = comandas.find(x => x.id === j.comandaId)
              return (
                <li key={j.id}>
                  <button onClick={() => setVer(j)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-harina">
                    <span className="w-14 text-sm tabular-nums text-gris">{hora(j.createdAt)}</span>
                    <span className="flex-1 capitalize">{j.tipo}{c ? ` #${c.numero}` : ''}</span>
                    <span className="text-sm text-gris">{impresoras.find(i => i.id === j.impresoraId)?.nombre}</span>
                    <span className={`w-24 text-right text-sm font-semibold ${j.estado === 'impreso' ? 'text-albahaca' : j.estado === 'error' ? 'text-tomate' : 'text-tinta'}`}>{etiqueta[j.estado]}</span>
                  </button>
                </li>
              )
            })}
            {!printJobs.length && <li className="px-4 py-6 text-center text-gris">Todavía no se mandó nada a imprimir.</li>}
          </ul>
        </section>
      </div>

      {ver && (
        <Modal titulo={`Trabajo ${etiqueta[ver.estado].toLowerCase()}`} onClose={() => setVer(null)} ancho="max-w-xl">
          <div className="overflow-x-auto p-5">
            {ver.error && <p className="mb-3 text-tomate">{ver.error}</p>}
            <TicketPreview lineas={ver.contenido} ancho={impresoras.find(i => i.id === ver.impresoraId)?.ancho ?? 48} />
          </div>
        </Modal>
      )}
    </Modal>
  )
}
