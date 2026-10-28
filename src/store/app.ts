import { create } from 'zustand'
import { repo } from '../data'
import type { Catalogo, MenuData } from '../data/repo'
import type { Caja, Comanda, EstadoComanda, Impresora, MovimientoCaja, NuevaComanda, Pago, PrintJob, Repartidor, Sesion, Sucursal, TipoGasto } from '../types'
import { jobsParaComanda, ticketPrueba } from '../lib/ticket'
import { resolverCatalogo } from '../lib/menu'
import { usePedido, totales } from './pedido'

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
  guardarPedido(imprimir: boolean): Promise<Comanda | null>
  cambiarEstado(c: Comanda, estado: EstadoComanda): Promise<void>
  marcarCobrada(c: Comanda, cobrada: boolean): Promise<void>
  asignarRepartidor(c: Comanda, repartidorId: string): Promise<boolean>
  entregar(c: Comanda, pagos: Pago[], cobrada: boolean): Promise<boolean>
  cargarRepartidores(): Promise<void>
  reimprimir(c: Comanda): Promise<void>
  anular(c: Comanda): Promise<void>
  imprimirPrueba(i: Impresora): Promise<void>
  marcarAgotado(productoId: string, agotado: boolean): Promise<void>
  avisar(texto: string, tipo?: Toast['tipo']): void
}

let toastSeq = 0
const menuVacio: MenuData = { categorias: [], productos: [], ajustes: [], ingredientes: [] }

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
      const [menu, zonas] = await Promise.all([repo.getMenu(id), repo.listZonas(id)])
      set({ menu, catalogo: resolverCatalogo(menu, zonas, id) })
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

    async guardarPedido(imprimir) {
      const p = usePedido.getState()
      const { caja, catalogo } = get()
      if (!caja) { get().avisar('Abrí la caja antes de cargar pedidos', 'error'); return null }
      if (!p.items.length) { get().avisar('El pedido no tiene productos', 'error'); return null }
      const { subtotal, envio, total } = totales(p, catalogo.zonas, catalogo.productos)
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
        descuento: p.descuento || 0,
        adicional: p.adicional || 0,
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
        if (imprimir) await encolar(c, editando ? 'reimpresion' : 'comanda')
        p.cerrar()
        get().avisar(`Comanda #${c.numero} ${editando ? 'actualizada' : 'guardada'}${imprimir ? ' y enviada a imprimir' : ''}`)
        await get().refrescar()
        return c
      } catch (e) { fallo(e); return null }
    },

    async cambiarEstado(c, estado) {
      try { await repo.cambiarEstado(c.id, estado); await get().refrescar() } catch (e) { fallo(e) }
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
        await repo.encolarImpresion([{ impresoraId: i.id, tipo: 'prueba', copias: 1, contenido: ticketPrueba(i) }])
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

    avisar(texto, tipo = 'ok') {
      const id = ++toastSeq
      set(s => ({ toasts: [...s.toasts, { id, texto, tipo }] }))
      setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), tipo === 'error' ? 6000 : 3000)
    },
  }
})

/** Nombre del local que se está operando */
export const useNombreLocal = () => useApp(s => s.sucursales.find(x => x.id === s.sucursalId)?.nombre ?? '')
