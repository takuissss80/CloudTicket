-- =====================================================================
-- 0010: programa de impresión de Windows (vinculado por token) e
--       importación automática de pedidos de PedidosYa.
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Comanderas: datos que reporta el programa
-- ---------------------------------------------------------------------
alter table impresoras
  add column if not exists impresora_windows text,   -- impresora de Windows elegida en el programa
  add column if not exists pc_nombre         text,
  add column if not exists version_programa  text,
  add column if not exists vinculada_at      timestamptz;

alter table print_jobs add column if not exists tomado_at timestamptz;

-- Token: CT-XXXX-XXXX-... Se guarda solo el hash (sha256 del token en mayúsculas y sin guiones)
create or replace function hash_token(p_token text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
$$;

-- Genera (o regenera) el token de una comandera. Se muestra una sola vez.
create or replace function generar_token_impresora(p_impresora uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_suc   uuid;
  v_hex   text := upper(replace(gen_random_uuid()::text, '-', ''));
  v_token text;
begin
  select sucursal_id into v_suc from impresoras where id = p_impresora;
  if v_suc is null or not puede_sucursal(v_suc) then
    raise exception 'Esa comandera no es de tu local' using errcode = 'P0001';
  end if;
  v_token := 'CT-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4) || '-' || substr(v_hex, 13, 4)
          || '-' || substr(v_hex, 17, 4) || '-' || substr(v_hex, 21, 4) || '-' || substr(v_hex, 25, 4) || '-' || substr(v_hex, 29, 4);
  update impresoras set token_hash = hash_token(v_token), vinculada_at = null, impresora_windows = null, pc_nombre = null
   where id = p_impresora;
  return v_token;
end $$;
grant execute on function generar_token_impresora(uuid) to authenticated;

-- Comandera de un token (uso interno)
create or replace function impresora_de_token(p_token text) returns impresoras
language plpgsql stable security definer set search_path = public as $$
declare i impresoras;
begin
  select * into i from impresoras where token_hash = hash_token(p_token) and activa;
  if not found then raise exception 'Token inválido o comandera desactivada' using errcode = 'P0001'; end if;
  return i;
end $$;
revoke execute on function impresora_de_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Funciones que usa el programa de Windows (sin usuario, solo con el token)
-- ---------------------------------------------------------------------

-- Vincular / avisar que está vivo. Devuelve los datos de la comandera.
create or replace function spool_ping(p_token text, p_pc text default null, p_impresora_windows text default null, p_version text default null)
returns json
language plpgsql volatile security definer set search_path = public as $$
declare i impresoras; v_local text; v_cuenta text;
begin
  i := impresora_de_token(p_token);
  update impresoras set
    ultimo_ping = now(),
    pc_nombre = coalesce(left(p_pc, 80), pc_nombre),
    impresora_windows = coalesce(left(p_impresora_windows, 200), impresora_windows),
    version_programa = coalesce(left(p_version, 30), version_programa),
    vinculada_at = coalesce(vinculada_at, now())
   where id = i.id;
  select s.nombre, c.nombre into v_local, v_cuenta from sucursales s join cuentas c on c.id = s.cuenta_id where s.id = i.sucursal_id;
  return json_build_object('impresora_id', i.id, 'nombre', i.nombre, 'ancho', i.ancho, 'copias', i.copias,
                           'local', v_local, 'cuenta', v_cuenta);
end $$;

-- Toma los trabajos pendientes (dos PCs con el mismo token no imprimen lo mismo).
-- Lo que lleva más de 30 minutos esperando no se imprime: queda con error "vencido".
create or replace function spool_tomar(p_token text, p_max int default 10)
returns table (id uuid, tipo text, contenido jsonb, copias int, creado timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare i impresoras;
begin
  i := impresora_de_token(p_token);
  update impresoras set ultimo_ping = now() where impresoras.id = i.id;

  update print_jobs pj set estado = 'error', error = 'Vencido: la comandera no estuvo conectada a tiempo'
   where pj.impresora_id = i.id and pj.estado = 'pendiente' and pj.created_at < now() - interval '30 minutes';
  update print_jobs pj set estado = 'error', error = coalesce(pj.error, 'No se pudo imprimir después de varios intentos')
   where pj.impresora_id = i.id and pj.estado in ('pendiente', 'imprimiendo') and pj.intentos >= 5;

  return query
  with c as (
    select pj.id from print_jobs pj
     where pj.impresora_id = i.id
       and (pj.estado = 'pendiente' or (pj.estado = 'imprimiendo' and coalesce(pj.tomado_at, pj.created_at) < now() - interval '2 minutes'))
     order by pj.created_at
     limit greatest(1, least(p_max, 50))
     for update skip locked
  )
  update print_jobs pj set estado = 'imprimiendo', intentos = pj.intentos + 1, tomado_at = now()
    from c where pj.id = c.id
  returning pj.id, pj.tipo, pj.contenido, pj.copias, pj.created_at;
end $$;

-- Resultado de cada trabajo
create or replace function spool_confirmar(p_token text, p_job uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare i impresoras;
begin
  i := impresora_de_token(p_token);
  if p_ok then
    update print_jobs set estado = 'impreso', printed_at = now(), error = null where id = p_job and impresora_id = i.id;
  else
    -- vuelve a la cola para reintentar (spool_tomar lo corta a los 5 intentos)
    update print_jobs set estado = 'pendiente', error = left(p_error, 500) where id = p_job and impresora_id = i.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Importación automática de pedidos (PedidosYa vía GoWin u otro sistema)
-- ---------------------------------------------------------------------
alter table comandas
  add column if not exists canal      text not null default 'propio',
  add column if not exists externo_id text;
do $$ begin
  alter table comandas add constraint comandas_canal_check check (canal in ('propio', 'pedidosya'));
exception when duplicate_object then null; end $$;

create table if not exists pedidos_externos (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null references sucursales(id) on delete cascade,
  impresora_id   uuid references impresoras(id) on delete set null,
  canal          text not null default 'pedidosya',
  texto          text not null,
  formato        text not null default 'texto' check (formato in ('texto', 'imagen')),
  hash           text not null,
  numero_externo text,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'procesando', 'importado', 'error', 'ignorado')),
  error          text,
  datos          jsonb,
  comanda_id     uuid references comandas(id) on delete set null,
  tomado_at      timestamptz,
  procesado_at   timestamptz,
  created_at     timestamptz not null default now()
);
create unique index if not exists pedidos_externos_hash on pedidos_externos (sucursal_id, hash);
create unique index if not exists pedidos_externos_numero on pedidos_externos (sucursal_id, canal, numero_externo)
  where numero_externo is not null and estado <> 'ignorado';
create index if not exists pedidos_externos_estado on pedidos_externos (sucursal_id, estado, created_at);

alter table pedidos_externos enable row level security;
drop policy if exists pe_sel on pedidos_externos;
drop policy if exists pe_upd on pedidos_externos;
create policy pe_sel on pedidos_externos for select to authenticated using (puede_sucursal(sucursal_id));
create policy pe_upd on pedidos_externos for update to authenticated using (puede_sucursal(sucursal_id)) with check (puede_sucursal(sucursal_id));

-- El programa manda el texto de un ticket que capturó. Mismo ticket = duplicado.
create or replace function spool_capturar(p_token text, p_texto text, p_formato text default 'texto', p_canal text default 'pedidosya')
returns text
language plpgsql volatile security definer set search_path = public as $$
declare i impresoras; v_texto text := left(coalesce(p_texto, ''), 20000); v_id uuid;
begin
  i := impresora_de_token(p_token);
  if length(trim(v_texto)) < 10 and p_formato = 'texto' then return 'vacio'; end if;
  insert into pedidos_externos (sucursal_id, impresora_id, canal, texto, formato, hash)
  values (i.sucursal_id, i.id, coalesce(p_canal, 'pedidosya'), v_texto,
          case when p_formato = 'imagen' then 'imagen' else 'texto' end,
          encode(sha256(convert_to(regexp_replace(v_texto, '\s+', ' ', 'g'), 'UTF8')), 'hex'))
  on conflict (sucursal_id, hash) do nothing
  returning id into v_id;
  return case when v_id is null then 'duplicado' else 'nuevo' end;
end $$;

-- Una sola PC procesa cada pedido capturado
create or replace function tomar_pedido_externo(p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  update pedidos_externos set estado = 'procesando', tomado_at = now()
   where id = p_id and puede_sucursal(sucursal_id)
     and (estado in ('pendiente', 'error') or (estado = 'procesando' and tomado_at < now() - interval '2 minutes'));
  return found;
end $$;

-- Asociación de productos de PedidosYa con los del menú (sirve para todos los locales)
create table if not exists mapeos_externos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  canal       text not null default 'pedidosya',
  texto       text not null,                       -- nombre como viene en el ticket, normalizado
  producto_id uuid references productos(id) on delete cascade,
  variante    text check (variante in ('entera', 'mitad')),
  ignorar     boolean not null default false,      -- p. ej. "Envío", "Propina": no es un producto
  created_at  timestamptz not null default now(),
  check (ignorar or producto_id is not null)
);
create unique index if not exists mapeos_externos_texto on mapeos_externos (cuenta_id, canal, texto);

alter table mapeos_externos enable row level security;
drop policy if exists me_sel on mapeos_externos;
drop policy if exists me_all on mapeos_externos;
create policy me_sel on mapeos_externos for select to authenticated using (cuenta_id = mi_cuenta());
create policy me_all on mapeos_externos for all to authenticated
  using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

-- ---------------------------------------------------------------------
-- Importar un pedido capturado como comanda, en una sola transacción.
-- p_datos lo arma la web (interpreta el ticket y asocia los productos):
-- { tipo, cliente_nombre, cliente_tel, direccion, observaciones, numero_externo,
--   subtotal, costo_envio, descuento, adicional, total, cobrada,
--   items: [{ producto_id, descripcion, variante, cantidad, precio_unit, nota }],
--   pagos: [{ forma, monto }] }
-- Devuelve el id de la comanda, o null si era un pedido repetido.
-- ---------------------------------------------------------------------
create or replace function importar_pedido_externo(p_id uuid, p_datos jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  pe       pedidos_externos;
  v_caja   uuid;
  v_cuenta uuid;
  v_num    text := nullif(trim(p_datos->>'numero_externo'), '');
  v_com    uuid;
begin
  select * into pe from pedidos_externos where id = p_id for update;
  if not found or not puede_sucursal(pe.sucursal_id) then
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
grant execute on function importar_pedido_externo(uuid, jsonb) to authenticated;
revoke execute on function importar_pedido_externo(uuid, jsonb) from anon;

-- Validación de descuentos (igual que 0008) + excepción para pedidos importados
create or replace function validar_descuentos_comanda() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c        cupones;
  v_max    numeric;
  v_manual numeric := new.descuento - new.descuento_cupon;
  v_nuevo  boolean;
begin
  if new.descuento_cupon > new.descuento + 0.01 then
    raise exception 'El descuento del cupón no puede ser mayor al descuento total';
  end if;

  -- Los pedidos importados (PedidosYa) traen sus propios descuentos: los carga importar_pedido_externo()
  if auth.uid() is not null and not puede_descontar() and coalesce(current_setting('app.importando', true), '') <> '1' then
    if tg_op = 'INSERT' then
      if v_manual > 0.01 or new.adicional > 0.01 then
        raise exception 'Solo el administrador o un encargado pueden aplicar descuentos o adicionales' using errcode = 'P0001';
      end if;
    elsif abs(v_manual - (old.descuento - old.descuento_cupon)) > 0.01 or abs(new.adicional - old.adicional) > 0.01 then
      raise exception 'Solo el administrador o un encargado pueden cambiar descuentos o adicionales' using errcode = 'P0001';
    end if;
  end if;

  if new.cupon_id is null then
    if new.descuento_cupon > 0.01 then raise exception 'Hay descuento de cupón sin cupón'; end if;
    new.cupon_codigo := null;
    return new;
  end if;

  v_nuevo := tg_op = 'INSERT' or new.cupon_id is distinct from old.cupon_id;
  -- Al aplicarlo se bloquea la fila del cupón: dos cajas no pueden usar a la vez el último uso
  if v_nuevo then
    select * into c from cupones where id = new.cupon_id for update;
  else
    select * into c from cupones where id = new.cupon_id;
  end if;
  if not found or c.cuenta_id <> (select s.cuenta_id from cajas cj join sucursales s on s.id = cj.sucursal_id where cj.id = new.caja_id) then
    raise exception 'Cupón inválido' using errcode = 'P0001';
  end if;
  new.cupon_codigo := c.codigo;

  -- Vigencia y usos se controlan al aplicarlo (no al editar una comanda vieja)
  if v_nuevo then
    if not c.activo or (c.desde is not null and hoy_ar() < c.desde) or (c.hasta is not null and hoy_ar() > c.hasta) then
      raise exception 'El cupón % no está vigente', c.codigo using errcode = 'P0001';
    end if;
    if c.max_usos is not null and usos_cupon(c.id, case when tg_op = 'UPDATE' then new.id end) >= c.max_usos then
      if c.max_usos = 1 then raise exception 'El cupón % ya fue usado', c.codigo using errcode = 'P0001';
      else raise exception 'El cupón % ya se usó las % veces permitidas', c.codigo, c.max_usos using errcode = 'P0001'; end if;
    end if;
  end if;

  v_max := case when c.tipo = 'porc' then round(new.subtotal * c.valor / 100) else least(c.valor, new.subtotal) end;
  if new.descuento_cupon > v_max + 1 then
    raise exception 'El cupón % descuenta como máximo $%', c.codigo, round(v_max)::bigint using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Protecciones de 0009: no aplican sin usuario (Supabase / servidor) ni al borrar en cascada
create or replace function proteger_comanda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sin usuario (Supabase / tareas del servidor) o admin/encargado: sin restricción
  if auth.uid() is null or puede_descontar() then return new; end if;

  if new.estado is distinct from old.estado and (new.estado = 'anulada' or old.estado = 'anulada') then
    raise exception 'Solo el administrador o un encargado pueden anular comandas' using errcode = 'P0001';
  end if;

  if (new.tipo, new.cliente_id, new.cliente_nombre, new.cliente_tel, new.direccion, new.entre_calles, new.zona_id,
      new.costo_envio, new.subtotal, new.descuento, new.adicional, new.total, new.observaciones, new.hora_entrega,
      new.cupon_id, new.caja_id)
     is distinct from
     (old.tipo, old.cliente_id, old.cliente_nombre, old.cliente_tel, old.direccion, old.entre_calles, old.zona_id,
      old.costo_envio, old.subtotal, old.descuento, old.adicional, old.total, old.observaciones, old.hora_entrega,
      old.cupon_id, old.caja_id) then
    raise exception 'Solo el administrador o un encargado pueden modificar comandas' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function proteger_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sin usuario (Supabase / tareas del servidor), admin/encargado, o borrado en cascada de la comanda
  if auth.uid() is null or puede_descontar()
     or (tg_op = 'DELETE' and not exists (select 1 from comandas where id = old.comanda_id)) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from comanda_items where comanda_id = new.comanda_id and created_at < now()) then
      raise exception 'Solo el administrador o un encargado pueden modificar comandas' using errcode = 'P0001';
    end if;
    return new;
  end if;
  raise exception 'Solo el administrador o un encargado pueden modificar comandas' using errcode = 'P0001';
end $$;


-- Las funciones del programa las puede llamar sin usuario (con la anon key + token)
grant execute on function spool_ping(text, text, text, text), spool_tomar(text, int),
  spool_confirmar(text, uuid, boolean, text), spool_capturar(text, text, text, text) to anon, authenticated;
grant execute on function tomar_pedido_externo(uuid) to authenticated;
revoke execute on function tomar_pedido_externo(uuid) from anon;

do $$ begin
  alter publication supabase_realtime add table pedidos_externos;
exception when duplicate_object then null; end $$;
