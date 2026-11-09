-- =====================================================================
-- 0018: Pedido a fábrica por presentación
--   En la planilla, cada ingrediente/producto puede pedirse por una presentación
--   (ej.: Jamón en fetas -> "Paquete" de 5 u.). Se pide y se recibe en
--   presentaciones, y al recibir se suma al stock cantidad × factor.
-- Se puede correr más de una vez.
-- =====================================================================

alter table fabrica_planilla add column if not exists presentacion text;
alter table fabrica_planilla add column if not exists factor numeric(14,3) not null default 1;
alter table fabrica_planilla drop constraint if exists fabrica_planilla_factor;
alter table fabrica_planilla add constraint fabrica_planilla_factor check (factor > 0);

-- Copia en cada ítem: el pedido queda igual aunque después cambie la planilla
alter table pedidos_fabrica_items add column if not exists presentacion text;
alter table pedidos_fabrica_items add column if not exists factor numeric(14,3) not null default 1;

-- Nuevo pedido: [{ingrediente_id | producto_id, cantidad}] (cantidad en presentaciones)
create or replace function crear_pedido_fabrica(p_sucursal uuid, p_fecha date, p_notas text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int; it jsonb; v_ing ingredientes; v_prod productos; v_pl fabrica_planilla;
        v_cant numeric; v_orden int := 0; v_n int := 0;
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
    v_pl := null;
    if it->>'producto_id' is not null then
      select * into v_prod from productos where id = (it->>'producto_id')::uuid and cuenta_id = mi_cuenta();
      if v_prod.id is null then raise exception 'Producto inválido'; end if;
      select * into v_pl from fabrica_planilla where cuenta_id = mi_cuenta() and producto_id = v_prod.id;
      insert into pedidos_fabrica_items (pedido_id, producto_id, nombre, unidad, cantidad, orden, presentacion, factor)
      values (v_id, v_prod.id, v_prod.nombre, 'un', v_cant, v_orden, nullif(trim(v_pl.presentacion), ''), coalesce(v_pl.factor, 1));
    else
      select * into v_ing from ingredientes where id = (it->>'ingrediente_id')::uuid and cuenta_id = mi_cuenta();
      if v_ing.id is null then raise exception 'Ingrediente inválido'; end if;
      select * into v_pl from fabrica_planilla where cuenta_id = mi_cuenta() and ingrediente_id = v_ing.id;
      insert into pedidos_fabrica_items (pedido_id, ingrediente_id, nombre, unidad, cantidad, orden, presentacion, factor)
      values (v_id, v_ing.id, v_ing.nombre, v_ing.unidad, v_cant, v_orden, nullif(trim(v_pl.presentacion), ''), coalesce(v_pl.factor, 1));
    end if;
    v_orden := v_orden + 1; v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'El pedido está vacío: poné al menos una cantidad' using errcode = 'P0001'; end if;
  return v_id;
end $$;
grant execute on function crear_pedido_fabrica(uuid, date, text, jsonb) to authenticated;

-- Recepción: [{id, recibido}] en presentaciones (0 = no llegó). Al stock va recibido × factor.
create or replace function recibir_pedido_fabrica(p_pedido uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos_fabrica; it jsonb; v_item pedidos_fabrica_items; v_rec numeric;
        v_usuario text := (select usuario from perfiles where user_id = auth.uid());
begin
  select * into p from pedidos_fabrica where id = p_pedido for update;
  if p.id is null or not puede_sucursal(p.sucursal_id) or es_produccion() then raise exception 'Sin acceso a ese pedido' using errcode = 'P0001'; end if;
  if p.estado <> 'pendiente' then raise exception 'Este pedido ya fue recibido' using errcode = 'P0001'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_item from pedidos_fabrica_items where id = (it->>'id')::uuid and pedido_id = p_pedido;
    if v_item.id is null then continue; end if;
    v_rec := greatest(coalesce((it->>'recibido')::numeric, 0), 0);
    update pedidos_fabrica_items set recibido = v_rec where id = v_item.id;
    if v_rec > 0 and v_item.ingrediente_id is not null then
      insert into stock_movimientos (sucursal_id, ingrediente_id, tipo, cantidad, motivo, creado_por_usuario)
      values (p.sucursal_id, v_item.ingrediente_id, 'ingreso', v_rec * v_item.factor, 'Pedido fábrica #' || p.numero, v_usuario);
      perform mover_stock(p.sucursal_id, v_item.ingrediente_id, v_rec * v_item.factor);
    end if;
  end loop;
  update pedidos_fabrica_items set recibido = 0 where pedido_id = p_pedido and recibido is null;
  update pedidos_fabrica set estado = 'recibido', recibido_at = now(), recibido_por = v_usuario where id = p_pedido;
end $$;
grant execute on function recibir_pedido_fabrica(uuid, jsonb) to authenticated;
