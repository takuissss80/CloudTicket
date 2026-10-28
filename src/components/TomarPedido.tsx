import { useEffect, useMemo, useRef, useState } from 'react'
import type { Categoria, Producto } from '../types'
import { useApp } from '../store/app'
import { itemProducto, itemPromo, totales, usePedido } from '../store/pedido'
import { coccionLabel, money, normalizar, varianteLabel } from '../lib/format'
import { Btn, Confirmar, Stepper, inputCls } from './ui'
import { CategoriaModal } from './CategoriaModal'
import { PromoModal } from './PromoModal'
import { ClienteModal } from './ClienteModal'
import { CobroModal } from './CobroModal'

const colorTile: Record<Categoria['color'], string> = {
  blue: 'border-t-pizarra',
  red: 'border-t-tomate',
  amber: 'border-t-muzza',
  green: 'border-t-albahaca',
}

/** Pantalla completa para cargar un pedido */
export function TomarPedido() {
  const p = usePedido()
  const { catalogo } = useApp()
  const [categoria, setCategoria] = useState<Categoria | null>(null)
  const [promo, setPromo] = useState<Producto | null>(null)
  const [verCliente, setVerCliente] = useState(false)
  const [verCobro, setVerCobro] = useState(false)
  const [confirmarSalir, setConfirmarSalir] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null)
  const buscador = useRef<HTMLInputElement>(null)

  const { subtotal, envio, total } = totales(p, catalogo.zonas, catalogo.productos)
  const unidades = p.items.reduce((s, i) => s + i.cantidad, 0)

  // Delivery nuevo: arranca pidiendo el cliente
  useEffect(() => {
    if (p.tipo === 'delivery' && !p.editandoId && !p.clienteNombre) setVerCliente(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.tipo])

  // Atajos: "/" busca, F2 cobra
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const enCampo = (e.target as HTMLElement)?.closest('input, textarea, select')
      if (e.key === '/' && !enCampo) { e.preventDefault(); buscador.current?.focus() }
      if (e.key === 'F2' && p.items.length) { e.preventDefault(); setVerCobro(true) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [p.items.length])

  const enCarrito = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of p.items) {
      const prod = catalogo.productos.find(x => x.id === it.productoId)
      if (prod) m[prod.categoriaId] = (m[prod.categoriaId] ?? 0) + it.cantidad
    }
    return m
  }, [p.items, catalogo.productos])

  const resultados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (!q) return []
    return catalogo.productos.filter(x => !x.agotado).filter(x =>
      normalizar(`${x.nombre} ${x.codigo ?? ''} ${x.descripcion ?? ''}`).includes(q)
      || (x.codigo && normalizar(x.codigo) === q),
    ).slice(0, 12)
  }, [busqueda, catalogo.productos])

  const agregarRapido = (prod: Producto, variante: 'entera' | 'mitad' | 'unica' = 'entera', coccion?: 'horno' | 'frita') => {
    if (prod.tipo === 'promo' && prod.slots.length) { setPromo(prod); return }
    if (prod.tipo === 'promo') {
      // promo sin elección: se agrega con sus fijos
      p.agregar(itemPromo(prod, [], catalogo.productos))
      return
    }
    p.agregar(itemProducto(prod, prod.precioMitad != null ? variante : 'unica', 1, coccion))
  }

  const salir = () => (p.items.length ? setConfirmarSalir(true) : p.cerrar())

  const zona = catalogo.zonas.find(z => z.id === p.zonaId)
  const categorias = [...catalogo.categorias].sort((a, b) => a.orden - b.orden)

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-harina">
      {/* ---- Barra superior */}
      <header className={`flex flex-wrap items-center gap-3 px-4 py-3 text-white ${p.tipo === 'delivery' ? 'bg-tomate' : 'bg-pizarra'}`}>
        <button onClick={salir} className="h-10 rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25">Volver</button>
        <h1 className="font-cond text-3xl font-bold leading-none">
          {p.editandoId ? `Comanda #${p.editandoNumero}` : p.tipo === 'delivery' ? 'Pedido delivery' : 'Pedido mostrador'}
        </h1>
        <div className="flex overflow-hidden rounded-lg bg-black/20 p-0.5">
          {(['mostrador', 'delivery'] as const).map(t => (
            <button key={t} onClick={() => p.set({ tipo: t })}
              className={`h-9 rounded-md px-3 font-semibold capitalize ${p.tipo === t ? 'bg-white text-tinta' : 'text-white/85 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto min-w-0">
          {p.tipo === 'mostrador' ? (
            <input value={p.clienteNombre} onChange={e => p.set({ clienteNombre: e.target.value })}
              placeholder="Nombre del cliente"
              className="h-10 w-56 rounded-lg border-0 bg-white px-3 text-[16px] text-tinta outline-none placeholder:text-gris" />
          ) : (
            <button onClick={() => setVerCliente(true)} className="flex max-w-md items-center gap-3 rounded-lg bg-white/15 px-3 py-1.5 text-left hover:bg-white/25">
              {p.clienteNombre ? (
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold">{p.clienteNombre} {p.clienteTel && <span className="font-normal opacity-80">{p.clienteTel}</span>}</span>
                  <span className="block truncate text-sm opacity-85">{p.direccion}{zona ? `, ${zona.nombre}` : ''}</span>
                </span>
              ) : <span className="font-semibold">Cargar cliente</span>}
              <span className="shrink-0 text-sm underline">Cambiar</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ---- Catálogo */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="relative mb-4">
            <input
              ref={buscador}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && resultados.length === 1) { agregarRapido(resultados[0]); setBusqueda('') }
                if (e.key === 'Escape') setBusqueda('')
              }}
              placeholder="Buscar producto por nombre o código  ( / )"
              className={`${inputCls} h-12 text-lg`}
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 size-8 -translate-y-1/2 rounded-full text-xl text-gris hover:bg-black/5">×</button>
            )}
          </div>

          {busqueda ? (
            <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-white">
              {resultados.map(prod => (
                <li key={prod.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{prod.codigo && <span className="mr-2 text-tomate">{prod.codigo}</span>}{prod.nombre}</div>
                    <div className="text-sm text-gris">{catalogo.categorias.find(c => c.id === prod.categoriaId)?.nombre}</div>
                  </div>
                  {prod.precioMitad != null ? (
                    <>
                      <Btn onClick={() => agregarRapido(prod, 'entera')}>Entera {money(prod.precio)}</Btn>
                      <Btn onClick={() => agregarRapido(prod, 'mitad')}>Mitad {money(prod.precioMitad)}</Btn>
                    </>
                  ) : prod.admiteCoccion ? (
                    <>
                      <Btn onClick={() => agregarRapido(prod, 'unica', 'horno')}>Horno</Btn>
                      <Btn onClick={() => agregarRapido(prod, 'unica', 'frita')}>Frita</Btn>
                      <span className="w-20 text-right font-semibold">{money(prod.precio)}</span>
                    </>
                  ) : (
                    <Btn tono="albahaca" onClick={() => agregarRapido(prod)}>
                      {prod.tipo === 'promo' && prod.slots.length ? 'Armar' : 'Agregar'} {money(prod.precio)}
                    </Btn>
                  )}
                </li>
              ))}
              {!resultados.length && <li className="px-4 py-8 text-center text-gris">No hay productos con “{busqueda}”.</li>}
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {categorias.map(c => {
                const n = enCarrito[c.id] ?? 0
                return (
                  <button key={c.id} onClick={() => setCategoria(c)}
                    className={`flex min-h-32 flex-col justify-between rounded-xl border border-linea border-t-[6px] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${colorTile[c.color]}`}>
                    <span className="font-cond text-2xl font-bold leading-tight">{c.nombre}</span>
                    <span className={`self-end font-cond text-5xl font-extrabold leading-none tabular-nums ${n ? 'text-tinta' : 'text-linea'}`}>{n}</span>
                  </button>
                )
              })}
            </div>
          )}
        </main>

        {/* ---- Pedido */}
        <aside className="flex max-h-[45dvh] flex-col border-t border-linea bg-papel lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
          <div className={`items-center justify-between px-4 pt-3 ${p.items.length ? 'flex' : 'hidden lg:flex'}`}>
            <h2 className="font-cond text-2xl font-bold">Pedido</h2>
            {p.items.length > 0 && <Btn tono="fantasma" onClick={() => p.restablecer()}>Vaciar</Btn>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {!p.items.length && (
              <p className="hidden py-8 text-center text-gris lg:block">Tocá una categoría o buscá un producto para empezar.</p>
            )}
            <ul className="space-y-2">
              {p.items.map(it => {
                const extra = [varianteLabel(it.variante), coccionLabel(it.coccion)].filter(Boolean).join(', ')
                return (
                  <li key={it.id} className="rounded-lg border border-linea bg-white p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-tight">{it.descripcion}{extra && <span className="font-normal text-gris"> ({extra})</span>}</div>
                        {it.componentes.length > 0 && (
                          <ul className="mt-1 text-sm leading-snug text-gris">
                            {it.componentes.map((c, i) => (
                              <li key={i}>{c.cantidad} {c.descripcion}{c.coccion ? ` (${coccionLabel(c.coccion)})` : ''}{c.variante === 'mitad' ? ' (Mitad)' : ''}</li>
                            ))}
                          </ul>
                        )}
                        {it.nota && notaAbierta !== it.id && <div className="mt-1 text-sm font-semibold text-tomate">Nota: {it.nota}</div>}
                      </div>
                      <div className="text-right font-semibold tabular-nums">{money(it.precioUnit * it.cantidad)}</div>
                    </div>
                    {notaAbierta === it.id && (
                      <input autoFocus defaultValue={it.nota} placeholder="Ej: sin aceitunas, bien cocida"
                        onBlur={e => { p.setNota(it.id, e.target.value.trim()); setNotaAbierta(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className={`${inputCls} mt-2 h-9 text-sm`} />
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <Stepper tam="sm" valor={it.cantidad} onChange={n => p.setCantidad(it.id, n)} />
                      <button onClick={() => setNotaAbierta(it.id)} className="ml-auto text-sm font-semibold text-pizarra hover:underline">
                        {it.nota ? 'Editar nota' : 'Nota'}
                      </button>
                      <button onClick={() => p.quitar(it.id)} className="text-sm font-semibold text-tomate hover:underline">Quitar</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="border-t border-linea px-4 py-3">
            <div className="flex justify-between text-[15px] text-gris"><span>{unidades} {unidades === 1 ? 'producto' : 'productos'}</span><span className="tabular-nums">{money(subtotal)}</span></div>
            {p.tipo === 'delivery' && <div className="flex justify-between text-[15px] text-gris"><span>Envío</span><span className="tabular-nums">{envio ? money(envio) : 'sin cargo'}</span></div>}
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-cond text-2xl font-bold">Total</span>
              <span className="font-cond text-4xl font-extrabold tabular-nums">{money(total)}</span>
            </div>
            <Btn tono="albahaca" grande className="mt-3 w-full" disabled={!p.items.length} onClick={() => setVerCobro(true)}>
              Revisar y cobrar <span className="text-sm font-normal opacity-80">F2</span>
            </Btn>
          </div>
        </aside>
      </div>

      {categoria && <CategoriaModal categoria={categoria} onClose={() => setCategoria(null)} onPromo={pr => setPromo(pr)} />}
      {promo && <PromoModal promo={promo} onClose={() => setPromo(null)} />}
      {verCliente && <ClienteModal onClose={() => setVerCliente(false)} />}
      {verCobro && <CobroModal onClose={() => setVerCobro(false)} />}
      {confirmarSalir && (
        <Confirmar
          texto="¿Descartar el pedido?"
          detalle={p.editandoId ? 'Los cambios que hiciste en esta comanda no se van a guardar.' : 'Se pierden los productos que cargaste.'}
          accion="Descartar"
          onNo={() => setConfirmarSalir(false)}
          onSi={() => { setConfirmarSalir(false); p.cerrar() }}
        />
      )}
    </div>
  )
}
