-- =====================================================================
-- 0034: pantallas (teles) con enlace propio, sin iniciar sesión
--   Cada tele (de clientes o de cocina) tiene un código corto: se abre
--   cloudticket.com.ar/p/CODIGO y anda sola. Con el código solo se ve lo que
--   muestra esa pantalla; la de cocina además puede marcar pedidos listos.
--   Se actualizan con avisos instantáneos (Realtime Broadcast): sin cambios,
--   la tele no consulta la base (salvo una revisión de respaldo cada 2 min).
-- Requiere la 0020 (plan por local). Se puede correr más de una vez.
-- =====================================================================

create table if not exists pantallas (
  id           uuid primary key default gen_random_uuid(),
  cuenta_id    uuid not null references cuentas(id) on delete cascade,
  sucursal_id  uuid not null references sucursales(id) on delete cascade,
  tipo         text not null check (tipo in ('clientes', 'cocina')),
  nombre       text not null default '',
  codigo       text not null unique,
  canal        uuid not null default gen_random_uuid(),
  orientacion  text not null default 'horizontal' check (orientacion in ('horizontal', 'vertical_izquierda', 'vertical_derecha')),
  videos       jsonb not null default '[]'::jsonb,
  ultimo_ping  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists pantallas_sucursal on pantallas (sucursal_id);
alter table pantallas enable row level security;
drop policy if exists pantallas_leer on pantallas;
create policy pantallas_leer on pantallas for select to authenticated using (puede_sucursal(sucursal_id));

-- ---------- Permisos y códigos
create or replace function puede_configurar_local(p_sucursal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (es_admin() and exists (select 1 from sucursales where id = p_sucursal and cuenta_id = mi_cuenta()))
    or (es_encargado() and p_sucursal = mi_sucursal()), false)
$$;

-- 7 letras/números sin los que se confunden (0/O, 1/I/L): ej. K7M2QX9
create or replace function nuevo_codigo_pantalla() returns text
language plpgsql volatile set search_path = public as $$
declare abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := '';
    for i in 1..7 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from pantallas where codigo = c);
  end loop;
  return c;
end $$;

-- ---------- Administración (admin o encargado del local, plan PRO)
create or replace function pantalla_crear(p_sucursal uuid, p_tipo text, p_nombre text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not puede_configurar_local(p_sucursal) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar las pantallas' using errcode = 'P0001';
  end if;
  if (select plan from sucursales where id = p_sucursal) <> 'pro' then
    raise exception 'Las pantallas son del plan PRO' using errcode = 'P0001';
  end if;
  if (select count(*) from pantallas where sucursal_id = p_sucursal) >= 10 then
    raise exception 'Hasta 10 pantallas por local' using errcode = 'P0001';
  end if;
  insert into pantallas (cuenta_id, sucursal_id, tipo, nombre, codigo)
  values ((select cuenta_id from sucursales where id = p_sucursal), p_sucursal, p_tipo, coalesce(trim(p_nombre), ''), nuevo_codigo_pantalla())
  returning id into v;
  return v;
end $$;

create or replace function pantalla_guardar(p_id uuid, p_nombre text, p_orientacion text, p_videos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_suc uuid;
begin
  select sucursal_id into v_suc from pantallas where id = p_id;
  if v_suc is null or not puede_configurar_local(v_suc) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar las pantallas' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 20 then
    raise exception 'Hasta 20 videos por pantalla' using errcode = 'P0001';
  end if;
  update pantallas set nombre = coalesce(trim(p_nombre), ''), orientacion = p_orientacion, videos = coalesce(p_videos, '[]'::jsonb) where id = p_id;
end $$;

-- Código nuevo: el enlace anterior deja de andar en el momento
create or replace function pantalla_nuevo_codigo(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_suc uuid; c text; v_canal uuid;
begin
  select sucursal_id, canal into v_suc, v_canal from pantallas where id = p_id;
  if v_suc is null or not puede_configurar_local(v_suc) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar las pantallas' using errcode = 'P0001';
  end if;
  c := nuevo_codigo_pantalla();
  -- avisa a la tele vieja (recarga y ve que el enlace ya no sirve)
  perform avisar_pantalla(v_canal);
  update pantallas set codigo = c, canal = gen_random_uuid(), ultimo_ping = null where id = p_id;
  return c;
end $$;

create or replace function pantalla_eliminar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_suc uuid; v_canal uuid;
begin
  select sucursal_id, canal into v_suc, v_canal from pantallas where id = p_id;
  if v_suc is null or not puede_configurar_local(v_suc) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar las pantallas' using errcode = 'P0001';
  end if;
  delete from pantallas where id = p_id;
  perform avisar_pantalla(v_canal);
end $$;

grant execute on function pantalla_crear(uuid, text, text) to authenticated;
grant execute on function pantalla_guardar(uuid, text, text, jsonb) to authenticated;
grant execute on function pantalla_nuevo_codigo(uuid) to authenticated;
grant execute on function pantalla_eliminar(uuid) to authenticated;

-- ---------- Avisos instantáneos a las teles (sin datos: la tele pide lo nuevo)
create or replace function avisar_pantalla(p_canal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send('{}'::jsonb, 'cambio', 'pantalla:' || p_canal::text, false);
exception when others then null; -- sin aviso: la tele igual revisa cada 2 minutos
end $$;

create or replace function avisar_pantallas_local(p_sucursal uuid, p_tipo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select canal from pantallas where sucursal_id = p_sucursal and (p_tipo is null or tipo = p_tipo) loop
    perform avisar_pantalla(r.canal);
  end loop;
end $$;

-- Comandas: nueva, cambia de estado, o se edita mientras está en cocina
create or replace function trg_pantallas_comanda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pantallas where sucursal_id = new.sucursal_id) then return null; end if;
  if tg_op = 'INSERT' or new.estado is distinct from old.estado
     or (new.estado = 'en_preparacion' and new.updated_at is distinct from old.updated_at) then
    perform avisar_pantallas_local(new.sucursal_id);
  end if;
  return null;
end $$;
drop trigger if exists trg_pantallas_comanda on comandas;
create trigger trg_pantallas_comanda after insert or update on comandas
  for each row execute function trg_pantallas_comanda();

-- Ítems cambiados de un pedido que está en cocina
create or replace function trg_pantallas_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_suc uuid;
begin
  select sucursal_id into v_suc from comandas where id = new.comanda_id and estado = 'en_preparacion';
  if v_suc is not null then perform avisar_pantallas_local(v_suc, 'cocina'); end if;
  return null;
end $$;
drop trigger if exists trg_pantallas_items on comanda_items;
create trigger trg_pantallas_items after insert on comanda_items
  for each row execute function trg_pantallas_items();

-- Config de la pantalla o del local (minutos de cocina, plan) cambiada
create or replace function trg_pantalla_config() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'pantallas' then
    perform avisar_pantalla(new.canal);
  else
    perform avisar_pantallas_local(new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_pantalla_config on pantallas;
create trigger trg_pantalla_config after update of nombre, orientacion, videos on pantallas
  for each row execute function trg_pantalla_config();
drop trigger if exists trg_pantalla_config_local on sucursales;
create trigger trg_pantalla_config_local after update of nombre, plan, activa, cocina_activa, cocina_amarillo, cocina_rojo on sucursales
  for each row execute function trg_pantalla_config();

-- Caja que se abre o se cierra
create or replace function trg_pantallas_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform avisar_pantallas_local(new.sucursal_id);
  return null;
end $$;
drop trigger if exists trg_pantallas_caja on cajas;
create trigger trg_pantallas_caja after insert or update of estado on cajas
  for each row execute function trg_pantallas_caja();

-- ---------- Lo que ve la tele (sin iniciar sesión, con el código)
create or replace function pantalla_datos(p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare p pantallas; s sucursales; v_caja uuid; r jsonb;
begin
  select * into p from pantallas where codigo = upper(trim(p_codigo));
  if p.id is null then raise exception 'Este enlace no existe o se cambió por uno nuevo' using errcode = 'P0001'; end if;
  select * into s from sucursales where id = p.sucursal_id;
  if not s.activa or s.plan <> 'pro' then raise exception 'Las pantallas son del plan PRO' using errcode = 'P0001'; end if;
  if p.ultimo_ping is null or p.ultimo_ping < now() - interval '1 minute' then
    update pantallas set ultimo_ping = now() where id = p.id;
  end if;
  select id into v_caja from cajas where sucursal_id = s.id and estado = 'abierta';

  r := jsonb_build_object(
    'pantalla', jsonb_build_object('id', p.id, 'tipo', p.tipo, 'nombre', p.nombre, 'orientacion', p.orientacion,
                                   'videos', p.videos, 'canal', p.canal),
    'sucursal', to_jsonb(s),
    'caja', (select jsonb_build_object('id', c.id, 'sucursal_id', c.sucursal_id, 'turno', c.turno, 'estado', c.estado,
                                       'abierta_at', c.abierta_at, 'dinero_inicial', c.dinero_inicial)
               from cajas c where c.id = v_caja),
    'hora', now());

  if p.tipo = 'clientes' then
    -- Solo el primer nombre de los pedidos de mostrador (nada de teléfonos ni montos)
    r := r || jsonb_build_object('comandas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'caja_id', c.caja_id, 'numero', c.numero, 'tipo', c.tipo, 'estado', c.estado,
               'canal', c.canal, 'cliente_nombre', nullif(split_part(trim(coalesce(c.cliente_nombre, '')), ' ', 1), ''),
               'created_at', c.created_at, 'updated_at', c.updated_at, 'listo_at', c.listo_at, 'cocina_at', c.cocina_at,
               'total', 0, 'cobrada', false))
        from comandas c
       where c.caja_id = v_caja and c.tipo = 'mostrador' and coalesce(c.canal, 'propio') <> 'pedidosya'
         and c.estado in ('pendiente', 'en_preparacion', 'listo')), '[]'::jsonb));
  else
    -- Cocina: los pedidos completos (el ticket que imprime al marcar listo lleva dirección y teléfono)
    r := r || jsonb_build_object(
      'comandas', coalesce((
        select jsonb_agg(to_jsonb(c) || jsonb_build_object(
                 'comanda_items', coalesce((select jsonb_agg(to_jsonb(i) order by i.orden) from comanda_items i where i.comanda_id = c.id), '[]'::jsonb),
                 'pagos', coalesce((select jsonb_agg(jsonb_build_object('forma', g.forma, 'monto', g.monto)) from pagos g where g.comanda_id = c.id), '[]'::jsonb),
                 'repartidores', (select jsonb_build_object('nombre', x.nombre) from repartidores x where x.id = c.repartidor_id)))
          from comandas c
         where c.caja_id = v_caja and (c.estado = 'en_preparacion' or (c.listo_at > now() - interval '40 minutes' and c.estado <> 'anulada'))), '[]'::jsonb),
      'impresoras', coalesce((select jsonb_agg(to_jsonb(i) - 'token_hash' order by i.created_at) from impresoras i where i.sucursal_id = s.id and i.activa), '[]'::jsonb),
      'zonas', coalesce((select jsonb_agg(to_jsonb(z)) from zonas_delivery z where z.sucursal_id = s.id and z.activa), '[]'::jsonb),
      'armado_id', (select id from productos where cuenta_id = s.cuenta_id and upper(trim(codigo)) = 'ARMADO-MITAD' limit 1));
  end if;
  return r;
end $$;
grant execute on function pantalla_datos(text) to anon, authenticated;

-- La cocina marca un pedido listo (e imprime su ticket) o lo devuelve a cocina
create or replace function pantalla_cocina_estado(p_codigo text, p_comanda uuid, p_estado text, p_jobs jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare p pantallas; c comandas; j jsonb;
begin
  select * into p from pantallas where codigo = upper(trim(p_codigo)) and tipo = 'cocina';
  if p.id is null then raise exception 'Este enlace no existe o se cambió por uno nuevo' using errcode = 'P0001'; end if;
  select k.* into c from comandas k join cajas cj on cj.id = k.caja_id
   where k.id = p_comanda and k.sucursal_id = p.sucursal_id and cj.estado = 'abierta';
  if c.id is null then raise exception 'Pedido no encontrado' using errcode = 'P0001'; end if;
  if not ((p_estado = 'listo' and c.estado = 'en_preparacion') or (p_estado = 'en_preparacion' and c.estado = 'listo')) then
    raise exception 'El pedido ya cambió de estado' using errcode = 'P0001';
  end if;
  update comandas set estado = p_estado where id = c.id;
  -- El ticket para pegar en el pedido (solo a las comanderas de este local)
  if p_estado = 'listo' then
    for j in select * from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) loop
      if exists (select 1 from impresoras where id = (j->>'impresora_id')::uuid and sucursal_id = p.sucursal_id) then
        insert into print_jobs (impresora_id, comanda_id, tipo, contenido, copias)
        values ((j->>'impresora_id')::uuid, c.id, 'comanda', j->'contenido', greatest(1, least(5, coalesce((j->>'copias')::int, 1))));
      end if;
    end loop;
  end if;
end $$;
grant execute on function pantalla_cocina_estado(text, uuid, text, jsonb) to anon, authenticated;
