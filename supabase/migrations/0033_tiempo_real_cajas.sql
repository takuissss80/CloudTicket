-- =====================================================================
-- 0033: la tabla cajas en el tiempo real
--   Así, si una caja se cierra o se reabre desde otra PC, las demás pantallas
--   se enteran al instante. Se puede correr más de una vez.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cajas') then
    alter publication supabase_realtime add table cajas;
  end if;
end $$;
