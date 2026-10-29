import { useState, type FormEvent } from 'react'
import { repo } from '../data'
import { USUARIOS_DEMO } from '../data/localRepo'
import { mensajeError } from '../store/app'
import { Btn, Campo, inputCls, BotonTema } from './ui'

/** Ingreso: usuario de local o email de administrador */
export function Login({ onListo }: { onListo: () => void }) {
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar')
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true); setError(''); setAviso('')
    try {
      if (modo === 'entrar') {
        await repo.login(usuario, password)
        onListo()
      } else {
        if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
        const r = await repo.registrar!(usuario, password)
        if (r.requiereConfirmacion) {
          setAviso('Te mandamos un email para confirmar la cuenta. Confirmalo y después entrá con tu email y contraseña.')
          setModo('entrar')
        } else onListo()
      }
    } catch (err) { setError(mensajeError(err)) }
    setEnviando(false)
  }

  const entrarDemo = async (u: string, p: string) => {
    setEnviando(true); setError('')
    try { await repo.login(u, p); onListo() } catch (err) { setError(mensajeError(err)) }
    setEnviando(false)
  }

  return (
    <div className="mx-auto mt-[10vh] max-w-sm px-4 pb-10">
      <BotonTema className="fixed right-4 top-4" />
      <h1 className="font-cond text-5xl font-bold">Comandas</h1>
      <p className="mt-1 text-gris">{modo === 'entrar' ? 'Entrá con el usuario de tu local o con tu email de administrador.' : 'Creá la cuenta de tu marca. Vas a ser el administrador.'}</p>

      <form onSubmit={enviar} className="mt-6 space-y-4">
        <Campo label={modo === 'entrar' ? 'Usuario o email' : 'Email'}>
          <input id="login-usuario" autoComplete="username" required autoCapitalize="none" value={usuario}
            type={modo === 'registro' ? 'email' : 'text'} onChange={e => setUsuario(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Contraseña">
          <input id="login-password" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} required
            value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
        </Campo>
        {error && <p className="text-tomate">{error}</p>}
        {aviso && <p className="rounded-lg bg-albahaca-claro p-3 text-albahaca">{aviso}</p>}
        <Btn tono="tinta" grande className="w-full" disabled={enviando}>
          {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </Btn>
      </form>

      {repo.modo === 'supabase' && (
        <p className="mt-4 text-center text-[15px] text-gris">
          {modo === 'entrar' ? '¿Primera vez? ' : '¿Ya tenés cuenta? '}
          <button type="button" className="font-semibold text-pizarra underline" onClick={() => { setModo(modo === 'entrar' ? 'registro' : 'entrar'); setError('') }}>
            {modo === 'entrar' ? 'Crear una cuenta' : 'Entrar'}
          </button>
        </p>
      )}

      {repo.modo === 'demo' && (
        <section className="mt-8 rounded-xl bg-muzza-claro p-4">
          <h2 className="font-cond text-xl font-bold">Modo demo</h2>
          <p className="text-[15px]">Probá con cualquiera de estos usuarios (contraseña 1234):</p>
          <ul className="mt-3 space-y-2">
            {USUARIOS_DEMO.map(u => (
              <li key={u.usuario}>
                <button type="button" disabled={enviando} onClick={() => entrarDemo(u.usuario, u.password)}
                  className="flex w-full items-center justify-between rounded-lg bg-superficie px-3 py-2 text-left ring-1 ring-linea hover:bg-papel">
                  <span className="font-semibold">{u.usuario}</span>
                  <span className="text-sm text-gris">{u.descripcion}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Usuario logueado sin cuenta: crea la marca y su local principal */
export function CrearCuenta({ email, onListo }: { email: string; onListo: () => void }) {
  const [cuenta, setCuenta] = useState('')
  const [local, setLocal] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true); setError('')
    try { await repo.crearCuenta(cuenta, local || `${cuenta} Principal`); onListo() } catch (err) { setError(mensajeError(err)) }
    setEnviando(false)
  }

  return (
    <form onSubmit={enviar} className="mx-auto mt-[10vh] max-w-sm space-y-4 px-4">
      <h1 className="font-cond text-5xl font-bold">Tu cuenta</h1>
      <p className="text-gris">Entraste como {email}. Poné el nombre de tu marca y de tu primer local. Después vas a poder sumar más locales desde Administración.</p>
      <Campo label="Nombre de la marca">
        <input id="cuenta-nombre" required value={cuenta} onChange={e => setCuenta(e.target.value)} className={inputCls} placeholder="Napoles" />
      </Campo>
      <Campo label="Nombre del local principal">
        <input id="cuenta-local" value={local} onChange={e => setLocal(e.target.value)} className={inputCls} placeholder={cuenta ? `${cuenta} Principal` : 'Napoles Principal'} />
      </Campo>
      {error && <p className="text-tomate">{error}</p>}
      <Btn tono="albahaca" grande className="w-full" disabled={enviando || !cuenta.trim()}>{enviando ? 'Creando…' : 'Crear cuenta'}</Btn>
      <button type="button" onClick={async () => { await repo.logout(); onListo() }} className="w-full text-center text-[15px] text-gris underline">Salir</button>
    </form>
  )
}
