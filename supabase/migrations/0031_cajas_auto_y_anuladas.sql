-- =====================================================================
-- 0031: cierre automático de cajas y comandas anuladas sin cobro
--   1) Pasada la medianoche, una caja abierta hace más de 5 horas se cierra
--      sola (si no se cargaron comandas en los últimos 30 minutos, para no
--      cortar el turno en pleno servicio). Queda sin dinero contado.
--   2) Al anular una comanda se borra lo cobrado: sin pagos y sin "cobrada".
--      También se arreglan las anuladas que ya existen.
-- Requiere la 0026. Se puede correr más de una vez.
-- =====================================================================

-- ---------- 2) Anuladas: sin cobro
create or replace function anulada_sin_cobro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'anulada' then
    new.cobrada := false;
  end if;
  return new;
end $$;
drop trigger if exists trg_anulada_sin_cobro on comandas;
create trigger trg_anulada_sin_cobro before insert or update of estado, cobrada on comandas
  for each row execute function anulada_sin_cobro();

create or replace function anulada_borra_pagos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from pagos where comanda_id = new.id;
  return null;
end $$;
drop trigger if exists trg_anulada_borra_pagos on comandas;
create trigger trg_anulada_borra_pagos after update of estado on comandas
  for each row when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
  execute function anulada_borra_pagos();

-- Que no se le pueda volver a cargar un pago a una anulada
create or replace function pago_no_en_anulada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from comandas where id = new.comanda_id and estado = 'anulada') then
    return null; -- se ignora en silencio
  end if;
  return new;
end $$;
drop trigger if exists trg_pago_no_en_anulada on pagos;
create trigger trg_pago_no_en_anulada before insert on pagos
  for each row execute function pago_no_en_anulada();

-- Las que ya están anuladas
delete from pagos p using comandas c where c.id = p.comanda_id and c.estado = 'anulada';
update comandas set cobrada = false where estado = 'anulada' and cobrada;

-- ---------- 1) Cierre automático
create or replace function cerrar_cajas_auto() returns int
language plpgsql security definer set search_path = public as $$
declare cj record; t record; n int := 0;
        ahora_ar timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
begin
  for cj in
    select c.* from cajas c
     where c.estado = 'abierta'
       and c.abierta_at < now() - interval '5 hours'
       and (c.abierta_at at time zone 'America/Argentina/Buenos_Aires')::date < ahora_ar::date
       and not exists (select 1 from comandas k where k.caja_id = c.id and k.created_at > now() - interval '30 minutes')
     for update skip locked
  loop
    -- Igual que el cierre manual: ninguna comanda sin forma de pago
    insert into pagos (comanda_id, forma, monto)
    select k.id, 'efectivo', k.total from comandas k
     where k.caja_id = cj.id and k.estado <> 'anulada' and k.total > 0
       and not exists (select 1 from pagos p where p.comanda_id = k.id and p.monto > 0);
    select * into t from totales_caja(cj.id);
    update cajas set
      estado = 'cerrada', cerrada_at = now(), cerrada_por = null,
      cerrada_por_usuario = 'Cierre automático',
      observaciones = concat_ws(' · ', nullif(observaciones, ''), 'Cerrada automáticamente (pasada la medianoche, más de 5 h abierta). No se contó el efectivo.'),
      cant_comandas = t.cant_comandas, cant_anuladas = t.cant_anuladas, total_ventas = t.total_ventas,
      ventas_efectivo = t.ventas_efectivo, total_ingresos = t.total_ingresos, total_gastos = t.total_gastos,
      total_egresos = t.total_egresos, total_sueldos = t.total_sueldos, efectivo_teorico = t.efectivo_teorico,
      dinero_cierre = null, diferencia = null
    where id = cj.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function cerrar_cajas_auto() from public, anon;
grant execute on function cerrar_cajas_auto() to authenticated;

-- Cada 10 minutos (pg_cron). Si la extensión no está disponible, avisa y sigue.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'No se pudo activar pg_cron (%). Activalo en Database > Extensions y volvé a correr este archivo.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'cerrar-cajas-auto';
  perform cron.schedule('cerrar-cajas-auto', '*/10 * * * *', 'select public.cerrar_cajas_auto()');
  raise notice 'Cierre automático programado cada 10 minutos';
end $$;

-- ---------- 3) Envío gratis por categoría (ej.: promos con envío incluido)
alter table categorias add column if not exists incluye_envio boolean not null default false;
