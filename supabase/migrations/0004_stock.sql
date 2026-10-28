-- =====================================================================
-- Stock de ingredientes por local
-- =====================================================================
-- - Cada local tiene su stock de cada ingrediente (en la unidad base:
--   unidades, gramos o mililitros) y un mínimo para avisar.
-- - Ingreso de mercadería: suma stock y puede actualizar el costo.
-- - Ajuste (contaste y no coincide) y decomiso (se tiró): restan o corrigen.
-- - Venta: al guardar los ítems de una comanda se descuenta la receta de
--   cada producto (y de lo que trae cada promo). Al editar o anular la
--   comanda se devuelve. Todo lo hace la base con triggers.
-- =====================================================================

create table stock (
  sucursal_id     uuid not null references sucursales(id) on delete cascade,
  ingrediente_id  uuid not null references ingredientes(id) on delete cascade,
  cantidad        numeric(14,3) not null default 0,
  minimo          numeric(14,3) not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (sucursal_id, ingrediente_id)
);

create table ingresos_mercaderia (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null references sucursales(id) on delete cascade,
  proveedor      text,
  comprobante    text,
  observaciones  text,
  total          numeric(14,2) not null default 0,
  pagado_con_caja boolean not null default false,
  creado_por     uuid references auth.users(id) on delete set null,
  creado_por_usuario text,
  created_at     timestamptz not null default now()
);
create index on ingresos_mercaderia (sucursal_id, created_at);

-- Historial de todo lo que mueve el stock
-- cantidad: positiva suma, negativa resta (en unidad base)
create table stock_movimientos (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id) on delete cascade,
  ingrediente_id  uuid not null references ingredientes(id) on delete cascade,
  tipo            text not null check (tipo in ('ingreso','venta','ajuste','decomiso')),
  cantidad        numeric(14,3) not null,
  costo           numeric(14,2),            -- ingreso: lo que se pagó por esa línea
  ingreso_id      uuid references ingresos_mercaderia(id) on delete cascade,
  comanda_id      uuid,                      -- venta (sin FK: se borra al devolver)
  comanda_item_id uuid,
  motivo          text,
  creado_por_usuario text,
  created_at      timestamptz not null default now()
);
create index on stock_movimientos (sucursal_id, created_at);
create index on stock_movimientos (comanda_item_id);

alter table stock enable row level security;
alter table ingresos_mercaderia enable row level security;
alter table stock_movimientos enable row level security;
-- Lectura por local; los cambios pasan por las funciones de abajo
create policy stock_sel on stock for select to authenticated using (puede_sucursal(sucursal_id));
create policy ingm_sel on ingresos_mercaderia for select to authenticated using (puede_sucursal(sucursal_id));
create policy smov_sel on stock_movimientos for select to authenticated using (puede_sucursal(sucursal_id));

-- Suma (o resta) stock
create or replace function mover_stock(p_suc uuid, p_ing uuid, p_cant numeric) returns void
language sql security definer set search_path = public as $$
  insert into stock (sucursal_id, ingrediente_id, cantidad) values (p_suc, p_ing, p_cant)
  on conflict (sucursal_id, ingrediente_id) do update set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();
$$;

-- ---------------------------------------------------------------------
-- Consumo por venta
-- ---------------------------------------------------------------------
-- Ingredientes que consume un ítem: su receta + la de cada componente de
-- promo que tenga productoId. La mitad consume la mitad.
create or replace function consumo_item(p_producto uuid, p_variante text, p_cantidad numeric, p_componentes jsonb)
returns table (ingrediente_id uuid, cantidad numeric)
language sql stable security definer set search_path = public as $$
  select x.ing, sum(x.cant) from (
    select r.ingrediente_id as ing,
           r.cantidad * p_cantidad * case when p_variante = 'mitad' then 0.5 else 1 end as cant
      from recetas r where r.producto_id = p_producto
    union all
    select r.ingrediente_id,
           r.cantidad * (c->>'cantidad')::numeric * p_cantidad * case when c->>'variante' = 'mitad' then 0.5 else 1 end
      from jsonb_array_elements(coalesce(p_componentes, '[]'::jsonb)) c
      join recetas r on r.producto_id = (c->>'productoId')::uuid
     where c ? 'productoId' and c->>'productoId' ~ '^[0-9a-f-]{36}$'
  ) x group by x.ing
$$;

create or replace function descontar_item(p_item comanda_items) returns void
language plpgsql security definer set search_path = public as $$
declare v_suc uuid; v_estado text; r record;
begin
  select sucursal_id, estado into v_suc, v_estado from comandas where id = p_item.comanda_id;
  if v_suc is null or v_estado = 'anulada' then return; end if;
  for r in select * from consumo_item(p_item.producto_id, p_item.variante, p_item.cantidad, p_item.componentes) loop
    if r.cantidad <> 0 then
      insert into stock_movimientos (sucursal_id, ingrediente_id, tipo, cantidad, comanda_id, comanda_item_id)
      values (v_suc, r.ingrediente_id, 'venta', -r.cantidad, p_item.comanda_id, p_item.id);
      perform mover_stock(v_suc, r.ingrediente_id, -r.cantidad);
    end if;
  end loop;
end $$;

-- Devuelve al stock lo descontado por un ítem y borra esos movimientos
create or replace function devolver_item(p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in delete from stock_movimientos where comanda_item_id = p_item_id and tipo = 'venta' returning * loop
    perform mover_stock(m.sucursal_id, m.ingrediente_id, -m.cantidad);
  end loop;
end $$;

create or replace function trg_item_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform devolver_item(old.id); end if;
  if tg_op in ('INSERT','UPDATE') then perform descontar_item(new); end if;
  return null;
end $$;
create trigger trg_comanda_items_stock after insert or update or delete on comanda_items
for each row execute function trg_item_stock();

-- Anular devuelve todo
create or replace function trg_comanda_anulada() returns trigger
language plpgsql security definer set search_path = public as $$
declare i record;
begin
  if new.estado = 'anulada' and old.estado <> 'anulada' then
    for i in select id from comanda_items where comanda_id = new.id loop perform devolver_item(i.id); end loop;
  end if;
  return null;
end $$;
create trigger trg_comandas_anulada after update of estado on comandas
for each row execute function trg_comanda_anulada();

-- ---------------------------------------------------------------------
-- Ingreso de mercadería
-- ---------------------------------------------------------------------
-- p_items: [{ "ingrediente_id": uuid, "cantidad": numeric (unidad base), "costo": numeric (total de la línea) }]
create or replace function registrar_ingreso(
  p_sucursal uuid, p_items jsonb, p_proveedor text default null, p_comprobante text default null,
  p_observaciones text default null, p_actualizar_costo boolean default true, p_pagar_con_caja boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric := 0; it jsonb; v_ing uuid; v_cant numeric; v_costo numeric; v_unidad text;
        v_usuario text := (select usuario from perfiles where user_id = auth.uid()); v_caja uuid;
begin
  if not puede_sucursal(p_sucursal) then raise exception 'Sin acceso a ese local'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'El ingreso no tiene ingredientes'; end if;
  insert into ingresos_mercaderia (sucursal_id, proveedor, comprobante, observaciones, creado_por, creado_por_usuario)
  values (p_sucursal, nullif(trim(p_proveedor), ''), nullif(trim(p_comprobante), ''), nullif(trim(p_observaciones), ''), auth.uid(), v_usuario)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_ing := (it->>'ingrediente_id')::uuid;
    v_cant := (it->>'cantidad')::numeric;
    v_costo := coalesce((it->>'costo')::numeric, 0);
    select unidad into v_unidad from ingredientes where id = v_ing and cuenta_id = mi_cuenta();
    if v_unidad is null then raise exception 'Ingrediente inválido'; end if;
    if v_cant is null or v_cant <= 0 then raise exception 'Las cantidades tienen que ser mayores a cero'; end if;
    insert into stock_movimientos (sucursal_id, ingrediente_id, tipo, cantidad, costo, ingreso_id, creado_por_usuario)
    values (p_sucursal, v_ing, 'ingreso', v_cant, v_costo, v_id, v_usuario);
    perform mover_stock(p_sucursal, v_ing, v_cant);
    v_total := v_total + v_costo;
    -- Costo nuevo: por unidad, o por kilo / litro
    if p_actualizar_costo and v_costo > 0 then
      update ingredientes set costo = round(v_costo / v_cant * case when v_unidad = 'un' then 1 else 1000 end, 2) where id = v_ing;
    end if;
  end loop;
  update ingresos_mercaderia set total = v_total where id = v_id;

  -- Opcional: se paga con la plata de la caja abierta (queda como gasto "Pago remito")
  if p_pagar_con_caja and v_total > 0 then
    select id into v_caja from cajas where sucursal_id = p_sucursal and estado = 'abierta';
    if v_caja is null then raise exception 'Para pagar con la caja tiene que haber una caja abierta'; end if;
    insert into caja_movimientos (caja_id, tipo, tipo_gasto_id, concepto, monto)
    values (v_caja, 'gasto',
      (select id from tipos_gasto where cuenta_id = mi_cuenta() and nombre ilike 'pago remito' limit 1),
      'Mercadería' || coalesce(' ' || nullif(trim(p_proveedor), ''), '') || coalesce(' ' || nullif(trim(p_comprobante), ''), ''),
      v_total);
    update ingresos_mercaderia set pagado_con_caja = true where id = v_id;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Ajuste (cantidad real contada) y decomiso (cantidad que se tira)
-- ---------------------------------------------------------------------
create or replace function ajustar_stock(p_sucursal uuid, p_ingrediente uuid, p_tipo text, p_cantidad numeric, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actual numeric; v_delta numeric;
begin
  if not puede_sucursal(p_sucursal) then raise exception 'Sin acceso a ese local'; end if;
  if not exists (select 1 from ingredientes where id = p_ingrediente and cuenta_id = mi_cuenta()) then raise exception 'Ingrediente inválido'; end if;
  select cantidad into v_actual from stock where sucursal_id = p_sucursal and ingrediente_id = p_ingrediente;
  v_actual := coalesce(v_actual, 0);
  if p_tipo = 'ajuste' then
    if p_cantidad is null or p_cantidad < 0 then raise exception 'La cantidad contada no puede ser negativa'; end if;
    v_delta := p_cantidad - v_actual;
  elsif p_tipo = 'decomiso' then
    if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad a decomisar tiene que ser mayor a cero'; end if;
    v_delta := -p_cantidad;
  else
    raise exception 'Tipo de ajuste inválido';
  end if;
  if v_delta = 0 then return; end if;
  insert into stock_movimientos (sucursal_id, ingrediente_id, tipo, cantidad, motivo, creado_por_usuario)
  values (p_sucursal, p_ingrediente, p_tipo, v_delta, nullif(trim(p_motivo), ''), (select usuario from perfiles where user_id = auth.uid()));
  perform mover_stock(p_sucursal, p_ingrediente, v_delta);
end $$;

create or replace function set_stock_minimo(p_sucursal uuid, p_ingrediente uuid, p_minimo numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_sucursal(p_sucursal) then raise exception 'Sin acceso a ese local'; end if;
  insert into stock (sucursal_id, ingrediente_id, minimo) values (p_sucursal, p_ingrediente, greatest(coalesce(p_minimo, 0), 0))
  on conflict (sucursal_id, ingrediente_id) do update set minimo = excluded.minimo, updated_at = now();
end $$;

grant execute on function registrar_ingreso(uuid, jsonb, text, text, text, boolean, boolean),
  ajustar_stock(uuid, uuid, text, numeric, text), set_stock_minimo(uuid, uuid, numeric) to authenticated;
revoke execute on function mover_stock(uuid, uuid, numeric), descontar_item(comanda_items), devolver_item(uuid) from public, anon, authenticated;
