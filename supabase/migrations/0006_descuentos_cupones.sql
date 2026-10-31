-- =====================================================================
-- 0006: descuentos y adicionales solo para el administrador,
--       recargo automático de delivery por local y cupones de descuento
-- =====================================================================

-- ---------------------------------------------------------------------
-- Recargo de delivery por local (monto fijo o porcentaje del pedido)
-- ---------------------------------------------------------------------
alter table sucursales
  add column if not exists recargo_delivery      numeric(12,2) not null default 0 check (recargo_delivery >= 0),
  add column if not exists recargo_delivery_tipo text not null default 'monto' check (recargo_delivery_tipo in ('monto','porc'));

-- Que los locales se enteren al toque si cambia el recargo
do $$ begin
  alter publication supabase_realtime add table sucursales;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Cupones (los crea y ve solo el administrador de la cuenta)
-- ---------------------------------------------------------------------
create table if not exists cupones (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  codigo      text not null check (codigo ~ '^[A-Z0-9_-]{3,30}$'),
  descripcion text,
  tipo        text not null check (tipo in ('porc','monto')),
  valor       numeric(12,2) not null check (valor > 0),
  desde       date,          -- null: desde ya
  hasta       date,          -- null: sin vencimiento (incluye el día)
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (tipo <> 'porc' or valor <= 100),
  check (desde is null or hasta is null or desde <= hasta)
);
create unique index if not exists cupones_codigo on cupones (cuenta_id, codigo);

alter table cupones enable row level security;
drop policy if exists cup_admin on cupones;
create policy cup_admin on cupones for all to authenticated
  using (cuenta_id = mi_cuenta() and es_admin())
  with check (cuenta_id = mi_cuenta() and es_admin());

alter table comandas
  add column if not exists cupon_id        uuid references cupones(id) on delete set null,
  add column if not exists cupon_codigo    text,
  add column if not exists descuento_cupon numeric(12,2) not null default 0 check (descuento_cupon >= 0);

-- Hoy en Argentina
create or replace function hoy_ar() returns date
language sql stable as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- El que toma pedidos valida un código sin poder listar todos los cupones
create or replace function validar_cupon(p_codigo text)
returns table (id uuid, codigo text, descripcion text, tipo text, valor numeric)
language plpgsql stable security definer set search_path = public as $$
declare c cupones;
begin
  select * into c from cupones x
   where x.cuenta_id = mi_cuenta() and x.codigo = upper(trim(p_codigo));
  if not found then raise exception 'El cupón % no existe', upper(trim(p_codigo)) using errcode = 'P0001'; end if;
  if not c.activo then raise exception 'El cupón % está desactivado', c.codigo using errcode = 'P0001'; end if;
  if c.desde is not null and hoy_ar() < c.desde then
    raise exception 'El cupón % vale desde el %', c.codigo, to_char(c.desde, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if c.hasta is not null and hoy_ar() > c.hasta then
    raise exception 'El cupón % venció el %', c.codigo, to_char(c.hasta, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  return query select c.id, c.codigo, c.descripcion, c.tipo, c.valor;
end $$;
grant execute on function validar_cupon(text) to authenticated;

-- ---------------------------------------------------------------------
-- Control al guardar una comanda
--  * descuento manual (descuento - descuento_cupon) y adicional: solo admin
--  * el cupón tiene que ser válido y no descontar más de lo que permite
-- ---------------------------------------------------------------------
create or replace function validar_descuentos_comanda() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c        cupones;
  v_max    numeric;
  v_manual numeric := new.descuento - new.descuento_cupon;
begin
  if new.descuento_cupon > new.descuento + 0.01 then
    raise exception 'El descuento del cupón no puede ser mayor al descuento total';
  end if;

  if not es_admin() then
    if tg_op = 'INSERT' then
      if v_manual > 0.01 or new.adicional > 0.01 then
        raise exception 'Solo el administrador puede aplicar descuentos o adicionales' using errcode = 'P0001';
      end if;
    elsif abs(v_manual - (old.descuento - old.descuento_cupon)) > 0.01 or abs(new.adicional - old.adicional) > 0.01 then
      raise exception 'Solo el administrador puede cambiar descuentos o adicionales' using errcode = 'P0001';
    end if;
  end if;

  if new.cupon_id is null then
    if new.descuento_cupon > 0.01 then raise exception 'Hay descuento de cupón sin cupón'; end if;
    new.cupon_codigo := null;
    return new;
  end if;

  select * into c from cupones where id = new.cupon_id;
  if not found or c.cuenta_id <> (select s.cuenta_id from cajas cj join sucursales s on s.id = cj.sucursal_id where cj.id = new.caja_id) then
    raise exception 'Cupón inválido' using errcode = 'P0001';
  end if;
  new.cupon_codigo := c.codigo;

  -- La vigencia se controla al aplicarlo (no al editar una comanda vieja)
  if tg_op = 'INSERT' or new.cupon_id is distinct from old.cupon_id then
    if not c.activo or (c.desde is not null and hoy_ar() < c.desde) or (c.hasta is not null and hoy_ar() > c.hasta) then
      raise exception 'El cupón % no está vigente', c.codigo using errcode = 'P0001';
    end if;
  end if;

  v_max := case when c.tipo = 'porc' then round(new.subtotal * c.valor / 100) else least(c.valor, new.subtotal) end;
  if new.descuento_cupon > v_max + 1 then
    raise exception 'El cupón % descuenta como máximo $%', c.codigo, round(v_max)::bigint using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_comandas_descuentos on comandas;
create trigger trg_comandas_descuentos before insert or update of descuento, adicional, descuento_cupon, cupon_id, subtotal on comandas
for each row execute function validar_descuentos_comanda();
