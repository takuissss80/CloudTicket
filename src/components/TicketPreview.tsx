import type { LineaTicket } from '../types'

/**
 * Muestra cómo va a salir la comanda en la térmica.
 * Simula el ancho en caracteres y los tamaños ESC/POS.
 */
export function TicketPreview({ lineas, ancho = 48 }: { lineas: LineaTicket[]; ancho?: number }) {
  return (
    <div className="ticket-edge mx-auto bg-white px-4 text-black shadow-md" style={{ width: `calc(${ancho}ch + 2rem)` }}>
      <div className="font-mono text-[13px] leading-[1.35]" style={{ width: `${ancho}ch` }}>
        {lineas.map((l, i) => {
          if (l.t === 'line') return <div key={i} className="overflow-hidden whitespace-pre">{(l.char ?? '-').repeat(ancho)}</div>
          if (l.t === 'feed') return <div key={i} style={{ height: `${l.n * 0.6}em` }} />
          if (l.t === 'cut') return <div key={i} className="mt-1 border-t-2 border-dashed border-black/30 pt-1 text-center text-[10px] text-black/40">corte</div>
          const escala = l.size === 'xl' ? 3 : l.size === 'large' ? 2 : 1
          return (
            <div
              key={i}
              className="whitespace-pre-wrap break-words"
              style={{
                textAlign: l.align ?? 'left',
                fontWeight: l.bold ? 700 : 400,
                fontSize: `${escala}em`,
                lineHeight: 1.15,
              }}
            >
              <span className={l.invert ? 'bg-black text-white' : ''}>{l.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
