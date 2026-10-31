# CloudTicket Impresión (programa de Windows)

Recibe las comandas de la web y las imprime en la comandera conectada a la PC
(USB, red o lo que Windows tenga instalado). También puede capturar los tickets
que imprime otro programa (GoWin / PedidosYa) para importarlos como pedidos.

- Un solo `.exe`, sin instalación. Go sin librerías externas.
- Panel en `http://127.0.0.1:7317` (se abre solo al ejecutarlo). Si ya está abierto,
  ejecutarlo de nuevo solo muestra el panel.
- Configuración y registro en `%APPDATA%\CloudTicket\` (`config.json`, `registro.txt`).

## Cómo se conecta

1. En la web, *Administración → Impresión* → **Generar token** en la comandera.
2. En el programa, **Vincular una comandera**: se pega el token y se elige la impresora de Windows.
3. El programa baja de la web `/spool-config.json` (URL de Supabase y anon key, que son públicas)
   y usa estas funciones de la base, que solo aceptan el token:
   - `spool_ping` cada 30 s (la web muestra "Conectada", la PC y la impresora),
   - `spool_tomar` cada 2 s (toma los trabajos; dos PCs con el mismo token no imprimen lo mismo),
   - `spool_confirmar` (impreso, o vuelve a la cola; a los 5 intentos queda con error),
   - `spool_capturar` (tickets capturados).
   Lo que espera más de 30 minutos en la cola no se imprime (queda "vencido").

## Impresión

Las líneas que arma la web (`src/lib/ticket.ts`) se traducen a ESC/POS: tamaño (`GS !`),
negrita (`ESC E`), alineación (`ESC a`), invertido (`GS B`), avance (`ESC d`) y corte
(`GS V 66 0`). Se manda RAW a la cola de Windows (`winspool.drv`).

Acentos: por defecto página **PC850** (`ESC t 2`). Si salen mal, en el panel se puede elegir
PC858, Windows-1252 o PC437 (el botón *Imprimir prueba* trae todos los acentos).

## Importación de pedidos (PedidosYa / GoWin)

El programa escucha en un puerto (9100 por defecto) como una impresora de red RAW:

- **GoWin en la misma PC:** botón *Crear impresora virtual en Windows* (pide permiso de
  administrador) → crea "PedidosYa (CloudTicket)" con el driver *Generic / Text Only* apuntando a
  `127.0.0.1:9100`. En GoWin se elige esa impresora.
- **GoWin en una tablet:** se activa "Aceptar desde otras PCs o tablets" y en GoWin se configura
  una impresora de red con la IP de la PC y el puerto 9100.

Cada ticket que llega: 1) se imprime igual en la comandera elegida (con corte si no trae),
2) se le saca el texto (ESC/POS o texto plano; UTF-8, Windows-1252 o PC850) y se manda a la web.
Si el ticket llega como imagen no se puede leer: hay que usar el driver *Generic / Text Only*.

La web interpreta el ticket (`src/lib/pedidosya.ts`), asocia los productos con el menú y crea la
comanda (canal PedidosYa) con `importar_pedido_externo`.

## Compilar

```sh
./compilar.sh      # tests + public/descargas/CloudTicketImpresion.exe
```

Fuera de Windows compila con impresoras simuladas (guardan los bytes en `%APPDATA%/CloudTicket/impreso`),
útil para probar: `CT_IMPRESORAS="POS-80,Otra" go run .`
