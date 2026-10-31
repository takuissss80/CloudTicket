-- =====================================================================
-- 0009: modificar y anular comandas, solo administrador o encargado
-- El usuario común puede tomar pedidos, cobrar, entregar, asignar la moto
-- y reimprimir, pero no cambiar el contenido de una comanda ya guardada
-- ni anularla. Se puede correr más de una vez.
-- =====================================================================

-- Para saber si los ítems se están cargando ahora (comanda nueva) o ya existían
alter table comanda_items add column if not exists created_at timestamptz not null default now();

create or replace function proteger_comanda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if puede_descontar() then return new; end if;  -- admin o encargado

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

drop trigger if exists trg_comandas_proteger on comandas;
create trigger trg_comandas_proteger before update on comandas
for each row execute function proteger_comanda();

-- Ítems: el común solo los carga al crear la comanda (todavía no tenía ítems de antes)
create or replace function proteger_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if puede_descontar() then
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

drop trigger if exists trg_items_proteger on comanda_items;
create trigger trg_items_proteger before insert or update or delete on comanda_items
for each row execute function proteger_items();
