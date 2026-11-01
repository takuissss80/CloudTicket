-- =====================================================================
-- 0011: formato de impresión por comandera
--   formato: chico (ahorra papel) | normal | grande (letra doble, para cocina)
--   mostrar_precios: la comandera de cocina puede imprimir sin precios
-- Se puede correr más de una vez.
-- =====================================================================
alter table impresoras
  add column if not exists formato         text    not null default 'normal',
  add column if not exists mostrar_precios boolean not null default true;

do $$ begin
  alter table impresoras add constraint impresoras_formato_check check (formato in ('chico', 'normal', 'grande'));
exception when duplicate_object then null; end $$;
