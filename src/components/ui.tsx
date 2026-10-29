import { useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { useApp } from '../store/app'
import { useTema } from '../lib/tema'

type Tono = 'tinta' | 'albahaca' | 'tomate' | 'muzza' | 'pizarra' | 'claro' | 'fantasma'

const tonos: Record<Tono, string> = {
  tinta: 'bg-primario text-sobre-primario hover:opacity-90',
  albahaca: 'bg-albahaca text-sobre-albahaca hover:brightness-110',
  tomate: 'bg-tomate text-white hover:brightness-110',
  muzza: 'bg-muzza text-sobre-muzza hover:brightness-105',
  pizarra: 'bg-pizarra text-white hover:brightness-110',
  claro: 'bg-papel text-tinta border border-linea hover:bg-superficie',
  fantasma: 'bg-transparent text-tinta hover:bg-tinta/5',
}

export function Btn({ tono = 'claro', grande, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tono?: Tono; grande?: boolean }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-40 ${grande ? 'h-14 px-6 text-lg' : 'h-10 px-4 text-[15px]'} ${tonos[tono]} ${className}`}
    />
  )
}

/** Control – cantidad + */
export function Stepper({ valor, onChange, min = 0, max, tam = 'md' }: { valor: number; onChange: (n: number) => void; min?: number; max?: number; tam?: 'sm' | 'md' }) {
  const b = tam === 'sm' ? 'size-8 text-lg' : 'size-11 text-2xl'
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Restar"
        disabled={valor <= min}
        onClick={() => onChange(valor - 1)}
        className={`${b} rounded-full bg-tomate-claro text-tomate font-bold leading-none disabled:opacity-30`}
      >−</button>
      <span className={`min-w-8 text-center font-cond font-bold tabular-nums ${tam === 'sm' ? 'text-lg' : 'text-2xl'} ${valor ? 'text-tinta' : 'text-gris/60'}`}>{valor}</span>
      <button
        type="button"
        aria-label="Sumar"
        disabled={max != null && valor >= max}
        onClick={() => onChange(valor + 1)}
        className={`${b} rounded-full bg-albahaca-claro text-albahaca font-bold leading-none disabled:opacity-30`}
      >+</button>
    </div>
  )
}

export function Modal({ titulo, onClose, children, pie, ancho = 'max-w-2xl', alto }: {
  titulo: ReactNode; onClose: () => void; children: ReactNode; pie?: ReactNode; ancho?: string; alto?: boolean
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" className={`entra flex w-full ${ancho} flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-papel shadow-2xl ${alto ? 'h-[92dvh]' : 'max-h-[92dvh]'}`}>
        <header className="flex items-center gap-3 border-b border-linea px-5 py-3">
          <div className="min-w-0 flex-1 font-cond text-2xl font-bold">{titulo}</div>
          <button onClick={onClose} aria-label="Cerrar" className="size-10 rounded-full text-2xl text-gris hover:bg-tinta/5">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {pie && <footer className="border-t border-linea bg-harina/60 px-5 py-3">{pie}</footer>}
      </div>
    </div>
  )
}

export function Campo({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-gris">{label}</span>
      {children}
    </label>
  )
}

/** Input sin ancho: para campos con ancho propio (w-24, flex-1…) */
export const inputBase = 'h-11 rounded-lg border border-linea bg-superficie px-3 text-[16px] outline-none focus:border-pizarra focus:ring-2 focus:ring-pizarra/20'
export const inputCls = `${inputBase} w-full`

export function Toasts() {
  const toasts = useApp(s => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`entra rounded-lg px-4 py-3 font-medium shadow-lg ${t.tipo === 'error' ? 'bg-tomate text-white' : 'bg-albahaca text-sobre-albahaca'}`}>
          {t.texto}
        </div>
      ))}
    </div>
  )
}

export function Confirmar({ texto, detalle, accion, tono = 'tomate', onSi, onNo }: {
  texto: string; detalle?: string; accion: string; tono?: Tono; onSi: () => void; onNo: () => void
}) {
  return (
    <Modal titulo={texto} onClose={onNo} ancho="max-w-md"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onNo}>Volver</Btn><Btn tono={tono} onClick={onSi}>{accion}</Btn></div>}>
      {detalle && <p className="px-5 py-4 text-gris">{detalle}</p>}
    </Modal>
  )
}

/** Botón sol / luna para el modo noche */
export function BotonTema({ className = '' }: { className?: string }) {
  const { tema, alternar } = useTema()
  const noche = tema === 'dark'
  return (
    <button type="button" onClick={alternar} aria-label={noche ? 'Pasar a modo día' : 'Pasar a modo noche'} title={noche ? 'Modo día' : 'Modo noche'}
      className={`grid size-10 place-items-center rounded-lg border border-linea bg-papel text-tinta hover:bg-superficie ${className}`}>
      {noche ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
      )}
    </button>
  )
}
