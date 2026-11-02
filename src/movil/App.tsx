import { useEffect, useState, type ReactNode } from 'react'
import { useTema } from '../lib/tema'
import { useCuentas } from './cuentas'
import { Cargando, Logo } from './comunes'
import { Cuentas } from './Cuentas'
import { Egresos } from './Egresos'
import { Inicio } from './Inicio'
import { Login } from './Login'
import { Mensual } from './Mensual'

type Pantalla = 'inicio' | 'mensual' | 'egresos' | 'cuentas'

const ICONOS: Record<Pantalla, ReactNode> = {
  inicio: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  mensual: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6" /></>,
  egresos: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
  cuentas: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
}
const MENU: { key: Pantalla; label: string }[] = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'mensual', label: 'Cierre mensual' },
  { key: 'egresos', label: 'Egresos por período' },
  { key: 'cuentas', label: 'Cuentas' },
]

const leerPantalla = (): Pantalla => {
  const h = location.hash.slice(1)
  return (MENU.some(m => m.key === h) ? h : 'inicio') as Pantalla
}

export default function App() {
  const { iniciando, sesion, reingresar, cuentas, iniciar, cancelarReingreso } = useCuentas()
  const [pantalla, setPantalla] = useState<Pantalla>(leerPantalla)
  const [menu, setMenu] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const { tema, alternar } = useTema()

  useEffect(() => { void iniciar() }, [iniciar])
  useEffect(() => {
    const f = () => setPantalla(leerPantalla())
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])

  const ir = (p: Pantalla) => {
    setMenu(false)
    if (p !== pantalla) { history.replaceState(null, '', `#${p}`); setPantalla(p) }
    scrollTo({ top: 0 })
  }

  if (iniciando) return <div className="grid min-h-full place-items-center"><Cargando texto="Abriendo…" /></div>
  if (agregando) return <Login agregando onCancelar={() => setAgregando(false)} />
  if (!sesion) {
    return <Login onCancelar={reingresar && cuentas.length > 1 ? cancelarReingreso : undefined} />
  }

  const titulo = MENU.find(m => m.key === pantalla)!.label

  return (
    <div className="min-h-full bg-harina">
      <header className="pt-seguro sticky top-0 z-20 border-b border-linea bg-superficie/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-2">
          <button type="button" onClick={() => setMenu(true)} aria-label="Abrir menú" className="grid size-11 place-items-center rounded-xl text-tinta active:bg-papel">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          </button>
          <Logo className="size-8" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-cond text-[19px] font-bold text-tinta">{titulo}</div>
            <div className="truncate text-[12px] text-gris">{sesion.cuentaNombre}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-3 pb-10 pt-3">
        {pantalla === 'inicio' && <Inicio />}
        {pantalla === 'mensual' && <Mensual />}
        {pantalla === 'egresos' && <Egresos />}
        {pantalla === 'cuentas' && <Cuentas onAgregar={() => setAgregando(true)} onElegida={() => ir('inicio')} />}
      </main>

      {/* Menú lateral */}
      <div className={`fixed inset-0 z-30 bg-black/45 transition-opacity ${menu ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMenu(false)} aria-hidden />
      <nav aria-label="Menú" aria-hidden={!menu} inert={!menu}
        className={`pt-seguro fixed inset-y-0 left-0 z-40 flex w-[82%] max-w-xs flex-col bg-superficie shadow-2xl transition-transform duration-200 ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 border-b border-linea px-4 py-4">
          <Logo className="size-11" />
          <div className="min-w-0">
            <div className="font-cond text-[22px] font-bold leading-none text-tinta">CloudTicket</div>
            <div className="truncate text-[13px] text-gris">{sesion.usuario} · {sesion.cuentaNombre}</div>
          </div>
        </div>
        <ul className="flex-1 space-y-1 p-2">
          {MENU.map(m => (
            <li key={m.key}>
              <button type="button" onClick={() => ir(m.key)}
                className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[16px] font-semibold ${pantalla === m.key ? 'bg-pizarra-claro text-tinta' : 'text-tinta active:bg-papel'}`}>
                <svg viewBox="0 0 24 24" className={`size-6 ${pantalla === m.key ? 'text-pizarra' : 'text-gris'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONOS[m.key]}</svg>
                {m.label}
                {m.key === 'cuentas' && cuentas.length > 1 && <span className="ml-auto rounded-full bg-papel px-2 text-[12px] text-gris ring-1 ring-linea">{cuentas.length}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-linea p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={alternar} className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[16px] text-tinta active:bg-papel">
            <svg viewBox="0 0 24 24" className="size-6 text-gris" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {tema === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />}
            </svg>
            {tema === 'dark' ? 'Modo día' : 'Modo noche'}
          </button>
        </div>
      </nav>
    </div>
  )
}
