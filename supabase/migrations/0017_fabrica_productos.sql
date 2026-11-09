-- =====================================================================
-- 0017: Pedido a fábrica con productos del menú (además de ingredientes)
--   * La planilla puede tener ingredientes o productos
--   * Los productos se piden en unidades; al recibirlos no suman al stock
--     (el stock se lleva por ingrediente)
-- Se puede correr más de una vez.
-- =====================================================================

-- ---- Planilla: cada fila es un ingrediente o un producto
alter table fabrica_planilla add column if not exists id uuid not null default gen_random_uuid();
alter table fabrica_planilla add column if not exists producto_id uuid references productos(id) on delete cascade;
alter table fabrica_planilla drop constraint if exists fabrica_planilla_pkey;
alter table fabrica_planilla add constraint fabrica_planilla_pkey primary key (id);
alter table fabrica_planilla alter column ingrediente_id drop not null;
alter table fabrica_planilla drop constraint if exists fabrica_planilla_uno;
alter table fabrica_planilla add constraint fabrica_planilla_uno check ((ingrediente_id is null) <> (producto_id is null));
create unique index if not exists fabrica_planilla_ing on fabrica_planilla (cuenta_id, ingrediente_id) where ingrediente_id is not null;
create unique index if not exists fabrica_planilla_prod on fabrica_planilla (cuenta_id, producto_id) where producto_id is not null;

-- ---- Ítems de pedido: pueden ser de un producto
alter table pedidos_fabrica_items add column if not exists producto_id uuid references productos(id) on delete set null;

-- Nuevo pedido: [{ingrediente_id, cantidad}] o [{producto_id, cantidad}]
create or replace function crear_pedido_fabrica(p_sucursal uuid, p_fecha date, p_notas text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int; it jsonb; v_ing ingredientes; v_prod productos; v_cant numeric; v_orden int := 0; v_n int := 0;
begin
  if not puede_sucursal(p_sucursal) or es_produccion() then raise exception 'Sin acceso a ese local' using errcode = 'P0001'; end if;
  if p_fecha is null then raise exception 'Poné la fecha del pedido' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('pedido_fabrica_' || p_sucursal::text));
  select coalesce(max(numero), 0) + 1 into v_num from pedidos_fabrica where sucursal_id = p_sucursal;
  insert into pedidos_fabrica (cuenta_id, sucursal_id, numero, fecha, notas, creado_por)
  values (mi_cuenta(), p_sucursal, v_num, p_fecha, nullif(trim(p_notas), ''), (select usuario from perfiles where user_id = auth.uid()))
  returning id into v_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_cant := (it->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then continue; end if;
    if it->>'producto_id' is not null then
      select * into v_prod from productos where id = (it->>'producto_id')::uuid and cuenta_id = mi_cuenta();
      if v_prod.id is null then raise exception 'Producto inválido'; end if;
      insert into pedidos_fabrica_items (pedido_id, producto_id, nombre, unidad, cantidad, orden)
      values (v_id, v_prod.id, v_prod.nombre, 'un', v_cant, v_orden);
    else
      select * into v_ing from ingredientes where id = (it->>'ingrediente_id')::uuid and cuenta_id = mi_cuenta();
      if v_ing.id is null then raise exception 'Ingrediente inválido'; end if;
      insert into pedidos_fabrica_items (pedido_id, ingrediente_id, nombre, unidad, cantidad, orden)
      values (v_id, v_ing.id, v_ing.nombre, v_ing.unidad, v_cant, v_orden);
    end if;
    v_orden := v_orden + 1; v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'El pedido está vacío: poné al menos una cantidad' using errcode = 'P0001'; end if;
  return v_id;
end $$;
grant execute on function crear_pedido_fabrica(uuid, date, text, jsonb) to authenticated;
