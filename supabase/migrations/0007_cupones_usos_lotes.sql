-- =====================================================================
-- 0007: cupones de un solo uso (o con límite de usos) y lotes de cupones
-- Se puede correr más de una vez.
-- =====================================================================

alter table cupones
  add column if not exists max_usos int check (max_usos is null or max_usos > 0),  -- null: ilimitado
  add column if not exists lote     text;                                          -- cupones generados juntos

create index if not exists comandas_cupon on comandas (cupon_id) where cupon_id is not null;
create index if not exists cupones_lote on cupones (cuenta_id, lote) where lote is not null;

-- Usos de un cupón: comandas no anuladas que lo usaron (si se anula, el uso se libera)
create or replace function usos_cupon(p_cupon uuid, p_sin_comanda uuid default null) returns int
language sql stable set search_path = public as $$
  select count(*)::int from comandas
   where cupon_id = p_cupon and estado <> 'anulada'
     and (p_sin_comanda is null or id <> p_sin_comanda)
$$;
-- sin security definer: llamada directa solo cuenta las comandas que el usuario puede ver

-- Validar un código antes de usarlo (ahora también controla los usos)
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
  if c.max_usos is not null and usos_cupon(c.id) >= c.max_usos then
    if c.max_usos = 1 then raise exception 'El cupón % ya fue usado', c.codigo using errcode = 'P0001';
    else raise exception 'El cupón % ya se usó las % veces permitidas', c.codigo, c.max_usos using errcode = 'P0001'; end if;
  end if;
  return query select c.id, c.codigo, c.descripcion, c.tipo, c.valor;
end $$;
grant execute on function validar_cupon(text) to authenticated;

-- Control al guardar una comanda (igual que 0006 + límite de usos)
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
