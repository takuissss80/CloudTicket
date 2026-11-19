-- =====================================================================
-- 0029: grupos de promo "elegí de X a Y"
--   Ej.: helado de 1 kg = elegí de 1 a 4 sabores.
--   minimo vacío = hay que elegir exactamente la cantidad (como siempre).
-- Se puede correr más de una vez.
-- =====================================================================
alter table promo_slots add column if not exists minimo int;
alter table promo_slots drop constraint if exists promo_slots_minimo;
alter table promo_slots add constraint promo_slots_minimo check (minimo is null or (minimo >= 1 and minimo <= cantidad));
