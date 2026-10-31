-- =====================================================================
-- 0008: tipos de usuario de local
--   * Común: toma pedidos y puede usar cupones.
--   * Encargado: además puede cargar descuentos y adicionales a mano
--     (y cambiar el envío de un delivery).
-- El administrador de la cuenta puede todo. Se puede correr más de una vez.
-- =====================================================================

alter table perfiles add column if not exists puede_descontar boolean not null default false;

-- ¿El usuario actual puede hacer descuentos manuales?
create or replace function puede_descontar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' or puede_descontar from perfiles where user_id = auth.uid()), false)
$$;

-- El admin cambia el tipo de un usuario de su cuenta
create or replace function set_puede_descontar(p_user uuid, p_valor boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar el tipo de usuario' using errcode = 'P0001';
  end if;
  update perfiles set puede_descontar = p_valor
   where user_id = p_user and cuenta_id = mi_cuenta() and rol = 'local';
  if not found then raise exception 'Ese usuario no es de tu cuenta' using errcode = 'P0001'; end if;
end $$;
grant execute on function set_puede_descontar(uuid, boolean) to authenticated;

-- Control al guardar una comanda: igual que 0007, pero descuentos y adicionales
-- los puede cargar el admin o un encargado
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

  if not puede_descontar() then
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
