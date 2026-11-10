import type { TipoUsuario as TipoUsuarioT } from '../../types'
import { useCallback, useEffect, useState } from 'react'
import type { Sucursal, Usuario } from '../../types'
import { repo } from '../../data'
import { mensajeError, useApp } from '../../store/app'
import { Btn, Confirmar, inputBase, inputCls } from '../ui'
import { CampoTexto } from './Ingredientes'
import { NOMBRE_PLAN } from '../../types'
import { CLASE_VENCE, estadoVence } from '../../lib/suscripcion'

/** Locales de la cuenta y sus usuarios (solo admin). El delivery está en su propia pestaña. */
export function Locales() {
  const { avisar, sesion } = useApp()
  const [locales, setLocales] = useState<Sucursal[] | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const cargar = useCallback(async () => {
    const [l, u] = await Promise.all([repo.listSucursales(), repo.listUsuarios()])
    setLocales(l)
    setUsuarios(u)
  }, [])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])

  if (!locales) return <p className="p-8 text-center text-gris">Cargando locales…</p>
  const admins = usuarios.filter(u => u.rol === 'admin')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h2 className="font-cond text-3xl font-bold">Locales de {sesion?.cuentaNombre}</h2>
        <p className="text-[15px] text-gris">Cada local entra con su propio usuario y solo ve sus pedidos, su caja y su menú.</p>
      </div>

      <p className="rounded-xl bg-superficie px-4 py-3 text-[15px] ring-1 ring-linea">
        Plan <b>{sesion ? NOMBRE_PLAN[sesion.plan] : ''}</b>{sesion?.plan === 'principal' ? ' (sin pantalla de cocina ni pantalla para clientes)' : ''}.
        {' '}Para sumar un local nuevo o cambiar de plan, pedíselo a CloudTicket.
      </p>

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
  const [nuevoUsuario, setNuevoUsuario] = useState({ usuario: '', password: '', tipo: 'comun' as TipoUsuarioT })
  const [pass, setPass] = useState<{ userId: string; valor: string } | null>(null)
  const [borrar, setBorrar] = useState<Usuario | null>(null)

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
        {(() => { const v = estadoVence(local.vence); return v.tono !== 'sin' && <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${CLASE_VENCE[v.tono]}`}>{v.texto}</span> })()}
        {!local.esPrincipal && (
          <label className="flex items-center gap-2 text-[15px]">
            <input type="checkbox" className="size-5 accent-albahaca" checked={local.activa}
              onChange={e => intentar(() => repo.actualizarSucursal(local.id, { activa: e.target.checked }), e.target.checked ? 'Local activado' : 'Local desactivado')} />
            Activo
          </label>
        )}
      </header>

      <div className="p-4">
        {/* ---- Usuarios */}
        <div>
          <h4 className="mb-2 font-semibold">Usuarios del local</h4>
          <ul className="space-y-2">
            {usuarios.map(u => (
              <li key={u.userId} className="rounded-lg bg-harina px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto font-semibold">{u.usuario}</span>
                  <TipoUsuario valor={u.esProduccion ? 'produccion' : u.puedeDescontar ? 'encargado' : 'comun'} etiqueta={`Tipo de ${u.usuario}`}
                    onChange={v => intentar(() => repo.setTipoUsuario(u.userId, v), `${u.usuario} ahora es ${NOMBRE_TIPO[v].toLowerCase()}`)} />
                  <button className="text-sm font-semibold text-pizarra hover:underline" onClick={() => setPass({ userId: u.userId, valor: '' })}>Cambiar contraseña</button>
                  <button className="text-sm font-semibold text-tomate hover:underline" onClick={() => setBorrar(u)}>Eliminar</button>
                </div>
                {pass?.userId === u.userId && (
                  <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); intentar(() => repo.cambiarPassword(u.userId, pass.valor), 'Contraseña actualizada').then(() => setPass(null)) }}>
                    <input autoFocus type="text" aria-label="Nueva contraseña" value={pass.valor} onChange={e => setPass({ ...pass, valor: e.target.value })}
                      className={`${inputCls} h-9`} placeholder="Nueva contraseña (mín. 6)" autoComplete="new-password" />
                    <Btn tono="albahaca" className="h-9" disabled={pass.valor.length < 6}>Guardar</Btn>
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
              .then(() => setNuevoUsuario({ usuario: '', password: '', tipo: 'comun' }))
          }}>
            <input aria-label="Usuario nuevo" value={nuevoUsuario.usuario} onChange={e => setNuevoUsuario({ ...nuevoUsuario, usuario: e.target.value.toLowerCase().replace(/\s/g, '') })}
              className={`${inputBase} h-10 min-w-0 flex-1`} placeholder={`usuario (ej: ${sugerido})`} autoComplete="off" autoCapitalize="none" />
            <input aria-label="Contraseña del usuario nuevo" type="text" value={nuevoUsuario.password} onChange={e => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
              className={`${inputBase} h-10 min-w-0 flex-1`} placeholder="contraseña (mín. 6)" autoComplete="new-password" />
            <TipoUsuario valor={nuevoUsuario.tipo} etiqueta="Tipo del usuario nuevo" onChange={v => setNuevoUsuario({ ...nuevoUsuario, tipo: v })} />
            <Btn tono="albahaca" className="h-10" disabled={nuevoUsuario.usuario.length < 3 || nuevoUsuario.password.length < 6}>Crear usuario</Btn>
          </form>
          <p className="mt-2 text-sm text-gris">
            <b>Común:</b> toma pedidos, cobra, entrega, usa cupones y marca productos agotados. <b>Encargado:</b> además modifica y anula comandas, carga descuentos y adicionales, cambia el envío, ve los reportes (también en la app del celular) y edita el menú y los precios del local. <b>Producción:</b> para la fábrica: solo ve los pedidos a fábrica y el stock de todos los locales.
          </p>
        </div>
      </div>

      {borrar && (
        <Confirmar texto={`¿Eliminar el usuario ${borrar.usuario}?`} detalle="No va a poder entrar más. Los pedidos que cargó quedan guardados." accion="Eliminar usuario"
          onNo={() => setBorrar(null)} onSi={() => { const u = borrar; setBorrar(null); intentar(() => repo.eliminarUsuario(u.userId), 'Usuario eliminado') }} />
      )}
    </section>
  )
}

export const NOMBRE_TIPO: Record<TipoUsuarioT, string> = { comun: 'Común', encargado: 'Encargado', produccion: 'Producción' }

/** Selector Común / Encargado / Producción */
export function TipoUsuario({ valor, etiqueta, onChange }: { valor: TipoUsuarioT; etiqueta: string; onChange: (v: TipoUsuarioT) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-linea text-sm" role="group" aria-label={etiqueta}>
      {(['comun', 'encargado', 'produccion'] as const).map(v => [v, NOMBRE_TIPO[v]] as const).map(([v, l]) => (
        <button key={l} type="button" aria-pressed={valor === v} onClick={() => valor !== v && onChange(v)}
          className={`h-9 px-3 font-semibold ${valor === v ? 'bg-primario text-sobre-primario' : 'bg-superficie hover:bg-harina'}`}>{l}</button>
      ))}
    </div>
  )
}
