import type {
  AjusteLocal, Caja, Categoria, Cliente, Comanda, Cupon, ImportacionPedido, MapeoExterno, PedidoExterno, CuponAplicado, UsoCupon, EstadoComanda, Impresora, Ingrediente, NuevaComanda,
  IngresoMercaderia, MovimientoCaja, MovimientoReporte, NuevoIngreso, Pago, PrintJob, StockItem, StockMovimiento, TipoMovStock, Producto, Repartidor, TipoGasto, Sesion, Sucursal, TipoPrintJob, LineaTicket, Usuario, Zona, PedidoFabrica, PlanillaFabricaItem, TipoUsuario,
} from '../types'

/** Catálogo listo para vender en un local (precios del local, sin ocultos) */
export interface Catalogo {
  categorias: Categoria[]
  productos: Producto[]
  zonas: Zona[]
}

/** Menú tal como está cargado (para administrar) */
export interface MenuData {
  categorias: Categoria[]
  /** Menú madre + productos propios del local pedido */
  productos: Producto[]
  /** Ajustes del local pedido sobre el menú madre */
  ajustes: AjusteLocal[]
  ingredientes: Ingrediente[]
}

export interface NuevoPrintJob {
  impresoraId: string
  comandaId?: string
  tipo: TipoPrintJob
  contenido: LineaTicket[]
  copias: number
}

export interface BusquedaCliente {
  nombre?: string
  telefono?: string
  direccion?: string
}

export type EstadoSesion =
  | { estado: 'sin_login' }
  | { estado: 'sin_cuenta'; email: string }   // logueado, pero todavía no creó su cuenta
  | { estado: 'ok'; sesion: Sesion }

export interface CambioProducto { id: string; precio: number; precioMitad?: number; activo: boolean }

/** En la planilla de fábrica: ingrediente = su id; producto = "p:" + su id */
export const PREFIJO_PRODUCTO = 'p:'
export const productoDePlanilla = (clave: string) => (clave.startsWith(PREFIJO_PRODUCTO) ? clave.slice(PREFIJO_PRODUCTO.length) : undefined)

export type ProductoEdicion = Omit<Producto, 'id' | 'agotado'> & { id?: string }
export type CategoriaEdicion = Omit<Categoria, 'id'> & { id?: string }
export type IngredienteEdicion = Omit<Ingrediente, 'id'> & { id?: string }

/**
 * Capa de datos. Dos implementaciones:
 *  - localRepo:    modo demo, todo en el navegador
 *  - supabaseRepo: base real con RLS
 */
export interface Repo {
  modo: 'demo' | 'supabase'

  // ---- Sesión
  estadoSesion(): Promise<EstadoSesion>
  /** usuario de local, o email del admin */
  login(usuario: string, password: string): Promise<void>
  logout(): Promise<void>
  /** Alta de un admin nuevo (después llama a crearCuenta) */
  registrar?(email: string, password: string): Promise<{ requiereConfirmacion: boolean }>
  crearCuenta(nombreCuenta: string, nombreLocal: string): Promise<void>
  onAuthChange(cb: () => void): () => void

  // ---- Locales y usuarios (admin)
  listSucursales(): Promise<Sucursal[]>
  crearSucursal(nombre: string): Promise<Sucursal>
  /** Pantalla de cocina del local (admin o encargado del local) */
  configCocina(sucursalId: string, c: { activa: boolean; amarillo: number; rojo: number }): Promise<void>
  /** Hora de la base, para corregir el reloj de la PC */
  horaServidor(): Promise<string>
  actualizarSucursal(id: string, data: Partial<Pick<Sucursal, 'nombre' | 'activa' | 'recargoDelivery' | 'recargoDeliveryTipo'>>): Promise<void>

  // ---- Cupones (admin crea; cualquiera valida un código)
  listCupones(): Promise<Cupon[]>
  guardarCupon(c: Omit<Cupon, 'id'> & { id?: string }): Promise<void>
  eliminarCupon(id: string): Promise<void>
  /** Lote: crea muchos cupones de una vez */
  crearCupones(cupones: Omit<Cupon, 'id'>[]): Promise<number>
  eliminarCupones(ids: string[]): Promise<void>
  activarCupones(ids: string[], activo: boolean): Promise<void>
  /** Usos (comandas no anuladas) y total descontado por cupón */
  usoCupones(): Promise<Record<string, UsoCupon>>
  /** Valida un código para usarlo hoy; tira error con el motivo si no sirve */
  validarCupon(codigo: string): Promise<CuponAplicado>
  listUsuarios(): Promise<Usuario[]>
  crearUsuario(data: { usuario: string; password: string; sucursalId: string; nombre?: string; puedeDescontar?: boolean; tipo?: TipoUsuario }): Promise<void>
  /** Común (false) o encargado (true) */
  setPuedeDescontar(userId: string, valor: boolean): Promise<void>
  /** Común / Encargado / Producción (solo admin) */
  setTipoUsuario(userId: string, tipo: TipoUsuario): Promise<void>
  cambiarPassword(userId: string, password: string): Promise<void>
  eliminarUsuario(userId: string): Promise<void>

  // ---- Menú
  /** sucursalId null = solo menú madre */
  getMenu(sucursalId: string | null): Promise<MenuData>
  guardarCategoria(c: CategoriaEdicion): Promise<Categoria>
  guardarProducto(p: ProductoEdicion): Promise<Producto>
  /** Cambia precio, precio mitad y activo de varios productos a la vez (no toca recetas) */
  actualizarProductos(cambios: CambioProducto[]): Promise<void>
  guardarAjuste(sucursalId: string, a: AjusteLocal): Promise<void>
  quitarAjuste(sucursalId: string, productoId: string): Promise<void>
  aumentarPrecios(categoriaId: string, porcentaje: number, sucursalId: string | null, redondeo: number): Promise<number>
  guardarIngrediente(i: IngredienteEdicion): Promise<Ingrediente>
  /** Borra un ingrediente. Falla si alguna receta (de cualquier local) lo usa. */
  eliminarIngrediente(id: string): Promise<void>

  // ---- Zonas e impresoras de un local
  listZonas(sucursalId: string): Promise<Zona[]>
  guardarZona(sucursalId: string, z: Omit<Zona, 'id'> & { id?: string }): Promise<void>
  eliminarZona(id: string): Promise<void>
  listImpresoras(sucursalId: string): Promise<Impresora[]>
  guardarImpresora(sucursalId: string, i: Omit<Impresora, 'id'> & { id?: string }): Promise<void>
  eliminarImpresora(id: string): Promise<void>
  /** Genera un token nuevo (desvincula la PC anterior). Se muestra una sola vez. */
  generarTokenImpresora(id: string): Promise<string>
  /** Incluye los inactivos */
  listRepartidores(sucursalId: string): Promise<Repartidor[]>
  guardarRepartidor(sucursalId: string, r: Omit<Repartidor, 'id'> & { id?: string }): Promise<Repartidor>

  // ---- Operación de un local
  getCajaAbierta(sucursalId: string): Promise<Caja | null>
  abrirCaja(sucursalId: string, turno: string, dineroInicial: number): Promise<Caja>
  /** Cierra guardando los totales, el efectivo contado y la diferencia */
  cerrarCaja(id: string, dineroCierre: number, observaciones?: string): Promise<void>
  /** Solo la última caja del local y si no hay otra abierta */
  reabrirCaja(id: string): Promise<void>
  /** Historial, de la más nueva a la más vieja */
  listCajas(sucursalId: string, limit?: number): Promise<Caja[]>
  listMovimientos(cajaId: string): Promise<MovimientoCaja[]>
  agregarMovimiento(cajaId: string, m: Pick<MovimientoCaja, 'tipo' | 'tipoGastoId' | 'concepto' | 'monto'>): Promise<void>
  eliminarMovimiento(id: string): Promise<void>
  listTiposGasto(): Promise<TipoGasto[]>
  listComandas(cajaId: string): Promise<Comanda[]>
  crearComanda(cajaId: string, data: NuevaComanda): Promise<Comanda>
  actualizarComanda(id: string, data: NuevaComanda): Promise<Comanda>
  cambiarEstado(id: string, estado: EstadoComanda): Promise<void>
  marcarCobrada(id: string, cobrada: boolean): Promise<void>
  /** Delivery: asigna la moto, pasa a "en camino" y arranca el contador */
  asignarRepartidor(comandaId: string, repartidorId: string): Promise<void>
  /** Saca la moto asignada (por si se eligió mal); vuelve a quedar sin moto */
  quitarRepartidor(comandaId: string): Promise<void>
  /** Entrega el pedido con la forma de pago final */
  entregarComanda(comandaId: string, pagos: Pago[], cobrada: boolean): Promise<void>
  buscarClientes(q: BusquedaCliente): Promise<Cliente[]>
  guardarCliente(c: Omit<Cliente, 'id'> & { id?: string }): Promise<Cliente>
  encolarImpresion(jobs: NuevoPrintJob[]): Promise<void>
  listPrintJobs(sucursalId: string, limit?: number): Promise<PrintJob[]>
  /** Borra trabajos de la cola. Solo los pendientes o con error; devuelve cuántos borró */
  eliminarPrintJobs(ids: string[]): Promise<number>
  /** Solo demo: simula que el spool imprimió */
  simularSpool?(): Promise<void>

  // ---- Importación automática de pedidos (PedidosYa)
  listPedidosExternos(sucursalId: string, limit?: number): Promise<PedidoExterno[]>
  /** Crea la comanda en una sola operación. null si era un pedido repetido. */
  importarPedidoExterno(id: string, datos: ImportacionPedido): Promise<string | null>
  marcarPedidoExterno(id: string, estado: 'pendiente' | 'error' | 'ignorado', error?: string, datos?: unknown): Promise<void>
  listMapeos(): Promise<MapeoExterno[]>
  guardarMapeo(m: Omit<MapeoExterno, 'id'>): Promise<void>
  eliminarMapeo(id: string): Promise<void>
  /** Solo demo: como si el programa de Windows hubiera capturado un ticket */
  simularCaptura?(sucursalId: string, texto: string): Promise<'nuevo' | 'duplicado'>

  // ---- Stock
  getStock(sucursalId: string): Promise<StockItem[]>

  // ---- Pedido a fábrica
  /** Ingredientes de la planilla, en orden */
  getPlanillaFabrica(): Promise<PlanillaFabricaItem[]>
  guardarPlanillaFabrica(items: PlanillaFabricaItem[]): Promise<void>
  /** Borra la categoría con todos sus productos (el historial de ventas queda) */
  eliminarCategoria(id: string): Promise<void>
  /** sucursalIds null: todos los que el usuario puede ver */
  listPedidosFabrica(sucursalIds: string[] | null, limite?: number): Promise<PedidoFabrica[]>
  crearPedidoFabrica(sucursalId: string, d: { fecha: string; notas?: string; items: { ingredienteId?: string; productoId?: string; cantidad: number }[] }): Promise<void>
  /** Lo que llegó de cada ítem (0 = no llegó); suma al stock */
  recibirPedidoFabrica(pedidoId: string, items: { id: string; recibido: number }[]): Promise<void>
  anularPedidoFabrica(pedidoId: string): Promise<void>
  registrarIngreso(sucursalId: string, data: NuevoIngreso): Promise<void>
  ajustarStock(sucursalId: string, ingredienteId: string, tipo: 'ajuste' | 'decomiso', cantidad: number, motivo?: string): Promise<void>
  setStockMinimo(sucursalId: string, ingredienteId: string, minimo: number): Promise<void>

  // ---- Reportes (desde y hasta: ISO; hasta excluido)
  reporteComandas(sucursalIds: string[], desde: string, hasta: string): Promise<Comanda[]>
  reporteMovimientosCaja(sucursalIds: string[], desde: string, hasta: string): Promise<MovimientoReporte[]>
  reporteIngresos(sucursalIds: string[], desde: string, hasta: string): Promise<IngresoMercaderia[]>
  reporteStockMovimientos(sucursalIds: string[], desde: string, hasta: string, tipos?: TipoMovStock[]): Promise<StockMovimiento[]>

  /** Cambios de comandas, cola o menú (realtime / otras pestañas) */
  subscribe(onChange: (tabla: 'comandas' | 'print_jobs' | 'menu' | 'externos') => void): () => void
}
