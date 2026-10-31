import { useEffect, useMemo, useRef, useState } from 'react'
import type { Comanda, TipoValor } from '../types'
import { FORMAS_PAGO } from '../types'
import { mensajeError, useApp, useLocalActivo, useNombreLocal } from '../store/app'
import { repo } from '../data'
import { normalizarCodigo, textoValor } from '../lib/descuentos'
import { faltaClienteMostrador, totales, usePedido } from '../store/pedido'
import { construirTicket } from '../lib/ticket'
import { money } from '../lib/format'
import { Btn, Campo, Modal, inputBase, inputCls } from './ui'
import { TicketPreview } from './TicketPreview'

/** Revisar el pedido, cobrar y mandar a la comandera */
export function CobroModal({ onClose }: { onClose: () => void }) {
  const p = usePedido()
  const { catalogo, comandas, impresoras, guardarPedido, sesion } = useApp()
  const esAdmin = sesion?.rol === 'admin'
  const sucursal = useNombreLocal()
  const local = useLocalActivo()
  const t = totales(p, catalogo.zonas, catalogo.productos, local)
  const { subtotal, envio, total } = t
  const [guardando, setGuardando] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [errCupon, setErrCupon] = useState('')
  const [validando, setValidando] = useState(false)

  const aplicarCupon = async () => {
    const cod = normalizarCodigo(codigo)
    if (!cod) return
    setValidando(true); setErrCupon('')
    try {
      p.set({ cupon: await repo.validarCupon(cod) })
      setCodigo('')
    } catch (e) { setErrCupon(mensajeError(e)) }
    setValidando(false)
  }

  // Si hay un solo pago por el total y el total cambia (cupón, descuento), el pago lo sigue
  const totalAnterior = useRef(total)
  useEffect(() => {
    const antes = totalAnterior.current
    totalAnterior.current = total
    if (antes !== total && p.pagos.length === 1 && Math.abs(p.pagos[0].monto - antes) < 0.01) p.setPago(0, { monto: total })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  // Primera vez: un pago por el total y "cobrado" según el tipo
  useEffect(() => {
    if (!p.pagos.length && !p.editandoId) {
      p.set({ pagos: [{ forma: 'efectivo', monto: total }], cobrada: p.tipo === 'mostrador' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const envioIncluido = p.items.some(i => catalogo.productos.find(x => x.id === i.productoId)?.incluyeEnvio)
  const pagado = p.pagos.reduce((s, x) => s + (x.monto || 0), 0)
  const vuelto = pagado - total

  const vistaPrevia = useMemo(() => {
    const c: Comanda = {
      id: 'preview', cajaId: '', numero: p.editandoNumero ?? Math.max(0, ...comandas.map(x => x.numero)) + 1,
      tipo: p.tipo, estado: 'pendiente', clienteNombre: p.clienteNombre || undefined, clienteTel: p.clienteTel || undefined,
      direccion: p.direccion || undefined, entreCalles: p.entreCalles || undefined, zonaId: p.zonaId,
      costoEnvio: envio, subtotal, descuento: t.descuento, adicional: t.adicional, total,
      cuponId: p.cupon?.id, cuponCodigo: p.cupon?.codigo, descuentoCupon: t.descuentoCupon,
      observaciones: p.observaciones || undefined, horaEntrega: p.horaEntrega || undefined,
      cobrada: p.cobrada, pagos: p.pagos.filter(x => x.monto > 0), items: p.items,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    return construirTicket(c, {
      ancho: impresoras[0]?.ancho ?? 48, tipo: p.editandoId ? 'reimpresion' : 'comanda',
      zonas: catalogo.zonas, nombreLocal: sucursal,
    })
  }, [p, envio, subtotal, total, t.descuento, t.adicional, t.descuentoCupon, comandas, impresoras, catalogo.zonas, sucursal])

  const guardar = async (imprimir: boolean) => {
    setGuardando(true)
    const ok = await guardarPedido(imprimir)
    setGuardando(false)
    if (ok) onClose()
  }

  const numero = (v: string) => (v === '' ? 0 : Math.max(0, Number(v.replace(',', '.')) || 0))
  const faltaCliente = faltaClienteMostrador(p)

  return (
    <Modal
      titulo={p.editandoId ? `Guardar cambios de la comanda #${p.editandoNumero}` : 'Revisar y cobrar'}
      onClose={onClose}
      ancho="max-w-5xl"
      alto
      pie={
        <div className="flex flex-wrap items-center gap-3">
          {faltaCliente && <p className="w-full text-right text-sm font-semibold text-tomate">{faltaCliente}: completalo arriba para poder guardar.</p>}
          <div className="mr-auto font-cond text-3xl font-bold">Total {money(total)}</div>
          <Btn onClick={onClose}>Seguir cargando</Btn>
          <Btn disabled={guardando || !!faltaCliente} onClick={() => guardar(false)}>Guardar sin imprimir</Btn>
          <Btn tono="albahaca" grande disabled={guardando || !!faltaCliente} onClick={() => guardar(true)}>
            {guardando ? 'Guardando…' : 'Guardar e imprimir'}
          </Btn>
        </div>
      }
    >
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          {p.tipo === 'mostrador' && (
            <section className="grid grid-cols-2 gap-3">
              <Campo label="Nombre del cliente *">
                <input id="cobro-nombre" value={p.clienteNombre} onChange={e => p.set({ clienteNombre: e.target.value })}
                  className={`${inputCls} ${faltaCliente && !p.clienteNombre.trim() ? 'border-tomate' : ''}`} autoComplete="off" />
              </Campo>
              <Campo label="Teléfono *">
                <input id="cobro-tel" type="tel" inputMode="tel" value={p.clienteTel} onChange={e => p.set({ clienteTel: e.target.value })}
                  className={`${inputCls} ${faltaCliente && p.clienteTel.replace(/\D/g, '').length < 6 ? 'border-tomate' : ''}`} autoComplete="off" />
              </Campo>
            </section>
          )}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo label="Para las">
              <input type="time" value={p.horaEntrega} onChange={e => p.set({ horaEntrega: e.target.value })} className={inputCls} />
            </Campo>
            {p.tipo === 'delivery' && (
              <Campo label="Envío">
                {esAdmin
                  ? <input inputMode="decimal" value={envio || ''} placeholder="0" onChange={e => p.set({ envioManual: numero(e.target.value) })} className={inputCls} />
                  : <div className={`${inputCls} flex items-center bg-harina font-semibold`}>{envio ? money(envio) : 'Sin cargo'}</div>}
                {envioIncluido && p.envioManual == null
                  ? <span className="mt-1 block text-xs text-albahaca">Incluido en la promo</span>
                  : p.envioManual == null && !p.zonaId && local?.recargoDelivery
                    ? <span className="mt-1 block text-xs text-gris">Recargo delivery {textoValor(local.recargoDeliveryTipo, local.recargoDelivery, money)}</span>
                    : null}
              </Campo>
            )}
          </section>

          {/* ---- Cupón */}
          <section>
            <span className="mb-1 block text-sm font-medium text-gris">Cupón de descuento</span>
            {p.cupon ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-albahaca-claro px-4 py-2.5 text-albahaca">
                <span className="font-mono text-lg font-semibold">{p.cupon.codigo}</span>
                <span className="text-[15px]">{textoValor(p.cupon.tipo, p.cupon.valor, money)} de descuento{p.cupon.descripcion ? ` · ${p.cupon.descripcion}` : ''}</span>
                <b className="ml-auto font-cond text-2xl tabular-nums">−{money(t.descuentoCupon)}</b>
                <button type="button" onClick={() => p.set({ cupon: undefined })} aria-label="Quitar cupón" title="Quitar cupón"
                  className="grid size-8 place-items-center rounded-full text-xl hover:bg-black/10">×</button>
              </div>
            ) : (
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); aplicarCupon() }}>
                <input id="cobro-cupon" value={codigo} onChange={e => { setCodigo(e.target.value.toUpperCase()); setErrCupon('') }}
                  placeholder="Código" autoComplete="off" aria-label="Código de cupón"
                  className={`${inputBase} min-w-0 flex-1 font-mono uppercase ${errCupon ? 'border-tomate' : ''}`} />
                <Btn type="submit" disabled={!codigo.trim() || validando}>{validando ? 'Validando…' : 'Aplicar'}</Btn>
              </form>
            )}
            {errCupon && <p className="mt-1 text-sm font-semibold text-tomate">{errCupon}</p>}
          </section>

          {/* ---- Descuento y adicional: solo admin */}
          {esAdmin ? (
            <section className="grid gap-3 sm:grid-cols-2">
              <ValorConTipo label="Descuento" valor={p.descuento} tipo={p.descuentoTipo} monto={t.descuentoManual}
                onChange={(valor, tipo) => p.set({ descuento: valor, descuentoTipo: tipo })} />
              <ValorConTipo label="Adicional" valor={p.adicional} tipo={p.adicionalTipo} monto={t.adicional}
                onChange={(valor, tipo) => p.set({ adicional: valor, adicionalTipo: tipo })} />
            </section>
          ) : (t.descuentoManual > 0 || t.adicional > 0) ? (
            <p className="rounded-lg bg-harina px-3 py-2 text-sm text-gris">
              Esta comanda tiene {t.descuentoManual > 0 ? `un descuento de ${money(t.descuentoManual)}` : ''}{t.descuentoManual > 0 && t.adicional > 0 ? ' y ' : ''}{t.adicional > 0 ? `un adicional de ${money(t.adicional)}` : ''} que cargó el administrador.
            </p>
          ) : null}

          <Campo label="Observaciones para cocina o delivery">
            <textarea rows={2} value={p.observaciones} onChange={e => p.set({ observaciones: e.target.value })}
              className={`${inputCls} h-auto py-2`} placeholder="Ej: tocar timbre del fondo" />
          </Campo>

          <section>
            <h3 className="mb-2 font-cond text-2xl font-bold">Pago</h3>
            <div className="space-y-2">
              {p.pagos.map((pg, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-linea bg-superficie p-2">
                  <div className="flex flex-wrap gap-1">
                    {FORMAS_PAGO.map(f => (
                      <button key={f.key} type="button" onClick={() => p.setPago(i, { forma: f.key })}
                        className={`h-10 rounded-lg px-3 font-semibold ${pg.forma === f.key ? 'bg-pizarra text-white' : 'bg-harina text-tinta hover:bg-linea'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm text-gris">{pg.forma === 'efectivo' ? 'Paga con' : 'Monto'}</span>
                    <input inputMode="decimal" value={pg.monto || ''} onChange={e => p.setPago(i, { monto: numero(e.target.value) })}
                      className={`${inputBase} w-32 text-right font-semibold`} />
                    {p.pagos.length > 1 && <Btn tono="fantasma" aria-label="Quitar pago" onClick={() => p.quitarPago(i)}>×</Btn>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Btn tono="fantasma" onClick={() => p.agregarPago('mercado_pago', Math.max(0, total - pagado))}>+ Dividir pago</Btn>
              <span className="ml-auto text-[15px]">
                {vuelto > 0.009 ? <>Vuelto <b className="font-cond text-2xl">{money(vuelto)}</b></>
                  : vuelto < -0.009 ? <span className="text-tomate">Falta {money(-vuelto)}</span>
                  : <span className="text-albahaca">Pago justo</span>}
              </span>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-linea bg-superficie px-4 py-3">
              <input type="checkbox" className="size-5 accent-albahaca" checked={p.cobrada} onChange={e => p.set({ cobrada: e.target.checked })} />
              <span className="font-semibold">Ya está cobrado</span>
              <span className="text-sm text-gris">{p.tipo === 'delivery' ? 'Dejalo sin marcar si cobra el repartidor' : 'Desmarcá si paga al retirar'}</span>
            </label>
          </section>

          <section className="rounded-xl bg-harina p-4 text-[15px]">
            <div className="flex justify-between"><span>Productos</span><span className="tabular-nums">{money(subtotal)}</span></div>
            {p.tipo === 'delivery' && <div className="flex justify-between"><span>Envío</span><span className="tabular-nums">{money(envio)}</span></div>}
            {t.adicional > 0 && <div className="flex justify-between"><span>Adicional{p.adicionalTipo === 'porc' ? ` (${p.adicional}%)` : ''}</span><span className="tabular-nums">{money(t.adicional)}</span></div>}
            {t.descuentoManual > 0 && <div className="flex justify-between text-albahaca"><span>Descuento{p.descuentoTipo === 'porc' ? ` (${p.descuento}%)` : ''}</span><span className="tabular-nums">−{money(t.descuentoManual)}</span></div>}
            {t.descuentoCupon > 0 && <div className="flex justify-between text-albahaca"><span>Cupón {p.cupon?.codigo}</span><span className="tabular-nums">−{money(t.descuentoCupon)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-linea pt-1 font-bold"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-2 text-sm font-medium text-gris">Así sale en la comandera</div>
          <div className="max-w-full overflow-x-auto pb-2">
            <TicketPreview lineas={vistaPrevia} ancho={impresoras[0]?.ancho ?? 48} />
          </div>
        </aside>
      </div>
    </Modal>
  )
}

/** Campo de monto con selector $ / % */
function ValorConTipo({ label, valor, tipo, monto, onChange }: {
  label: string; valor: number; tipo: TipoValor; monto: number; onChange: (valor: number, tipo: TipoValor) => void
}) {
  const id = `cobro-${label.toLowerCase()}`
  const numero = (v: string) => (v === '' ? 0 : Math.max(0, Number(v.replace(',', '.')) || 0))
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gris">{label}</label>
      <div className="flex gap-2">
        <input id={id} inputMode="decimal" value={valor || ''} placeholder="0"
          onChange={e => onChange(tipo === 'porc' ? Math.min(100, numero(e.target.value)) : numero(e.target.value), tipo)}
          className={`${inputBase} min-w-0 flex-1 text-right`} />
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-linea" role="group" aria-label={`${label} en pesos o porcentaje`}>
          {(['monto', 'porc'] as const).map(k => (
            <button key={k} type="button" aria-pressed={tipo === k} onClick={() => onChange(k === 'porc' ? Math.min(100, valor) : valor, k)}
              className={`h-11 w-11 font-semibold ${tipo === k ? 'bg-primario text-sobre-primario' : 'bg-superficie hover:bg-harina'}`}>{k === 'porc' ? '%' : '$'}</button>
          ))}
        </div>
      </div>
      {tipo === 'porc' && valor > 0 && <span className="mt-1 block text-xs text-gris">{valor}% de los productos = {money(monto)}</span>}
    </div>
  )
}
