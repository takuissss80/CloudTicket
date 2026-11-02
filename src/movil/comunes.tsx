import { useEffect, useState, type ReactNode } from 'react'
import { money } from '../lib/format'
import type { Sucursal } from '../types'
import { useCuentas, useRepo } from './cuentas'
import logo from './logo.png'

export const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

export function Tarjeta({ titulo, children, className = '', accion }: { titulo?: ReactNode; children: ReactNode; className?: string; accion?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-linea bg-superficie p-4 shadow-sm ${className}`}>
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="font-cond text-[19px] font-bold tracking-wide text-tinta">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  )
}

/** Número grande con su etiqueta */
export function Cifra({ valor, label, detalle, tono }: { valor: ReactNode; label: string; detalle?: ReactNode; tono?: 'ok' | 'mal' }) {
  const color = tono === 'ok' ? 'text-albahaca' : tono === 'mal' ? 'text-tomate' : 'text-tinta'
  return (
    <div className="rounded-xl border border-linea bg-papel px-3 py-2.5">
      <div className={`num font-cond text-[24px] font-bold leading-tight ${color}`}>{valor}</div>
      <div className="text-[13px] font-medium text-gris">{label}</div>
      {detalle && <div className="num mt-0.5 text-[12px] text-gris">{detalle}</div>}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-gris" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-linea border-t-pizarra" />
      {texto}
    </div>
  )
}

export function Aviso({ children, tono = 'mal' }: { children: ReactNode; tono?: 'mal' | 'info' }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 text-[14px] ${tono === 'mal' ? 'bg-tomate-claro text-tinta' : 'bg-pizarra-claro text-tinta'}`}>{children}</div>
  )
}

export const selectCls = 'h-11 w-full rounded-xl border border-linea bg-superficie px-3 text-[16px] text-tinta outline-none focus:border-pizarra'

/** Locales visibles para la sesión. El admin puede elegir "Todos". */
export function useSucursales() {
  const repo = useRepo()
  const sesion = useCuentas(s => s.sesion)
  const [lista, setLista] = useState<Sucursal[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    setLista(null)
    repo.listSucursales()
      .then(l => { if (vivo) setLista(l.filter(s => s.activa || s.id === sesion?.sucursalId)) })
      .catch(e => { if (vivo) setError((e as Error).message) })
    return () => { vivo = false }
  }, [repo, sesion?.userId, sesion?.sucursalId])
  return { lista, error }
}

const CLAVE_LOCAL = 'ct-movil-local'
/** Local elegido, recordado por cuenta */
export function useLocalElegido(lista: Sucursal[] | null, permitirTodos: boolean) {
  const activa = useCuentas(s => s.activaId)
  const clave = `${CLAVE_LOCAL}-${activa}`
  const [valor, setValor] = useState<string>(() => { try { return localStorage.getItem(clave) ?? '' } catch { return '' } })
  const elegir = (v: string) => { setValor(v); try { localStorage.setItem(clave, v) } catch { /* */ } }
  let efectivo = valor
  if (lista) {
    const valido = (valor === 'todos' && permitirTodos && lista.length > 1) || lista.some(s => s.id === valor)
    if (!valido) efectivo = lista.find(s => s.esPrincipal)?.id ?? lista[0]?.id ?? ''
  }
  const ids = !lista ? [] : efectivo === 'todos' ? lista.map(s => s.id) : [efectivo].filter(Boolean)
  return { valor: efectivo, elegir, ids }
}

export function SelectorLocal({ lista, valor, onChange, permitirTodos }: { lista: Sucursal[]; valor: string; onChange: (v: string) => void; permitirTodos: boolean }) {
  const nombreCuenta = useCuentas(s => s.sesion?.cuentaNombre)
  if (lista.length <= 1) {
    return (
      <div className="flex h-12 items-center gap-3 rounded-2xl border border-linea bg-superficie px-4">
        <Logo className="size-7" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{lista[0]?.nombre ?? nombreCuenta}</div>
        </div>
      </div>
    )
  }
  return (
    <label className="relative flex h-12 items-center gap-3 rounded-2xl border border-linea bg-superficie pl-4 pr-3">
      <Logo className="size-7 shrink-0" />
      <span className="sr-only">Local</span>
      <select value={valor} onChange={e => onChange(e.target.value)} className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-6 text-[16px] font-semibold text-tinta outline-none">
        {permitirTodos && <option value="todos">Todos los locales</option>}
        {lista.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 size-5 text-gris" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6" /></svg>
    </label>
  )
}

export function Logo({ className = 'size-8' }: { className?: string }) {
  return <img src={logo} alt="" className={`${className} object-contain`} />
}

export function BotonRecargar({ onClick, cargando }: { onClick: () => void; cargando: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={cargando} aria-label="Actualizar"
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-linea bg-superficie text-tinta active:bg-papel disabled:opacity-60">
      <svg viewBox="0 0 24 24" className={`size-5 ${cargando ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
      </svg>
    </button>
  )
}

// ---------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------
export interface Segmento { key: string; label: string; valor: number; color: string; detalle?: string }

/**
 * Barra 100% segmentada: reemplaza a la torta. Cada parte lleva su leyenda con
 * cantidad y porcentaje (nunca solo color). Tocando una parte se resalta su fila.
 */
export function BarraSegmentada({ segmentos, unidad = 'pedidos' }: { segmentos: Segmento[]; unidad?: string }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0)
  const [activo, setActivo] = useState<string | null>(null)
  if (total === 0) return <p className="py-3 text-center text-[14px] text-gris">Sin {unidad} todavía</p>
  const visibles = segmentos.filter(s => s.valor > 0)
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img"
        aria-label={visibles.map(s => `${s.label}: ${s.valor} (${pct(s.valor, total)}%)`).join(', ')}>
        {visibles.map(s => (
          <button key={s.key} type="button" onClick={() => setActivo(a => (a === s.key ? null : s.key))}
            title={`${s.label}: ${s.valor} (${pct(s.valor, total)}%)`}
            className="h-full min-w-[3px] transition-opacity"
            style={{ width: `${(s.valor / total) * 100}%`, background: s.color, opacity: activo && activo !== s.key ? 0.35 : 1 }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {segmentos.map(s => (
          <li key={s.key}>
            <button type="button" onClick={() => setActivo(a => (a === s.key ? null : s.key))}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${activo === s.key ? 'bg-papel ring-1 ring-linea' : ''}`}>
              <span className="size-3 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="flex-1 text-[15px] text-tinta">{s.label}</span>
              {s.detalle && <span className="num text-[13px] text-gris">{s.detalle}</span>}
              <span className="num w-8 text-right text-[15px] font-semibold text-tinta">{s.valor}</span>
              <span className="num w-11 text-right text-[13px] text-gris">{pct(s.valor, total)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barras horizontales (un solo color): para ranking por categoría o forma de pago */
export function BarrasHorizontales({ filas, formato = money }: { filas: { label: string; valor: number; detalle?: string }[]; formato?: (n: number) => string }) {
  const max = Math.max(1, ...filas.map(f => f.valor))
  if (!filas.length) return <p className="py-3 text-center text-[14px] text-gris">Sin datos en el período</p>
  return (
    <ul className="space-y-2.5">
      {filas.map(f => (
        <li key={f.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[14px]">
            <span className="min-w-0 truncate text-tinta">{f.label}{f.detalle && <span className="text-gris"> · {f.detalle}</span>}</span>
            <span className="num shrink-0 font-semibold text-tinta">{formato(f.valor)}</span>
          </div>
          <div className="h-2 w-full rounded-[4px] bg-papel">
            <div className="h-2 rounded-[4px]" style={{ width: `${Math.max(1.5, (f.valor / max) * 100)}%`, background: 'var(--g-barra)' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Columnas por día (ventas del mes). Tocando un día se ve el valor. */
export function ColumnasDia({ dias }: { dias: { dia: string; total: number; comandas: number }[] }) {
  const [sel, setSel] = useState<number | null>(null)
  const max = Math.max(1, ...dias.map(d => d.total))
  const mejor = dias.reduce((m, d, i) => (d.total > (dias[m]?.total ?? 0) ? i : m), 0)
  const elegido = sel ?? (dias[mejor]?.total ? mejor : null)
  const d = elegido != null ? dias[elegido] : null
  const etiquetaDia = (iso: string) => { const [, m, dd] = iso.split('-'); return `${Number(dd)}/${Number(m)}` }
  return (
    <div>
      <div className="mb-2 h-10 text-[14px]">
        {d ? (
          <>
            <div className="text-gris">{sel == null ? 'Mejor día · ' : ''}{mayuscula(new Date(`${d.dia}T12:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' }))}</div>
            <div className="num font-semibold text-tinta">{money(d.total)} · {d.comandas} comandas</div>
          </>
        ) : <div className="text-gris">Tocá un día para ver el detalle</div>}
      </div>
      <div className="relative flex h-32 items-end gap-[2px] border-b border-linea" role="img" aria-label="Ventas por día">
        {dias.map((x, i) => (
          <button key={x.dia} type="button" onClick={() => setSel(s => (s === i ? null : i))} aria-label={`${etiquetaDia(x.dia)}: ${money(x.total)}`}
            className="flex h-full flex-1 items-end">
            <span className="w-full rounded-t-[3px]" style={{
              height: `${x.total > 0 ? Math.max(2, (x.total / max) * 100) : 0}%`,
              background: 'var(--g-barra)', opacity: elegido != null && elegido !== i ? 0.45 : 1,
            }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-gris num">
        <span>{dias[0] && etiquetaDia(dias[0].dia)}</span>
        <span>{dias[Math.floor(dias.length / 2)] && etiquetaDia(dias[Math.floor(dias.length / 2)].dia)}</span>
        <span>{dias.at(-1) && etiquetaDia(dias.at(-1)!.dia)}</span>
      </div>
    </div>
  )
}

/** Filas tipo planilla: concepto a la izquierda, monto a la derecha */
export function Fila({ label, valor, fuerte, tono, sub }: { label: ReactNode; valor: ReactNode; fuerte?: boolean; tono?: 'ok' | 'mal'; sub?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? 'border-t border-linea pt-2.5 text-[17px] font-bold' : 'text-[15px]'} ${sub ? 'pl-3 text-gris' : ''}`}>
      <span className={sub ? 'text-gris' : 'text-tinta'}>{label}</span>
      <span className={`num ${tono === 'ok' ? 'text-albahaca' : tono === 'mal' ? 'text-tomate' : sub ? 'text-gris' : 'text-tinta'}`}>{valor}</span>
    </div>
  )
}
