import { useCallback, useEffect, useRef, useState } from 'react'
import type { Comanda, DatosPantalla, Producto } from '../types'
import { repo } from '../data'
import { mensajeError, useApp } from '../store/app'
import { jobsParaComanda } from '../lib/ticket'
import { PantallaMostrador } from './PantallaMostrador'
import { PantallaCocina } from './PantallaCocina'
import { Toasts } from './ui'

/** Revisión de respaldo: la tele se entera al instante por aviso; esto es por si se corta internet */
const RESPALDO_MS = 2 * 60_000

/** El código de una tele en la dirección: /p/K7M2QX9 (o ?p=K7M2QX9) */
export function codigoDePantalla(): string | null {
  const m = location.pathname.match(/^\/p\/([A-Za-z0-9]{5,12})\/?$/)
  return m?.[1] ?? new URLSearchParams(location.search).get('p')
}

/**
 * Tele abierta con su enlace, sin iniciar sesión. Carga lo que muestra con el código y lo
 * vuelve a pedir solo cuando la base avisa que algo cambió (o cada 2 minutos por las dudas).
 */
export function PantallaPublica({ codigo }: { codigo: string }) {
  const [datos, setDatos] = useState<DatosPantalla | null>(null)
  const [error, setError] = useState('')
  const ultimo = useRef<DatosPantalla | null>(null)

  const cargar = useCallback(async () => {
    try {
      const d = await repo.pantallaDatos(codigo)
      ultimo.current = d
      const sucursal = { ...d.sucursal, pantallaOrientacion: d.pantalla.orientacion, pantallaVideos: d.pantalla.videos }
      useApp.setState({
        cargando: false, sucursales: [sucursal], sucursalId: sucursal.id, caja: d.caja, comandas: d.comandas,
        impresoras: d.impresoras,
        // solo hace falta el producto "armado de mitades" (la cocina no lo muestra como ítem)
        catalogo: { categorias: [], productos: d.armadoId ? [{ id: d.armadoId, codigo: 'ARMADO-MITAD' } as Producto] : [], zonas: d.zonas },
      })
      setDatos(d); setError('')
    } catch (e) {
      setError(mensajeError(e))
    }
  }, [codigo])

  // Las acciones de la cocina van por el código (no hay sesión)
  useEffect(() => {
    const cambiar = async (c: Comanda, estado: 'listo' | 'en_preparacion') => {
      const d = ultimo.current
      if (!d) return
      try {
        const jobs = estado === 'listo' ? jobsParaComanda({ ...c, estado: 'listo' }, d.impresoras, 'comanda', { zonas: d.zonas, nombreLocal: d.sucursal.nombre }) : []
        await repo.pantallaCocinaEstado(codigo, c.id, estado, jobs)
        if (estado === 'en_preparacion') useApp.getState().avisar(`Comanda #${c.numero} volvió a cocina`)
      } catch (e) { useApp.getState().avisar(mensajeError(e), 'error') }
      await cargar()
    }
    useApp.setState({
      refrescar: cargar, refrescarMenu: cargar,
      marcarListo: c => cambiar(c, 'listo'),
      volverACocina: c => cambiar(c, 'en_preparacion'),
    })
  }, [codigo, cargar])

  // Primera carga, respaldo cada 2 min y al volver a la pestaña o a tener internet
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, RESPALDO_MS)
    const ya = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', ya)
    addEventListener('online', ya)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ya); removeEventListener('online', ya) }
  }, [cargar])

  // Avisos instantáneos (varios seguidos se juntan en una sola carga)
  const canal = datos?.pantalla.canal
  useEffect(() => {
    if (!canal) return
    let t: ReturnType<typeof setTimeout> | undefined
    const off = repo.escucharPantalla(canal, () => { clearTimeout(t); t = setTimeout(cargar, 500) })
    return () => { clearTimeout(t); off() }
  }, [canal, cargar])

  useEffect(() => { document.title = datos ? `${datos.pantalla.nombre || 'Pantalla'} · ${datos.sucursal.nombre}` : 'Pantalla' }, [datos])

  if (error && !datos) return (
    <div className="flex min-h-full items-center justify-center p-8 text-center">
      <div>
        <h1 className="font-cond text-5xl font-bold">Pantalla</h1>
        <p className="mt-3 text-2xl text-gris">{error}</p>
        <p className="mt-6 text-lg text-gris">Pedí la dirección correcta en Administración → Pantallas.</p>
      </div>
    </div>
  )
  if (!datos) return <p className="p-10 text-center text-2xl text-gris">Cargando…</p>
  return (
    <>
      {datos.pantalla.tipo === 'clientes' ? <PantallaMostrador publica />
        : datos.sucursal.cocinaActiva ? <PantallaCocina publica />
        : (
          <div className="flex min-h-full items-center justify-center p-8 text-center">
            <div>
              <h1 className="font-cond text-5xl font-bold">Pantalla de cocina apagada</h1>
              <p className="mt-3 text-2xl text-gris">Se activa en Administración → Pantallas. Cuando la activen, esta tele se enciende sola.</p>
            </div>
          </div>
        )}
      {error && <div className="fixed bottom-3 right-3 z-50 rounded-lg bg-tomate px-3 py-1.5 text-sm font-semibold text-white">Sin conexión: reintentando…</div>}
      <Toasts />
    </>
  )
}
