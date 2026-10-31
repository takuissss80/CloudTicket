-- =====================================================================
-- 0005: orden de los turnos de caja
-- En un mismo día (hora de Argentina) un usuario de local no puede abrir
-- un turno anterior ni repetir uno ya abierto: mañana -> tarde -> noche.
-- El administrador sí puede.
-- =====================================================================

create or replace function validar_orden_turno() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_orden  int := array_position(array['Mañana','Tarde','Noche'], new.turno);
  v_hoy    date := (coalesce(new.abierta_at, now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  v_turno  text;
begin
  if es_admin() or v_orden is null then
    return new;
  end if;

  select c.turno into v_turno
    from cajas c
   where c.sucursal_id = new.sucursal_id
     and (c.abierta_at at time zone 'America/Argentina/Buenos_Aires')::date = v_hoy
     and array_position(array['Mañana','Tarde','Noche'], c.turno) >= v_orden
   order by array_position(array['Mañana','Tarde','Noche'], c.turno) desc
   limit 1;

  if v_turno is not null then
    raise exception 'Hoy ya se abrió la caja %. Solo el administrador puede abrir un turno anterior o repetirlo.', lower(v_turno)
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_cajas_orden_turno on cajas;
create trigger trg_cajas_orden_turno before insert on cajas
for each row execute function validar_orden_turno();

-- Borrar trabajos de la cola: solo los que todavía no se imprimieron
-- (pendientes o con error). Reemplaza el permiso general de print_jobs.
drop policy if exists pj_all on print_jobs;
drop policy if exists pj_sel on print_jobs;
drop policy if exists pj_ins on print_jobs;
drop policy if exists pj_upd on print_jobs;
drop policy if exists pj_del on print_jobs;
create policy pj_sel on print_jobs for select to authenticated
  using (exists (select 1 from impresoras i where i.id = impresora_id and puede_sucursal(i.sucursal_id)));
create policy pj_ins on print_jobs for insert to authenticated
  with check (exists (select 1 from impresoras i where i.id = impresora_id and puede_sucursal(i.sucursal_id)));
create policy pj_upd on print_jobs for update to authenticated
  using (exists (select 1 from impresoras i where i.id = impresora_id and puede_sucursal(i.sucursal_id)))
  with check (exists (select 1 from impresoras i where i.id = impresora_id and puede_sucursal(i.sucursal_id)));
create policy pj_del on print_jobs for delete to authenticated
  using (estado in ('pendiente', 'error')
         and exists (select 1 from impresoras i where i.id = impresora_id and puede_sucursal(i.sucursal_id)));
