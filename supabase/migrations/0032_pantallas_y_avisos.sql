-- =====================================================================
-- 0032: pantallas (cocina + clientes), sin cierre automático y alarma de
--       PedidosYa sin confirmar
--   1) Se saca el cierre automático de cajas de la 0031 (la web muestra una
--      barra roja si la caja quedó abierta de un día para el otro).
--   2) Pantalla para clientes: orientación y videos que se reproducen en loop.
--      Los videos van al Storage (bucket público "pantallas").
--   3) Cuando GoWin imprime el recordatorio "pedido sin confirmar", el
--      programa de impresión (1.7.2) lo avisa y la web muestra una alarma.
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------- 1) Sin cierre automático
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cerrar-cajas-auto';
  end if;
exception when others then null;
end $$;
drop function if exists cerrar_cajas_auto();

-- ---------- 2) Pantalla para clientes
alter table sucursales add column if not exists pantalla_orientacion text not null default 'horizontal';
alter table sucursales drop constraint if exists sucursales_pantalla_orientacion;
alter table sucursales add constraint sucursales_pantalla_orientacion
  check (pantalla_orientacion in ('horizontal', 'vertical_izquierda', 'vertical_derecha'));
alter table sucursales add column if not exists pantalla_videos jsonb not null default '[]'::jsonb;

create or replace function config_pantalla_clientes(p_sucursal uuid, p_orientacion text, p_videos jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(
    (es_admin() and exists (select 1 from sucursales where id = p_sucursal and cuenta_id = mi_cuenta()))
    or (es_encargado() and p_sucursal = mi_sucursal()), false
  ) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar las pantallas' using errcode = 'P0001';
  end if;
  if (select plan from sucursales where id = p_sucursal) <> 'pro' then
    raise exception 'La pantalla para clientes es del plan PRO' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 20 then
    raise exception 'Hasta 20 videos' using errcode = 'P0001';
  end if;
  update sucursales set pantalla_orientacion = p_orientacion, pantalla_videos = coalesce(p_videos, '[]'::jsonb) where id = p_sucursal;
end $$;
grant execute on function config_pantalla_clientes(uuid, text, jsonb) to authenticated;

-- Bucket de videos: público para leer (las teles los muestran sin iniciar sesión),
-- y cada cuenta solo sube o borra en su carpeta (<cuenta>/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pantallas', 'pantallas', true, 209715200, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pantallas_subir on storage.objects;
create policy pantallas_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'pantallas' and (storage.foldername(name))[1] = mi_cuenta()::text and (es_admin() or es_encargado()));
drop policy if exists pantallas_borrar on storage.objects;
create policy pantallas_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'pantallas' and (storage.foldername(name))[1] = mi_cuenta()::text and (es_admin() or es_encargado()));
drop policy if exists pantallas_leer on storage.objects;
create policy pantallas_leer on storage.objects for select to authenticated
  using (bucket_id = 'pantallas' and (storage.foldername(name))[1] = mi_cuenta()::text);

-- ---------- 3) Alarma de PedidosYa sin confirmar
create table if not exists avisos_py (
  sucursal_id uuid primary key references sucursales(id) on delete cascade,
  ultimo_at   timestamptz not null default now(),
  texto       text
);
alter table avisos_py enable row level security;
drop policy if exists avisos_py_leer on avisos_py;
create policy avisos_py_leer on avisos_py for select to authenticated using (puede_sucursal(sucursal_id));

create or replace function spool_aviso_py(p_token text, p_texto text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare i impresoras;
begin
  i := impresora_de_token(p_token);
  insert into avisos_py (sucursal_id, ultimo_at, texto) values (i.sucursal_id, now(), left(p_texto, 300))
  on conflict (sucursal_id) do update set ultimo_at = now(), texto = excluded.texto;
end $$;
grant execute on function spool_aviso_py(text, text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'avisos_py') then
    alter publication supabase_realtime add table avisos_py;
  end if;
end $$;
