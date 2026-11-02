import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './movil.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// App instalable: el service worker guarda la app para que abra rápido (los datos siempre se piden en vivo)
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:') {
  addEventListener('load', () => { void navigator.serviceWorker.register('/movil/sw.js', { scope: '/movil/' }) })
}
