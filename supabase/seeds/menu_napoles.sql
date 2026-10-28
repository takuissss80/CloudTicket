-- =====================================================================
-- Menú de Napoles (carta oficial) — cargar en el MENÚ MADRE de la cuenta
-- =====================================================================
-- Cómo usarlo: Supabase -> SQL Editor -> pegar todo -> Run.
-- 1) Cambiá v_nombre_cuenta si tu cuenta no se llama "Napoles".
-- 2) BORRA el menú madre actual de esa cuenta (categorías y productos sin
--    local) y carga este. Los productos propios de cada local no se tocan.
--    Los pedidos viejos no se pierden: guardan nombre y precio aparte.
-- 3) Se puede correr de nuevo cuando quieras: deja el menú igual a este.
-- =====================================================================
do $$
declare
  v_nombre_cuenta text := 'Napoles';
  v_cuenta uuid;
  c_promos uuid; c_grandes uuid; c_chicas uuid; c_emp uuid; c_can uuid; c_beb uuid;
  v_promo uuid;
begin
  select id into v_cuenta from cuentas where nombre ilike v_nombre_cuenta order by created_at limit 1;
  if v_cuenta is null then
    raise exception 'No encontré la cuenta "%". Cambiá v_nombre_cuenta arriba (select nombre from cuentas;)', v_nombre_cuenta;
  end if;

  -- Limpia el menú madre anterior (los productos caen en cascada)
  delete from productos where cuenta_id = v_cuenta and sucursal_id is null;
  delete from categorias where cuenta_id = v_cuenta and sucursal_id is null;

  -- Categorías (orden = cómo aparecen en la pantalla de pedidos)
  insert into categorias (cuenta_id, nombre, orden, color) values (v_cuenta, 'PROMOS', 0, 'red') returning id into c_promos;
  insert into categorias (cuenta_id, nombre, orden, color) values (v_cuenta, 'PIZZAS GRANDES 8 porciones', 1, 'blue') returning id into c_grandes;
  insert into categorias (cuenta_id, nombre, orden, color) values (v_cuenta, 'PIZZAS CHICAS 4 porciones', 2, 'blue') returning id into c_chicas;
  insert into categorias (cuenta_id, nombre, orden, color) values (v_cuenta, 'EMPANADAS', 3, 'amber') returning id into c_emp;
  insert into categorias (cuenta_id, nombre, orden, color) values (v_cuenta, 'CANASTITAS', 4, 'amber') returning id into c_can;
  insert into categorias (cuenta_id, nombre, orden, color) values (v_cuenta, 'BEBIDAS', 5, 'green') returning id into c_beb;

  -- Pizzas grandes: la mitad se cobra al precio de la chica
  insert into productos (cuenta_id, categoria_id, nombre, precio, precio_mitad, orden) values
    (v_cuenta, c_grandes, 'Grande Muzzarella', 18800, 9400, 0),
    (v_cuenta, c_grandes, 'Grande Fugazza', 19500, 9900, 1),
    (v_cuenta, c_grandes, 'Grande Fugazzeta', 21800, 10900, 2),
    (v_cuenta, c_grandes, 'Grande Salsa y Anchoas', 21300, 10900, 3),
    (v_cuenta, c_grandes, 'Grande Fugazzeta con Jamón', 22500, 11900, 4),
    (v_cuenta, c_grandes, 'Grande Muzzarella y Anchoas', 22500, 11900, 5),
    (v_cuenta, c_grandes, 'Grande Muzzarella con Huevo', 22500, 11900, 6),
    (v_cuenta, c_grandes, 'Grande Muzzarella Doble', 22500, 11900, 7),
    (v_cuenta, c_grandes, 'Grande Muzzarella con Jamón', 22500, 11900, 8),
    (v_cuenta, c_grandes, 'Grande Napolitana', 22800, 11900, 9),
    (v_cuenta, c_grandes, 'Grande Napolitana con Jamón', 23300, 11900, 10),
    (v_cuenta, c_grandes, 'Grande Napolitana con Huevo', 23300, 11900, 11),
    (v_cuenta, c_grandes, 'Grande Calabresa', 22800, 11900, 12),
    (v_cuenta, c_grandes, 'Grande Calabresa con Morrón', 23300, 11900, 13),
    (v_cuenta, c_grandes, 'Grande Jamón y Morrón', 23000, 11900, 14),
    (v_cuenta, c_grandes, 'Grande Jamón y Huevo', 22800, 11900, 15),
    (v_cuenta, c_grandes, 'Grande Champignon', 22800, 11900, 16),
    (v_cuenta, c_grandes, 'Grande Capresse', 22800, 11900, 17),
    (v_cuenta, c_grandes, 'Grande Palmitos y Jamón', 23500, 11900, 18),
    (v_cuenta, c_grandes, 'Grande Jamón Crudo y Rúcula', 23300, 11900, 19),
    (v_cuenta, c_grandes, 'Grande Ananá y Jamón', 23000, 11900, 20),
    (v_cuenta, c_grandes, 'Grande 4 Quesos', 23000, 11900, 21),
    (v_cuenta, c_grandes, 'Grande Roquefort', 22800, 11900, 22),
    (v_cuenta, c_grandes, 'Grande Roquefort con Jamón', 23100, 11900, 23),
    (v_cuenta, c_grandes, 'Grande Panceta', 22800, 11900, 24),
    (v_cuenta, c_grandes, 'Grande Panceta con Roquefort', 23300, 11900, 25),
    (v_cuenta, c_grandes, 'Grande Panceta, Roquefort y Morrón', 23800, 11900, 26),
    (v_cuenta, c_grandes, 'Grande Jamón Crudo y Morrón', 23500, 11900, 27),
    (v_cuenta, c_grandes, 'Grande Jamón Crudo, Morrón y Huevo', 24000, 12900, 28),
    (v_cuenta, c_grandes, 'Grande Salchicha a la Mostaza', 22500, 11900, 29),
    (v_cuenta, c_grandes, 'Grande Fugazzeta Caramelizada', 22100, 11900, 30),
    (v_cuenta, c_grandes, 'Grande Especial Napoles', 25900, 12900, 31);

  -- Pizzas chicas
  insert into productos (cuenta_id, categoria_id, nombre, precio, orden) values
    (v_cuenta, c_chicas, 'Chica Muzzarella', 9400, 0),
    (v_cuenta, c_chicas, 'Chica Fugazza', 9900, 1),
    (v_cuenta, c_chicas, 'Chica Fugazzeta', 10900, 2),
    (v_cuenta, c_chicas, 'Chica Salsa y Anchoas', 10900, 3),
    (v_cuenta, c_chicas, 'Chica Fugazzeta con Jamón', 11900, 4),
    (v_cuenta, c_chicas, 'Chica Muzzarella y Anchoas', 11900, 5),
    (v_cuenta, c_chicas, 'Chica Muzzarella con Huevo', 11900, 6),
    (v_cuenta, c_chicas, 'Chica Muzzarella Doble', 11900, 7),
    (v_cuenta, c_chicas, 'Chica Muzzarella con Jamón', 11900, 8),
    (v_cuenta, c_chicas, 'Chica Napolitana', 11900, 9),
    (v_cuenta, c_chicas, 'Chica Napolitana con Jamón', 11900, 10),
    (v_cuenta, c_chicas, 'Chica Napolitana con Huevo', 11900, 11),
    (v_cuenta, c_chicas, 'Chica Calabresa', 11900, 12),
    (v_cuenta, c_chicas, 'Chica Calabresa con Morrón', 11900, 13),
    (v_cuenta, c_chicas, 'Chica Jamón y Morrón', 11900, 14),
    (v_cuenta, c_chicas, 'Chica Jamón y Huevo', 11900, 15),
    (v_cuenta, c_chicas, 'Chica Champignon', 11900, 16),
    (v_cuenta, c_chicas, 'Chica Capresse', 11900, 17),
    (v_cuenta, c_chicas, 'Chica Palmitos y Jamón', 11900, 18),
    (v_cuenta, c_chicas, 'Chica Jamón Crudo y Rúcula', 11900, 19),
    (v_cuenta, c_chicas, 'Chica Ananá y Jamón', 11900, 20),
    (v_cuenta, c_chicas, 'Chica 4 Quesos', 11900, 21),
    (v_cuenta, c_chicas, 'Chica Roquefort', 11900, 22),
    (v_cuenta, c_chicas, 'Chica Roquefort con Jamón', 11900, 23),
    (v_cuenta, c_chicas, 'Chica Panceta', 11900, 24),
    (v_cuenta, c_chicas, 'Chica Panceta con Roquefort', 11900, 25),
    (v_cuenta, c_chicas, 'Chica Panceta, Roquefort y Morrón', 11900, 26),
    (v_cuenta, c_chicas, 'Chica Jamón Crudo y Morrón', 11900, 27),
    (v_cuenta, c_chicas, 'Chica Jamón Crudo, Morrón y Huevo', 12900, 28),
    (v_cuenta, c_chicas, 'Chica Salchicha a la Mostaza', 11900, 29),
    (v_cuenta, c_chicas, 'Chica Fugazzeta Caramelizada', 11900, 30),
    (v_cuenta, c_chicas, 'Chica Especial Napoles', 12900, 31);

  -- Empanadas ($3.000 c/u; media docena y docena salen al mismo precio por unidad)
  insert into productos (cuenta_id, categoria_id, codigo, nombre, precio, orden) values
    (v_cuenta, c_emp, 'CC', 'Carne a cuchillo', 3000, 0),
    (v_cuenta, c_emp, 'CAP', 'Capresse', 3000, 1),
    (v_cuenta, c_emp, 'CQ', 'Cebolla y queso', 3000, 2),
    (v_cuenta, c_emp, 'H', 'Humita', 3000, 3),
    (v_cuenta, c_emp, 'JQ', 'Jamón y queso', 3000, 4),
    (v_cuenta, c_emp, 'JR', 'Jamón y roquefort', 3000, 5),
    (v_cuenta, c_emp, 'P', 'Pollo', 3000, 6),
    (v_cuenta, c_emp, 'V', 'Verdura', 3000, 7);

  -- Canastitas
  insert into productos (cuenta_id, categoria_id, nombre, precio, orden) values
    (v_cuenta, c_can, 'Salchicha a la mostaza', 4500, 0),
    (v_cuenta, c_can, 'Fugazzeta', 4500, 1),
    (v_cuenta, c_can, 'Napolitana', 4500, 2),
    (v_cuenta, c_can, 'Capresse', 4500, 3),
    (v_cuenta, c_can, 'Calabresa con morrón', 4500, 4),
    (v_cuenta, c_can, 'Panceta, muzzarella y ciruela', 4500, 5),
    (v_cuenta, c_can, 'Panceta, muzzarella y roquefort', 4500, 6),
    (v_cuenta, c_can, 'Jamón y palmito', 4500, 7),
    (v_cuenta, c_can, 'Jamón y ananá', 4500, 8),
    (v_cuenta, c_can, 'Jamón y morrón', 4500, 9),
    (v_cuenta, c_can, 'Crudo y rúcula', 4500, 10),
    (v_cuenta, c_can, 'Crudo y morrón', 4500, 11),
    (v_cuenta, c_can, '4 quesos', 4500, 12),
    (v_cuenta, c_can, 'Muzzarella, salsa y anchoas', 4500, 13);

  -- Bebidas: la lata de Pepsi existe para la Promo 7. Está inactiva hasta que
  -- le pongas precio desde Administración si la querés vender suelta.
  insert into productos (cuenta_id, categoria_id, nombre, precio, orden, activo)
  values (v_cuenta, c_beb, 'Lata Pepsi', 0, 0, false);

  -- Promociones (todas con envío gratis)
  insert into productos (cuenta_id, categoria_id, tipo, codigo, nombre, descripcion, precio, incluye_envio, orden)
  values (v_cuenta, c_promos, 'promo', 'P1', 'PROMO 1', '1 MUZZA + 1 JAMÓN Y MORRÓN', 39999, true, 0) returning id into v_promo;
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Muzzarella';
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Jamón y Morrón';

  insert into productos (cuenta_id, categoria_id, tipo, codigo, nombre, descripcion, precio, incluye_envio, orden)
  values (v_cuenta, c_promos, 'promo', 'P2', 'PROMO 2', '1 MUZZA + 1 NAPOLITANA', 39999, true, 1) returning id into v_promo;
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Muzzarella';
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Napolitana';

  insert into productos (cuenta_id, categoria_id, tipo, codigo, nombre, descripcion, precio, incluye_envio, orden)
  values (v_cuenta, c_promos, 'promo', 'P3', 'PROMO 3', '1 MUZZA + 1 NAPOLITANA + 1 JAMÓN Y MORRÓN', 57999, true, 2) returning id into v_promo;
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Muzzarella';
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Napolitana';
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Jamón y Morrón';

  insert into productos (cuenta_id, categoria_id, tipo, codigo, nombre, descripcion, precio, incluye_envio, orden)
  values (v_cuenta, c_promos, 'promo', 'P4', 'PROMO 4', '1 MUZZA + 4 EMPANADAS', 28999, true, 3) returning id into v_promo;
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Muzzarella';
  insert into promo_slots (promo_id, nombre, categoria_id, cantidad) values (v_promo, 'Empanadas', c_emp, 4);

  insert into productos (cuenta_id, categoria_id, tipo, codigo, nombre, descripcion, precio, incluye_envio, orden)
  values (v_cuenta, c_promos, 'promo', 'P5', 'PROMO 5', '1 JAMÓN Y HUEVO + 4 EMPANADAS', 32999, true, 4) returning id into v_promo;
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Jamón y Huevo';
  insert into promo_slots (promo_id, nombre, categoria_id, cantidad) values (v_promo, 'Empanadas', c_emp, 4);

  insert into productos (cuenta_id, categoria_id, tipo, codigo, nombre, descripcion, precio, incluye_envio, orden)
  values (v_cuenta, c_promos, 'promo', 'P6', 'PROMO 6', '1 JAMÓN Y MORRÓN + 4 EMPANADAS', 32999, true, 5) returning id into v_promo;
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'entera' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Grande Jamón y Morrón';
  insert into promo_slots (promo_id, nombre, categoria_id, cantidad) values (v_promo, 'Empanadas', c_emp, 4);

  insert into productos (cuenta_id, categoria_id, tipo, codigo, nombre, descripcion, precio, incluye_envio, orden)
  values (v_cuenta, c_promos, 'promo', 'P7', 'PROMO 7', '1 MUZZA CHICA + 1 LATA DE PEPSI', 9999, true, 6) returning id into v_promo;
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'unica' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Chica Muzzarella';
  insert into promo_fijos (promo_id, producto_id, cantidad, variante)
    select v_promo, id, 1, 'unica' from productos where cuenta_id = v_cuenta and sucursal_id is null and nombre = 'Lata Pepsi';

  raise notice 'Menú cargado: % productos', (select count(*) from productos where cuenta_id = v_cuenta and sucursal_id is null);
end $$;
