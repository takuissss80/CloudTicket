import { useEffect, useState } from 'react'
import type { Comanda, TipoComanda } from '../types'
import { useApp } from '../store/app'
import { usePedido } from '../store/pedido'
import { hora, minutosDesde, money } from '../lib/format'
import { ComandaDetalle } from './ComandaDetalle'
import { etiquetaEstado, siguienteEstado } from '../lib/estados'

const colorEstado: Record<Comanda['estado'], string> = {
  pendiente: 'bg-muzza text-tinta',
  en_preparacion: 'bg-pizarra text-white',
  listo: 'bg-albahaca text-white',
  en_camino: 'bg-tomate text-white',
  entregado: 'bg-linea text-gris',
  anulada: 'bg-tinta text-white',
}

function TarjetaComanda({ c, onAbrir, ahora }: { c: Comanda; onAbrir: () => void; ahora: number }) {
  const cambiarEstado = useApp(s => s.cambiarEstado)
  const sig = siguienteEstado(c)
  const mins = minutosDesde(c.createdAt, ahora)
  const cerrada = c.estado === 'entregado' || c.estado === 'anulada'
  const demorada = !cerrada && mins >= 40
  const unidades = c.items.reduce((s, i) => s + i.cantidad, 0)

  return (
    <article className={`ticket-edge relative bg-white shadow-sm transition ${cerrada ? 'opacity-55' : ''}`}>
      <button onClick={onAbrir} className="block w-full px-4 text-left">
        <div className="flex items-start gap-3">
          <span className={`font-cond text-5xl font-extrabold leading-[0.85] tabular-nums ${c.estado === 'anulada' ? 'line-through' : ''}`}>{c.numero}</span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate font-semibold">{c.clienteNombre || (c.tipo === 'mostrador' ? 'Mostrador' : 'Sin nombre')}</div>
            {c.tipo === 'delivery' && <div className="truncate text-sm text-gris">{c.direccion}</div>}
          </div>
          <div className="text-right">
            <div className={`text-sm font-semibold tabular-nums ${demorada ? 'text-tomate' : 'text-gris'}`}>{hora(c.createdAt)}</div>
            {!cerrada && <div className={`text-xs tabular-nums ${demorada ? 'font-bold text-tomate' : 'text-gris'}`}>hace {mins}′</div>}
          </div>
        </div>

        <ul className="mt-2 border-t border-dashed border-linea pt-2 text-[15px] leading-snug">
          {c.items.slice(0, 4).map(i => (
            <li key={i.id} className="truncate"><b>{i.cantidad}</b> {i.descripcion}{i.variante === 'mitad' ? ' (½)' : ''}</li>
          ))}
          {c.items.length > 4 && <li className="text-gris">y {c.items.length - 4} más</li>}
        </ul>

        <div className="mt-2 flex items-center gap-2 border-t border-dashed border-linea pt-2">
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${colorEstado[c.estado]}`}>{etiquetaEstado(c.estado)}</span>
          {c.horaEntrega && <span className="rounded bg-tomate-claro px-2 py-0.5 text-xs font-bold text-tomate">Para {c.horaEntrega}</span>}
          <span className="ml-auto text-sm text-gris">{unidades} u.</span>
          <span className="font-cond text-xl font-bold tabular-nums">{money(c.total)}</span>
          {!c.cobrada && c.estado !== 'anulada' && <span className="rounded bg-tomate px-1.5 py-0.5 text-xs font-bold text-white">A cobrar</span>}
        </div>
      </button>
      {sig && c.estado !== 'anulada' && (
        <div className="px-4 pt-2">
          <button onClick={() => cambiarEstado(c, sig)}
            className="h-9 w-full rounded-lg bg-harina text-sm font-semibold text-tinta hover:bg-linea">
            Pasar a {etiquetaEstado(sig).toLowerCase()}
          </button>
        </div>
      )}
    </article>
  )
}

export function Tablero() {
  const { comandas } = useApp()
  const nuevo = usePedido(s => s.nuevo)
  const [verCerradas, setVerCerradas] = useState(false)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [ahora, setAhora] = useState(Date.now())

  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(t) }, [])

  const visibles = comandas
    .filter(c => verCerradas || (c.estado !== 'entregado' && c.estado !== 'anulada'))
    .sort((a, b) => b.numero - a.numero)
  const cerradas = comandas.filter(c => c.estado === 'entregado' || c.estado === 'anulada').length
  const sel = comandas.find(c => c.id === seleccion)

  const columna = (tipo: TipoComanda) => {
    const lista = visibles.filter(c => c.tipo === tipo)
    const abiertas = lista.filter(c => c.estado !== 'entregado' && c.estado !== 'anulada').length
    return (
      <section className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <h2 className={`font-cond text-3xl font-bold ${tipo === 'delivery' ? 'text-tomate' : 'text-pizarra'}`}>
            {tipo === 'delivery' ? 'Delivery' : 'Mostrador'}
          </h2>
          <span className="font-cond text-2xl font-bold text-gris tabular-nums">{abiertas}</span>
          <button onClick={() => nuevo(tipo)}
            className={`ml-auto h-12 rounded-xl px-5 font-cond text-xl font-bold shadow-sm ${tipo === 'delivery' ? 'bg-tomate text-white' : 'bg-pizarra text-white'} hover:brightness-110`}>
            + Tomar pedido
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {lista.map(c => <TarjetaComanda key={c.id} c={c} ahora={ahora} onAbrir={() => setSeleccion(c.id)} />)}
        </div>
        {!lista.length && (
          <button onClick={() => nuevo(tipo)} className="w-full rounded-xl border-2 border-dashed border-linea py-10 text-center text-gris hover:border-gris">
            No hay pedidos de {tipo} en curso. Tocá para cargar uno.
          </button>
        )}
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-4">
      <div className="mb-4 flex justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-[15px] text-gris">
          <input type="checkbox" className="size-4 accent-pizarra" checked={verCerradas} onChange={e => setVerCerradas(e.target.checked)} />
          Mostrar entregadas y anuladas ({cerradas})
        </label>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {columna('mostrador')}
        {columna('delivery')}
      </div>
      {sel && <ComandaDetalle comanda={sel} onClose={() => setSeleccion(null)} />}
    </div>
  )
}
