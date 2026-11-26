-- =====================================================================
-- 0035: los pedidos de PedidosYa se importan en el servidor
--   Apenas el programa de impresión sube un ticket, la base llama a la Edge
--   Function "pedidosya", que lo lee y crea la comanda (si la caja está abierta).
--   Al abrir una caja, importa los que quedaron pendientes.
--   La web sigue importando como respaldo (si la función no está o falla).
-- Requiere: Edge Function "pedidosya" desplegada con "Verify JWT" desactivado.
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------- La importación, sin el control de usuario (lo hace el que la llama)
create or replace function importar_pedido_externo_core(p_id uuid, p_datos jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  pe       pedidos_externos;
  v_caja   uuid;
  v_cuenta uuid;
  v_num    text := nullif(trim(p_datos->>'numero_externo'), '');
  v_com    uuid;
begin
  select * into pe from pedidos_externos where id = p_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001';
  end if;
  if pe.estado in ('importado', 'ignorado') then
    return pe.comanda_id;  -- otra PC ya lo importó
  end if;

  -- El mismo número de pedido ya entró (p. ej. GoWin lo imprimió dos veces con distinta hora)
  if v_num is not null and exists (
    select 1 from pedidos_externos x
     where x.sucursal_id = pe.sucursal_id and x.canal = pe.canal and x.numero_externo = v_num
       and x.id <> pe.id and x.estado = 'importado') then
    update pedidos_externos set estado = 'ignorado', error = 'Pedido repetido: ya se importó el ' || v_num,
           procesado_at = now(), datos = p_datos
     where id = pe.id;
    return null;
  end if;

  select id into v_caja from cajas where sucursal_id = pe.sucursal_id and estado = 'abierta';
  if v_caja is null then
    raise exception 'No hay caja abierta: abrí la caja para importar el pedido' using errcode = 'P0001';
  end if;
  select cuenta_id into v_cuenta from sucursales where id = pe.sucursal_id;

  perform set_config('app.importando', '1', true);

  insert into comandas (caja_id, numero, tipo, cliente_nombre, cliente_tel, direccion, observaciones,
                        costo_envio, subtotal, descuento, adicional, total, cobrada, canal, externo_id, creada_por)
  values (v_caja, 0,
          case when p_datos->>'tipo' = 'mostrador' then 'mostrador' else 'delivery' end,
          left(p_datos->>'cliente_nombre', 120), left(p_datos->>'cliente_tel', 40), left(p_datos->>'direccion', 200),
          left(p_datos->>'observaciones', 500),
          greatest(0, coalesce((p_datos->>'costo_envio')::numeric, 0)),
          greatest(0, coalesce((p_datos->>'subtotal')::numeric, 0)),
          greatest(0, coalesce((p_datos->>'descuento')::numeric, 0)),
          greatest(0, coalesce((p_datos->>'adicional')::numeric, 0)),
          greatest(0, coalesce((p_datos->>'total')::numeric, 0)),
          coalesce((p_datos->>'cobrada')::boolean, false),
          pe.canal, v_num, auth.uid())
  returning id into v_com;

  insert into comanda_items (comanda_id, producto_id, descripcion, variante, cantidad, precio_unit, subtotal, nota, orden)
  select v_com,
         (select p.id from productos p where p.id = nullif(it->>'producto_id', '')::uuid and p.cuenta_id = v_cuenta),
         left(coalesce(it->>'descripcion', 'Producto'), 200),
         case when it->>'variante' in ('entera', 'mitad', 'unica') then it->>'variante' end,
         greatest(0.01, coalesce((it->>'cantidad')::numeric, 1)),
         greatest(0, coalesce((it->>'precio_unit')::numeric, 0)),
         greatest(0.01, coalesce((it->>'cantidad')::numeric, 1)) * greatest(0, coalesce((it->>'precio_unit')::numeric, 0)),
         left(it->>'nota', 300),
         ord::int
    from jsonb_array_elements(coalesce(p_datos->'items', '[]'::jsonb)) with ordinality as t(it, ord);

  insert into pagos (comanda_id, forma, monto)
  select v_com, left(coalesce(pg->>'forma', 'efectivo'), 30), greatest(0, coalesce((pg->>'monto')::numeric, 0))
    from jsonb_array_elements(coalesce(p_datos->'pagos', '[]'::jsonb)) as t(pg)
   where coalesce((pg->>'monto')::numeric, 0) > 0;

  update pedidos_externos set estado = 'importado', comanda_id = v_com, numero_externo = v_num,
         datos = p_datos, error = null, procesado_at = now()
   where id = pe.id;

  perform set_config('app.importando', '', true);
  return v_com;
end $$;
revoke execute on function importar_pedido_externo_core(uuid, jsonb) from public, anon, authenticated;

-- Desde la web: con usuario del local
create or replace function importar_pedido_externo(p_id uuid, p_datos jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from pedidos_externos where id = p_id and puede_sucursal(sucursal_id)) then
    raise exception 'Pedido no encontrado' using errcode = 'P0001';
  end if;
  return importar_pedido_externo_core(p_id, p_datos);
end $$;
grant execute on function importar_pedido_externo(uuid, jsonb) to authenticated;
revoke execute on function importar_pedido_externo(uuid, jsonb) from anon;

-- Desde el servidor (Edge Function con la service role key)
create or replace function importar_pedido_externo_servidor(p_id uuid, p_datos jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
begin
  return importar_pedido_externo_core(p_id, p_datos);
end $$;
revoke execute on function importar_pedido_externo_servidor(uuid, jsonb) from public, anon, authenticated;
grant execute on function importar_pedido_externo_servidor(uuid, jsonb) to service_role;

-- ---------- Llamado a la Edge Function (pg_net: asíncrono, nunca frena el guardado)
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'No se pudo activar pg_net (%). Activalo en Database > Extensions y volvé a correr este archivo.', sqlerrm;
end $$;

create table if not exists config_servidor (clave text primary key, valor text not null);
alter table config_servidor enable row level security;  -- sin políticas: solo la base la lee
insert into config_servidor (clave, valor)
values ('url_funcion_pedidosya', 'https://pamtiheprrgqmbwqzydt.supabase.co/functions/v1/pedidosya')
on conflict (clave) do nothing;

create or replace function llamar_importador_pedidosya(p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  select valor into v_url from config_servidor where clave = 'url_funcion_pedidosya';
  if v_url is null then return; end if;
  perform net.http_post(url := v_url, body := p_body,
                        headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 15000);
exception when others then null;  -- sin la función, importa la web como siempre
end $$;

create or replace function trg_importar_pedido_externo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform llamar_importador_pedidosya(jsonb_build_object('id', new.id));
  return null;
end $$;
drop trigger if exists trg_importar_pedido_externo on pedidos_externos;
create trigger trg_importar_pedido_externo after insert on pedidos_externos
  for each row when (new.estado = 'pendiente') execute function trg_importar_pedido_externo();

create or replace function trg_importar_al_abrir_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pedidos_externos where sucursal_id = new.sucursal_id and estado = 'pendiente'
              and created_at > now() - interval '24 hours') then
    perform llamar_importador_pedidosya(jsonb_build_object('sucursal_id', new.sucursal_id));
  end if;
  return null;
end $$;
drop trigger if exists trg_importar_al_abrir_caja on cajas;
create trigger trg_importar_al_abrir_caja after insert or update of estado on cajas
  for each row when (new.estado = 'abierta') execute function trg_importar_al_abrir_caja();
