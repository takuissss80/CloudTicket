-- =====================================================================
-- 0021: mostrar u ocultar una categoría del menú madre en un local
--   Una fila = esa categoría NO se muestra en ese local (en los demás sigue).
--   Lo cambian el administrador de la cuenta o el encargado del local.
-- Se puede correr más de una vez.
-- =====================================================================

create table if not exists categoria_sucursal (
  categoria_id uuid not null references categorias(id) on delete cascade,
  sucursal_id  uuid not null references sucursales(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (categoria_id, sucursal_id)
);
alter table categoria_sucursal enable row level security;

drop policy if exists cs_sel on categoria_sucursal;
create policy cs_sel on categoria_sucursal for select to authenticated using (puede_sucursal(sucursal_id));

drop policy if exists cs_ins on categoria_sucursal;
create policy cs_ins on categoria_sucursal for insert to authenticated with check (
  ((es_admin() and puede_sucursal(sucursal_id)) or (es_encargado() and sucursal_id = mi_sucursal()))
  and exists (select 1 from categorias c where c.id = categoria_id and c.cuenta_id = mi_cuenta())
);

drop policy if exists cs_del on categoria_sucursal;
create policy cs_del on categoria_sucursal for delete to authenticated using (
  (es_admin() and puede_sucursal(sucursal_id)) or (es_encargado() and sucursal_id = mi_sucursal())
);

do $$ begin
  alter publication supabase_realtime add table categoria_sucursal;
exception when duplicate_object or undefined_object then null; end $$;
