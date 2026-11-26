// Edge Function "pedidosya": importa en el servidor los pedidos de PedidosYa.
// ARCHIVO GENERADO desde src/server/ con `npm run funcion:pedidosya`: no editar a mano.
// Deploy: Supabase → Edge Functions → pedidosya → pegar este archivo → Deploy,
//         con "Verify JWT" desactivado (la llama la base, sin usuario).
// src/server/funcionPedidosYa.ts
import { createClient as createClient2 } from "npm:@supabase/supabase-js@2";

// src/lib/pedidosya.ts
function parsearMonto(s) {
  const limpio = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(limpio)) return void 0;
  const neg = limpio.startsWith("-");
  let t = limpio.replace(/-/g, "");
  const ultPunto = t.lastIndexOf("."), ultComa = t.lastIndexOf(",");
  if (ultPunto >= 0 && ultComa >= 0) {
    t = ultComa > ultPunto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (ultComa >= 0) {
    t = t.length - ultComa - 1 === 3 && (t.match(/,/g) ?? []).length >= 1 && !/,\d{1,2}$/.test(t) ? t.replace(/,/g, "") : t.replace(/,/g, ".");
  } else if (ultPunto >= 0) {
    const dec = t.length - ultPunto - 1;
    if (dec === 3 || (t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return void 0;
  return neg ? -n : n;
}
var MONTO = String.raw`-?\$?\s*-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|-?\$?\s*-?\d+(?:[.,]\d{1,2})?`;
var reMontoFinal = new RegExp(String.raw`\s+(${MONTO})\s*$`);
var reItem = /^\s*(\d{1,3}(?:[.,]5)?)\s*(?:x|X|×|u\.?|un\.?|uds?\.?)?\s+(.+)$/;
var reItemXAlFinal = /^\s*(.+?)\s+[xX×]\s?(\d{1,3})\s*$/;
var reCierre = /^\s*(sub\s*-?\s*total|total|env[ií]o|costo de (env[ií]o|entrega)|delivery|descuento|cup[oó]n|bonificaci[oó]n|promoci[oó]n|propina|forma de pago|m[eé]todo de pago|medio de pago|pago|abona|paga con|vuelto|cargo|tarifa|recargo)\b/i;
var reExtra = /^\s*([-+*•>·]|\s{2,})\s*\S/;
function montoDeLinea(l) {
  const m = l.match(new RegExp(String.raw`(${MONTO})\s*$`));
  return m ? parsearMonto(m[1]) : void 0;
}
function parsearTicket(texto) {
  const crudas = texto.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const lineas = [];
  for (const l of crudas) {
    const prev = lineas[lineas.length - 1];
    if (prev !== void 0 && /\d[.,]$/.test(prev) && /^\s*\d{1,2}\s*$/.test(l)) lineas[lineas.length - 1] = prev + l.trim();
    else lineas.push(l);
  }
  const todo = lineas.join("\n");
  const t = { items: [], retiro: false };
  const num2 = todo.match(/(?:pedido|orden|order|n[°ºo]\.?\s*de\s*pedido)\s*(?:n[°ºo.]*|nro\.?|n[uú]mero|id)?\s*[:#]?\s*#?\s*(\d{4,})/i) ?? todo.match(/#\s*(\d{4,})/);
  if (num2) t.numero = num2[1];
  const campo = (re) => todo.match(re)?.[1]?.trim();
  t.cliente = campo(/^\s*(?:cliente|nombre|a nombre de|para)\s*[:\-]\s*(.+)$/im);
  t.telefono = campo(/(?:tel[eé]fono|tel\.?|cel(?:ular)?|whats?app)\s*[:\-]?\s*([+\d][\d\s\-()]{6,}\d)/i)?.replace(/\s+/g, " ");
  t.direccion = campo(/^\s*(?:direcci[oó]n(?: de entrega)?|domicilio|entregar en|entrega en)\s*[:\-]\s*(.+)$/im);
  t.notas = campo(/^\s*(?:notas?|observaciones?|comentarios?|aclaraci[oó]n(?:es)?|indicaciones)\s*[:\-]\s*(.+)$/im);
  if (!t.cliente) leerBloqueCliente(lineas, t);
  t.retiro = /retir[ao] en (el )?local|retiro en|para retirar|take\s?away|pick\s?up|retira el cliente/i.test(todo);
  if (/pag(ad)?o (con )?(online|en l[ií]nea|tarjeta|mercado ?pago)|ya pagad|pagado|pago online|online|medio de pago\s*:\s*(visa|master|amex|american|cabal|naranja|maestro|d[eé]bito|cr[eé]dito|tarjeta|mercado ?pago|pago online)/i.test(todo)) t.pago = "online";
  if (/efectivo|abona con|paga con|cash/i.test(todo) && !/no (abona|paga) en efectivo/i.test(todo)) t.pago = t.pago === "online" && /pagado/i.test(todo) ? "online" : "efectivo";
  for (const l of lineas) {
    const s = l.trim();
    if (/^sub\s*-?\s*total\b/i.test(s)) t.subtotal = montoDeLinea(s) ?? t.subtotal;
    else if (/^total\b/i.test(s)) t.total = montoDeLinea(s) ?? t.total;
    else if (/^(env[ií]o|costo de (env[ií]o|entrega)|delivery|cargo de env)/i.test(s)) {
      const m = montoDeLinea(s);
      if (m != null) t.envio = Math.abs(m);
    } else if (/^(descuento|cup[oó]n|bonificaci[oó]n|promoci[oó]n|dto\.?)/i.test(s)) {
      const m = montoDeLinea(s);
      if (m != null) t.descuento = (t.descuento ?? 0) + Math.abs(m);
    }
  }
  let empezo = false;
  for (const l of lineas) {
    if (!l.trim() || /^[\s\-=_*.·~]+$/.test(l)) continue;
    if (empezo && reCierre.test(l)) break;
    const ult = t.items[t.items.length - 1];
    if (ult && reExtra.test(l) && !reItem.test(l.trim())) {
      ult.extras.push(l.trim().replace(/^[-+*•>·]\s*/, ""));
      continue;
    }
    const item = leerItem(l);
    if (item) {
      t.items.push(item);
      empezo = true;
    }
  }
  return t;
}
var reSeparador = /^[\s\-=_*.·~]{5,}$/;
var reTelLinea = /^\s*(?:tel[eé]fono|tel\.?|cel(?:ular)?|whats?app)\s*[:.\-]?\s*[+\d]/i;
function leerBloqueCliente(lineas, t) {
  let antes, despues = [];
  const iTel = lineas.findIndex((l) => reTelLinea.test(l));
  if (iTel >= 0) {
    let ini = iTel, fin = iTel;
    while (ini > 0 && !reSeparador.test(lineas[ini - 1])) ini--;
    while (fin < lineas.length - 1 && !reSeparador.test(lineas[fin + 1])) fin++;
    antes = lineas.slice(ini, iTel).map((l) => l.trim()).filter(Boolean);
    despues = lineas.slice(iTel + 1, fin + 1).map((l) => l.trim()).filter(Boolean);
  } else {
    const iPago = lineas.findIndex((l) => /^\s*(medio|forma|m[eé]todo) de pago\b/i.test(l));
    if (iPago < 0) return;
    let fin = iPago - 1;
    while (fin >= 0 && !reSeparador.test(lineas[fin])) fin--;
    if (fin < 0) return;
    let ini = fin - 1;
    while (ini >= 0 && !reSeparador.test(lineas[ini])) ini--;
    antes = lineas.slice(ini + 1, fin).map((l) => l.trim()).filter(Boolean);
  }
  while (antes.length && /^(\w{2,4},?\s*)?\d{1,2}[\/:.-]\d{1,2}([\/.-]\d{2,4})?$|^[#\d\s]+$|^(entrega|retiro|delivery|pedidos ?ya|hurrier|rider|repartidor)\b/i.test(antes[0])) antes.shift();
  if (!antes.length || antes.length > 6) return;
  if (antes.some((l) => /\$/.test(l) && reMontoFinal.test(" " + l))) return;
  if (!/\p{L}{2,}/u.test(antes[0]) || antes[0].length > 60) return;
  t.cliente = antes[0] === antes[0].toUpperCase() ? antes[0].toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : antes[0];
  const resto = antes.slice(1);
  const indicaciones = [...resto.filter((l) => /^entre\b/i.test(l)), ...despues];
  const direccion = resto.filter((l) => !/^entre\b/i.test(l));
  if (!t.direccion && direccion.length) t.direccion = direccion.join(", ");
  if (!t.notas && indicaciones.length) t.notas = indicaciones.join(" ");
}
function leerItem(linea) {
  let resto = linea.trim();
  let precio;
  const m = resto.match(reMontoFinal);
  if (m && /\d{2,}/.test(m[1])) {
    precio = parsearMonto(m[1]);
    resto = resto.slice(0, m.index).trim();
  }
  let cantidad, nombre;
  const a = resto.match(reItem);
  if (a) {
    cantidad = Number(a[1].replace(",", "."));
    nombre = a[2];
  } else {
    const b = resto.match(reItemXAlFinal);
    if (b) {
      cantidad = Number(b[2]);
      nombre = b[1];
    }
  }
  if (!cantidad || !nombre) return null;
  nombre = nombre.replace(/\s{2,}/g, " ").replace(/[.\s]+$/, "").trim();
  if ((nombre.match(/[a-záéíóúñ]/gi) ?? []).length < 3) return null;
  if (cantidad > 50) return null;
  return { cantidad, nombre, precio, extras: [] };
}
var PALABRAS_VACIAS = /* @__PURE__ */ new Set(["de", "del", "la", "el", "los", "las", "con", "y", "a", "al", "en", "pizza", "pizzas", "x", "u", "un", "una"]);
var normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();
var palabras = (s) => new Set(normalizar(s).split(" ").filter((w) => w && !PALABRAS_VACIAS.has(w)));
function parecido(a, b) {
  const A = palabras(a), B = palabras(b);
  if (!A.size || !B.size) return 0;
  let comun = 0;
  for (const w of A) if (B.has(w)) comun++;
  return comun / (A.size + B.size - comun);
}
var esMitad = (s) => /(^|\s)(1\/2|media|mitad)(\s|$)/i.test(normalizar(s));
var sinMitad = (s) => normalizar(s).replace(/(^|\s)(1\/2|media|mitad)(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
function asociarItems(items, productos2, mapeos) {
  const porTexto = new Map(mapeos.map((m) => [m.texto, m]));
  const vendibles = productos2;
  return items.map((it) => {
    const clave = normalizar(it.nombre);
    const map = porTexto.get(clave);
    if (map) {
      if (map.ignorar) return { ...it, ignorar: true, como: "asociado", sugerencias: [] };
      const p = productos2.find((x) => x.id === map.productoId);
      if (p) return { ...it, producto: p, variante: map.variante, como: "asociado", sugerencias: [] };
    }
    const mitad = esMitad(it.nombre);
    const base = mitad ? sinMitad(it.nombre) : clave;
    const exacto = vendibles.find((p) => normalizar(p.nombre) === base);
    if (exacto) return { ...it, producto: exacto, variante: mitad ? "mitad" : void 0, como: "nombre", sugerencias: [] };
    const puntajes = vendibles.map((p) => ({ p, s: parecido(base, p.nombre) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const [uno, dos] = puntajes;
    if (uno && uno.s >= 0.75 && (!dos || uno.s - dos.s >= 0.15)) {
      return { ...it, producto: uno.p, variante: mitad ? "mitad" : void 0, como: "parecido", sugerencias: [] };
    }
    return { ...it, sugerencias: puntajes.slice(0, 4).map((x) => x.p) };
  });
}
var faltantes = (items) => items.filter((i) => !i.producto && !i.ignorar);
function armarImportacion(t, items) {
  const lineas = items.filter((i) => !i.ignorar && i.producto).map((i) => {
    const precioLinea = i.precio ?? (i.variante === "mitad" ? i.producto.precioMitad ?? i.producto.precio / 2 : i.producto.precio) * i.cantidad;
    return {
      productoId: i.producto.id,
      descripcion: i.producto.nombre + (i.variante === "mitad" ? " (\xBD)" : ""),
      variante: i.variante,
      cantidad: i.cantidad,
      precioUnit: Math.round(precioLinea / i.cantidad * 100) / 100,
      nota: i.extras.length ? i.extras.join(", ").slice(0, 300) : void 0
    };
  });
  const subtotal = lineas.reduce((s, l) => s + l.precioUnit * l.cantidad, 0);
  const envio = t.retiro ? 0 : t.envio ?? 0;
  let descuento = t.descuento ?? 0;
  let adicional = 0;
  const total = t.total ?? Math.max(0, subtotal + envio - descuento);
  const diferencia = Math.round((total - (subtotal + envio - descuento)) * 100) / 100;
  if (diferencia > 0) adicional = diferencia;
  else if (diferencia < 0) descuento += -diferencia;
  const online = t.pago !== "efectivo";
  return {
    tipo: t.retiro ? "mostrador" : "delivery",
    clienteNombre: t.cliente,
    clienteTel: t.telefono,
    direccion: t.direccion,
    observaciones: ["PedidosYa" + (t.numero ? ` #${t.numero}` : ""), t.notas].filter(Boolean).join(" \xB7 "),
    numeroExterno: t.numero,
    subtotal,
    costoEnvio: envio,
    descuento,
    adicional,
    total,
    cobrada: online,
    items: lineas,
    pagos: [{ forma: online ? "pedidosya" : "efectivo", monto: total }]
  };
}
function interpretarPedido(texto, productos2, mapeos) {
  const ticket = parsearTicket(texto);
  const items = asociarItems(ticket.items, productos2, mapeos);
  let error;
  if (!ticket.items.length) error = "No se encontraron productos en el ticket";
  else if (faltantes(items).length) error = `No se reconoce: ${faltantes(items).map((i) => i.nombre).join(", ")}`;
  return { ticket, items, error, importacion: error ? void 0 : armarImportacion(ticket, items) };
}

// src/data/menu.ts
var BASE = [["bollo", 1], ["salsa", 120], ["muzza", 350]];
var grande = (key, nombre, precio, mitad, extra2 = []) => ({
  key,
  categoria: "grandes",
  nombre: `Grande ${nombre}`,
  precio,
  precioMitad: mitad,
  receta: [...BASE, ...extra2]
});
var empanada = (codigo, nombre, relleno) => ({
  key: `emp-${codigo.toLowerCase()}`,
  categoria: "empanadas",
  codigo,
  nombre,
  precio: 2200,
  coccion: true,
  receta: [["tapa", 1], ...relleno]
});
var extra = (key, nombre, precio, receta = []) => ({
  key,
  categoria: "grandes",
  tipo: "extra",
  nombre,
  precio,
  receta
});
var productos = [
  // ---- Extras de pizzas grandes
  extra("ad-albahaca", "Adicional Albahaca", 500),
  extra("ad-provenzal", "Adicional Provenzal", 500),
  extra("ad-rucula", "Adicional R\xFAcula", 500),
  extra("ad-huevo", "Adicional Huevo", 800, [["huevo", 1]]),
  extra("ad-tomate", "Adicional Tomate", 800, [["tomate", 120]]),
  extra("ad-jamon", "Adicional Jam\xF3n", 1e3, [["jamon", 3]]),
  extra("ad-crudo", "Adicional Jam\xF3n Crudo", 1500, [["crudo", 2]]),
  extra("ad-panceta", "Adicional Panceta", 1200, [["panceta", 3]]),
  extra("ad-calabresa", "Adicional Calabresa", 1e3, [["calabresa", 6]]),
  { ...extra("armado-mitad", "Armado mitad y mitad", 1500), codigo: "ARMADO-MITAD", descripcion: "Se suma solo por cada pizza armada con dos mitades" },
  // ---- Pizzas grandes (entera / mitad)
  grande("g-muzza", "Muzzarella", 18800, 9400, [["aceitunas", 20]]),
  grande("g-fugazza", "Fugazza", 19500, 9900, [["cebolla", 250]]),
  grande("g-fugazzeta", "Fugazzeta", 21800, 10900, [["cebolla", 250], ["muzza", 100]]),
  grande("g-anchoas", "Salsa y Anchoas", 21300, 10900, [["anchoas", 40]]),
  grande("g-fugajamon", "Fugazzeta y Jam\xF3n", 22500, 11900, [["cebolla", 250], ["muzza", 100], ["jamon", 8]]),
  grande("g-muzzanchoas", "Muzza y Anchoas", 22500, 11900, [["anchoas", 40]]),
  grande("g-muzzahuevo", "Muzza y Huevo", 22500, 11900, [["huevo", 2]]),
  grande("g-muzzajamon", "Muzza con Jam\xF3n", 22500, 11900, [["jamon", 8]]),
  grande("g-napo", "Napolitana", 22500, 11900, [["tomate", 200]]),
  grande("g-napojamon", "Napo y Jam\xF3n", 23500, 12400, [["tomate", 200], ["jamon", 8]]),
  grande("g-jym", "Jam\xF3n y Morr\xF3n", 23500, 12400, [["jamon", 8], ["morron", 120]]),
  grande("g-jyh", "Jam\xF3n y Huevo", 23500, 12400, [["jamon", 8], ["huevo", 2]]),
  grande("g-calabresa", "Calabresa", 23500, 12400, [["calabresa", 12]]),
  // ---- Pizzas chicas
  { key: "c-muzza", categoria: "chicas", nombre: "Chica Muzzarella", precio: 11e3, receta: [["bollo-chico", 1], ["salsa", 70], ["muzza", 200]] },
  { key: "c-napo", categoria: "chicas", nombre: "Chica Napolitana", precio: 13e3, receta: [["bollo-chico", 1], ["salsa", 70], ["muzza", 200], ["tomate", 120]] },
  { key: "c-jym", categoria: "chicas", nombre: "Chica Jam\xF3n y Morr\xF3n", precio: 13500, receta: [["bollo-chico", 1], ["salsa", 70], ["muzza", 200], ["jamon", 5], ["morron", 70]] },
  // ---- Molde
  { key: "m-muzza", categoria: "molde", nombre: "Molde Muzzarella", precio: 21e3, precioMitad: 10500, receta: [["prepizza-molde", 1], ["salsa", 150], ["muzza", 450]] },
  { key: "m-napo", categoria: "molde", nombre: "Molde Napolitana", precio: 24e3, precioMitad: 12e3, receta: [["prepizza-molde", 1], ["salsa", 150], ["muzza", 450], ["tomate", 250]] },
  { key: "m-fugazzeta", categoria: "molde", nombre: "Molde Fugazzeta", precio: 24e3, precioMitad: 12e3, receta: [["prepizza-molde", 1], ["muzza", 550], ["cebolla", 300]] },
  // ---- Empanadas (horno / frita)
  empanada("CC", "Carne a cuchillo", [["relleno-carne", 70]]),
  empanada("CAP", "Capresse", [["muzza", 40], ["tomate", 25]]),
  empanada("CQ", "Cebolla y queso", [["muzza", 40], ["cebolla", 30]]),
  empanada("H", "Humita", [["relleno-humita", 70]]),
  empanada("JQ", "Jam\xF3n y queso", [["jamon", 1], ["muzza", 40]]),
  empanada("JR", "Jam\xF3n y roquefort", [["jamon", 1], ["roquefort", 30]]),
  empanada("P", "Pollo", [["relleno-pollo", 70]]),
  empanada("V", "Verdura", [["relleno-verdura", 70]]),
  // ---- Canastitas y tartas
  { key: "can-jq", categoria: "canastitas", nombre: "Canastita Jam\xF3n y queso", precio: 2500 },
  { key: "can-v", categoria: "canastitas", nombre: "Canastita Verdura", precio: 2500 },
  { key: "t-jq", categoria: "tartas", nombre: "Tarta Jam\xF3n y queso", precio: 14e3 },
  { key: "t-v", categoria: "tartas", nombre: "Tarta Verdura", precio: 13e3 },
  // ---- Bebidas
  { key: "b-coca15", categoria: "bebidas", nombre: "Coca-Cola 1.5L", precio: 4500, receta: [["coca-15", 1]] },
  { key: "b-pepsilata", categoria: "bebidas", nombre: "Lata Pepsi", precio: 2e3, receta: [["lata-pepsi", 1]] },
  { key: "b-agua", categoria: "bebidas", nombre: "Agua 500ml", precio: 2e3, receta: [["agua", 1]] },
  { key: "b-cerveza", categoria: "bebidas", nombre: "Cerveza 1L", precio: 5500, receta: [["cerveza", 1]] },
  // ---- Promos
  {
    key: "promo-1",
    categoria: "promos",
    tipo: "promo",
    codigo: "P325",
    nombre: "PROMO 1",
    descripcion: "1 GRD MUZZA + 1 GRD JAM\xD3N Y MORR\xD3N + ENV\xCDO",
    precio: 39999,
    incluyeEnvio: true,
    fijos: [{ producto: "g-muzza", cantidad: 1 }, { producto: "g-jym", cantidad: 1 }]
  },
  {
    key: "promo-2",
    categoria: "promos",
    tipo: "promo",
    codigo: "P321",
    nombre: "PROMO 2",
    descripcion: "1 GRD MUZZA + 1 GRD NAPO + ENV\xCDO",
    precio: 39999,
    incluyeEnvio: true,
    fijos: [{ producto: "g-muzza", cantidad: 1 }, { producto: "g-napo", cantidad: 1 }]
  },
  {
    key: "promo-3",
    categoria: "promos",
    tipo: "promo",
    codigo: "P324",
    nombre: "PROMO 3",
    descripcion: "1 GRD MUZZA + 1 GRD NAPO + 1 GRD JAM\xD3N Y MORR\xD3N + ENV\xCDO",
    precio: 57999,
    incluyeEnvio: true,
    fijos: [{ producto: "g-muzza", cantidad: 1 }, { producto: "g-napo", cantidad: 1 }, { producto: "g-jym", cantidad: 1 }]
  },
  {
    key: "promo-4",
    categoria: "promos",
    tipo: "promo",
    codigo: "P353",
    nombre: "PROMO 4",
    descripcion: "GDE. MUZZARELLA + 4 EMPANADAS A ELECCI\xD3N",
    precio: 28999,
    fijos: [{ producto: "g-muzza", cantidad: 1 }],
    slots: [{ nombre: "Empanadas", categoria: "empanadas", cantidad: 4 }]
  },
  {
    key: "promo-5",
    categoria: "promos",
    tipo: "promo",
    codigo: "P354",
    nombre: "PROMO 5",
    descripcion: "GDE. JAM\xD3N Y HUEVO + 4 EMPANADAS",
    precio: 32999,
    fijos: [{ producto: "g-jyh", cantidad: 1 }],
    slots: [{ nombre: "Empanadas", categoria: "empanadas", cantidad: 4 }]
  },
  {
    key: "promo-6",
    categoria: "promos",
    tipo: "promo",
    codigo: "P8522",
    nombre: "PROMO 6",
    descripcion: "1 GRD JAM\xD3N Y MORR\xD3N + 4 EMPANADAS + ENV\xCDO",
    precio: 32999,
    incluyeEnvio: true,
    fijos: [{ producto: "g-jym", cantidad: 1 }],
    slots: [{ nombre: "Empanadas", categoria: "empanadas", cantidad: 4 }]
  },
  {
    key: "promo-chica",
    categoria: "promos",
    tipo: "promo",
    codigo: "P6374",
    nombre: "PROMO CHICA",
    descripcion: "Lata Pepsi + Muzza Chica",
    precio: 9999,
    fijos: [{ producto: "b-pepsilata", cantidad: 1, variante: "unica" }, { producto: "c-muzza", cantidad: 1, variante: "unica" }]
  },
  {
    key: "promo-emp-bebida",
    categoria: "promos",
    tipo: "promo",
    codigo: "P8694",
    nombre: "Promo 2 Empanadas + Bebida",
    descripcion: "2 empanadas a elecci\xF3n + bebida",
    precio: 6999,
    slots: [
      { nombre: "Empanadas", categoria: "empanadas", cantidad: 2 },
      { nombre: "Bebida", categoria: "bebidas", cantidad: 1 }
    ]
  },
  {
    key: "promo-molde",
    categoria: "promos-molde",
    tipo: "promo",
    nombre: "PROMO MOLDE",
    descripcion: "Molde Muzzarella + 6 empanadas",
    precio: 31999,
    fijos: [{ producto: "m-muzza", cantidad: 1 }],
    slots: [{ nombre: "Empanadas", categoria: "empanadas", cantidad: 6 }]
  }
];

// src/lib/menu.ts
function resolverCatalogo(menu, zonas, sucursalId) {
  const ajustes = new Map(menu.ajustes.map((a) => [a.productoId, a]));
  const sueltas = new Set(menu.categoriasSueltas ?? []);
  const cats = menu.categorias.map((c) => c.padreId && sueltas.has(c.padreId) ? { ...c, padreId: void 0 } : c);
  const porId = new Map(cats.map((c) => [c.id, c]));
  const ocultas = new Set((menu.categoriasOcultas ?? []).flatMap((id) => [id, ...cats.filter((c) => c.padreId === id).map((c) => c.id)]));
  const enLocal = (c) => c.activa && !ocultas.has(c.id) && (!c.sucursalId || c.sucursalId === sucursalId);
  const padreVisible = (c) => {
    const p = c.padreId ? porId.get(c.padreId) : void 0;
    return !p || enLocal(p);
  };
  const envioGratis = (id) => {
    const c = porId.get(id);
    return !!c && (!!c.incluyeEnvio || !!(c.padreId && porId.get(c.padreId)?.incluyeEnvio));
  };
  const productos2 = menu.productos.filter((p) => p.activo && (!p.sucursalId || p.sucursalId === sucursalId) && !ocultas.has(p.categoriaId)).filter((p) => !ajustes.get(p.id)?.oculto).map((p) => {
    const a = ajustes.get(p.id);
    return {
      ...p,
      precio: a?.precio ?? p.precio,
      precioMitad: p.precioMitad == null ? void 0 : a?.precioMitad ?? p.precioMitad,
      agotado: !!a?.agotado,
      // Envío gratis: lo marca la promo o su categoría (o la categoría de afuera)
      incluyeEnvio: p.incluyeEnvio || envioGratis(p.categoriaId)
    };
  });
  const conProductos = cats.filter((c) => enLocal(c) && padreVisible(c)).filter((c) => productos2.some((p) => p.categoriaId === c.id));
  const contenedoras = cats.filter((c) => enLocal(c) && !conProductos.includes(c) && conProductos.some((h) => h.padreId === c.id));
  const categorias2 = [...conProductos, ...contenedoras].sort((a, b) => a.orden - b.orden);
  return { categorias: categorias2, productos: productos2, zonas };
}

// src/data/supabaseRepo.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/lib/caja.ts
var TURNOS_DEFECTO = [{ nombre: "Ma\xF1ana", desde: "06:00" }, { nombre: "Tarde", desde: "14:00" }, { nombre: "Noche", desde: "19:00" }];
var TURNOS = TURNOS_DEFECTO.map((t) => t.nombre);

// src/data/supabaseRepo.ts
var num = (v) => v == null ? 0 : Number(v);
var numOpt = (v) => v == null ? void 0 : Number(v);
var opt = (v) => v == null ? void 0 : v;
var mapCategoria = (c) => ({
  id: c.id,
  nombre: c.nombre,
  orden: c.orden,
  color: c.color,
  activa: c.activa,
  sucursalId: opt(c.sucursal_id),
  padreId: opt(c.padre_id),
  incluyeEnvio: !!c.incluye_envio
});
function mapProducto(p) {
  return {
    id: p.id,
    categoriaId: p.categoria_id,
    sucursalId: opt(p.sucursal_id),
    tipo: p.tipo,
    codigo: opt(p.codigo),
    nombre: p.nombre,
    descripcion: opt(p.descripcion),
    precio: num(p.precio),
    precioMitad: numOpt(p.precio_mitad),
    admiteCoccion: p.admite_coccion,
    incluyeEnvio: p.incluye_envio,
    orden: p.orden,
    activo: p.activo,
    receta: (p.recetas ?? []).map((r) => ({ ingredienteId: r.ingrediente_id, cantidad: num(r.cantidad) })),
    fijos: (p.promo_fijos ?? []).map((f) => ({ productoId: f.producto_id, cantidad: f.cantidad, variante: f.variante })),
    slots: (p.promo_slots ?? []).sort((a, b) => a.orden - b.orden).map((s) => ({ id: s.id, nombre: s.nombre, categoriaId: s.categoria_id ?? "", cantidad: s.cantidad, minimo: s.minimo ?? void 0, productos: s.productos ?? void 0 }))
  };
}
var datosImportacion = (d) => ({
  tipo: d.tipo,
  cliente_nombre: d.clienteNombre ?? null,
  cliente_tel: d.clienteTel ?? null,
  direccion: d.direccion ?? null,
  observaciones: d.observaciones ?? null,
  numero_externo: d.numeroExterno ?? null,
  subtotal: d.subtotal,
  costo_envio: d.costoEnvio,
  descuento: d.descuento,
  adicional: d.adicional,
  total: d.total,
  cobrada: d.cobrada,
  items: d.items.map((i) => ({ producto_id: i.productoId ?? null, descripcion: i.descripcion, variante: i.variante ?? null, cantidad: i.cantidad, precio_unit: i.precioUnit, nota: i.nota ?? null })),
  pagos: d.pagos.map((p) => ({ forma: p.forma, monto: p.monto }))
});
var SELECT_PRODUCTO = "*, recetas(*), promo_fijos!promo_fijos_promo_id_fkey(*), promo_slots(*)";

// src/server/importarPedidosYa.ts
var ERROR_IMAGEN = 'El ticket lleg\xF3 como imagen y no se puede leer. La impresora virtual tiene que usar el driver "Generic / Text Only".';
async function menuDelLocal(sb, cuentaId, sucursalId) {
  const filtroLocal = `sucursal_id.is.null,sucursal_id.eq.${sucursalId}`;
  const [cats, prods, ajustes, ocultas] = await Promise.all([
    sb.from("categorias").select("*").eq("cuenta_id", cuentaId).or(filtroLocal).order("orden"),
    sb.from("productos").select(SELECT_PRODUCTO).eq("cuenta_id", cuentaId).or(filtroLocal).order("orden"),
    sb.from("producto_sucursal").select("*").eq("sucursal_id", sucursalId),
    sb.from("categoria_sucursal").select("*").eq("sucursal_id", sucursalId)
  ]);
  for (const r of [cats, prods, ajustes]) if (r.error) throw new Error(r.error.message);
  const filasOcultas = ocultas.error ? [] : ocultas.data;
  return {
    categorias: cats.data.map(mapCategoria),
    productos: prods.data.map(mapProducto),
    ajustes: ajustes.data.map((a) => ({
      productoId: a.producto_id,
      precio: a.precio == null ? void 0 : Number(a.precio),
      precioMitad: a.precio_mitad == null ? void 0 : Number(a.precio_mitad),
      oculto: a.oculto,
      agotado: a.agotado
    })),
    ingredientes: [],
    categoriasOcultas: filasOcultas.filter((r) => (r.modo ?? "oculta") === "oculta").map((r) => r.categoria_id),
    categoriasSueltas: filasOcultas.filter((r) => r.modo === "suelta").map((r) => r.categoria_id)
  };
}
async function mapeosDeCuenta(sb, cuentaId) {
  const r = await sb.from("mapeos_externos").select("*").eq("cuenta_id", cuentaId);
  if (r.error) throw new Error(r.error.message);
  return r.data.map((m) => ({
    id: m.id,
    canal: m.canal,
    texto: m.texto,
    productoId: m.producto_id ?? void 0,
    variante: m.variante ?? void 0,
    ignorar: m.ignorar
  }));
}
async function marcarError(sb, id, error, datos) {
  const fila = { estado: "error", error };
  if (datos !== void 0) fila.datos = datos;
  await sb.from("pedidos_externos").update(fila).eq("id", id).in("estado", ["pendiente", "procesando", "error"]);
}
async function importarPendientes(sb, filtro) {
  if (!filtro.id && !filtro.sucursalId) return [];
  let q = sb.from("pedidos_externos").select("id, sucursal_id, texto, formato, created_at").eq("estado", "pendiente").gt("created_at", new Date(Date.now() - 24 * 36e5).toISOString()).order("created_at").limit(30);
  q = filtro.id ? q.eq("id", filtro.id) : q.eq("sucursal_id", filtro.sucursalId);
  const { data: pendientes, error } = await q;
  if (error) throw new Error(error.message);
  if (!pendientes?.length) return [];
  const resultados = [];
  const porLocal = /* @__PURE__ */ new Map();
  for (const p of pendientes) porLocal.set(p.sucursal_id, [...porLocal.get(p.sucursal_id) ?? [], p]);
  for (const [sucursalId, lista] of porLocal) {
    const caja = await sb.from("cajas").select("id").eq("sucursal_id", sucursalId).eq("estado", "abierta").maybeSingle();
    if (!caja.data) {
      for (const p of lista) resultados.push({ id: p.id, estado: "pendiente", detalle: "Sin caja abierta" });
      continue;
    }
    const suc = await sb.from("sucursales").select("cuenta_id").eq("id", sucursalId).single();
    if (suc.error) throw new Error(suc.error.message);
    const cuentaId = suc.data.cuenta_id;
    const [menu, mapeos] = await Promise.all([menuDelLocal(sb, cuentaId, sucursalId), mapeosDeCuenta(sb, cuentaId)]);
    const productos2 = resolverCatalogo(menu, [], sucursalId).productos;
    for (const p of lista) {
      if (p.formato === "imagen") {
        await marcarError(sb, p.id, ERROR_IMAGEN);
        resultados.push({ id: p.id, estado: "error", detalle: ERROR_IMAGEN });
        continue;
      }
      const r = interpretarPedido(p.texto, productos2, mapeos);
      if (r.error || !r.importacion) {
        await marcarError(sb, p.id, r.error ?? "No se pudo leer el ticket", { ticket: r.ticket });
        resultados.push({ id: p.id, estado: "error", detalle: r.error });
        continue;
      }
      const imp = await sb.rpc("importar_pedido_externo_servidor", { p_id: p.id, p_datos: datosImportacion(r.importacion) });
      if (imp.error) {
        await marcarError(sb, p.id, imp.error.message, { ticket: r.ticket });
        resultados.push({ id: p.id, estado: "error", detalle: imp.error.message });
      } else {
        resultados.push({ id: p.id, estado: imp.data ? "importado" : "repetido" });
      }
    }
  }
  return resultados;
}

// src/server/funcionPedidosYa.ts
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  let body = {};
  try {
    body = await req.json();
  } catch {
  }
  const uuid = /^[0-9a-f-]{36}$/i;
  const id = body.id && uuid.test(body.id) ? body.id : void 0;
  const sucursalId = body.sucursal_id && uuid.test(body.sucursal_id) ? body.sucursal_id : void 0;
  if (!id && !sucursalId) return Response.json({ error: "Falta id o sucursal_id" }, { status: 400 });
  const sb = createClient2(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  try {
    const resultados = await importarPendientes(sb, { id, sucursalId });
    return Response.json({ resultados });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
