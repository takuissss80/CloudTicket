-- =====================================================================
-- 0026: toda comanda tiene forma de pago
--   Si una comanda queda sin pagos (o en $0), se le pone Efectivo por el total.
--   1) Arregla las que ya existen (no toca las anuladas).
--   2) Red de seguridad: al crear una comanda, al marcarla cobrada o al
--      entregarla, si no tiene pagos se agrega Efectivo por el total.
-- Se puede correr más de una vez.
-- =====================================================================

-- 1) Las que ya están sin forma de pago
insert into pagos (comanda_id, forma, monto)
select c.id, 'efectivo', c.total
  from comandas c
 where c.estado <> 'anulada' and c.total > 0
   and not exists (select 1 from pagos p where p.comanda_id = c.id and p.monto > 0);

-- 2) Red de seguridad
create or replace function pago_por_defecto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado <> 'anulada' and new.total > 0
     and not exists (select 1 from pagos where comanda_id = new.id and monto > 0) then
    insert into pagos (comanda_id, forma, monto) values (new.id, 'efectivo', new.total);
  end if;
  return null;
end $$;

drop trigger if exists trg_pago_por_defecto on comandas;
create trigger trg_pago_por_defecto after update of cobrada, estado on comandas
  for each row when (new.cobrada or new.estado = 'entregado')
  execute function pago_por_defecto();

-- Al cerrar la caja, ninguna comanda de esa caja queda sin forma de pago
-- (se completa ANTES de calcular los totales del cierre)
drop trigger if exists trg_pagos_al_cerrar_caja on cajas;
drop function if exists pagos_al_cerrar_caja();

create or replace function cerrar_caja(p_caja uuid, p_dinero_cierre numeric, p_observaciones text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_suc uuid;
begin
  select sucursal_id into v_suc from cajas where id = p_caja and estado = 'abierta';
  if v_suc is null then raise exception 'La caja no está abierta'; end if;
  if not puede_sucursal(v_suc) then raise exception 'Sin acceso a ese local'; end if;
  insert into pagos (comanda_id, forma, monto)
  select c.id, 'efectivo', c.total
    from comandas c
   where c.caja_id = p_caja and c.estado <> 'anulada' and c.total > 0
     and not exists (select 1 from pagos p where p.comanda_id = c.id and p.monto > 0);
  select * into t from totales_caja(p_caja);
  update cajas set
    estado = 'cerrada', cerrada_at = now(), cerrada_por = auth.uid(),
    cerrada_por_usuario = (select usuario from perfiles where user_id = auth.uid()),
    observaciones = nullif(trim(p_observaciones), ''),
    cant_comandas = t.cant_comandas, cant_anuladas = t.cant_anuladas, total_ventas = t.total_ventas,
    ventas_efectivo = t.ventas_efectivo, total_ingresos = t.total_ingresos, total_gastos = t.total_gastos,
    total_egresos = t.total_egresos, total_sueldos = t.total_sueldos, efectivo_teorico = t.efectivo_teorico,
    dinero_cierre = p_dinero_cierre, diferencia = p_dinero_cierre - t.efectivo_teorico
  where id = p_caja;
end $$;
