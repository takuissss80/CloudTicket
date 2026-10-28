// Menú de ejemplo, basado en la carta de la pizzería.
// Se usa en el modo demo y en "Cargar menú de ejemplo" de la administración.
// Las claves (key) son internas: al importar se crean IDs nuevos.
// Precios y costos de ejemplo: ajustalos a los reales.

export interface MenuCategoria {
  key: string
  nombre: string
  color: 'blue' | 'red' | 'amber' | 'green'
}

export interface MenuProducto {
  key: string
  categoria: string
  tipo?: 'producto' | 'extra' | 'promo'
  codigo?: string
  nombre: string
  descripcion?: string
  precio: number
  precioMitad?: number
  coccion?: boolean
  incluyeEnvio?: boolean
  fijos?: { producto: string; cantidad: number; variante?: 'entera' | 'mitad' | 'unica' }[]
  slots?: { nombre: string; categoria: string; cantidad: number }[]
  /** [clave del ingrediente, cantidad en su unidad] */
  receta?: [string, number][]
}

export interface MenuIngrediente {
  key: string
  nombre: string
  unidad: 'un' | 'g' | 'ml'
  /** por unidad, por kilo o por litro */
  costo: number
}

export const ingredientes: MenuIngrediente[] = [
  { key: 'bollo', nombre: 'Bollo de masa', unidad: 'un', costo: 650 },
  { key: 'bollo-chico', nombre: 'Bollo de masa chico', unidad: 'un', costo: 400 },
  { key: 'prepizza-molde', nombre: 'Prepizza molde', unidad: 'un', costo: 900 },
  { key: 'salsa', nombre: 'Salsa de tomate', unidad: 'g', costo: 3200 },
  { key: 'muzza', nombre: 'Muzzarella', unidad: 'g', costo: 9500 },
  { key: 'jamon', nombre: 'Feta de jamón', unidad: 'un', costo: 180 },
  { key: 'crudo', nombre: 'Feta de jamón crudo', unidad: 'un', costo: 420 },
  { key: 'panceta', nombre: 'Feta de panceta', unidad: 'un', costo: 260 },
  { key: 'calabresa', nombre: 'Feta de calabresa', unidad: 'un', costo: 150 },
  { key: 'morron', nombre: 'Morrón', unidad: 'g', costo: 4500 },
  { key: 'tomate', nombre: 'Tomate', unidad: 'g', costo: 2800 },
  { key: 'cebolla', nombre: 'Cebolla', unidad: 'g', costo: 1200 },
  { key: 'huevo', nombre: 'Huevo', unidad: 'un', costo: 250 },
  { key: 'anchoas', nombre: 'Anchoas', unidad: 'g', costo: 38000 },
  { key: 'aceitunas', nombre: 'Aceitunas', unidad: 'g', costo: 7000 },
  { key: 'roquefort', nombre: 'Roquefort', unidad: 'g', costo: 16000 },
  { key: 'tapa', nombre: 'Tapa de empanada', unidad: 'un', costo: 110 },
  { key: 'relleno-carne', nombre: 'Relleno de carne', unidad: 'g', costo: 11000 },
  { key: 'relleno-pollo', nombre: 'Relleno de pollo', unidad: 'g', costo: 8500 },
  { key: 'relleno-verdura', nombre: 'Relleno de verdura', unidad: 'g', costo: 5000 },
  { key: 'relleno-humita', nombre: 'Relleno de humita', unidad: 'g', costo: 5500 },
  { key: 'aceite', nombre: 'Aceite para freír', unidad: 'ml', costo: 2400 },
  { key: 'lata-pepsi', nombre: 'Lata Pepsi', unidad: 'un', costo: 900 },
  { key: 'coca-15', nombre: 'Coca-Cola 1.5L', unidad: 'un', costo: 2300 },
  { key: 'agua', nombre: 'Agua 500ml', unidad: 'un', costo: 700 },
  { key: 'cerveza', nombre: 'Cerveza 1L', unidad: 'un', costo: 2600 },
]

// Base de una pizza grande: masa + salsa + muzza
const BASE: [string, number][] = [['bollo', 1], ['salsa', 120], ['muzza', 350]]

export const categorias: MenuCategoria[] = [
  { key: 'molde', nombre: 'MOLDE', color: 'red' },
  { key: 'promos-molde', nombre: 'PROMOS MOLDE', color: 'red' },
  { key: 'promos', nombre: 'PROMOS', color: 'blue' },
  { key: 'grandes', nombre: 'PIZZAS GRANDES 8 porciones', color: 'blue' },
  { key: 'chicas', nombre: 'PIZZAS CHICAS 4 porciones', color: 'blue' },
  { key: 'empanadas', nombre: 'EMPANADAS', color: 'blue' },
  { key: 'canastitas', nombre: 'CANASTITAS', color: 'blue' },
  { key: 'tartas', nombre: 'TARTAS', color: 'blue' },
  { key: 'bebidas', nombre: 'BEBIDAS', color: 'blue' },
]

const grande = (key: string, nombre: string, precio: number, mitad: number, extra: [string, number][] = []): MenuProducto => ({
  key, categoria: 'grandes', nombre: `Grande ${nombre}`, precio, precioMitad: mitad, receta: [...BASE, ...extra],
})
const empanada = (codigo: string, nombre: string, relleno: [string, number][]): MenuProducto => ({
  key: `emp-${codigo.toLowerCase()}`, categoria: 'empanadas', codigo, nombre, precio: 2200, coccion: true,
  receta: [['tapa', 1], ...relleno],
})
const extra = (key: string, nombre: string, precio: number, receta: [string, number][] = []): MenuProducto => ({
  key, categoria: 'grandes', tipo: 'extra', nombre, precio, receta,
})

export const productos: MenuProducto[] = [
  // ---- Extras de pizzas grandes
  extra('ad-albahaca', 'Adicional Albahaca', 500),
  extra('ad-provenzal', 'Adicional Provenzal', 500),
  extra('ad-rucula', 'Adicional Rúcula', 500),
  extra('ad-huevo', 'Adicional Huevo', 800, [['huevo', 1]]),
  extra('ad-tomate', 'Adicional Tomate', 800, [['tomate', 120]]),
  extra('ad-jamon', 'Adicional Jamón', 1000, [['jamon', 3]]),
  extra('ad-crudo', 'Adicional Jamón Crudo', 1500, [['crudo', 2]]),
  extra('ad-panceta', 'Adicional Panceta', 1200, [['panceta', 3]]),
  extra('ad-calabresa', 'Adicional Calabresa', 1000, [['calabresa', 6]]),
  extra('armado-mitad', 'Armado mitad', 1500),

  // ---- Pizzas grandes (entera / mitad)
  grande('g-muzza', 'Muzzarella', 18800, 9400, [['aceitunas', 20]]),
  grande('g-fugazza', 'Fugazza', 19500, 9900, [['cebolla', 250]]),
  grande('g-fugazzeta', 'Fugazzeta', 21800, 10900, [['cebolla', 250], ['muzza', 100]]),
  grande('g-anchoas', 'Salsa y Anchoas', 21300, 10900, [['anchoas', 40]]),
  grande('g-fugajamon', 'Fugazzeta y Jamón', 22500, 11900, [['cebolla', 250], ['muzza', 100], ['jamon', 8]]),
  grande('g-muzzanchoas', 'Muzza y Anchoas', 22500, 11900, [['anchoas', 40]]),
  grande('g-muzzahuevo', 'Muzza y Huevo', 22500, 11900, [['huevo', 2]]),
  grande('g-muzzajamon', 'Muzza con Jamón', 22500, 11900, [['jamon', 8]]),
  grande('g-napo', 'Napolitana', 22500, 11900, [['tomate', 200]]),
  grande('g-napojamon', 'Napo y Jamón', 23500, 12400, [['tomate', 200], ['jamon', 8]]),
  grande('g-jym', 'Jamón y Morrón', 23500, 12400, [['jamon', 8], ['morron', 120]]),
  grande('g-jyh', 'Jamón y Huevo', 23500, 12400, [['jamon', 8], ['huevo', 2]]),
  grande('g-calabresa', 'Calabresa', 23500, 12400, [['calabresa', 12]]),

  // ---- Pizzas chicas
  { key: 'c-muzza', categoria: 'chicas', nombre: 'Chica Muzzarella', precio: 11000, receta: [['bollo-chico', 1], ['salsa', 70], ['muzza', 200]] },
  { key: 'c-napo', categoria: 'chicas', nombre: 'Chica Napolitana', precio: 13000, receta: [['bollo-chico', 1], ['salsa', 70], ['muzza', 200], ['tomate', 120]] },
  { key: 'c-jym', categoria: 'chicas', nombre: 'Chica Jamón y Morrón', precio: 13500, receta: [['bollo-chico', 1], ['salsa', 70], ['muzza', 200], ['jamon', 5], ['morron', 70]] },

  // ---- Molde
  { key: 'm-muzza', categoria: 'molde', nombre: 'Molde Muzzarella', precio: 21000, precioMitad: 10500, receta: [['prepizza-molde', 1], ['salsa', 150], ['muzza', 450]] },
  { key: 'm-napo', categoria: 'molde', nombre: 'Molde Napolitana', precio: 24000, precioMitad: 12000, receta: [['prepizza-molde', 1], ['salsa', 150], ['muzza', 450], ['tomate', 250]] },
  { key: 'm-fugazzeta', categoria: 'molde', nombre: 'Molde Fugazzeta', precio: 24000, precioMitad: 12000, receta: [['prepizza-molde', 1], ['muzza', 550], ['cebolla', 300]] },

  // ---- Empanadas (horno / frita)
  empanada('CC', 'Carne a cuchillo', [['relleno-carne', 70]]),
  empanada('CAP', 'Capresse', [['muzza', 40], ['tomate', 25]]),
  empanada('CQ', 'Cebolla y queso', [['muzza', 40], ['cebolla', 30]]),
  empanada('H', 'Humita', [['relleno-humita', 70]]),
  empanada('JQ', 'Jamón y queso', [['jamon', 1], ['muzza', 40]]),
  empanada('JR', 'Jamón y roquefort', [['jamon', 1], ['roquefort', 30]]),
  empanada('P', 'Pollo', [['relleno-pollo', 70]]),
  empanada('V', 'Verdura', [['relleno-verdura', 70]]),

  // ---- Canastitas y tartas
  { key: 'can-jq', categoria: 'canastitas', nombre: 'Canastita Jamón y queso', precio: 2500 },
  { key: 'can-v', categoria: 'canastitas', nombre: 'Canastita Verdura', precio: 2500 },
  { key: 't-jq', categoria: 'tartas', nombre: 'Tarta Jamón y queso', precio: 14000 },
  { key: 't-v', categoria: 'tartas', nombre: 'Tarta Verdura', precio: 13000 },

  // ---- Bebidas
  { key: 'b-coca15', categoria: 'bebidas', nombre: 'Coca-Cola 1.5L', precio: 4500, receta: [['coca-15', 1]] },
  { key: 'b-pepsilata', categoria: 'bebidas', nombre: 'Lata Pepsi', precio: 2000, receta: [['lata-pepsi', 1]] },
  { key: 'b-agua', categoria: 'bebidas', nombre: 'Agua 500ml', precio: 2000, receta: [['agua', 1]] },
  { key: 'b-cerveza', categoria: 'bebidas', nombre: 'Cerveza 1L', precio: 5500, receta: [['cerveza', 1]] },

  // ---- Promos
  {
    key: 'promo-1', categoria: 'promos', tipo: 'promo', codigo: 'P325', nombre: 'PROMO 1',
    descripcion: '1 GRD MUZZA + 1 GRD JAMÓN Y MORRÓN + ENVÍO', precio: 39999, incluyeEnvio: true,
    fijos: [{ producto: 'g-muzza', cantidad: 1 }, { producto: 'g-jym', cantidad: 1 }],
  },
  {
    key: 'promo-2', categoria: 'promos', tipo: 'promo', codigo: 'P321', nombre: 'PROMO 2',
    descripcion: '1 GRD MUZZA + 1 GRD NAPO + ENVÍO', precio: 39999, incluyeEnvio: true,
    fijos: [{ producto: 'g-muzza', cantidad: 1 }, { producto: 'g-napo', cantidad: 1 }],
  },
  {
    key: 'promo-3', categoria: 'promos', tipo: 'promo', codigo: 'P324', nombre: 'PROMO 3',
    descripcion: '1 GRD MUZZA + 1 GRD NAPO + 1 GRD JAMÓN Y MORRÓN + ENVÍO', precio: 57999, incluyeEnvio: true,
    fijos: [{ producto: 'g-muzza', cantidad: 1 }, { producto: 'g-napo', cantidad: 1 }, { producto: 'g-jym', cantidad: 1 }],
  },
  {
    key: 'promo-4', categoria: 'promos', tipo: 'promo', codigo: 'P353', nombre: 'PROMO 4',
    descripcion: 'GDE. MUZZARELLA + 4 EMPANADAS A ELECCIÓN', precio: 28999,
    fijos: [{ producto: 'g-muzza', cantidad: 1 }],
    slots: [{ nombre: 'Empanadas', categoria: 'empanadas', cantidad: 4 }],
  },
  {
    key: 'promo-5', categoria: 'promos', tipo: 'promo', codigo: 'P354', nombre: 'PROMO 5',
    descripcion: 'GDE. JAMÓN Y HUEVO + 4 EMPANADAS', precio: 32999,
    fijos: [{ producto: 'g-jyh', cantidad: 1 }],
    slots: [{ nombre: 'Empanadas', categoria: 'empanadas', cantidad: 4 }],
  },
  {
    key: 'promo-6', categoria: 'promos', tipo: 'promo', codigo: 'P8522', nombre: 'PROMO 6',
    descripcion: '1 GRD JAMÓN Y MORRÓN + 4 EMPANADAS + ENVÍO', precio: 32999, incluyeEnvio: true,
    fijos: [{ producto: 'g-jym', cantidad: 1 }],
    slots: [{ nombre: 'Empanadas', categoria: 'empanadas', cantidad: 4 }],
  },
  {
    key: 'promo-chica', categoria: 'promos', tipo: 'promo', codigo: 'P6374', nombre: 'PROMO CHICA',
    descripcion: 'Lata Pepsi + Muzza Chica', precio: 9999,
    fijos: [{ producto: 'b-pepsilata', cantidad: 1, variante: 'unica' }, { producto: 'c-muzza', cantidad: 1, variante: 'unica' }],
  },
  {
    key: 'promo-emp-bebida', categoria: 'promos', tipo: 'promo', codigo: 'P8694', nombre: 'Promo 2 Empanadas + Bebida',
    descripcion: '2 empanadas a elección + bebida', precio: 6999,
    slots: [
      { nombre: 'Empanadas', categoria: 'empanadas', cantidad: 2 },
      { nombre: 'Bebida', categoria: 'bebidas', cantidad: 1 },
    ],
  },
  {
    key: 'promo-molde', categoria: 'promos-molde', tipo: 'promo', nombre: 'PROMO MOLDE',
    descripcion: 'Molde Muzzarella + 6 empanadas', precio: 31999,
    fijos: [{ producto: 'm-muzza', cantidad: 1 }],
    slots: [{ nombre: 'Empanadas', categoria: 'empanadas', cantidad: 6 }],
  },
]

export const zonas = [
  { key: 'zona-1', nombre: 'Zona 1 (hasta 15 cuadras)', costo: 2000 },
  { key: 'zona-2', nombre: 'Zona 2 (hasta 30 cuadras)', costo: 3000 },
  { key: 'zona-3', nombre: 'Zona 3 (lejos)', costo: 4500 },
]
