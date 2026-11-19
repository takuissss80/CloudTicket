import { FORMAS_PAGO } from '../types'
import type { VentaGrupo } from '../lib/caja'
import { money } from '../lib/format'
import { Tarjeta } from './comunes'

/** Venta discriminada por marca (categoría contenedora): total y cobrado por cada medio */
export function VentaPorMarca({ grupos }: { grupos: VentaGrupo[] }) {
  if (!grupos.length) return null
  const total = grupos.reduce((s, g) => s + g.total, 0)
  return (
    <Tarjeta titulo="Venta por marca">
      <div className="space-y-3">
        {grupos.map(g => (
          <div key={g.nombre} className="rounded-xl border border-linea bg-papel px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-cond text-[19px] font-bold text-tinta">{g.nombre}</span>
              <span className="num text-[13px] text-gris">{g.comandas} {g.comandas === 1 ? 'comanda' : 'comandas'} · {total > 0 ? Math.round((g.total / total) * 100) : 0}%</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[14px] font-semibold text-tinta">Venta total</span>
              <span className="num font-cond text-[24px] font-bold text-albahaca">{money(g.total)}</span>
            </div>
            {[...g.porForma].map(([forma, monto]) => (
              <div key={forma} className="flex justify-between text-[14px] text-gris">
                <span>{FORMAS_PAGO.find(f => f.key === forma)?.label ?? forma}</span>
                <span className="num text-tinta">{money(monto)}</span>
              </div>
            ))}
            {g.total - g.cobrado > 0.5 && (
              <div className="flex justify-between text-[14px] text-gris"><span>Sin cobrar</span><span className="num">{money(g.total - g.cobrado)}</span></div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-gris">El efectivo es una sola caja. Un pedido con productos de dos marcas se reparte según lo que suma cada una.</p>
    </Tarjeta>
  )
}
