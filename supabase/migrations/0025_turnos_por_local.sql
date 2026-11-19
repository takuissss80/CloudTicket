-- =====================================================================
-- 0025: turnos de caja configurables por local
--   sucursales.turnos = [{"nombre": "Mañana", "desde": "06:00"}, ...]
--   El orden es por la hora de inicio. Sin configurar: Mañana / Tarde / Noche.
--   La regla de la 0005 sigue igual pero con la lista del local: un usuario
--   del local no puede abrir en el mismo día un turno anterior ni repetir uno.
-- Se puede correr más de una vez.
-- =====================================================================

alter table sucursales add column if not exists turnos jsonb;

-- Nombres de los turnos del local, en orden
create or replace function turnos_local(p_sucursal uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array_agg(t->>'nombre' order by coalesce(t->>'desde', '99:99'), o)
       from sucursales s, jsonb_array_elements(s.turnos) with ordinality as x(t, o)
      where s.id = p_sucursal and jsonb_typeof(s.turnos) = 'array'),
    array['Mañana', 'Tarde', 'Noche'])
$$;

create or replace function validar_orden_turno() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lista  text[] := turnos_local(new.sucursal_id);
  v_orden  int := array_position(v_lista, new.turno);
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
     and array_position(v_lista, c.turno) >= v_orden
   order by array_position(v_lista, c.turno) desc
   limit 1;

  if v_turno is not null then
    raise exception 'Hoy ya se abrió la caja %. Solo el administrador puede abrir un turno anterior o repetirlo.', lower(v_turno)
      using errcode = 'P0001';
  end if;
  return new;
end $$;
