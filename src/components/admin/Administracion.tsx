import { useState } from 'react'
import { useApp } from '../../store/app'
import { MenuAdmin } from './MenuAdmin'
import { Ingredientes } from './Ingredientes'
import { Locales } from './Locales'
import { Repartidores } from './Repartidores'
import { CajasAdmin } from './CajasAdmin'
import { Stock } from './Stock'
import { ImpresionPanel } from '../ColaImpresion'
import { Delivery } from './Delivery'
import { Cupones } from './Cupones'
import { Cocina } from './Cocina'

export type Pestana = 'menu' | 'caja' | 'stock' | 'ingredientes' | 'repartidores' | 'delivery' | 'cupones' | 'impresion' | 'cocina' | 'locales'

/** Pantalla de administración: menú, ingredientes, locales y usuarios */
export function Administracion({ onClose, inicial = 'menu' }: { onClose: () => void; inicial?: Pestana }) {
  const sesion = useApp(s => s.sesion)
  const esAdmin = sesion?.rol === 'admin'
  const esEncargado = !!sesion?.puedeDescontar
  const [pestana, setPestana] = useState<Pestana>(inicial === 'menu' && !esEncargado ? 'caja' : inicial)

  const pestanas: { key: Pestana; label: string }[] = esAdmin
    ? [{ key: 'menu', label: 'Menú' }, { key: 'caja', label: 'Caja' }, { key: 'stock', label: 'Stock' }, { key: 'ingredientes', label: 'Ingredientes' }, { key: 'repartidores', label: 'Repartidores' }, { key: 'delivery', label: 'Delivery' }, { key: 'cupones', label: 'Cupones' }, { key: 'impresion', label: 'Impresión' }, { key: 'cocina', label: 'Cocina' }, { key: 'locales', label: 'Locales y usuarios' }]
    : [...(esEncargado ? [{ key: 'menu' as const, label: 'Menú del local' }] : []), { key: 'caja', label: 'Caja' }, { key: 'stock', label: 'Stock' }, { key: 'repartidores', label: 'Repartidores' }, { key: 'impresion', label: 'Impresión' }, ...(esEncargado ? [{ key: 'cocina' as const, label: 'Cocina' }] : [])]

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-barra px-4 py-3 text-white">
        <button onClick={onClose} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>
        <h1 className="font-cond text-3xl font-bold leading-none">{esAdmin ? `Administración de ${sesion?.cuentaNombre}` : 'Administración del local'}</h1>
        {pestanas.length > 1 && (
          <nav className="flex flex-wrap gap-1 rounded-lg bg-white/10 p-1 sm:ml-auto" aria-label="Secciones">
            {pestanas.map(p => (
              <button key={p.key} onClick={() => setPestana(p.key)} aria-current={pestana === p.key}
                className={`h-9 rounded-md px-3 font-semibold ${pestana === p.key ? 'bg-albahaca text-sobre-albahaca' : 'text-white/85 hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pestana === 'menu' && esEncargado && <MenuAdmin />}
        {pestana === 'caja' && <CajasAdmin />}
        {pestana === 'stock' && <Stock />}
        {pestana === 'ingredientes' && esAdmin && <Ingredientes />}
        {pestana === 'repartidores' && <Repartidores />}
        {pestana === 'delivery' && esAdmin && <Delivery />}
        {pestana === 'cupones' && esAdmin && <Cupones />}
        {pestana === 'impresion' && <ImpresionPanel />}
        {pestana === 'cocina' && esEncargado && <Cocina />}
        {pestana === 'locales' && esAdmin && <Locales />}
      </div>
    </div>
  )
}
