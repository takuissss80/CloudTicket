export type Variante = 'entera' | 'mitad' | 'unica'
export type Coccion = 'horno' | 'frita'
export type TipoComanda = 'mostrador' | 'delivery'
export type EstadoComanda = 'pendiente' | 'en_preparacion' | 'listo' | 'en_camino' | 'entregado' | 'anulada'
export type FormaPago = 'efectivo' | 'mercado_pago' | 'tarjeta' | 'transferencia'

export type Rol = 'admin' | 'local'

export interface Sesion {
  userId: string
  usuario: string
  rol: Rol
  cuentaId: string
  cuentaNombre: string
  /** Solo usuarios de local */
  sucursalId?: string
}

export interface Sucursal {
  id: string
  nombre: string
  esPrincipal: boolean
  activa: boolean
}

export interface Usuario {
  userId: string
  usuario: string
  rol: Rol
  sucursalId?: string
  nombre?: string
}

export type UnidadIngrediente = 'un' | 'g' | 'ml'

export interface Ingrediente {
  id: string
  nombre: string
  unidad: UnidadIngrediente
  /** Costo por unidad, por kilo o por litro según la unidad */
  costo: number
  activo: boolean
}

export interface RecetaItem {
  ingredienteId: string
  /** En la unidad del ingrediente: unidades, gramos o mililitros */
  cantidad: number
}

export type ColorCategoria = 'blue' | 'red' | 'amber' | 'green'

export interface Categoria {
  id: string
  nombre: string
  orden: number
  color: ColorCategoria
  activa: boolean
  /** Con valor: categoría propia de ese local */
  sucursalId?: string
}

export interface PromoFijo {
  productoId: string
  cantidad: number
  variante: Variante
}

export interface PromoSlot {
  id: string
  nombre: string
  categoriaId: string
  cantidad: number
}

export interface Producto {
  id: string
  categoriaId: string
  tipo: 'producto' | 'extra' | 'promo'
  codigo?: string
  nombre: string
  descripcion?: string
  precio: number
  precioMitad?: number
  admiteCoccion: boolean
  incluyeEnvio: boolean
  orden: number
  activo: boolean
  /** Con valor: producto propio de ese local. Sin valor: menú madre */
  sucursalId?: string
  fijos: PromoFijo[]
  slots: PromoSlot[]
  receta: RecetaItem[]
  /** Solo en el catálogo resuelto de un local */
  agotado?: boolean
}

/** Ajustes de un local sobre un producto del menú madre (sin valor = usa el del menú madre) */
export interface AjusteLocal {
  productoId: string
  precio?: number
  precioMitad?: number
  oculto: boolean
  agotado: boolean
}

export interface Zona {
  id: string
  nombre: string
  costo: number
}

export interface Cliente {
  id: string
  nombre: string
  telefono?: string
  direccion?: string
  entreCalles?: string
  zonaId?: string
}

/** Totales de una caja (en vivo o la foto guardada al cerrar) */
export interface TotalesCaja {
  cantComandas: number
  cantAnuladas: number
  totalVentas: number
  /** Efectivo cobrado, ya sin el vuelto */
  ventasEfectivo: number
  totalIngresos: number
  totalGastos: number
  totalEgresos: number
  totalSueldos: number
  /** inicio + efectivo + ingresos - gastos - egresos - sueldos */
  efectivoTeorico: number
}

export interface Caja {
  id: string
  turno: string
  estado: 'abierta' | 'cerrada'
  abiertaAt: string
  cerradaAt?: string
  dineroInicial: number
  abiertaPor?: string
  cerradaPor?: string
  observaciones?: string
  /** Solo cajas cerradas */
  totales?: TotalesCaja
  dineroCierre?: number
  diferencia?: number
}

export type TipoMovimiento = 'ingreso' | 'gasto' | 'egreso' | 'sueldo'

export interface MovimientoCaja {
  id: string
  tipo: TipoMovimiento
  tipoGastoId?: string
  tipoGastoNombre?: string
  concepto: string
  monto: number
  creadoPor?: string
  createdAt: string
}

export interface TipoGasto {
  id: string
  nombre: string
}

export const TIPOS_MOVIMIENTO: { key: TipoMovimiento; label: string; ayuda: string }[] = [
  { key: 'gasto', label: 'Gasto', ayuda: 'Se pagó algo con la plata de la caja: motos, proveedores, servicios' },
  { key: 'egreso', label: 'Retiro', ayuda: 'Se sacó efectivo de la caja (al cofre o al dueño)' },
  { key: 'ingreso', label: 'Ingreso', ayuda: 'Entró efectivo que no es una venta: cambio, aporte' },
  { key: 'sueldo', label: 'Sueldo', ayuda: 'Pago de sueldo o adelanto en efectivo' },
]

export interface Componente {
  descripcion: string
  cantidad: number
  variante?: Variante
  coccion?: Coccion
}

export interface ItemComanda {
  /** id local del renglón (antes de guardar) o id de base */
  id: string
  productoId?: string
  descripcion: string
  variante?: Variante
  coccion?: Coccion
  cantidad: number
  precioUnit: number
  nota?: string
  componentes: Componente[]
}

export interface Pago {
  forma: FormaPago
  monto: number
}

export interface Comanda {
  id: string
  cajaId: string
  numero: number
  tipo: TipoComanda
  estado: EstadoComanda
  clienteId?: string
  clienteNombre?: string
  clienteTel?: string
  direccion?: string
  entreCalles?: string
  zonaId?: string
  costoEnvio: number
  subtotal: number
  descuento: number
  adicional: number
  total: number
  observaciones?: string
  horaEntrega?: string
  cobrada: boolean
  pagos: Pago[]
  items: ItemComanda[]
  /** Delivery: moto asignada y cuándo salió */
  repartidorId?: string
  repartidorNombre?: string
  asignadaAt?: string
  entregadaAt?: string
  createdAt: string
  updatedAt: string
}

/** Datos para crear una comanda (sin campos que asigna el sistema) */
export type NuevaComanda = Omit<Comanda, 'id' | 'numero' | 'estado' | 'createdAt' | 'updatedAt' | 'cajaId' | 'repartidorId' | 'repartidorNombre' | 'asignadaAt' | 'entregadaAt'>

/** Moto / repartidor de un local */
export interface Repartidor {
  id: string
  nombre: string
  dni?: string
  telefono?: string
  activo: boolean
}

export interface Impresora {
  id: string
  nombre: string
  imprimeMostrador: boolean
  imprimeDelivery: boolean
  copias: number
  ancho: number
  ultimoPing?: string
}

export type LineaTicket =
  | { t: 'text'; text: string; size?: 'normal' | 'large' | 'xl'; bold?: boolean; align?: 'left' | 'center' | 'right'; invert?: boolean }
  | { t: 'line'; char?: string }
  | { t: 'feed'; n: number }
  | { t: 'cut' }

export type TipoPrintJob = 'comanda' | 'reimpresion' | 'anulacion' | 'cuenta' | 'prueba'

export interface PrintJob {
  id: string
  impresoraId: string
  comandaId?: string
  tipo: TipoPrintJob
  contenido: LineaTicket[]
  copias: number
  estado: 'pendiente' | 'imprimiendo' | 'impreso' | 'error'
  intentos: number
  error?: string
  createdAt: string
  printedAt?: string
}

export const ESTADOS: { key: EstadoComanda; label: string }[] = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'en_preparacion', label: 'En preparación' },
  { key: 'listo', label: 'Listo' },
  { key: 'en_camino', label: 'En camino' },
  { key: 'entregado', label: 'Entregado' },
  { key: 'anulada', label: 'Anulada' },
]

export const FORMAS_PAGO: { key: FormaPago; label: string }[] = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'mercado_pago', label: 'Mercado Pago' },
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'transferencia', label: 'Transferencia' },
]
