-- =====================================================================
-- 0023: cómo se ve una categoría contenedora en cada local
--   Sin fila   -> normal (si es contenedora, agrupa sus categorías)
--   'oculta'   -> no se ve en ese local, ni ella ni lo de adentro (como la 0021)
--   'suelta'   -> en ese local no agrupa: sus categorías aparecen sueltas
--   Ej.: NAPOLES agrupada solo en el local que también vende MAXX y TODO MILA,
--        y suelta en los locales que solo venden pizza.
-- Requiere la 0021. Se puede correr más de una vez.
-- =====================================================================

alter table categoria_sucursal add column if not exists modo text not null default 'oculta';
alter table categoria_sucursal drop constraint if exists categoria_sucursal_modo;
alter table categoria_sucursal add constraint categoria_sucursal_modo check (modo in ('oculta', 'suelta'));

drop policy if exists cs_upd on categoria_sucursal;
create policy cs_upd on categoria_sucursal for update to authenticated using (
  (es_admin() and puede_sucursal(sucursal_id)) or (es_encargado() and sucursal_id = mi_sucursal())
) with check (
  (es_admin() and puede_sucursal(sucursal_id)) or (es_encargado() and sucursal_id = mi_sucursal())
);
