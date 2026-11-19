-- =====================================================================
-- 0024: cierre de caja a ciegas (por local)
--   Con la opción activa, el usuario común cierra la caja poniendo el
--   efectivo que contó sin ver lo vendido ni el teórico; solo se le avisa
--   si está correcto, si falta o si sobra. El encargado y el admin ven todo.
-- Se puede correr más de una vez.
-- =====================================================================
alter table sucursales add column if not exists cierre_ciegas boolean not null default false;
