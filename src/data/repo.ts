import type {
  AjusteLocal, Caja, Categoria, Cliente, Comanda, EstadoComanda, Impresora, Ingrediente, NuevaComanda,
  PrintJob, Producto, Sesion, Sucursal, TipoPrintJob, LineaTicket, Usuario, Zona,
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
  actualizarSucursal(id: string, data: Partial<Pick<Sucursal, 'nombre' | 'activa'>>): Promise<void>
  listUsuarios(): Promise<Usuario[]>
  crearUsuario(data: { usuario: string; password: string; sucursalId: string; nombre?: string }): Promise<void>
  cambiarPassword(userId: string, password: string): Promise<void>
  eliminarUsuario(userId: string): Promise<void>

  // ---- Menú
  /** sucursalId null = solo menú madre */
  getMenu(sucursalId: string | null): Promise<MenuData>
  guardarCategoria(c: CategoriaEdicion): Promise<Categoria>
  guardarProducto(p: ProductoEdicion): Promise<Producto>
  guardarAjuste(sucursalId: string, a: AjusteLocal): Promise<void>
  quitarAjuste(sucursalId: string, productoId: string): Promise<void>
  aumentarPrecios(categoriaId: string, porcentaje: number, sucursalId: string | null, redondeo: number): Promise<number>
  guardarIngrediente(i: IngredienteEdicion): Promise<Ingrediente>

  // ---- Zonas e impresoras de un local
  listZonas(sucursalId: string): Promise<Zona[]>
  guardarZona(sucursalId: string, z: Omit<Zona, 'id'> & { id?: string }): Promise<void>
  eliminarZona(id: string): Promise<void>
  listImpresoras(sucursalId: string): Promise<Impresora[]>

  // ---- Operación de un local
  getCajaAbierta(sucursalId: string): Promise<Caja | null>
  abrirCaja(sucursalId: string, turno: string): Promise<Caja>
  cerrarCaja(id: string): Promise<void>
  listComandas(cajaId: string): Promise<Comanda[]>
  crearComanda(cajaId: string, data: NuevaComanda): Promise<Comanda>
  actualizarComanda(id: string, data: NuevaComanda): Promise<Comanda>
  cambiarEstado(id: string, estado: EstadoComanda): Promise<void>
  marcarCobrada(id: string, cobrada: boolean): Promise<void>
  buscarClientes(q: BusquedaCliente): Promise<Cliente[]>
  guardarCliente(c: Omit<Cliente, 'id'> & { id?: string }): Promise<Cliente>
  encolarImpresion(jobs: NuevoPrintJob[]): Promise<void>
  listPrintJobs(sucursalId: string, limit?: number): Promise<PrintJob[]>
  /** Solo demo: simula que el spool imprimió */
  simularSpool?(): Promise<void>

  /** Cambios de comandas, cola o menú (realtime / otras pestañas) */
  subscribe(onChange: (tabla: 'comandas' | 'print_jobs' | 'menu') => void): () => void
}
