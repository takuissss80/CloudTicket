import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormatoTicket, Impresora } from '../types'
import { repo } from '../data'
import { mensajeError, useApp } from '../store/app'
import { hora } from '../lib/format'
import { comandaEjemplo, construirTicket, FORMATOS, versionAlMenos, VERSION_TAMANOS } from '../lib/ticket'
import { TicketPreview } from './TicketPreview'
import { Btn, Campo, Confirmar, Modal, inputCls } from './ui'

const URL_PROGRAMA = '/descargas/CloudTicketImpresion.exe'
/**
 * Verde si el programa avisó que está vivo en el último minuto y medio (avisa cada 30 s).
 * Si se lo ve avisar mientras la pantalla está abierta, se usa eso y no la hora de la PC,
 * así un reloj de Windows corrido no la pinta de amarillo estando conectada.
 */
const pings = new Map<string, { ping: string; cambio: number | null }>()
function conectada(i: Impresora) {
  if (!i.ultimoPing) return false
  const prev = pings.get(i.id)
  if (!prev) pings.set(i.id, { ping: i.ultimoPing, cambio: null })
  else if (prev.ping !== i.ultimoPing) pings.set(i.id, { ping: i.ultimoPing, cambio: Date.now() })
  const cambio = pings.get(i.id)!.cambio
  return Date.now() - (cambio ?? new Date(i.ultimoPing).getTime()) < 90_000
}

/** Comanderas del local: alta, token para el programa de Windows y estado */
export function Comanderas() {
  const { impresoras, sucursalId, imprimirPrueba, avisar } = useApp()
  const [editar, setEditar] = useState<Partial<Impresora> | null>(null)
  const [token, setToken] = useState<{ nombre: string; token: string } | null>(null)
  const [regenerar, setRegenerar] = useState<Impresora | null>(null)
  const [borrar, setBorrar] = useState<Impresora | null>(null)
  const [, setTick] = useState(0)

  const recargar = useCallback(async () => {
    if (!sucursalId) return
    useApp.setState({ impresoras: await repo.listImpresoras(sucursalId) })
  }, [sucursalId])
  // El estado "conectada" se actualiza solo mientras esta pantalla está abierta
  useEffect(() => {
    const t = setInterval(() => { recargar().catch(() => {}); setTick(x => x + 1) }, 10_000)
    return () => clearInterval(t)
  }, [recargar])

  const intentar = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) avisar(ok); await recargar(); return true } catch (e) { avisar(mensajeError(e), 'error'); return false }
  }
  const generar = async (i: Impresora) => {
    try {
      const t = await repo.generarTokenImpresora(i.id)
      setToken({ nombre: i.nombre, token: t })
      await recargar()
    } catch (e) { avisar(mensajeError(e), 'error') }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <h3 className="mr-auto font-cond text-2xl font-bold">Comanderas</h3>
        <Btn tono="albahaca" onClick={() => setEditar({ nombre: '', imprimeMostrador: true, imprimeDelivery: true, copias: 1, ancho: 48, formato: 'normal', mostrarPrecios: true })}>+ Agregar comandera</Btn>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-pizarra-claro p-4">
        <div className="min-w-0 flex-1 text-[15px]">
          <b>Programa de impresión para Windows.</b> Se instala en la PC donde está conectada la comandera por USB.
          Lo abrís, pegás el token de la comandera y elegís la impresora.
        </div>
        <a href={URL_PROGRAMA} download className="inline-flex h-10 items-center rounded-lg bg-pizarra px-4 font-semibold text-white hover:brightness-110">Descargar programa</a>
      </div>

      <ul className="space-y-2">
        {impresoras.map(i => {
          const on = conectada(i)
          return (
            <li key={i.id} className="rounded-xl bg-superficie p-4 ring-1 ring-linea">
              <div className="flex flex-wrap items-start gap-3">
                <span className={`mt-1.5 size-3 shrink-0 rounded-full ${on ? 'bg-albahaca' : i.conToken ? 'bg-muzza' : 'bg-linea'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold">{i.nombre}</div>
                  <div className="text-sm text-gris">
                    Imprime {[i.imprimeMostrador && 'mostrador', i.imprimeDelivery && 'delivery'].filter(Boolean).join(' y ') || 'nada (desactivada)'}
                    , {i.ancho === 32 ? '58 mm' : '80 mm'}, letra {FORMATOS[i.formato ?? 'normal'].nombre.toLowerCase()}
                    {i.mostrarPrecios === false ? ', sin precios' : ''}{i.copias > 1 ? `, ${i.copias} copias` : ''}
                  </div>
                  <div className={`mt-1 text-sm font-semibold ${on ? 'text-albahaca' : i.conToken ? 'text-tinta' : 'text-gris'}`}>
                    {on ? `Conectada${i.pcNombre ? ` en ${i.pcNombre}` : ''}${i.impresoraWindows ? ` → ${i.impresoraWindows}` : ''}`
                      : i.conToken && i.ultimoPing ? `Desconectada: el programa no responde desde las ${hora(i.ultimoPing)}${i.pcNombre ? ` (${i.pcNombre})` : ''}`
                      : i.conToken ? 'Token generado: falta pegarlo en el programa de Windows'
                      : 'Sin vincular: generá un token'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {i.conToken
                    ? <Btn tono="fantasma" onClick={() => setRegenerar(i)}>Nuevo token</Btn>
                    : <Btn tono="albahaca" onClick={() => generar(i)}>Generar token</Btn>}
                  <Btn tono="fantasma" onClick={() => imprimirPrueba(i)}>Imprimir prueba</Btn>
                  <Btn tono="fantasma" onClick={() => setEditar(i)}>Editar y formato</Btn>
                  <button aria-label={`Eliminar ${i.nombre}`} title="Eliminar" onClick={() => setBorrar(i)}
                    className="size-10 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
                </div>
              </div>
            </li>
          )
        })}
        {!impresoras.length && <li className="rounded-xl bg-superficie p-6 text-center text-gris ring-1 ring-linea">No hay comanderas en este local. Agregá una.</li>}
      </ul>

      {editar && (
        <EditorComandera inicial={editar} onClose={() => setEditar(null)}
          onGuardar={async i => { if (sucursalId && await intentar(() => repo.guardarImpresora(sucursalId, i), 'Comandera guardada')) setEditar(null) }} />
      )}
      {token && (
        <Modal titulo={`Token de ${token.nombre}`} onClose={() => setToken(null)} ancho="max-w-lg"
          pie={<div className="flex justify-end"><Btn tono="albahaca" onClick={() => setToken(null)}>Listo</Btn></div>}>
          <div className="space-y-4 p-5">
            <p className="text-[15px]">Pegalo en el programa <b>CloudTicket Impresión</b> de la PC que tiene la comandera, en <b>Vincular una comandera</b>.</p>
            <div className="flex items-center gap-2 rounded-xl bg-harina p-3">
              <code id="token-generado" className="min-w-0 flex-1 break-all font-mono text-lg font-semibold">{token.token}</code>
              <Btn onClick={async () => {
                try { await navigator.clipboard.writeText(token.token); avisar('Token copiado') } catch { avisar('Seleccioná el token y copialo a mano', 'error') }
              }}>Copiar</Btn>
            </div>
            <p className="text-sm text-gris">Por seguridad se muestra <b>una sola vez</b>. Si lo perdés, generá uno nuevo (el anterior deja de funcionar).</p>
            {repo.modo === 'demo' && <p className="rounded-lg bg-muzza-claro p-3 text-sm">Modo demo: el programa de Windows solo se conecta a la web real.</p>}
          </div>
        </Modal>
      )}
      {regenerar && (
        <Confirmar texto={`¿Generar un token nuevo para ${regenerar.nombre}?`}
          detalle="El token anterior deja de funcionar: la PC que lo tenía deja de imprimir hasta que pegues el nuevo."
          accion="Generar token nuevo" tono="pizarra" onNo={() => setRegenerar(null)}
          onSi={() => { const i = regenerar; setRegenerar(null); generar(i) }} />
      )}
      {borrar && (
        <Confirmar texto={`¿Eliminar la comandera ${borrar.nombre}?`} detalle="Deja de imprimir y su token deja de funcionar."
          accion="Eliminar" onNo={() => setBorrar(null)}
          onSi={() => { const i = borrar; setBorrar(null); intentar(() => repo.eliminarImpresora(i.id), 'Comandera eliminada') }} />
      )}
    </section>
  )
}

function EditorComandera({ inicial, onClose, onGuardar }: {
  inicial: Partial<Impresora>; onClose: () => void; onGuardar: (i: Omit<Impresora, 'id'> & { id?: string }) => void
}) {
  const nombreLocal = useApp(s => s.sucursales.find(x => x.id === s.sucursalId)?.nombre)
  const [nombre, setNombre] = useState(inicial.nombre ?? '')
  const [mostrador, setMostrador] = useState(inicial.imprimeMostrador ?? true)
  const [delivery, setDelivery] = useState(inicial.imprimeDelivery ?? true)
  const [ancho, setAncho] = useState(inicial.ancho ?? 48)
  const [copias, setCopias] = useState(inicial.copias ?? 1)
  const [formato, setFormato] = useState<FormatoTicket>(inicial.formato ?? 'normal')
  const [precios, setPrecios] = useState(inicial.mostrarPrecios ?? true)
  const ejemplo = useMemo(() => comandaEjemplo(), [])
  const vista = useMemo(() => construirTicket(ejemplo, { ancho, tipo: 'comanda', formato, mostrarPrecios: precios, nombreLocal }), [ejemplo, ancho, formato, precios, nombreLocal])

  const marca = (v: boolean, set: (b: boolean) => void, l: string) => (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-harina px-3 py-2.5">
      <input type="checkbox" className="size-5 accent-albahaca" checked={v} onChange={e => set(e.target.checked)} /> {l}
    </label>
  )
  return (
    <Modal titulo={inicial.id ? `Editar ${inicial.nombre}` : 'Nueva comandera'} onClose={onClose} ancho="max-w-5xl" alto
      pie={<div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn>
        <Btn tono="albahaca" disabled={!nombre.trim()} onClick={() => onGuardar({ id: inicial.id, nombre, imprimeMostrador: mostrador, imprimeDelivery: delivery, ancho, copias, formato, mostrarPrecios: precios })}>Guardar</Btn></div>}>
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <Campo label="Nombre"><input id="comandera-nombre" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} placeholder="Cocina, Mostrador, Horno…" /></Campo>
          <div>
            <span className="mb-1 block text-sm font-medium text-gris">Qué imprime</span>
            <div className="grid grid-cols-2 gap-2">{marca(mostrador, setMostrador, 'Pedidos de mostrador')}{marca(delivery, setDelivery, 'Pedidos de delivery')}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Papel">
              <select id="comandera-ancho" value={ancho} onChange={e => setAncho(Number(e.target.value))} className={inputCls}>
                <option value={48}>80 mm (48 letras)</option><option value={32}>58 mm (32 letras)</option>
              </select>
            </Campo>
            <Campo label="Copias de cada comanda">
              <select id="comandera-copias" value={copias} onChange={e => setCopias(Number(e.target.value))} className={inputCls}>
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Campo>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gris">Tamaño de la letra</span>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tamaño de la letra">
              {(Object.keys(FORMATOS) as FormatoTicket[]).map(k => (
                <button key={k} type="button" role="radio" aria-checked={formato === k} onClick={() => setFormato(k)}
                  className={`rounded-xl p-3 text-left ring-2 transition ${formato === k ? 'bg-albahaca-claro ring-albahaca' : 'bg-harina ring-transparent hover:ring-linea'}`}>
                  <span className={`block font-cond font-bold ${k === 'chico' ? 'text-lg' : k === 'normal' ? 'text-2xl' : 'text-3xl'}`}>{FORMATOS[k].nombre}</span>
                  <span className="mt-0.5 block text-sm text-gris">{FORMATOS[k].descripcion}</span>
                </button>
              ))}
            </div>
          </div>
          {inicial.versionPrograma && !versionAlMenos(inicial.versionPrograma, VERSION_TAMANOS) && (
            <p className="rounded-lg bg-muzza-claro p-3 text-sm">
              Esta PC tiene el programa {inicial.versionPrograma}: hasta que lo actualices (botón <b>Descargar programa</b>), los productos y la dirección no van a salir con este tamaño.
            </p>
          )}
          {marca(precios, setPrecios, 'Imprimir precios y totales (desactivalo para la comandera de cocina)')}
          <p className="text-sm text-gris">La vista previa usa una comanda de ejemplo. Con <b>Imprimir prueba</b> sale esta misma comanda por la comandera.</p>
        </div>
        <aside className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-2 text-sm font-medium text-gris">Así sale en la comandera</div>
          <div className="max-w-full overflow-x-auto pb-2"><TicketPreview lineas={vista} ancho={ancho} /></div>
        </aside>
      </div>
    </Modal>
  )
}
