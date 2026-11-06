-- =====================================================================
-- 0014: permitir imprimir el cierre de caja en la comandera
-- Se puede correr más de una vez.
-- =====================================================================
do $$
declare r record;
begin
  -- Borra el control viejo de "tipo" (sea cual sea su nombre) y pone el nuevo
  for r in select conname from pg_constraint
            where conrelid = 'print_jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table print_jobs drop constraint %I', r.conname);
  end loop;
end $$;

alter table print_jobs add constraint print_jobs_tipo_check
  check (tipo in ('comanda','reimpresion','anulacion','cuenta','prueba','cierre'));
