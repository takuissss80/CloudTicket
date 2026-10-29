import { useEffect, useState } from 'react'

export type Tema = 'light' | 'dark'
const CLAVE = 'comandas-tema'

function leer(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t === 'light' || t === 'dark') return t
  } catch { /* sin storage */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function aplicarTema(t: Tema) {
  document.documentElement.dataset.theme = t
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(leer)
  useEffect(() => { aplicarTema(tema) }, [tema])
  const alternar = () => {
    const nuevo: Tema = tema === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(CLAVE, nuevo) } catch { /* sin storage */ }
    setTema(nuevo)
  }
  return { tema, alternar }
}
