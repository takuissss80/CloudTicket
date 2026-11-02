import { useState } from 'react'
import { esDemo, useCuentas } from './cuentas'
import { Aviso, Logo } from './comunes'

/** Caja de inicio de sesión: lo primero que se ve al abrir la app, y también para sumar cuentas */
export function Login({ agregando, onCancelar }: { agregando?: boolean; onCancelar?: () => void }) {
  const entrar = useCuentas(s => s.entrar)
  const reingresar = useCuentas(s => s.reingresar)
  const [usuario, setUsuario] = useState(reingresar?.usuario ?? '')
  const [password, setPassword] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!usuario.trim() || !password) { setError('Completá usuario y contraseña'); return }
    setEnviando(true); setError('')
    try {
      await entrar(usuario, password)
      onCancelar?.()
    } catch (err) {
      setError((err as Error).message)
    } finally { setEnviando(false) }
  }

  const campo = 'h-12 w-full rounded-xl border border-linea bg-superficie px-4 text-[17px] text-tinta outline-none focus:border-pizarra focus:ring-2 focus:ring-pizarra/20'

  return (
    <div className="pt-seguro flex min-h-full flex-col items-center justify-center bg-harina px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="size-20" />
          <h1 className="font-cond text-[30px] font-bold leading-none text-tinta">CloudTicket</h1>
          <p className="text-[15px] text-gris">Gestión desde el celular</p>
        </div>

        <form onSubmit={enviar} className="space-y-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
          <h2 className="font-cond text-[21px] font-bold text-tinta">
            {agregando ? 'Agregar otra cuenta' : reingresar ? `Volvé a entrar a ${reingresar.nombre}` : 'Iniciar sesión'}
          </h2>
          {reingresar && !agregando && <Aviso tono="info">La sesión de esta cuenta venció. Poné la contraseña de nuevo.</Aviso>}
          <label className="block">
            <span className="mb-1 block text-[14px] font-medium text-gris">Usuario o email</span>
            <input className={campo} value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="username"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" autoFocus={!usuario} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[14px] font-medium text-gris">Contraseña</span>
            <div className="relative">
              <input className={`${campo} pr-14`} type={ver ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                autoComplete={agregando ? 'off' : 'current-password'} autoFocus={!!usuario} />
              <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="absolute inset-y-0 right-0 grid w-12 place-items-center text-gris">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
                  {ver && <path d="M3 3l18 18" />}
                </svg>
              </button>
            </div>
          </label>
          {error && <Aviso>{error}</Aviso>}
          <button type="submit" disabled={enviando}
            className="h-12 w-full rounded-xl bg-primario text-[17px] font-bold text-sobre-primario active:opacity-90 disabled:opacity-60">
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          {onCancelar && (
            <button type="button" onClick={onCancelar} className="h-11 w-full rounded-xl border border-linea text-[16px] font-semibold text-tinta">
              Cancelar
            </button>
          )}
        </form>
        {esDemo && <p className="mt-4 text-center text-[13px] text-gris">Demo: usuario <b>admin</b>, contraseña <b>1234</b></p>}
        <p className="mt-6 text-center text-[13px] text-gris">Usá el mismo usuario que en la web de CloudTicket.</p>
      </div>
    </div>
  )
}
