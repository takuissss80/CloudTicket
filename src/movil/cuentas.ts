import { create } from 'zustand'
import { localRepo, sembrarHistorialDemo } from '../data/localRepo'
import { crearSupabaseRepo } from '../data/supabaseRepo'
import type { Repo } from '../data/repo'
import type { Sesion } from '../types'

/**
 * Cuentas guardadas en el celular. Cada una tiene su propia sesión de Supabase
 * (guardada aparte con su storageKey), así se pasa de una a otra sin volver a escribir la contraseña.
 */
export interface CuentaGuardada {
  id: string
  usuario: string
  /** Nombre de la cuenta de CloudTicket (el negocio) */
  nombre: string
  rol: Sesion['rol']
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const esDemo = !(url && key)

const CLAVE_LISTA = 'ct-movil-cuentas'
const CLAVE_ACTIVA = 'ct-movil-activa'

function leer<T>(k: string, def: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : def } catch { return def }
}
function escribir(k: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin storage */ }
}

const repos = new Map<string, Repo>()
export function repoDe(id: string): Repo {
  if (esDemo) return localRepo
  let r = repos.get(id)
  if (!r) {
    r = crearSupabaseRepo(url!, key!, { storageKey: `ct-movil-${id}` })
    repos.set(id, r)
  }
  return r
}

const nuevoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

interface EstadoCuentas {
  cuentas: CuentaGuardada[]
  activaId: string | null
  sesion: Sesion | null
  /** Revisando la sesión guardada al abrir */
  iniciando: boolean
  /** La cuenta activa necesita volver a entrar (venció la sesión) */
  reingresar: CuentaGuardada | null
  iniciar(): Promise<void>
  entrar(usuario: string, password: string): Promise<void>
  cambiar(id: string): Promise<void>
  quitar(id: string): Promise<void>
  cancelarReingreso(): void
}

export const useCuentas = create<EstadoCuentas>((set, get) => {
  const guardar = (cuentas: CuentaGuardada[], activaId: string | null) => {
    escribir(CLAVE_LISTA, cuentas)
    escribir(CLAVE_ACTIVA, activaId)
    set({ cuentas, activaId })
  }

  async function abrir(id: string) {
    const c = get().cuentas.find(x => x.id === id)
    if (!c) return
    const est = await repoDe(id).estadoSesion()
    if (est.estado === 'ok') {
      if (esDemo) await sembrarHistorialDemo()
      guardar(get().cuentas, id)
      set({ sesion: est.sesion, reingresar: null })
    } else {
      set({ reingresar: c })
    }
  }

  return {
    cuentas: leer<CuentaGuardada[]>(CLAVE_LISTA, []),
    activaId: leer<string | null>(CLAVE_ACTIVA, null),
    sesion: null,
    iniciando: true,
    reingresar: null,

    async iniciar() {
      const { cuentas, activaId } = get()
      const id = cuentas.find(c => c.id === activaId)?.id ?? cuentas[0]?.id
      try { if (id) await abrir(id) } finally { set({ iniciando: false }) }
    },

    async entrar(usuario, password) {
      // Reingreso: misma cuenta, mismo lugar de guardado
      const re = get().reingresar
      const id = re && re.usuario === usuario.trim().toLowerCase() ? re.id : nuevoId()
      const repo = repoDe(id)
      try {
        await repo.login(usuario, password)
        const est = await repo.estadoSesion()
        if (est.estado !== 'ok') {
          await repo.logout()
          throw new Error(est.estado === 'sin_cuenta' ? 'Ese usuario todavía no tiene la cuenta creada: terminá el alta desde la web.' : 'No se pudo entrar')
        }
        const s = est.sesion
        if (esDemo) await sembrarHistorialDemo()
        // Si ese mismo usuario ya estaba guardado, se reemplaza (no se duplica)
        const viejas = get().cuentas.filter(c => c.id !== id && !(c.usuario === s.usuario && c.nombre === s.cuentaNombre))
        for (const v of get().cuentas) if (!viejas.includes(v) && v.id !== id) { repos.delete(v.id); try { localStorage.removeItem(`ct-movil-${v.id}`) } catch { /* */ } }
        const nueva: CuentaGuardada = { id, usuario: s.usuario, nombre: s.cuentaNombre, rol: s.rol }
        guardar([...viejas, nueva], id)
        set({ sesion: s, reingresar: null })
      } catch (e) {
        if (!re) repos.delete(id)
        throw e
      }
    },

    async cambiar(id) {
      if (id === get().activaId && get().sesion) return
      set({ sesion: null })
      await abrir(id)
    },

    async quitar(id) {
      try { await repoDe(id).logout() } catch { /* ya no tenía sesión */ }
      repos.delete(id)
      const resto = get().cuentas.filter(c => c.id !== id)
      if (get().activaId === id) {
        guardar(resto, null)
        set({ sesion: null, reingresar: null })
        if (resto[0]) await abrir(resto[0].id)
      } else {
        guardar(resto, get().activaId)
      }
    },

    cancelarReingreso() {
      const { cuentas, activaId, sesion } = get()
      // Si había otra cuenta abierta se vuelve a esa
      set({ reingresar: null })
      if (!sesion) {
        const otra = cuentas.find(c => c.id !== activaId)
        if (otra) void get().cambiar(otra.id)
      }
    },
  }
})

/** Repo de la cuenta que se está mirando */
export const useRepo = () => {
  const id = useCuentas(s => s.activaId)
  return repoDe(id ?? 'sin')
}
