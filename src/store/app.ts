import { calcularTotales } from '../lib/caja'
import { create } from 'zustand'
import { repo } from '../data'
import type { Catalogo, MenuData } from '../data/repo'
import type { Caja, Comanda, EstadoComanda, Impresora, MovimientoCaja, NuevaComanda, Pago, PedidoExterno, PrintJob, Repartidor, Sesion, Sucursal, TipoGasto } from '../types'
import { interpretarPedido } from '../lib/pedidosya'
import { jobsParaComanda, ticketPrueba, ticketCierre } from '../lib/ticket'
import { resolverCatalogo } from '../lib/menu'
import { usePedido, totales, faltaClienteMostrador } from './pedido'

interface Toast { id: number; texto: string; tipo: 'ok' | 'error' }

const KEY_LOCAL = 'comandas-local-activo'
const leerLocal = () => { try { return localStorage.getItem(KEY_LOCAL) } catch { return null } }
const guardarLocal = (id: string) => { try { localStorage.setItem(KEY_LOCAL, id) } catch { /* noop */ } }

interface AppState {
  cargando: boolean
  error?: string
  sesion: Sesion | null
  sucursales: Sucursal[]
  /** Local que se está operando */
  sucursalId: string | null
  menu: MenuData
  catalogo: Catalogo
  caja: Caja | null
  comandas: Comanda[]
  impresoras: Impresora[]
  repartidores: Repartidor[]
  movimientos: MovimientoCaja[]
  tiposGasto: TipoGasto[]
  printJobs: PrintJob[]
  /** Pedidos capturados de PedidosYa (null = la base todavía no tiene la migración 0010) */
  pedidosExternos: PedidoExterno[] | null
  toasts: Toast[]

  iniciar(sesion: Sesion): Promise<void>
  cambiarLocal(id: string): Promise<void>
  refrescar(): Promise<void>
  refrescarMenu(): Promise<void>
  salir(): Promise<void>
  abrirCaja(turno: string, dineroInicial: number): Promise<void>
  cerrarCaja(dineroCierre: number, observaciones?: string): Promise<boolean>
  reabrirCaja(id: string): Promise<void>
  agregarMovimiento(m: Pick<MovimientoCaja, 'tipo' | 'tipoGastoId' | 'concepto' | 'monto'>): Promise<boolean>
  eliminarMovimiento(id: string): Promise<void>
  /** aCocina: con la pantalla de cocina activa, la deja directo en cocina (sin imprimir) */
  guardarPedido(imprimir: boolean, aCocina?: boolean): Promise<Comanda | null>
  /** Cocina: el pedido pasa a preparación (no se imprime) */
  pasarACocina(c: Comanda): Promise<void>
  /** Imprime el cierre de una caja (o el parcial si sigue abierta) en una comandera del local */
  imprimirCierre(caja: Caja, impresoraId?: string): Promise<boolean>
  /** Cocina: pedido listo, recién ahí se imprime el ticket */
  marcarListo(c: Comanda): Promise<void>
  /** Cocina: deshace un "listo" por error */
  volverACocina(c: Comanda): Promise<void>
  cambiarEstado(c: Comanda, estado: EstadoComanda): Promise<void>
  marcarCobrada(c: Comanda, cobrada: boolean): Promise<void>
  asignarRepartidor(c: Comanda, repartidorId: string): Promise<boolean>
  quitarRepartidor(c: Comanda): Promise<boolean>
  entregar(c: Comanda, pagos: Pago[], cobrada: boolean): Promise<boolean>
  cargarRepartidores(): Promise<void>
  reimprimir(c: Comanda): Promise<void>
  anular(c: Comanda): Promise<void>
  imprimirPrueba(i: Impresora): Promise<void>
  marcarAgotado(productoId: string, agotado: boolean): Promise<void>
  avisar(texto: string, tipo?: Toast['tipo']): void
  cargarExternos(): Promise<void>
  /** Importa los pedidos capturados pendientes (lo corre cualquier PC con la caja abierta) */
  procesarExternos(): Promise<void>
}

let toastSeq = 0
let procesandoExternos = false
const avisados = new Set<string>()
const menuVacio: MenuData = { categorias: [], productos: [], ajustes: [], ingredientes: [] }

/** Recargo de delivery del local activo */
export const useLocalActivo = () => useApp(s => s.sucursales.find(x => x.id === s.sucursalId))
/** El local trabaja con pantalla de cocina */
export const useCocinaActiva = () => useApp(s => !!s.sucursales.find(x => x.id === s.sucursalId)?.cocinaActiva)

export const mensajeError = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)

export const useApp = create<AppState>((set, get) => {
  const fallo = (e: unknown) => get().avisar(mensajeError(e), 'error')

  const nombreLocal = () => get().sucursales.find(s => s.id === get().sucursalId)?.nombre ?? ''

  const encolar = async (c: Comanda, tipo: 'comanda' | 'reimpresion' | 'anulacion') => {
    const { impresoras, catalogo } = get()
    if (!impresoras.length) { get().avisar('Este local no tiene comanderas configuradas', 'error'); return }
    await repo.encolarImpresion(jobsParaComanda(c, impresoras, tipo, { zonas: catalogo.zonas, nombreLocal: nombreLocal() }))
  }

  return {
    cargando: true,
    sesion: null,
    sucursales: [],
    sucursalId: null,
    menu: menuVacio,
    catalogo: { categorias: [], productos: [], zonas: [] },
    caja: null,
    comandas: [],
    impresoras: [],
    repartidores: [],
    movimientos: [],
    tiposGasto: [],
    printJobs: [],
    pedidosExternos: null,
    toasts: [],

    async iniciar(sesion) {
      set({ cargando: true, error: undefined, sesion })
      try {
        const sucursales = (await repo.listSucursales()).filter(s => s.activa)
        if (!sucursales.length) throw new Error('Tu usuario no tiene ningún local activo asignado.')
        const guardado = leerLocal()
        const sucursalId = sesion.rol === 'local'
          ? sesion.sucursalId!
          : sucursales.find(s => s.id === guardado)?.id ?? sucursales.find(s => s.esPrincipal)?.id ?? sucursales[0].id
        set({ sucursales })
        await get().cambiarLocal(sucursalId)
        set({ cargando: false })
      } catch (e) {
        set({ cargando: false, error: mensajeError(e) })
      }
    },

    async cambiarLocal(id) {
      guardarLocal(id)
      set({ sucursalId: id, caja: null, comandas: [], printJobs: [] })
      const [impresoras, repartidores, tiposGasto] = await Promise.all([repo.listImpresoras(id), repo.listRepartidores(id), repo.listTiposGasto(), get().refrescarMenu()])
      set({ impresoras, repartidores, tiposGasto })
      await get().refrescar()
    },

    async refrescarMenu() {
      const id = get().sucursalId
      if (!id) return
      const [menu, zonas, sucursales] = await Promise.all([repo.getMenu(id), repo.listZonas(id), repo.listSucursales()])
      // también los locales: el recargo de delivery puede haber cambiado
      set({ menu, catalogo: resolverCatalogo(menu, zonas, id), sucursales: sucursales.filter(s => s.activa) })
    },

    async refrescar() {
      const id = get().sucursalId
      if (!id) return
      const caja = await repo.getCajaAbierta(id)
      const [comandas, printJobs] = await Promise.all([
        caja ? repo.listComandas(caja.id) : Promise.resolve([]),
        repo.listPrintJobs(id, 40),
      ])
      const movimientos = caja ? await repo.listMovimientos(caja.id) : []
      set({ caja, comandas, printJobs, movimientos })
    },

    async salir() {
      usePedido.getState().cerrar()
      await repo.logout()
      set({ sesion: null, sucursales: [], sucursalId: null, caja: null, comandas: [], menu: menuVacio, cargando: true })
    },

    async abrirCaja(turno, dineroInicial) {
      const id = get().sucursalId
      if (!id) return
      try {
        const caja = await repo.abrirCaja(id, turno, dineroInicial)
        set({ caja })
        await get().refrescar()
        get().avisar(`Caja ${turno.toLowerCase()} abierta`)
      } catch (e) { fallo(e) }
    },

    async cerrarCaja(dineroCierre, observaciones) {
      const caja = get().caja
      if (!caja) return false
      try {
        await repo.cerrarCaja(caja.id, dineroCierre, observaciones)
        set({ caja: null, comandas: [], movimientos: [] })
        get().avisar('Caja cerrada')
        return true
      } catch (e) { fallo(e); return false }
    },

    async reabrirCaja(id) {
      try {
        await repo.reabrirCaja(id)
        await get().refrescar()
        get().avisar('Caja reabierta: seguís con la misma numeración')
      } catch (e) { fallo(e) }
    },

    async agregarMovimiento(m) {
      const caja = get().caja
      if (!caja) return false
      try {
        await repo.agregarMovimiento(caja.id, m)
        set({ movimientos: await repo.listMovimientos(caja.id) })
        return true
      } catch (e) { fallo(e); return false }
    },

    async eliminarMovimiento(id) {
      const caja = get().caja
      if (!caja) return
      try {
        await repo.eliminarMovimiento(id)
        set({ movimientos: await repo.listMovimientos(caja.id) })
      } catch (e) { fallo(e) }
    },

    async guardarPedido(imprimir, aCocina) {
      const p = usePedido.getState()
      const { caja, catalogo, sucursales, sucursalId, sesion } = get()
      if (!caja) { get().avisar('Abrí la caja antes de cargar pedidos', 'error'); return null }
      if (!p.items.length) { get().avisar('El pedido no tiene productos', 'error'); return null }
      const faltaCliente = faltaClienteMostrador(p)
      if (faltaCliente) { get().avisar(faltaCliente, 'error'); return null }
      if (!sesion?.puedeDescontar && !p.editandoId && (p.descuento > 0 || p.adicional > 0)) {
        get().avisar('Solo el administrador o un encargado pueden aplicar descuentos o adicionales', 'error'); return null
      }
      const t = totales(p, catalogo.zonas, catalogo.productos, sucursales.find(s => s.id === sucursalId))
      const { subtotal, envio, total } = t
      const data: NuevaComanda = {
        tipo: p.tipo,
        clienteId: p.clienteId,
        clienteNombre: p.clienteNombre.trim() || undefined,
        clienteTel: p.clienteTel.trim() || undefined,
        direccion: p.tipo === 'delivery' ? p.direccion.trim() || undefined : undefined,
        entreCalles: p.tipo === 'delivery' ? p.entreCalles.trim() || undefined : undefined,
        zonaId: p.tipo === 'delivery' ? p.zonaId : undefined,
        costoEnvio: envio,
        subtotal,
        descuento: t.descuento,
        adicional: t.adicional,
        cuponId: p.cupon?.id,
        cuponCodigo: p.cupon?.codigo,
        descuentoCupon: t.descuentoCupon,
        total,
        observaciones: p.observaciones.trim() || undefined,
        horaEntrega: p.horaEntrega || undefined,
        cobrada: p.cobrada,
        pagos: p.pagos.filter(x => x.monto > 0),
        items: p.items,
      }
      try {
        if (p.tipo === 'delivery' && data.clienteNombre && (data.clienteTel || data.direccion)) {
          const cli = await repo.guardarCliente({
            id: p.clienteId, nombre: data.clienteNombre, telefono: data.clienteTel,
            direccion: data.direccion, entreCalles: data.entreCalles, zonaId: data.zonaId,
          })
          data.clienteId = cli.id
        }
        const editando = p.editandoId
        const c = editando ? await repo.actualizarComanda(editando, data) : await repo.crearComanda(caja.id, data)
        if (aCocina && c.estado === 'pendiente') await repo.cambiarEstado(c.id, 'en_preparacion')
        else if (imprimir) await encolar(c, editando ? 'reimpresion' : 'comanda')
        p.cerrar()
        get().avisar(`Comanda #${c.numero} ${editando ? 'actualizada' : 'guardada'}${aCocina && c.estado === 'pendiente' ? ' y pasada a cocina' : imprimir ? ' y enviada a imprimir' : ''}`)
        await get().refrescar()
        return c
      } catch (e) { fallo(e); return null }
    },

    async cambiarEstado(c, estado) {
      try { await repo.cambiarEstado(c.id, estado); await get().refrescar() } catch (e) { fallo(e) }
    },

    async imprimirCierre(caja, impresoraId) {
      try {
        const { impresoras } = get()
        const imp = impresoras.find(i => i.id === impresoraId) ?? impresoras.find(i => i.imprimeMostrador) ?? impresoras[0]
        if (!imp) { get().avisar('Este local no tiene comanderas configuradas', 'error'); return false }
        const [comandas, movimientos] = await Promise.all([repo.listComandas(caja.id), repo.listMovimientos(caja.id)])
        const totales = caja.totales ?? calcularTotales(caja, comandas, movimientos)
        await repo.encolarImpresion([{
          impresoraId: imp.id, tipo: 'cierre', copias: 1,
          contenido: ticketCierre({ caja, totales, comandas, movimientos, nombreLocal: nombreLocal() }, imp.ancho),
        }])
        get().avisar(`Cierre enviado a imprimir en ${imp.nombre}`)
        return true
      } catch (e) { fallo(e); return false }
    },

    async pasarACocina(c) {
      try {
        await repo.cambiarEstado(c.id, 'en_preparacion')
        get().avisar(`Comanda #${c.numero} pasada a cocina`)
        await get().refrescar()
      } catch (e) { fallo(e) }
    },

    async marcarListo(c) {
      try {
        await repo.cambiarEstado(c.id, 'listo')
        // El ticket sale recién ahora, para pegarlo en el pedido
        await encolar({ ...c, estado: 'listo' }, 'comanda')
        await get().refrescar()
      } catch (e) { fallo(e) }
    },

    async volverACocina(c) {
      try {
        await repo.cambiarEstado(c.id, 'en_preparacion')
        get().avisar(`Comanda #${c.numero} volvió a cocina`)
        await get().refrescar()
      } catch (e) { fallo(e) }
    },

    async marcarCobrada(c, cobrada) {
      try { await repo.marcarCobrada(c.id, cobrada); await get().refrescar() } catch (e) { fallo(e) }
    },

    async asignarRepartidor(c, repartidorId) {
      try {
        await repo.asignarRepartidor(c.id, repartidorId)
        const r = get().repartidores.find(x => x.id === repartidorId)
        get().avisar(`Comanda #${c.numero} salió con ${r?.nombre ?? 'el repartidor'}`)
        await get().refrescar()
        return true
      } catch (e) { fallo(e); return false }
    },

    async quitarRepartidor(c) {
      try {
        await repo.quitarRepartidor(c.id)
        get().avisar(`Comanda #${c.numero}: se quitó a ${c.repartidorNombre ?? 'la moto'}`)
        await get().refrescar()
        return true
      } catch (e) { fallo(e); return false }
    },

    async entregar(c, pagos, cobrada) {
      try {
        await repo.entregarComanda(c.id, pagos.filter(p => p.monto > 0), cobrada)
        get().avisar(`Comanda #${c.numero} entregada`)
        await get().refrescar()
        return true
      } catch (e) { fallo(e); return false }
    },

    async cargarRepartidores() {
      const id = get().sucursalId
      if (id) set({ repartidores: await repo.listRepartidores(id) })
    },

    async reimprimir(c) {
      try {
        await encolar(c, 'reimpresion')
        get().avisar(`Comanda #${c.numero} enviada a reimprimir`)
        await get().refrescar()
      } catch (e) { fallo(e) }
    },

    async anular(c) {
      try {
        await repo.cambiarEstado(c.id, 'anulada')
        await encolar({ ...c, estado: 'anulada' }, 'anulacion')
        get().avisar(`Comanda #${c.numero} anulada`)
        await get().refrescar()
      } catch (e) { fallo(e) }
    },

    async imprimirPrueba(i) {
      try {
        await repo.encolarImpresion([{ impresoraId: i.id, tipo: 'prueba', copias: 1, contenido: ticketPrueba(i, nombreLocal()) }])
        get().avisar(`Prueba enviada a ${i.nombre}`)
        await get().refrescar()
      } catch (e) { fallo(e) }
    },

    async marcarAgotado(productoId, agotado) {
      const { sucursalId, menu } = get()
      if (!sucursalId) return
      try {
        // Vale igual para productos del menú madre y propios del local
        const prod = menu.productos.find(p => p.id === productoId)
        const actual = menu.ajustes.find(a => a.productoId === productoId)
        await repo.guardarAjuste(sucursalId, { productoId, oculto: false, ...actual, agotado })
        await get().refrescarMenu()
        get().avisar(agotado ? `${prod?.nombre ?? 'Producto'} marcado como agotado` : `${prod?.nombre ?? 'Producto'} disponible de nuevo`)
      } catch (e) { fallo(e) }
    },

    async cargarExternos() {
      const id = get().sucursalId
      if (!id) return
      try { set({ pedidosExternos: await repo.listPedidosExternos(id) }) } catch { set({ pedidosExternos: null }) }
    },

    async procesarExternos() {
      if (procesandoExternos) return
      procesandoExternos = true
      try {
        await get().cargarExternos()
        const { caja, catalogo, pedidosExternos } = get()
        if (!caja || !pedidosExternos) return
        const limite = Date.now() - 24 * 3600_000
        const pendientes = pedidosExternos.filter(p => p.estado === 'pendiente' && new Date(p.createdAt).getTime() > limite).reverse()
        if (!pendientes.length) return
        const mapeos = await repo.listMapeos()
        let importados = 0
        for (const p of pendientes) {
          if (p.formato === 'imagen') {
            await repo.marcarPedidoExterno(p.id, 'error', 'El ticket llegó como imagen y no se puede leer. La impresora virtual tiene que usar el driver "Generic / Text Only".')
            continue
          }
          const r = interpretarPedido(p.texto, catalogo.productos, mapeos)
          if (r.error || !r.importacion) {
            await repo.marcarPedidoExterno(p.id, 'error', r.error, { ticket: r.ticket })
            if (!avisados.has(p.id)) { avisados.add(p.id); get().avisar(`PedidosYa${r.ticket.numero ? ` #${r.ticket.numero}` : ''}: ${r.error}. Revisalo en el botón PedidosYa.`, 'error') }
            continue
          }
          try {
            const comandaId = await repo.importarPedidoExterno(p.id, r.importacion)
            if (comandaId) { importados++; get().avisar(`Pedido PedidosYa${r.importacion.numeroExterno ? ` #${r.importacion.numeroExterno}` : ''} importado`) }
          } catch (e) {
            await repo.marcarPedidoExterno(p.id, 'error', mensajeError(e), { ticket: r.ticket }).catch(() => {})
          }
        }
        if (importados) await get().refrescar()
        await get().cargarExternos()
      } catch { /* sin conexión: se reintenta en el próximo ciclo */ } finally { procesandoExternos = false }
    },

    avisar(texto, tipo = 'ok') {
      const id = ++toastSeq
      set(s => ({ toasts: [...s.toasts, { id, texto, tipo }] }))
      setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), tipo === 'error' ? 6000 : 3000)
    },
  }
})

/** Nombre del local que se está operando */
export const useNombreLocal = () => useApp(s => s.sucursales.find(x => x.id === s.sucursalId)?.nombre ?? '')
