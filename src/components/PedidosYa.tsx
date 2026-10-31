import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MapeoExterno, PedidoExterno, Producto } from '../types'
import { repo } from '../data'
import { mensajeError, useApp } from '../store/app'
import { hora, money } from '../lib/format'
import { asociarItems, faltantes, interpretarPedido, normalizar, parsearTicket, TICKET_EJEMPLO, type ItemAsociado } from '../lib/pedidosya'
import { Btn, Confirmar } from './ui'

const ESTADOS: Record<PedidoExterno['estado'], { label: string; cls: string }> = {
  pendiente: { label: 'Esperando', cls: 'bg-muzza-claro text-tinta' },
  procesando: { label: 'Procesando', cls: 'bg-muzza-claro text-tinta' },
  importado: { label: 'Importado', cls: 'bg-albahaca-claro text-albahaca' },
  error: { label: 'Revisar', cls: 'bg-tomate text-white' },
  ignorado: { label: 'Ignorado', cls: 'bg-linea text-gris' },
}

type Pestana = 'pedidos' | 'asociados' | 'probar'

/** Importación automática de pedidos de PedidosYa */
export function PedidosYa({ onClose }: { onClose: () => void }) {
  const { pedidosExternos, cargarExternos, procesarExternos } = useApp()
  const [pestana, setPestana] = useState<Pestana>('pedidos')
  const errores = (pedidosExternos ?? []).filter(p => p.estado === 'error').length

  useEffect(() => { cargarExternos() }, [cargarExternos])

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-harina">
      <header className="flex flex-wrap items-center gap-3 bg-barra px-4 py-3 text-white">
        <button onClick={onClose} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>
        <h1 className="font-cond text-3xl font-bold leading-none">Pedidos PedidosYa</h1>
        <nav className="flex flex-wrap gap-1 rounded-lg bg-white/10 p-1 sm:ml-auto" aria-label="Secciones">
          {([['pedidos', `Pedidos${errores ? ` (${errores} a revisar)` : ''}`], ['asociados', 'Productos asociados'], ['probar', 'Probar un ticket']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPestana(k)} aria-current={pestana === k}
              className={`h-9 rounded-md px-3 font-semibold ${pestana === k ? 'bg-albahaca text-sobre-albahaca' : 'text-white/85 hover:text-white'}`}>{l}</button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-5">
          {pedidosExternos === null ? (
            <p className="rounded-xl bg-muzza-claro p-4">Falta actualizar la base de datos: corré en Supabase la migración <b>0010_spool_y_pedidosya.sql</b>.</p>
          ) : pestana === 'pedidos' ? <ListaPedidos pedidos={pedidosExternos} onCambio={async () => { await procesarExternos(); await cargarExternos() }} />
            : pestana === 'asociados' ? <Asociados />
            : <Probar />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
function ListaPedidos({ pedidos, onCambio }: { pedidos: PedidoExterno[]; onCambio: () => Promise<void> }) {
  const { comandas, caja, avisar } = useApp()
  const [abierto, setAbierto] = useState<string | null>(() => pedidos.find(p => p.estado === 'error')?.id ?? null)
  const [ignorar, setIgnorar] = useState<PedidoExterno | null>(null)

  const intentar = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) avisar(ok); await onCambio() } catch (e) { avisar(mensajeError(e), 'error') }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-cond text-3xl font-bold">Pedidos recibidos</h2>
          <p className="text-[15px] text-gris">
            Los manda el programa de Windows cuando GoWin imprime un pedido. Se cargan solos como comanda (canal PedidosYa) mientras la caja está abierta.
          </p>
        </div>
      </div>
      {!caja && <p className="rounded-xl bg-muzza-claro p-3 text-[15px]">La caja está cerrada: los pedidos quedan esperando hasta que se abra.</p>}
      <ul className="space-y-2">
        {pedidos.map(p => {
          const est = ESTADOS[p.estado]
          const c = comandas.find(x => x.id === p.comandaId)
          const t = parsearTicket(p.texto)
          const ver = abierto === p.id
          return (
            <li key={p.id} className="rounded-xl bg-superficie ring-1 ring-linea">
              <button onClick={() => setAbierto(ver ? null : p.id)} aria-expanded={ver} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
                <span className="w-12 text-sm tabular-nums text-gris">{hora(p.createdAt)}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${est.cls}`}>{est.label}</span>
                <span className="font-semibold">{p.numeroExterno || t.numero ? `#${p.numeroExterno || t.numero}` : 'Sin número'}</span>
                <span className="min-w-0 flex-1 truncate text-gris">{t.cliente ?? ''}{p.error && p.estado !== 'importado' ? ` · ${p.error}` : ''}</span>
                {c && <span className="text-sm font-semibold">Comanda #{c.numero}</span>}
                {t.total != null && <span className="font-cond text-xl font-bold tabular-nums">{money(t.total)}</span>}
              </button>
              {ver && (
                <div className="space-y-3 border-t border-linea p-4">
                  {p.estado === 'error' && <Asociador pedido={p} onListo={() => intentar(() => repo.marcarPedidoExterno(p.id, 'pendiente'), 'Reintentando…')} />}
                  <details open={p.estado !== 'error'}>
                    <summary className="cursor-pointer text-sm font-semibold text-gris">Ticket capturado</summary>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-harina p-3 font-mono text-[13px] leading-snug whitespace-pre-wrap">{p.texto}</pre>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    {(p.estado === 'error' || p.estado === 'ignorado') && <Btn onClick={() => intentar(() => repo.marcarPedidoExterno(p.id, 'pendiente'), 'Reintentando…')}>Reintentar</Btn>}
                    {(p.estado === 'error' || p.estado === 'pendiente') && <Btn tono="fantasma" onClick={() => setIgnorar(p)}>Ignorar este pedido</Btn>}
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {!pedidos.length && (
          <li className="rounded-xl bg-superficie p-8 text-center text-gris ring-1 ring-linea">
            Todavía no llegó ningún pedido. Activá la importación en el programa de Windows (sección "Importación automática de pedidos").
          </li>
        )}
      </ul>
      {ignorar && (
        <Confirmar texto="¿Ignorar este pedido?" detalle="No se carga en la caja. Usalo si es un pedido de prueba o si ya lo cargaste a mano." accion="Ignorar"
          onNo={() => setIgnorar(null)} onSi={() => { const p = ignorar; setIgnorar(null); intentar(() => repo.marcarPedidoExterno(p.id, 'ignorado', 'Ignorado a mano'), 'Pedido ignorado') }} />
      )}
    </div>
  )
}

/** Para un pedido con productos que no se reconocieron: elegir a qué producto corresponde cada uno */
function Asociador({ pedido, onListo }: { pedido: PedidoExterno; onListo: () => void }) {
  const { catalogo, avisar } = useApp()
  const [mapeos, setMapeos] = useState<MapeoExterno[] | null>(null)
  const [eleccion, setEleccion] = useState<Record<string, { productoId?: string; variante?: 'entera' | 'mitad'; ignorar?: boolean }>>({})
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { repo.listMapeos().then(setMapeos).catch(() => setMapeos([])) }, [])

  const items = useMemo(() => mapeos ? asociarItems(parsearTicket(pedido.texto).items, catalogo.productos, mapeos) : [], [mapeos, pedido.texto, catalogo.productos])
  const sinReconocer = faltantes(items)
  if (!mapeos) return null
  if (!items.length) return <p className="rounded-lg bg-tomate-claro p-3 text-[15px] text-tomate">{pedido.error ?? 'No se encontraron productos en el ticket.'} Si el formato del ticket es distinto, mandame una foto para ajustar la lectura.</p>
  if (!sinReconocer.length) return <p className="rounded-lg bg-tomate-claro p-3 text-[15px] text-tomate">{pedido.error}</p>

  const completo = sinReconocer.every(i => { const e = eleccion[normalizar(i.nombre)]; return e?.ignorar || e?.productoId })
  const guardar = async () => {
    setGuardando(true)
    try {
      for (const i of sinReconocer) {
        const e = eleccion[normalizar(i.nombre)]
        await repo.guardarMapeo({ canal: 'pedidosya', texto: normalizar(i.nombre), productoId: e.productoId, variante: e.variante, ignorar: !!e.ignorar })
      }
      avisar('Productos asociados: la próxima vez se reconocen solos')
      onListo()
    } catch (e) { avisar(mensajeError(e), 'error') }
    setGuardando(false)
  }

  return (
    <div className="space-y-3 rounded-xl bg-tomate-claro/60 p-4">
      <p className="font-semibold">Estos productos de PedidosYa no se reconocieron. Elegí a cuál de tu menú corresponden (se guarda para siempre):</p>
      {sinReconocer.map(i => (
        <FilaAsociar key={i.nombre} item={i} productos={catalogo.productos} valor={eleccion[normalizar(i.nombre)] ?? {}}
          onChange={v => setEleccion(e => ({ ...e, [normalizar(i.nombre)]: v }))} />
      ))}
      <Btn tono="albahaca" disabled={!completo || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar y cargar el pedido'}</Btn>
    </div>
  )
}

function FilaAsociar({ item, productos, valor, onChange }: {
  item: ItemAsociado; productos: Producto[]; valor: { productoId?: string; variante?: 'entera' | 'mitad'; ignorar?: boolean }
  onChange: (v: { productoId?: string; variante?: 'entera' | 'mitad'; ignorar?: boolean }) => void
}) {
  const { catalogo } = useApp()
  const p = productos.find(x => x.id === valor.productoId)
  const sugeridos = item.sugerencias
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-superficie p-3 ring-1 ring-linea">
      <div className="min-w-[180px] flex-1">
        <div className="font-semibold">{item.cantidad} x {item.nombre}</div>
        {item.precio != null && <div className="text-sm text-gris">{money(item.precio)} en PedidosYa</div>}
      </div>
      <select aria-label={`Producto para ${item.nombre}`} value={valor.ignorar ? '__ignorar' : valor.productoId ?? ''}
        onChange={e => e.target.value === '__ignorar' ? onChange({ ignorar: true }) : onChange({ productoId: e.target.value || undefined, variante: undefined })}
        className="h-10 min-w-[220px] flex-1 rounded-lg border border-linea bg-superficie px-2">
        <option value="">Elegí el producto…</option>
        {sugeridos.length > 0 && <optgroup label="Parecidos">{sugeridos.map(s => <option key={'s' + s.id} value={s.id}>{s.nombre}</option>)}</optgroup>}
        {catalogo.categorias.map(c => {
          const ps = productos.filter(x => x.categoriaId === c.id)
          return ps.length ? <optgroup key={c.id} label={c.nombre}>{ps.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</optgroup> : null
        })}
        <option value="__ignorar">No es un producto (ignorar esta línea)</option>
      </select>
      {p && p.precioMitad != null && (
        <select aria-label={`Variante de ${item.nombre}`} value={valor.variante ?? 'entera'} onChange={e => onChange({ ...valor, variante: e.target.value as 'entera' | 'mitad' })}
          className="h-10 rounded-lg border border-linea bg-superficie px-2">
          <option value="entera">Entera</option><option value="mitad">Mitad</option>
        </select>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
function Asociados() {
  const { catalogo, avisar } = useApp()
  const [mapeos, setMapeos] = useState<MapeoExterno[] | null>(null)
  const cargar = useCallback(async () => setMapeos(await repo.listMapeos()), [])
  useEffect(() => { cargar().catch(e => avisar(mensajeError(e), 'error')) }, [cargar, avisar])
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-cond text-3xl font-bold">Productos asociados</h2>
        <p className="text-[15px] text-gris">Cómo se llama cada producto en PedidosYa y a cuál de tu menú corresponde. Sirve para todos los locales. Los que tienen el mismo nombre que en tu menú se reconocen solos.</p>
      </div>
      <ul className="divide-y divide-linea rounded-xl bg-superficie ring-1 ring-linea">
        {mapeos?.map(m => {
          const p = catalogo.productos.find(x => x.id === m.productoId)
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 font-mono text-[15px]">{m.texto}</span>
              <span className="text-gris">→</span>
              <span className="min-w-0 flex-1 font-semibold">{m.ignorar ? <span className="text-gris">Se ignora (no es un producto)</span> : p ? `${p.nombre}${m.variante === 'mitad' ? ' (mitad)' : ''}` : 'Producto borrado'}</span>
              <button aria-label={`Quitar asociación de ${m.texto}`} onClick={async () => { try { await repo.eliminarMapeo(m.id); await cargar() } catch (e) { avisar(mensajeError(e), 'error') } }}
                className="size-8 rounded-full text-xl text-gris hover:bg-tomate-claro hover:text-tomate">×</button>
            </li>
          )
        })}
        {mapeos && !mapeos.length && <li className="px-4 py-8 text-center text-gris">Todavía no asociaste ningún producto. Cuando llegue un pedido con un producto que no se reconoce, lo asociás desde ahí.</li>}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------
function Probar() {
  const { catalogo, sucursalId, avisar, procesarExternos } = useApp()
  const [texto, setTexto] = useState(TICKET_EJEMPLO)
  const [mapeos, setMapeos] = useState<MapeoExterno[]>([])
  useEffect(() => { repo.listMapeos().then(setMapeos).catch(() => {}) }, [])
  const r = useMemo(() => interpretarPedido(texto, catalogo.productos, mapeos), [texto, catalogo.productos, mapeos])
  const t = r.ticket
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h2 className="font-cond text-3xl font-bold">Probar un ticket</h2>
        <p className="mb-2 text-[15px] text-gris">Pegá el texto de un ticket (está en el programa, en "Último ticket capturado") para ver cómo se lee. No se carga nada.</p>
        <textarea id="ticket-prueba" value={texto} onChange={e => setTexto(e.target.value)} rows={22}
          className="w-full rounded-xl border border-linea bg-superficie p-3 font-mono text-[13px] leading-snug" />
        {repo.modo === 'demo' && sucursalId && (
          <Btn className="mt-2" onClick={async () => {
            const res = await repo.simularCaptura!(sucursalId, texto)
            avisar(res === 'nuevo' ? 'Ticket recibido como si viniera de GoWin' : 'Ese ticket ya había llegado (repetido)')
            await procesarExternos()
          }}>Simular que llegó este ticket</Btn>
        )}
      </div>
      <div className="space-y-3">
        <div className={`rounded-xl p-3 font-semibold ${r.error ? 'bg-tomate-claro text-tomate' : 'bg-albahaca-claro text-albahaca'}`}>
          {r.error ?? 'Se puede importar'}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-superficie p-4 text-[15px] ring-1 ring-linea">
          {([['Número', t.numero], ['Cliente', t.cliente], ['Teléfono', t.telefono], ['Dirección', t.direccion], ['Notas', t.notas],
            ['Tipo', t.retiro ? 'Retira en el local' : 'Delivery'], ['Pago', t.pago === 'efectivo' ? 'Efectivo (queda a cobrar)' : 'Online (cobrado)']] as const).map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-gris">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>
          ))}
        </dl>
        <ul className="divide-y divide-linea rounded-xl bg-superficie ring-1 ring-linea">
          {r.items.map((i, k) => (
            <li key={k} className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <b>{i.cantidad} x {i.nombre}</b>
                {i.precio != null && <span className="ml-auto tabular-nums">{money(i.precio)}</span>}
              </div>
              <div className={`text-sm ${i.producto || i.ignorar ? 'text-albahaca' : 'text-tomate'}`}>
                {i.ignorar ? 'Se ignora' : i.producto ? `→ ${i.producto.nombre}${i.variante === 'mitad' ? ' (mitad)' : ''} (${i.como === 'asociado' ? 'asociado' : i.como === 'nombre' ? 'mismo nombre' : 'nombre parecido'})` : 'No se reconoce'}
                {i.extras.length > 0 && <span className="text-gris"> · {i.extras.join(', ')}</span>}
              </div>
            </li>
          ))}
          {!r.items.length && <li className="px-4 py-6 text-center text-gris">No se encontraron productos.</li>}
        </ul>
        {r.importacion && (
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 rounded-xl bg-superficie p-4 text-[15px] ring-1 ring-linea">
            <dt>Productos</dt><dd className="tabular-nums">{money(r.importacion.subtotal)}</dd>
            {r.importacion.costoEnvio > 0 && <><dt>Envío</dt><dd className="tabular-nums">{money(r.importacion.costoEnvio)}</dd></>}
            {r.importacion.adicional > 0 && <><dt>Adicional</dt><dd className="tabular-nums">{money(r.importacion.adicional)}</dd></>}
            {r.importacion.descuento > 0 && <><dt>Descuento</dt><dd className="tabular-nums">−{money(r.importacion.descuento)}</dd></>}
            <dt className="font-bold">Total</dt><dd className="font-bold tabular-nums">{money(r.importacion.total)}</dd>
          </dl>
        )}
      </div>
    </div>
  )
}
