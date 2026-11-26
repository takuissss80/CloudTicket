/**
 * Importación de pedidos de PedidosYa en el servidor (Edge Function "pedidosya").
 * Usa el mismo lector de tickets y la misma asociación de productos que la web,
 * así un pedido se interpreta igual lo importe quien lo importe.
 *
 * Corre con la service role key: por eso todo se filtra a mano por cuenta y local.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { interpretarPedido } from '../lib/pedidosya'
import { resolverCatalogo } from '../lib/menu'
import { datosImportacion, mapCategoria, mapProducto, SELECT_PRODUCTO } from '../data/supabaseRepo'
import type { MenuData } from '../data/repo'
import type { MapeoExterno } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export interface ResultadoImportacion { id: string; estado: 'importado' | 'error' | 'pendiente' | 'repetido'; detalle?: string }

const ERROR_IMAGEN = 'El ticket llegó como imagen y no se puede leer. La impresora virtual tiene que usar el driver "Generic / Text Only".'

async function menuDelLocal(sb: SupabaseClient, cuentaId: string, sucursalId: string): Promise<MenuData> {
  const filtroLocal = `sucursal_id.is.null,sucursal_id.eq.${sucursalId}`
  const [cats, prods, ajustes, ocultas] = await Promise.all([
    sb.from('categorias').select('*').eq('cuenta_id', cuentaId).or(filtroLocal).order('orden'),
    sb.from('productos').select(SELECT_PRODUCTO).eq('cuenta_id', cuentaId).or(filtroLocal).order('orden'),
    sb.from('producto_sucursal').select('*').eq('sucursal_id', sucursalId),
    sb.from('categoria_sucursal').select('*').eq('sucursal_id', sucursalId),
  ])
  for (const r of [cats, prods, ajustes]) if (r.error) throw new Error(r.error.message)
  const filasOcultas = ocultas.error ? [] : (ocultas.data as Row[])
  return {
    categorias: (cats.data as Row[]).map(mapCategoria),
    productos: (prods.data as Row[]).map(mapProducto),
    ajustes: (ajustes.data as Row[]).map(a => ({
      productoId: a.producto_id, precio: a.precio == null ? undefined : Number(a.precio),
      precioMitad: a.precio_mitad == null ? undefined : Number(a.precio_mitad), oculto: a.oculto, agotado: a.agotado,
    })),
    ingredientes: [],
    categoriasOcultas: filasOcultas.filter(r => (r.modo ?? 'oculta') === 'oculta').map(r => r.categoria_id as string),
    categoriasSueltas: filasOcultas.filter(r => r.modo === 'suelta').map(r => r.categoria_id as string),
  }
}

async function mapeosDeCuenta(sb: SupabaseClient, cuentaId: string): Promise<MapeoExterno[]> {
  const r = await sb.from('mapeos_externos').select('*').eq('cuenta_id', cuentaId)
  if (r.error) throw new Error(r.error.message)
  return (r.data as Row[]).map(m => ({
    id: m.id, canal: m.canal, texto: m.texto, productoId: m.producto_id ?? undefined, variante: m.variante ?? undefined, ignorar: m.ignorar,
  }))
}

async function marcarError(sb: SupabaseClient, id: string, error: string, datos?: unknown) {
  const fila: Row = { estado: 'error', error }
  if (datos !== undefined) fila.datos = datos
  // no pisa uno que mientras tanto se importó (por ejemplo, desde la web)
  await sb.from('pedidos_externos').update(fila).eq('id', id).in('estado', ['pendiente', 'procesando', 'error'])
}

/**
 * Importa los pedidos pendientes (de las últimas 24 h) de un pedido puntual o de un local.
 * Si el local no tiene la caja abierta, quedan pendientes: entran cuando se abre.
 */
export async function importarPendientes(sb: SupabaseClient, filtro: { id?: string; sucursalId?: string }): Promise<ResultadoImportacion[]> {
  if (!filtro.id && !filtro.sucursalId) return []
  let q = sb.from('pedidos_externos').select('id, sucursal_id, texto, formato, created_at')
    .eq('estado', 'pendiente').gt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('created_at').limit(30)
  q = filtro.id ? q.eq('id', filtro.id) : q.eq('sucursal_id', filtro.sucursalId!)
  const { data: pendientes, error } = await q
  if (error) throw new Error(error.message)
  if (!pendientes?.length) return []

  const resultados: ResultadoImportacion[] = []
  const porLocal = new Map<string, Row[]>()
  for (const p of pendientes as Row[]) porLocal.set(p.sucursal_id, [...(porLocal.get(p.sucursal_id) ?? []), p])

  for (const [sucursalId, lista] of porLocal) {
    const caja = await sb.from('cajas').select('id').eq('sucursal_id', sucursalId).eq('estado', 'abierta').maybeSingle()
    if (!caja.data) {
      for (const p of lista) resultados.push({ id: p.id, estado: 'pendiente', detalle: 'Sin caja abierta' })
      continue
    }
    const suc = await sb.from('sucursales').select('cuenta_id').eq('id', sucursalId).single()
    if (suc.error) throw new Error(suc.error.message)
    const cuentaId = suc.data.cuenta_id as string
    const [menu, mapeos] = await Promise.all([menuDelLocal(sb, cuentaId, sucursalId), mapeosDeCuenta(sb, cuentaId)])
    const productos = resolverCatalogo(menu, [], sucursalId).productos

    for (const p of lista) {
      if (p.formato === 'imagen') {
        await marcarError(sb, p.id, ERROR_IMAGEN)
        resultados.push({ id: p.id, estado: 'error', detalle: ERROR_IMAGEN })
        continue
      }
      const r = interpretarPedido(p.texto, productos, mapeos)
      if (r.error || !r.importacion) {
        await marcarError(sb, p.id, r.error ?? 'No se pudo leer el ticket', { ticket: r.ticket })
        resultados.push({ id: p.id, estado: 'error', detalle: r.error })
        continue
      }
      const imp = await sb.rpc('importar_pedido_externo_servidor', { p_id: p.id, p_datos: datosImportacion(r.importacion) })
      if (imp.error) {
        await marcarError(sb, p.id, imp.error.message, { ticket: r.ticket })
        resultados.push({ id: p.id, estado: 'error', detalle: imp.error.message })
      } else {
        resultados.push({ id: p.id, estado: imp.data ? 'importado' : 'repetido' })
      }
    }
  }
  return resultados
}
