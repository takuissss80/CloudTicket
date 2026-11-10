import { useState, type FormEvent } from 'react'
import { repo } from '../data'
import { USUARIOS_DEMO } from '../data/localRepo'
import { mensajeError } from '../store/app'
import { Btn, Campo, inputCls, BotonTema } from './ui'

/** Ingreso: usuario o email */
export function Login({ onListo }: { onListo: () => void }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true); setError('')
    try { await repo.login(usuario, password); onListo() } catch (err) { setError(mensajeError(err)) }
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
      <p className="mt-1 text-gris">Entrá con tu usuario y contraseña.</p>

      <form onSubmit={enviar} className="mt-6 space-y-4">
        <Campo label="Usuario">
          <input id="login-usuario" autoComplete="username" required autoCapitalize="none" value={usuario}
            onChange={e => setUsuario(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Contraseña">
          <input id="login-password" type="password" autoComplete="current-password" required
            value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
        </Campo>
        {error && <p className="text-tomate">{error}</p>}
        <Btn tono="tinta" grande className="w-full" disabled={enviando}>{enviando ? 'Un momento…' : 'Entrar'}</Btn>
      </form>

      {repo.modo === 'supabase' && (
        <p className="mt-4 text-center text-[15px] text-gris">¿Todavía no tenés usuario? Pedí el alta a CloudTicket.</p>
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

/** Usuario que entró pero no tiene cuenta asignada (las cuentas las da de alta CloudTicket) */
export function SinCuenta({ email, onListo }: { email: string; onListo: () => void }) {
  return (
    <div className="mx-auto mt-[15vh] max-w-sm space-y-4 px-4 text-center">
      <h1 className="font-cond text-4xl font-bold">Usuario sin cuenta</h1>
      <p className="text-gris">Entraste como <b className="text-tinta">{email}</b>, pero este usuario no tiene un local asignado. Pedile el alta al administrador de CloudTicket.</p>
      <Btn className="w-full" onClick={async () => { await repo.logout(); onListo() }}>Salir</Btn>
    </div>
  )
}
