import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Plan, SaCuenta, SaLocal, TipoUsuario as TipoUsuarioT, Usuario } from '../types'
import { NOMBRE_PLAN } from '../types'
import { repo } from '../data'
import { mensajeError, useApp } from '../store/app'
import { fecha, normalizar } from '../lib/format'
import { CLASE_VENCE, DIAS_AVISO, estadoVence } from '../lib/suscripcion'
import { isoDia } from '../lib/reportes'
import { BotonTema, Btn, Campo, Confirmar, Modal, inputBase, inputCls } from './ui'
import { NOMBRE_TIPO, TipoUsuario } from './admin/Locales'

type Filtro = '' | 'vencidos' | 'pronto' | 'principal' | 'pro'
const tipoDe = (u: Usuario): TipoUsuarioT => (u.esProduccion ? 'produccion' : u.puedeDescontar ? 'encargado' : 'comun')
/** El vencimiento más próximo (o ya pasado) de los locales activos */
const peorVence = (c: SaCuenta) => c.locales.filter(l => l.activa).map(l => estadoVence(l.vence)).sort((a, b) => a.dias - b.dias)[0]
const sumarMeses = (base: string | undefined, meses: number) => {
  const hoy = isoDia(new Date())
  const desde = base && base > hoy ? base : hoy
  const [y, m, d] = desde.split('-').map(Number)
  const f = new Date(y, m - 1 + meses, d)
  return isoDia(f)
}

/** Panel del administrador general de CloudTicket: cuentas, planes, locales, vencimientos y usuarios */
export function SuperAdmin({ usuario, onSalir }: { usuario: string; onSalir: () => void }) {
  const avisar = useApp(s => s.avisar)
  const [cuentas, setCuentas] = useState<SaCuenta[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)

  const cargar = useCallback(async () => {
    try { setCuentas(await repo.saResumen()) } catch (e) { avisar(mensajeError(e), 'error') }
  }, [avisar])
  useEffect(() => { cargar() }, [cargar])

  const intentar = useCallback(async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) avisar(ok); await cargar(); return true } catch (e) { avisar(mensajeError(e), 'error'); return false }
  }, [avisar, cargar])

  const todos = cuentas ?? []
  const locales = todos.flatMap(c => c.locales.filter(l => l.activa))
  const vencidos = locales.filter(l => estadoVence(l.vence).tono === 'vencido').length
  const pronto = locales.filter(l => estadoVence(l.vence).tono === 'pronto').length

  const lista = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return todos.filter(c => {
      if (q && !normalizar([c.nombre, ...c.locales.map(l => l.nombre), ...c.usuarios.map(u => u.usuario)].join(' ')).includes(q)) return false
      const v = peorVence(c)
      if (filtro === 'vencidos') return v?.tono === 'vencido'
      if (filtro === 'pronto') return v?.tono === 'pronto'
      if (filtro === 'principal' || filtro === 'pro') return c.plan === filtro
      return true
    })
  }, [todos, busqueda, filtro])

  const tarjeta = (f: Filtro, titulo: string, valor: number, clase = '') => (
    <button onClick={() => setFiltro(filtro === f ? '' : f)} aria-pressed={filtro === f}
      className={`rounded-xl p-4 text-left ring-1 ${clase || 'bg-superficie ring-linea'} ${filtro === f ? 'ring-2 ring-primario' : ''}`}>
      <div className="text-sm text-gris">{titulo}</div>
      <div className="font-cond text-3xl font-bold tabular-nums">{valor}</div>
    </button>
  )

  return (
    <div className="flex min-h-full flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-barra px-4 py-3 text-white">
        <h1 className="font-cond text-3xl font-extrabold leading-none">CloudTicket</h1>
        <span className="text-white/75">Administración general</span>
        <div className="ml-auto flex items-center gap-2">
          <BotonTema className="!border-white/20 !bg-white/15 !text-white hover:!bg-white/25" />
          <button onClick={async () => { await repo.logout(); onSalir() }} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">
            Salir <span className="text-white/60">({usuario})</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tarjeta('', 'Cuentas', todos.length)}
          {tarjeta('pro', 'Cuentas PRO', todos.filter(c => c.plan === 'pro').length)}
          {tarjeta('pronto', `Vencen en ${DIAS_AVISO} días`, pronto, pronto ? 'bg-muzza-claro ring-muzza' : '')}
          {tarjeta('vencidos', 'Locales vencidos', vencidos, vencidos ? 'bg-tomate-claro ring-tomate' : '')}
        </div>

        <div className="flex flex-wrap gap-2">
          <input aria-label="Buscar cuenta" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por cuenta, local o usuario…"
            className={`${inputBase} h-11 min-w-0 flex-1`} />
          <Btn tono="albahaca" className="h-11" onClick={() => setNueva(true)}>Nueva cuenta</Btn>
        </div>

        {!cuentas ? <p className="p-8 text-center text-gris">Cargando…</p> : (
          <div className="overflow-x-auto rounded-xl bg-superficie ring-1 ring-linea">
            <table className="w-full min-w-[760px] text-left text-[15px]">
              <thead className="border-b border-linea text-sm text-gris">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Cuenta</th>
                  <th className="px-3 py-2.5 font-medium">Plan</th>
                  <th className="px-3 py-2.5 font-medium">Suscripción</th>
                  <th className="px-3 py-2.5 font-medium">Alta</th>
                  <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {lista.map(c => {
                  const v = peorVence(c)
                  const admins = c.usuarios.filter(u => u.rol === 'admin')
                  const ab = abierta === c.id
                  return [
                    <tr key={c.id} className={ab ? 'bg-harina' : ''}>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{c.nombre}</div>
                        <div className="text-sm text-gris">{admins.map(a => a.usuario).join(', ') || 'Sin administrador'} · {c.locales.length} local{c.locales.length === 1 ? '' : 'es'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <select aria-label={`Plan de ${c.nombre}`} value={c.plan} className={`${inputBase} h-9 w-auto`}
                          onChange={e => { const p = e.target.value as Plan; intentar(() => repo.saSetPlan(c.id, p), `${c.nombre} ahora es plan ${NOMBRE_PLAN[p]}`) }}>
                          <option value="principal">Principal</option>
                          <option value="pro">PRO</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        {v ? <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${CLASE_VENCE[v.tono]}`}>{v.texto}</span> : <span className="text-sm text-gris">Sin locales activos</span>}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums text-gris">{fecha(c.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Btn className="h-9" aria-expanded={ab} onClick={() => setAbierta(ab ? null : c.id)}>{ab ? 'Cerrar' : 'Locales y usuarios'}</Btn>
                      </td>
                    </tr>,
                    ab && (
                      <tr key={c.id + '-det'}>
                        <td colSpan={5} className="bg-harina px-4 pb-4">
                          <DetalleCuenta cuenta={c} intentar={intentar} />
                        </td>
                      </tr>
                    ),
                  ]
                })}
                {!lista.length && <tr><td colSpan={5} className="p-8 text-center text-gris">{todos.length ? 'Ninguna cuenta coincide.' : 'Todavía no hay cuentas.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {nueva && <NuevaCuenta onClose={() => setNueva(false)} onLista={async nombre => { setNueva(false); avisar(`Cuenta ${nombre} creada`); await cargar() }} />}
    </div>
  )
}

type Intentar = (f: () => Promise<unknown>, ok?: string) => Promise<boolean>

function DetalleCuenta({ cuenta, intentar }: { cuenta: SaCuenta; intentar: Intentar }) {
  const [nombre, setNombre] = useState(cuenta.nombre)
  const [nuevoLocal, setNuevoLocal] = useState({ nombre: '', vence: '' })
  const [nuevoAdmin, setNuevoAdmin] = useState({ usuario: '', password: '' })
  const admins = cuenta.usuarios.filter(u => u.rol === 'admin')

  return (
    <div className="space-y-3 pt-1">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="mb-0.5 block text-gris">Nombre de la cuenta</span>
          <input aria-label="Nombre de la cuenta" value={nombre} onChange={e => setNombre(e.target.value)} className={`${inputBase} h-9 w-64`} /></label>
        {nombre.trim() !== cuenta.nombre && <Btn className="h-9" disabled={!nombre.trim()} onClick={() => intentar(() => repo.saRenombrarCuenta(cuenta.id, nombre), 'Nombre actualizado')}>Guardar nombre</Btn>}
        <p className="ml-auto max-w-md text-sm text-gris">
          {cuenta.plan === 'pro' ? 'PRO: todas las funciones, con pantalla de cocina y pantalla para clientes.' : 'Principal: todo menos la pantalla de cocina y la pantalla para clientes.'}
        </p>
      </div>

      {cuenta.locales.map(l => <LocalSa key={l.id} local={l} cuenta={cuenta} usuarios={cuenta.usuarios.filter(u => u.sucursalId === l.id)} intentar={intentar} />)}

      <form className="flex flex-wrap items-end gap-2 rounded-xl bg-superficie p-3 ring-1 ring-linea" onSubmit={async e => {
        e.preventDefault()
        if (await intentar(() => repo.saCrearLocal(cuenta.id, nuevoLocal.nombre, nuevoLocal.vence || undefined), `Local ${nuevoLocal.nombre} creado`)) setNuevoLocal({ nombre: '', vence: '' })
      }}>
        <label className="min-w-48 flex-1 text-sm"><span className="mb-0.5 block text-gris">Nuevo local</span>
          <input aria-label="Nombre del local nuevo" value={nuevoLocal.nombre} onChange={e => setNuevoLocal({ ...nuevoLocal, nombre: e.target.value })} placeholder={`${cuenta.nombre} Centro`} className={`${inputBase} h-10 w-full`} /></label>
        <label className="text-sm"><span className="mb-0.5 block text-gris">Vence</span>
          <input type="date" aria-label="Vencimiento del local nuevo" value={nuevoLocal.vence} onChange={e => setNuevoLocal({ ...nuevoLocal, vence: e.target.value })} className={`${inputBase} h-10`} /></label>
        <Btn tono="albahaca" className="h-10" disabled={!nuevoLocal.nombre.trim()}>Agregar local</Btn>
      </form>

      <section className="rounded-xl bg-superficie p-3 ring-1 ring-linea">
        <h4 className="font-semibold">Administradores de la cuenta</h4>
        <p className="text-sm text-gris">Ven todos los locales, arman el menú madre y crean los usuarios Encargado, Común y Producción. No crean locales.</p>
        <ul className="mt-2 space-y-1.5">{admins.map(u => <FilaUsuario key={u.userId} u={u} intentar={intentar} />)}</ul>
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={async e => {
          e.preventDefault()
          if (await intentar(() => repo.saCrearUsuario({ cuentaId: cuenta.id, usuario: nuevoAdmin.usuario, password: nuevoAdmin.password, tipo: 'admin' }), `Administrador ${nuevoAdmin.usuario} creado`)) setNuevoAdmin({ usuario: '', password: '' })
        }}>
          <input aria-label="Usuario administrador nuevo" value={nuevoAdmin.usuario} onChange={e => setNuevoAdmin({ ...nuevoAdmin, usuario: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="usuario" autoComplete="off" autoCapitalize="none" className={`${inputBase} h-9 min-w-0 flex-1`} />
          <input aria-label="Contraseña del administrador nuevo" value={nuevoAdmin.password} onChange={e => setNuevoAdmin({ ...nuevoAdmin, password: e.target.value })} placeholder="contraseña (mín. 6)" autoComplete="new-password" className={`${inputBase} h-9 min-w-0 flex-1`} />
          <Btn className="h-9" disabled={nuevoAdmin.usuario.length < 3 || nuevoAdmin.password.length < 6}>Agregar administrador</Btn>
        </form>
      </section>
    </div>
  )
}

function LocalSa({ local, cuenta, usuarios, intentar }: { local: SaLocal; cuenta: SaCuenta; usuarios: Usuario[]; intentar: Intentar }) {
  const [vence, setVence] = useState(local.vence ?? '')
  const [nombre, setNombre] = useState(local.nombre)
  const [nuevo, setNuevo] = useState({ usuario: '', password: '', tipo: 'comun' as TipoUsuarioT })
  useEffect(() => { setVence(local.vence ?? ''); setNombre(local.nombre) }, [local.vence, local.nombre])
  const v = estadoVence(local.vence)
  const guardarVence = (f: string) => intentar(() => repo.saSetVence(local.id, f || null), f ? `${local.nombre}: vence el ${f.split('-').reverse().join('/')}` : `${local.nombre}: sin fecha de vencimiento`)

  return (
    <section className={`rounded-xl bg-superficie ring-1 ring-linea ${local.activa ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-linea px-3 py-2.5">
        <input aria-label={`Nombre de ${local.nombre}`} value={nombre} onChange={e => setNombre(e.target.value)}
          className={`${inputBase} h-9 w-56 font-cond text-xl font-bold`} />
        {nombre.trim() && nombre.trim() !== local.nombre && <Btn className="h-9" onClick={() => intentar(() => repo.saEditarLocal(local.id, nombre, local.activa), 'Nombre actualizado')}>Guardar</Btn>}
        {local.esPrincipal && <span className="rounded bg-pizarra-claro px-2 py-0.5 text-sm font-semibold text-pizarra">Principal</span>}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4 accent-albahaca" checked={local.activa}
            onChange={e => intentar(() => repo.saEditarLocal(local.id, local.nombre, e.target.checked), e.target.checked ? 'Local activado' : 'Local desactivado')} />
          Activo
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${CLASE_VENCE[v.tono]}`}>{v.texto}</span>
          <input type="date" aria-label={`Vencimiento de ${local.nombre}`} value={vence} onChange={e => setVence(e.target.value)} className={`${inputBase} h-9`} />
          {vence !== (local.vence ?? '') && <Btn tono="albahaca" className="h-9" onClick={() => guardarVence(vence)}>Guardar fecha</Btn>}
          <Btn className="h-9" title="Suma un mes desde el vencimiento (o desde hoy si ya venció)" onClick={() => guardarVence(sumarMeses(local.vence, 1))}>+1 mes</Btn>
          <Btn className="h-9" onClick={() => guardarVence(sumarMeses(local.vence, 12))}>+1 año</Btn>
        </div>
      </div>
      <div className="p-3">
        <ul className="space-y-1.5">
          {usuarios.map(u => <FilaUsuario key={u.userId} u={u} intentar={intentar} />)}
          {!usuarios.length && <li className="text-sm text-gris">Sin usuarios en este local.</li>}
        </ul>
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={async e => {
          e.preventDefault()
          if (await intentar(() => repo.saCrearUsuario({ cuentaId: cuenta.id, sucursalId: local.id, ...nuevo }), `Usuario ${nuevo.usuario} creado`)) setNuevo({ usuario: '', password: '', tipo: 'comun' })
        }}>
          <input aria-label={`Usuario nuevo de ${local.nombre}`} value={nuevo.usuario} onChange={e => setNuevo({ ...nuevo, usuario: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="usuario" autoComplete="off" autoCapitalize="none" className={`${inputBase} h-9 min-w-0 flex-1`} />
          <input aria-label={`Contraseña del usuario nuevo de ${local.nombre}`} value={nuevo.password} onChange={e => setNuevo({ ...nuevo, password: e.target.value })} placeholder="contraseña (mín. 6)" autoComplete="new-password" className={`${inputBase} h-9 min-w-0 flex-1`} />
          <TipoUsuario valor={nuevo.tipo} etiqueta={`Tipo del usuario nuevo de ${local.nombre}`} onChange={t => setNuevo({ ...nuevo, tipo: t })} />
          <Btn className="h-9" disabled={nuevo.usuario.length < 3 || nuevo.password.length < 6}>Crear usuario</Btn>
        </form>
      </div>
    </section>
  )
}

function FilaUsuario({ u, intentar }: { u: Usuario; intentar: Intentar }) {
  const [pass, setPass] = useState<string | null>(null)
  const [borrar, setBorrar] = useState(false)
  return (
    <li className="rounded-lg bg-harina px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto font-semibold">{u.usuario}</span>
        {u.rol === 'local' ? (
          <TipoUsuario valor={tipoDe(u)} etiqueta={`Tipo de ${u.usuario}`}
            onChange={t => intentar(() => repo.setTipoUsuario(u.userId, t), `${u.usuario} ahora es ${NOMBRE_TIPO[t].toLowerCase()}`)} />
        ) : <span className="rounded bg-pizarra-claro px-2 py-0.5 text-sm font-semibold text-pizarra">Administrador</span>}
        <button className="text-sm font-semibold text-pizarra hover:underline" onClick={() => setPass('')}>Cambiar contraseña</button>
        <button className="text-sm font-semibold text-tomate hover:underline" onClick={() => setBorrar(true)}>Eliminar</button>
      </div>
      {pass !== null && (
        <form className="mt-1.5 flex gap-2" onSubmit={async e => { e.preventDefault(); if (await intentar(() => repo.cambiarPassword(u.userId, pass), `Contraseña de ${u.usuario} actualizada`)) setPass(null) }}>
          <input autoFocus aria-label={`Nueva contraseña de ${u.usuario}`} value={pass} onChange={e => setPass(e.target.value)} placeholder="Nueva contraseña (mín. 6)" autoComplete="new-password" className={`${inputCls} h-9`} />
          <Btn tono="albahaca" className="h-9" disabled={pass.length < 6}>Guardar</Btn>
          <Btn type="button" className="h-9" onClick={() => setPass(null)}>Cancelar</Btn>
        </form>
      )}
      {borrar && (
        <Confirmar texto={`¿Eliminar el usuario ${u.usuario}?`} detalle="No va a poder entrar más. Lo que cargó queda guardado." accion="Eliminar usuario"
          onNo={() => setBorrar(false)} onSi={() => { setBorrar(false); intentar(() => repo.eliminarUsuario(u.userId), 'Usuario eliminado') }} />
      )}
    </li>
  )
}

function NuevaCuenta({ onClose, onLista }: { onClose: () => void; onLista: (nombre: string) => void }) {
  const avisar = useApp(s => s.avisar)
  const [d, setD] = useState({ cuenta: '', local: '', usuario: '', password: '', plan: 'principal' as Plan, vence: sumarMeses(undefined, 1) })
  const [enviando, setEnviando] = useState(false)
  const valido = d.cuenta.trim() && d.usuario.length >= 3 && d.password.length >= 6
  const crear = async () => {
    setEnviando(true)
    try { await repo.saCrearCuenta({ ...d, local: d.local.trim() || `${d.cuenta.trim()} Principal`, vence: d.vence || undefined }); onLista(d.cuenta.trim()) }
    catch (e) { avisar(mensajeError(e), 'error') } finally { setEnviando(false) }
  }
  return (
    <Modal titulo="Nueva cuenta" onClose={onClose} ancho="max-w-lg"
      pie={<div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn tono="albahaca" disabled={!valido || enviando} onClick={crear}>{enviando ? 'Creando…' : 'Crear cuenta'}</Btn></div>}>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <Campo label="Nombre de la cuenta (marca)"><input id="sa-cuenta" autoFocus value={d.cuenta} onChange={e => setD({ ...d, cuenta: e.target.value })} placeholder="Napoles" className={inputCls} /></Campo>
        <Campo label="Primer local"><input id="sa-local" value={d.local} onChange={e => setD({ ...d, local: e.target.value })} placeholder={d.cuenta ? `${d.cuenta} Principal` : 'Napoles Principal'} className={inputCls} /></Campo>
        <Campo label="Usuario administrador"><input id="sa-usuario" value={d.usuario} onChange={e => setD({ ...d, usuario: e.target.value.toLowerCase().replace(/\s/g, '') })} autoComplete="off" autoCapitalize="none" placeholder="napoles" className={inputCls} /></Campo>
        <Campo label="Contraseña"><input id="sa-password" value={d.password} onChange={e => setD({ ...d, password: e.target.value })} autoComplete="new-password" placeholder="mín. 6" className={inputCls} /></Campo>
        <Campo label="Plan">
          <select id="sa-plan" value={d.plan} onChange={e => setD({ ...d, plan: e.target.value as Plan })} className={inputCls}>
            <option value="principal">Principal</option>
            <option value="pro">PRO</option>
          </select>
        </Campo>
        <Campo label="Vence el primer local"><input id="sa-vence" type="date" value={d.vence} onChange={e => setD({ ...d, vence: e.target.value })} className={inputCls} /></Campo>
        <p className="text-sm text-gris sm:col-span-2">El administrador entra con ese usuario y contraseña, arma el menú y crea los usuarios de su local.</p>
      </div>
    </Modal>
  )
}
