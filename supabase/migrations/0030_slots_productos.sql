-- =====================================================================
-- 0030: grupos de promo con productos elegidos a mano
--   Además de "elegí N de esta categoría", un grupo puede ser
--   "elegí N de ESTOS productos" (de cualquier categoría).
--   Ej.: 4 sándwiches completos (carne o pollo) + 4 bebidas (solo gaseosas y agua).
-- Se puede correr más de una vez.
-- =====================================================================
alter table promo_slots add column if not exists productos uuid[];
alter table promo_slots alter column categoria_id drop not null;
alter table promo_slots drop constraint if exists promo_slots_origen;
alter table promo_slots add constraint promo_slots_origen
  check (categoria_id is not null or coalesce(cardinality(productos), 0) > 0);
