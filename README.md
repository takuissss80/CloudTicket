# Comandas

Web para tomar pedidos de mostrador y delivery, administrar el menú de varios locales
y mandar las comandas a la comandera.
React + TypeScript + Vite + Tailwind, con Supabase como base.

## Probar ya (modo demo)

```bash
npm install
npm run dev
```

Sin variables de entorno arranca en **modo demo**: todo se guarda en el navegador y la
impresión se simula. Viene con la cuenta *Napoles*, dos locales y tres usuarios
(contraseña `1234`):

| Usuario | Qué ve |
|---|---|
| `admin` | Todos los locales, el menú madre, ingredientes, locales y usuarios |
| `principal` | Solo Napoles Principal |
| `benavidez` | Solo Napoles Benavidez (tiene la muzza más cara y la humita agotada) |

## Cómo está organizado

**Cuenta** (la marca, ej. Napoles) → **locales** → **usuarios**.

- **Administrador:** entra con su email. Ve todos los locales (los elige arriba a la
  izquierda), arma el **menú madre**, carga ingredientes, crea locales y sus usuarios.
- **Usuario de local:** entra con usuario y contraseña. Solo ve su local: su caja, sus
  comandas y su menú.

### Menú madre y ajustes por local

- El menú madre (categorías, productos, promos, recetas) es uno solo para toda la cuenta.
  Un local nuevo lo hereda al crearse.
- Si el admin cambia un precio del menú madre, cambia en todos los locales al instante.
- Cada local puede, sobre su menú:
  - poner **su propio precio** a un producto (deja de seguir al menú madre; si lo borrás, vuelve a seguirlo),
  - marcar **agotado** (también desde la pantalla de carga) u **ocultar** productos,
  - crear **productos y categorías propios**, que solo existen en ese local.
- **Aumentar precios** por categoría con porcentaje y redondeo: en el menú madre sube el
  precio base; en un local sube solo sus precios propios.

### Pedidos y delivery

- **Mostrador:** el pedido queda pendiente hasta que tocás **Entregar pedido**. Ahí confirmás
  o cambiás la forma de pago (por si el cliente paga distinto al retirar).
- **Delivery:** primero **Asignar delivery** (elegís la moto). Desde ese momento corre un
  contador de minutos en la tarjeta (en rojo pasados los 30). Recién con la moto asignada
  aparece **Entregar pedido**, con la forma de pago final. Queda guardado cuánto tardó.
- Los **repartidores** (nombre, DNI y teléfono) se cargan por local en
  *Administración → Repartidores* o directo desde el botón de asignar.
- El cierre de caja muestra los viajes de cada moto y su tiempo promedio.

### Caja

- **Abrir:** elegís el turno y el **dinero al inicio**. Viene sugerido con lo que se contó al
  cerrar la caja anterior.
- **Durante el turno**, desde el botón *Caja*: resumen en vivo y carga de **gastos** (con tipo:
  Motos, Proveedores, Servicios…), **retiros** de efectivo, **ingresos** y **sueldos**.
- **Total teórico en caja** = inicio + ventas en efectivo cobradas (sin el vuelto) + ingresos
  − gastos − retiros − sueldos. Lo cobrado por Mercado Pago, tarjeta o transferencia no suma.
- **Cerrar:** cargás el efectivo contado y queda la **diferencia** (sobra / falta) con una
  observación. Se guarda una foto de todos los totales, quién cerró y a qué hora.
- **Reabrir:** la última caja del local se puede reabrir si se cerró por error; sigue con la
  misma numeración de comandas.
- **Historial de cajas:** todas las cajas del local con ventas, teórico, contado y diferencia.
  Cada una tiene su detalle: resumen, comandas y gastos/retiros.

### Stock

- Cada local tiene el stock de cada ingrediente (*Administración → Stock*).
- **Ingreso de mercadería:** proveedor, remito y lo que entró (en kilos, litros o unidades) con lo que
  se pagó. Puede actualizar el costo de los ingredientes y, si se pagó con la plata de la caja,
  queda como gasto "Pago remito".
- **Descuento automático:** al guardar una comanda, la base descuenta la receta de cada producto y
  de lo que trae cada promo (la mitad consume la mitad). Si se edita la comanda se recalcula, y si
  se anula se devuelve.
- **Ajuste** (contaste y no coincide) y **decomiso** (se tiró), con motivo. **Mínimo** por
  ingrediente para avisar cuando falta.

### Reportes

Botón **Reportes** arriba. Se elige el período (hoy, ayer, 7 días, este mes, mes pasado o fechas) y,
si sos admin, un local o todos. Cada reporte se descarga en CSV para Excel.

| Reporte | Qué muestra |
|---|---|
| Ventas | Total, ticket promedio, mostrador/delivery, sin cobrar, por forma de pago y por día |
| Venta de mercadería | Unidades por producto (sueltas y dentro de promos), ingredientes consumidos, costo y margen |
| Gastos | Por tipo de gasto (incluye sueldos) y detalle |
| Ingresos y egresos de dinero | Ingresos y retiros de caja |
| Ingreso de mercadería | Cada ingreso con su detalle y el total por ingrediente con precio promedio |
| Stock | Stock actual por local y lo que entró, se vendió y se ajustó en el período |

### Ingredientes y recetas

- Cada ingrediente se mide en **unidades, gramos o mililitros** y tiene un costo de compra
  **por unidad, por kilo o por litro**.
- Cada producto tiene su receta (ingrediente + cantidad). La mitad usa la mitad de la receta.
- El sistema calcula **costo y margen** de cada producto; en las promos suma los productos
  fijos y el promedio de lo que se puede elegir.

## Conectar Supabase

1. Creá un proyecto en Supabase.
2. Corré en orden las migraciones de `supabase/migrations/` (`0001`, `0002`, `0003`…) en el SQL Editor (o `supabase db push`).
3. Desplegá la función de usuarios: `supabase functions deploy usuarios`.
   La usa el admin para crear usuarios de local y cambiarles la contraseña.
4. En *Authentication → Providers → Email* dejá habilitado el registro con email. Si
   activás "Confirm email", el admin tiene que confirmar su email antes de entrar.
5. Copiá `.env.example` a `.env.local` con la URL y la anon key del proyecto.
6. `npm run dev` → **Crear una cuenta** con tu email → nombre de la marca y del local principal.
7. En *Administración → Menú* podés tocar **Cargar menú de ejemplo** para arrancar con la
   carta, los ingredientes y las recetas de la pizzería, y editarla después.

Los usuarios de local entran con su nombre de usuario; por dentro, Supabase Auth guarda
`<usuario>@comandas.local`. No hace falta que ese email exista.

### Seguridad

Todo se controla con RLS en la base, no en la web:

- Un usuario solo ve los datos de su cuenta.
- Un usuario de local solo ve y opera su local; no puede cambiar el menú madre ni
  los ingredientes.
- Crear locales y aumentar el menú madre se hace con funciones que verifican que sea admin.
- Crear, borrar y cambiar contraseñas de usuarios pasa por la Edge Function `usuarios`,
  que usa la service role key del lado del servidor.

## Estructura

```
src/
  data/         repo.ts (interfaz), localRepo.ts (demo), supabaseRepo.ts, menu.ts (ejemplo)
  store/        app.ts (sesión, local activo, caja, comandas), pedido.ts (pedido en carga)
  lib/          ticket.ts (comanda imprimible), menu.ts (catálogo por local, costos)
  components/   Tablero, TomarPedido, CobroModal, ComandaDetalle, ColaImpresion, Login…
  components/admin/  MenuAdmin, ProductoEditor, Ingredientes, Locales
supabase/
  migrations/0001_init.sql
  functions/usuarios/
```

## Impresión: contrato con el spool

La web **no habla con la impresora**. Al guardar una comanda inserta una fila en
`print_jobs` por cada comandera del local que corresponda (mostrador y/o delivery).
El spool de Windows de cada local toma esos trabajos y los imprime.

| Campo | |
|---|---|
| `impresora_id` | comandera destino |
| `tipo` | `comanda`, `reimpresion`, `anulacion`, `cuenta`, `prueba` |
| `contenido` | lista de líneas (abajo) |
| `copias` | cuántas veces imprimir |
| `estado` | `pendiente` → `imprimiendo` → `impreso` / `error` |
| `intentos`, `error`, `printed_at` | los completa el spool |

El diseño del ticket vive en la web (`src/lib/ticket.ts`); el spool solo traduce cada
línea a ESC/POS:

```json
[
  { "t": "text", "text": "COMANDA #12", "size": "xl", "bold": true, "align": "center" },
  { "t": "text", "text": " DELIVERY ", "size": "large", "bold": true, "align": "center", "invert": true },
  { "t": "line" },
  { "t": "text", "text": "1 x PROMO 4                              $28.999", "bold": true },
  { "t": "text", "text": "  -> 2 Jamón y queso (Horno)" },
  { "t": "feed", "n": 3 },
  { "t": "cut" }
]
```

| Línea | ESC/POS sugerido |
|---|---|
| `text` | `ESC a n` alineación, `ESC E n` negrita, `GS ! n` tamaño (`normal` 0x00, `large` 0x11, `xl` 0x22), `GS B n` invertido, texto en CP858 + `LF` |
| `line` | `-` repetido al ancho de la comandera |
| `feed` | `ESC d n` |
| `cut` | `GS V 66 0` (corte parcial con avance) |

Las líneas ya vienen cortadas al ancho de la impresora (`impresoras.ancho`: 48 para 80 mm,
32 para 58 mm). El texto viene con acentos y ñ: el spool lo manda en la página de códigos
que soporte la comandera (CP858 o CP850 en la mayoría de las genéricas).

### Pendiente para el spool

- Edge Function `spool-vincular`: recibe el token que se pega en el programa, verifica
  `impresoras.token_hash` y devuelve credenciales limitadas a esa impresora.
- RPC `spool-tomar-trabajos` con `for update skip locked` para que dos PCs no impriman
  lo mismo, y `spool-confirmar` para `impreso` / `error`. Actualiza `impresoras.ultimo_ping`.
- Programa de Windows: escucha `print_jobs` por Realtime con polling de respaldo,
  imprime en RAW a la impresora USB y expone `localhost` para el modo offline.
