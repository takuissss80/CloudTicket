import { useState } from 'react'
import { useApp } from '../../store/app'
import { MenuAdmin } from './MenuAdmin'
import { Ingredientes } from './Ingredientes'
import { Locales } from './Locales'

type Pestana = 'menu' | 'ingredientes' | 'locales'

/** Pantalla de administración: menú, ingredientes, locales y usuarios */
export function Administracion({ onClose }: { onClose: () => void }) {
  const sesion = useApp(s => s.sesion)
  const esAdmin = sesion?.rol === 'admin'
  const [pestana, setPestana] = useState<Pestana>('menu')

  const pestanas: { key: Pestana; label: string }[] = esAdmin
    ? [{ key: 'menu', label: 'Menú' }, { key: 'ingredientes', label: 'Ingredientes' }, { key: 'locales', label: 'Locales y usuarios' }]
    : [{ key: 'menu', label: 'Menú del local' }]

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-tinta px-4 py-3 text-white">
        <button onClick={onClose} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>
        <h1 className="font-cond text-3xl font-bold leading-none">{esAdmin ? `Administración de ${sesion?.cuentaNombre}` : 'Menú del local'}</h1>
        {pestanas.length > 1 && (
          <nav className="flex gap-1 rounded-lg bg-white/10 p-1 sm:ml-auto" aria-label="Secciones">
            {pestanas.map(p => (
              <button key={p.key} onClick={() => setPestana(p.key)} aria-current={pestana === p.key}
                className={`h-9 rounded-md px-3 font-semibold ${pestana === p.key ? 'bg-white text-tinta' : 'text-white/85 hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pestana === 'menu' && <MenuAdmin />}
        {pestana === 'ingredientes' && esAdmin && <Ingredientes />}
        {pestana === 'locales' && esAdmin && <Locales />}
      </div>
    </div>
  )
}
