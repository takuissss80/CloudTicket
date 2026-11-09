-- =====================================================================
-- 0016: Pedido a fábrica + usuario Producción
--   * Planilla (qué ingredientes se piden a fábrica, en qué orden): por cuenta
--   * Pedidos de cada local con fecha, historial y recepción (suma al stock)
--   * Tipo de usuario Producción: ve los pedidos y el stock de todos los locales
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Usuario Producción
-- ---------------------------------------------------------------------
alter table perfiles add column if not exists es_produccion boolean not null default false;

create or replace function es_produccion() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_produccion from perfiles where user_id = auth.uid()), false)
$$;
grant execute on function es_produccion() to authenticated;

-- Ver (no operar) un local: el suyo, cualquiera si es admin, o todos si es Producción
create or replace function puede_ver_sucursal(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select puede_sucursal(s) or (es_produccion() and exists (select 1 from sucursales where id = s and cuenta_id = mi_cuenta()))
$$;
grant execute on function puede_ver_sucursal(uuid) to authenticated;

-- Común / Encargado / Producción
create or replace function set_tipo_usuario(p_user uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar el tipo de usuario' using errcode = 'P0001';
  end if;
  if p_tipo not in ('comun', 'encargado', 'produccion') then raise exception 'Tipo de usuario inválido'; end if;
  update perfiles set puede_descontar = (p_tipo = 'encargado'), es_produccion = (p_tipo = 'produccion')
   where user_id = p_user and cuenta_id = mi_cuenta() and rol = 'local';
  if not found then raise exception 'Ese usuario no es de tu cuenta' using errcode = 'P0001'; end if;
end $$;
grant execute on function set_tipo_usuario(uuid, text) to authenticated;

-- Producción ve todos los locales y su stock
drop policy if exists suc_sel_prod on sucursales;
create policy suc_sel_prod on sucursales for select to authenticated using (es_produccion() and cuenta_id = mi_cuenta());
drop policy if exists stock_sel_prod on stock;
create policy stock_sel_prod on stock for select to authenticated using (puede_ver_sucursal(sucursal_id));

-- ---------------------------------------------------------------------
-- Planilla de pedido a fábrica
-- ---------------------------------------------------------------------
create table if not exists fabrica_planilla (
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  ingrediente_id uuid not null references ingredientes(id) on delete cascade,
  orden          int not null default 0,
  primary key (cuenta_id, ingrediente_id)
);
alter table fabrica_planilla enable row level security;
drop policy if exists fp_sel on fabrica_planilla;
drop policy if exists fp_all on fabrica_planilla;
create policy fp_sel on fabrica_planilla for select to authenticated using (cuenta_id = mi_cuenta());
create policy fp_all on fabrica_planilla for all to authenticated
  using (cuenta_id = mi_cuenta() and es_admin()) with check (cuenta_id = mi_cuenta() and es_admin());

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create table if not exists pedidos_fabrica (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references cuentas(id) on delete cascade,
  sucursal_id   uuid not null references sucursales(id) on delete cascade,
  numero        int not null,
  fecha         date not null,
  notas         text,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'recibido', 'anulado')),
  creado_por    text,
  created_at    timestamptz not null default now(),
  recibido_at   timestamptz,
  recibido_por  text,
  unique (sucursal_id, numero)
);
create index if not exists pedidos_fabrica_cuenta on pedidos_fabrica (cuenta_id, fecha desc);

create table if not exists pedidos_fabrica_items (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references pedidos_fabrica(id) on delete cascade,
  ingrediente_id uuid references ingredientes(id) on delete set null,
  nombre         text not null,      -- copia: queda aunque se borre el ingrediente
  unidad         text not null,
  cantidad       numeric(14,3) not null check (cantidad > 0),
  recibido       numeric(14,3) check (recibido >= 0),
  orden          int not null default 0
);
create index if not exists pedidos_fabrica_items_pedido on pedidos_fabrica_items (pedido_id);

alter table pedidos_fabrica enable row level security;
alter table pedidos_fabrica_items enable row level security;
drop policy if exists pf_sel on pedidos_fabrica;
create policy pf_sel on pedidos_fabrica for select to authenticated
  using (cuenta_id = mi_cuenta() and puede_ver_sucursal(sucursal_id));
drop policy if exists pfi_sel on pedidos_fabrica_items;
create policy pfi_sel on pedidos_fabrica_items for select to authenticated
  using (exists (select 1 from pedidos_fabrica p where p.id = pedido_id and p.cuenta_id = mi_cuenta() and puede_ver_sucursal(p.sucursal_id)));
-- Los cambios pasan por las funciones de abajo

do $$ begin
  alter publication supabase_realtime add table pedidos_fabrica;
exception when duplicate_object or undefined_object then null; end $$;

-- Nuevo pedido: [{ingrediente_id, cantidad}]
create or replace function crear_pedido_fabrica(p_sucursal uuid, p_fecha date, p_notas text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int; it jsonb; v_ing ingredientes; v_cant numeric; v_orden int := 0; v_n int := 0;
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
    select * into v_ing from ingredientes where id = (it->>'ingrediente_id')::uuid and cuenta_id = mi_cuenta();
    if v_ing.id is null then raise exception 'Ingrediente inválido'; end if;
    insert into pedidos_fabrica_items (pedido_id, ingrediente_id, nombre, unidad, cantidad, orden)
    values (v_id, v_ing.id, v_ing.nombre, v_ing.unidad, v_cant, v_orden);
    v_orden := v_orden + 1; v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'El pedido está vacío: poné al menos una cantidad' using errcode = 'P0001'; end if;
  return v_id;
end $$;
grant execute on function crear_pedido_fabrica(uuid, date, text, jsonb) to authenticated;

-- Recepción: [{id, recibido}] (0 = no llegó). Suma al stock lo que llegó.
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
      values (p.sucursal_id, v_item.ingrediente_id, 'ingreso', v_rec, 'Pedido fábrica #' || p.numero, v_usuario);
      perform mover_stock(p.sucursal_id, v_item.ingrediente_id, v_rec);
    end if;
  end loop;
  -- Lo que no vino en la lista se toma como no recibido
  update pedidos_fabrica_items set recibido = 0 where pedido_id = p_pedido and recibido is null;
  update pedidos_fabrica set estado = 'recibido', recibido_at = now(), recibido_por = v_usuario where id = p_pedido;
end $$;
grant execute on function recibir_pedido_fabrica(uuid, jsonb) to authenticated;

-- Anular un pedido que todavía no llegó
create or replace function anular_pedido_fabrica(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos_fabrica;
begin
  select * into p from pedidos_fabrica where id = p_pedido for update;
  if p.id is null or not puede_sucursal(p.sucursal_id) or es_produccion() then raise exception 'Sin acceso a ese pedido' using errcode = 'P0001'; end if;
  if p.estado <> 'pendiente' then raise exception 'Solo se puede anular un pedido que todavía no llegó' using errcode = 'P0001'; end if;
  update pedidos_fabrica set estado = 'anulado' where id = p_pedido;
end $$;
grant execute on function anular_pedido_fabrica(uuid) to authenticated;
