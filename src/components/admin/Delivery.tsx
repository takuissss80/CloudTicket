import { useCallback, useEffect, useState } from 'react'
import type { Sucursal, TipoValor, Zona } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { money } from '../../lib/format'
import { textoValor } from '../../lib/descuentos'
import { Btn, inputBase } from '../ui'
import { CampoTexto } from './Ingredientes'

/** Recargo automático de delivery y zonas, por local (solo admin) */
export function Delivery() {
  const { avisar, refrescarMenu } = useApp()
  const [locales, setLocales] = useState<Sucursal[] | null>(null)
  const cargar = useCallback(async () => setLocales(await repo.listSucursales()), [])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-5">
      <div>
        <h2 className="font-cond text-3xl font-bold">Delivery</h2>
        <p className="text-[15px] text-gris">
          El recargo se suma solo a cada pedido de delivery como envío. Las promos con envío gratis no lo cobran.
          Los usuarios del local no lo pueden cambiar en el pedido.
        </p>
      </div>
      {locales?.map(l => (
        <TarjetaDelivery key={l.id} local={l} onCambio={async () => { await cargar(); await refrescarMenu() }} />
      ))}
      {!locales && <p className="text-gris">Cargando…</p>}
    </div>
  )
}

function TarjetaDelivery({ local, onCambio }: { local: Sucursal; onCambio: () => Promise<void> }) {
  const avisar = useApp(s => s.avisar)
  const [valor, setValor] = useState(String(local.recargoDelivery || ''))
  const [tipo, setTipo] = useState<TipoValor>(local.recargoDeliveryTipo)
  const [zonas, setZonas] = useState<Zona[]>([])
  const [nuevaZona, setNuevaZona] = useState({ nombre: '', costo: '' })
  const [verZonas, setVerZonas] = useState(false)

  useEffect(() => { setValor(String(local.recargoDelivery || '')); setTipo(local.recargoDeliveryTipo) }, [local])
  const cargarZonas = useCallback(async () => {
    const z = await repo.listZonas(local.id)
    setZonas(z)
    if (z.length) setVerZonas(true)
  }, [local.id])
  useEffect(() => { cargarZonas().catch(() => {}) }, [cargarZonas])

  const intentar = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) avisar(ok); await onCambio() } catch (e) { avisar(mensajeError(e), 'error') }
  }
  const numero = Math.max(0, Number(valor.replace(',', '.')) || 0)
  const cambiado = numero !== (local.recargoDelivery || 0) || tipo !== local.recargoDeliveryTipo
  const invalido = tipo === 'porc' && numero > 100

  return (
    <section className={`rounded-xl bg-superficie ring-1 ring-linea ${local.activa ? '' : 'opacity-60'}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-linea px-4 py-3">
        <h3 className="mr-auto font-cond text-2xl font-bold">{local.nombre}</h3>
        <span className="text-[15px] text-gris">
          {local.recargoDelivery ? <>Hoy cobra <b className="text-tinta">{textoValor(local.recargoDeliveryTipo, local.recargoDelivery, money)}</b> por delivery</> : 'Sin recargo de delivery'}
        </span>
      </header>
      <div className="space-y-4 p-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => {
          e.preventDefault()
          intentar(() => repo.actualizarSucursal(local.id, { recargoDelivery: numero, recargoDeliveryTipo: tipo }), `Recargo de ${local.nombre} guardado`)
        }}>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-sm font-medium text-gris">Recargo automático por delivery</span>
            <input id={`recargo-${local.id}`} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0"
              className={`${inputBase} w-full text-right font-semibold ${invalido ? 'border-tomate' : ''}`} />
          </label>
          <div className="flex overflow-hidden rounded-lg border border-linea" role="group" aria-label="Recargo en pesos o porcentaje">
            {(['monto', 'porc'] as const).map(k => (
              <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(k)}
                className={`h-11 px-4 font-semibold ${tipo === k ? 'bg-primario text-sobre-primario' : 'bg-superficie hover:bg-harina'}`}>
                {k === 'porc' ? '% del pedido' : '$ fijo'}
              </button>
            ))}
          </div>
          <Btn tono="albahaca" className="h-11" disabled={!cambiado || invalido}>Guardar</Btn>
        </form>
        {invalido && <p className="-mt-2 text-sm text-tomate">El porcentaje va de 0 a 100.</p>}

        <div>
          <button type="button" onClick={() => setVerZonas(v => !v)} className="text-sm font-semibold text-pizarra hover:underline" aria-expanded={verZonas}>
            {verZonas ? 'Ocultar zonas' : 'Zonas con otro costo (opcional)'}
          </button>
          {verZonas && (
            <div className="mt-2">
              <p className="mb-2 text-sm text-gris">Si al cargar el cliente elegís una zona, se cobra el costo de la zona en lugar del recargo.</p>
              <ul className="divide-y divide-linea rounded-lg bg-harina">
                {zonas.map(z => (
                  <li key={z.id} className="flex items-center gap-2 px-2 py-1">
                    <CampoTexto valor={z.nombre} etiqueta="Nombre de la zona" onGuardar={v => v && intentar(() => repo.guardarZona(local.id, { ...z, nombre: v }).then(cargarZonas))} />
                    <span className="text-gris">$</span>
                    <CampoTexto valor={String(z.costo)} numerico etiqueta={`Costo de ${z.nombre}`}
                      onGuardar={v => intentar(() => repo.guardarZona(local.id, { ...z, costo: Number(v) || 0 }).then(cargarZonas))} />
                    <button aria-label={`Quitar ${z.nombre}`} onClick={() => intentar(() => repo.eliminarZona(z.id).then(cargarZonas))}
                      className="size-8 shrink-0 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                  </li>
                ))}
                {!zonas.length && <li className="px-3 py-2 text-[15px] text-gris">Sin zonas: se cobra el recargo automático.</li>}
              </ul>
              <form className="mt-2 flex gap-2" onSubmit={e => {
                e.preventDefault()
                intentar(() => repo.guardarZona(local.id, { nombre: nuevaZona.nombre.trim(), costo: Number(nuevaZona.costo) || 0 }).then(cargarZonas), 'Zona agregada')
                  .then(() => setNuevaZona({ nombre: '', costo: '' }))
              }}>
                <input aria-label="Nombre de la zona nueva" value={nuevaZona.nombre} onChange={e => setNuevaZona({ ...nuevaZona, nombre: e.target.value })}
                  className={`${inputBase} h-10 min-w-0 flex-1`} placeholder="Zona lejana (más de 30 cuadras)" />
                <input aria-label="Costo de la zona nueva" inputMode="decimal" value={nuevaZona.costo} onChange={e => setNuevaZona({ ...nuevaZona, costo: e.target.value })}
                  className={`${inputBase} h-10 w-24 text-right`} placeholder="$" />
                <Btn className="h-10" disabled={!nuevaZona.nombre.trim()}>Agregar</Btn>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
