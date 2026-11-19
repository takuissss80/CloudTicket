-- =====================================================================
-- 0027: aviso instantáneo al programa de impresión (Realtime Broadcast)
--   Al crearse un trabajo de impresión, la base avisa por tiempo real al
--   programa de esa comandera y la imprime al instante, sin que el programa
--   tenga que preguntar cada 2 segundos.
--   El aviso NO lleva datos: el programa igual va a buscar el trabajo con su
--   token. Si el aviso falla o el programa no está escuchando, nada se pierde:
--   el programa sigue revisando la cola (cada 30 s si escucha avisos, cada 2 s
--   si no) y los programas viejos (1.6.x) siguen funcionando igual.
-- Se puede correr más de una vez.
-- =====================================================================

-- Canal secreto de cada comandera (no se deduce del token; cambia si se genera un token nuevo)
alter table impresoras add column if not exists canal_aviso uuid not null default gen_random_uuid();

create or replace function rotar_canal_aviso() returns trigger
language plpgsql as $$
begin
  if new.token_hash is distinct from old.token_hash then new.canal_aviso := gen_random_uuid(); end if;
  return new;
end $$;
drop trigger if exists trg_rotar_canal_aviso on impresoras;
create trigger trg_rotar_canal_aviso before update of token_hash on impresoras
  for each row execute function rotar_canal_aviso();

-- Aviso al crear un trabajo. Nunca hace fallar la impresión.
create or replace function avisar_spool() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_canal uuid;
begin
  if new.estado <> 'pendiente' then return null; end if;
  select canal_aviso into v_canal from impresoras where id = new.impresora_id;
  if v_canal is null then return null; end if;
  begin
    perform realtime.send(jsonb_build_object('n', 1), 'nuevo', 'spool:' || v_canal::text, false);
  exception when others then
    null; -- sin aviso: el programa lo encuentra igual en su próxima revisión de la cola
  end;
  return null;
end $$;
drop trigger if exists trg_avisar_spool on print_jobs;
create trigger trg_avisar_spool after insert on print_jobs
  for each row execute function avisar_spool();

-- spool_ping ahora también le dice al programa en qué canal escuchar
create or replace function spool_ping(p_token text, p_pc text default null, p_impresora_windows text default null, p_version text default null)
returns json
language plpgsql volatile security definer set search_path = public as $$
declare i impresoras; v_local text; v_cuenta text;
begin
  i := impresora_de_token(p_token);
  update impresoras set
    ultimo_ping = now(),
    pc_nombre = coalesce(left(p_pc, 80), pc_nombre),
    impresora_windows = coalesce(left(p_impresora_windows, 200), impresora_windows),
    version_programa = coalesce(left(p_version, 30), version_programa),
    vinculada_at = coalesce(vinculada_at, now())
   where id = i.id;
  select s.nombre, c.nombre into v_local, v_cuenta from sucursales s join cuentas c on c.id = s.cuenta_id where s.id = i.sucursal_id;
  return json_build_object('impresora_id', i.id, 'nombre', i.nombre, 'ancho', i.ancho, 'copias', i.copias,
                           'local', v_local, 'cuenta', v_cuenta, 'canal', 'spool:' || i.canal_aviso::text);
end $$;
