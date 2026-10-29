import { useCallback, useEffect, useState } from 'react'
import type { Sucursal, Usuario, Zona } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { money } from '../../lib/format'
import { Btn, Confirmar, inputBase, inputCls } from '../ui'
import { CampoTexto } from './Ingredientes'

/** Locales de la cuenta, sus usuarios y sus zonas de delivery (solo admin) */
export function Locales() {
  const { avisar, sesion } = useApp()
  const [locales, setLocales] = useState<Sucursal[] | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [nuevoLocal, setNuevoLocal] = useState('')
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    const [l, u] = await Promise.all([repo.listSucursales(), repo.listUsuarios()])
    setLocales(l)
    setUsuarios(u)
  }, [])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])

  const crearLocal = async () => {
    if (!nuevoLocal.trim()) return
    setCreando(true)
    try {
      const s = await repo.crearSucursal(nuevoLocal.trim())
      setNuevoLocal('')
      avisar(`${s.nombre} creado. Ya tiene el menú madre; creale un usuario para que pueda entrar.`)
      await cargar()
      // el selector de local del encabezado tiene que mostrar el nuevo
      useApp.setState({ sucursales: (await repo.listSucursales()).filter(x => x.activa) })
    } catch (e) { avisar(mensajeError(e), 'error') }
    setCreando(false)
  }

  if (!locales) return <p className="p-8 text-center text-gris">Cargando locales…</p>
  const admins = usuarios.filter(u => u.rol === 'admin')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h2 className="font-cond text-3xl font-bold">Locales de {sesion?.cuentaNombre}</h2>
        <p className="text-[15px] text-gris">Cada local nuevo arranca con el menú madre. Cada uno entra con su propio usuario y solo ve sus pedidos, su caja y su menú.</p>
      </div>

      <form onSubmit={e => { e.preventDefault(); crearLocal() }} className="flex flex-wrap items-end gap-2 rounded-xl bg-superficie p-3 ring-1 ring-linea">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-sm font-medium text-gris">Nuevo local</span>
          <input id="local-nuevo" value={nuevoLocal} onChange={e => setNuevoLocal(e.target.value)} className={inputCls} placeholder={`${sesion?.cuentaNombre ?? ''} Benavidez`.trim()} />
        </label>
        <Btn tono="albahaca" className="h-11" disabled={!nuevoLocal.trim() || creando}>{creando ? 'Creando…' : 'Agregar local'}</Btn>
      </form>

      {locales.map(l => (
        <TarjetaLocal key={l.id} local={l} usuarios={usuarios.filter(u => u.sucursalId === l.id)} onCambio={cargar} />
      ))}

      <section className="rounded-xl bg-superficie p-4 ring-1 ring-linea">
        <h3 className="font-cond text-2xl font-bold">Administradores</h3>
        <p className="text-[15px] text-gris">Ven y administran todos los locales.</p>
        <ul className="mt-2 space-y-1">
          {admins.map(a => <li key={a.userId} className="font-medium">{a.usuario}{a.userId === sesion?.userId ? <span className="text-gris"> (vos)</span> : null}</li>)}
        </ul>
      </section>
    </div>
  )
}

function TarjetaLocal({ local, usuarios, onCambio }: { local: Sucursal; usuarios: Usuario[]; onCambio: () => Promise<void> }) {
  const avisar = useApp(s => s.avisar)
  const [zonas, setZonas] = useState<Zona[]>([])
  const [nuevoUsuario, setNuevoUsuario] = useState({ usuario: '', password: '' })
  const [nuevaZona, setNuevaZona] = useState({ nombre: '', costo: '' })
  const [pass, setPass] = useState<{ userId: string; valor: string } | null>(null)
  const [borrar, setBorrar] = useState<Usuario | null>(null)

  const cargarZonas = useCallback(async () => setZonas(await repo.listZonas(local.id)), [local.id])
  useEffect(() => { cargarZonas().catch(() => {}) }, [cargarZonas])

  const intentar = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) avisar(ok); await onCambio() } catch (e) { avisar(mensajeError(e), 'error') }
  }

  const sugerido = local.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).slice(-1)[0] ?? ''

  return (
    <section className={`rounded-xl bg-superficie ring-1 ring-linea ${local.activa ? '' : 'opacity-60'}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-linea px-4 py-3">
        <CampoTexto valor={local.nombre} etiqueta="Nombre del local" className="!w-auto min-w-0 flex-1 font-cond !text-2xl !font-bold"
          onGuardar={v => v && intentar(() => repo.actualizarSucursal(local.id, { nombre: v }), 'Nombre actualizado')} />
        {local.esPrincipal && <span className="rounded bg-pizarra-claro px-2 py-0.5 text-sm font-semibold text-pizarra">Principal</span>}
        {!local.esPrincipal && (
          <label className="flex items-center gap-2 text-[15px]">
            <input type="checkbox" className="size-5 accent-albahaca" checked={local.activa}
              onChange={e => intentar(() => repo.actualizarSucursal(local.id, { activa: e.target.checked }), e.target.checked ? 'Local activado' : 'Local desactivado')} />
            Activo
          </label>
        )}
      </header>

      <div className="grid gap-6 p-4 md:grid-cols-2">
        {/* ---- Usuarios */}
        <div>
          <h4 className="mb-2 font-semibold">Usuarios del local</h4>
          <ul className="space-y-2">
            {usuarios.map(u => (
              <li key={u.userId} className="rounded-lg bg-harina px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto font-semibold">{u.usuario}</span>
                  <button className="text-sm font-semibold text-pizarra hover:underline" onClick={() => setPass({ userId: u.userId, valor: '' })}>Cambiar contraseña</button>
                  <button className="text-sm font-semibold text-tomate hover:underline" onClick={() => setBorrar(u)}>Eliminar</button>
                </div>
                {pass?.userId === u.userId && (
                  <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); intentar(() => repo.cambiarPassword(u.userId, pass.valor), 'Contraseña actualizada').then(() => setPass(null)) }}>
                    <input autoFocus type="text" aria-label="Nueva contraseña" value={pass.valor} onChange={e => setPass({ ...pass, valor: e.target.value })}
                      className={`${inputCls} h-9`} placeholder="Nueva contraseña" autoComplete="new-password" />
                    <Btn tono="albahaca" className="h-9" disabled={pass.valor.length < 4}>Guardar</Btn>
                    <Btn type="button" className="h-9" onClick={() => setPass(null)}>Cancelar</Btn>
                  </form>
                )}
              </li>
            ))}
            {!usuarios.length && <li className="text-[15px] text-gris">Sin usuarios. Creá uno para que el local pueda entrar.</li>}
          </ul>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => {
            e.preventDefault()
            intentar(() => repo.crearUsuario({ ...nuevoUsuario, sucursalId: local.id }), `Usuario ${nuevoUsuario.usuario} creado`)
              .then(() => setNuevoUsuario({ usuario: '', password: '' }))
          }}>
            <input aria-label="Usuario nuevo" value={nuevoUsuario.usuario} onChange={e => setNuevoUsuario({ ...nuevoUsuario, usuario: e.target.value.toLowerCase().replace(/\s/g, '') })}
              className={`${inputBase} h-10 min-w-0 flex-1`} placeholder={`usuario (ej: ${sugerido})`} autoComplete="off" autoCapitalize="none" />
            <input aria-label="Contraseña del usuario nuevo" type="text" value={nuevoUsuario.password} onChange={e => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
              className={`${inputBase} h-10 min-w-0 flex-1`} placeholder="contraseña" autoComplete="new-password" />
            <Btn tono="albahaca" className="h-10" disabled={nuevoUsuario.usuario.length < 3 || nuevoUsuario.password.length < 4}>Crear usuario</Btn>
          </form>
        </div>

        {/* ---- Zonas de delivery */}
        <div>
          <h4 className="mb-2 font-semibold">Zonas de delivery</h4>
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
            {!zonas.length && <li className="px-3 py-2 text-[15px] text-gris">Sin zonas: el envío se carga a mano en cada pedido.</li>}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={e => {
            e.preventDefault()
            intentar(() => repo.guardarZona(local.id, { nombre: nuevaZona.nombre.trim(), costo: Number(nuevaZona.costo) || 0 }).then(cargarZonas), 'Zona agregada')
              .then(() => setNuevaZona({ nombre: '', costo: '' }))
          }}>
            <input aria-label="Nombre de la zona nueva" value={nuevaZona.nombre} onChange={e => setNuevaZona({ ...nuevaZona, nombre: e.target.value })}
              className={`${inputBase} h-10 min-w-0 flex-1`} placeholder="Zona 1 (hasta 15 cuadras)" />
            <input aria-label="Costo de la zona nueva" inputMode="decimal" value={nuevaZona.costo} onChange={e => setNuevaZona({ ...nuevaZona, costo: e.target.value })}
              className={`${inputBase} h-10 w-24 text-right`} placeholder="$" />
            <Btn className="h-10" disabled={!nuevaZona.nombre.trim()}>Agregar</Btn>
          </form>
          {zonas.length > 0 && <p className="mt-2 text-sm text-gris">Envío más barato: {money(Math.min(...zonas.map(z => z.costo)))}</p>}
        </div>
      </div>

      {borrar && (
        <Confirmar texto={`¿Eliminar el usuario ${borrar.usuario}?`} detalle="No va a poder entrar más. Los pedidos que cargó quedan guardados." accion="Eliminar usuario"
          onNo={() => setBorrar(null)} onSi={() => { const u = borrar; setBorrar(null); intentar(() => repo.eliminarUsuario(u.userId), 'Usuario eliminado') }} />
      )}
    </section>
  )
}
