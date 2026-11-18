-- =====================================================================
-- 0022: categorías dentro de otra categoría (un nivel)
--   Sirve para agrupar por marca dentro del mismo local, ej.:
--     NAPOLES      -> PROMOS, PIZZAS, EMPANADAS...
--     TODO MILA    -> SÁNDWICHES, COMBOS...
--     MAXX BURGER  -> HAMBURGUESAS, COMBOS...
--   Reglas: un solo nivel; la de adentro es de la misma cuenta; una categoría
--   del menú madre solo puede ir dentro de otra del menú madre.
--   Si se borra la de afuera, las de adentro quedan sueltas.
-- Se puede correr más de una vez.
-- =====================================================================

alter table categorias add column if not exists padre_id uuid references categorias(id) on delete set null;
create index if not exists categorias_padre on categorias (padre_id);

create or replace function validar_categoria_padre() returns trigger
language plpgsql security definer set search_path = public as $$
declare p categorias;
begin
  if new.padre_id is null then return new; end if;
  if new.padre_id = new.id then raise exception 'Una categoría no puede ir dentro de sí misma' using errcode = 'P0001'; end if;
  select * into p from categorias where id = new.padre_id;
  if p.id is null or p.cuenta_id <> new.cuenta_id then raise exception 'Categoría contenedora inválida' using errcode = 'P0001'; end if;
  if p.padre_id is not null then
    raise exception '% ya está dentro de otra categoría: solo se puede anidar un nivel', p.nombre using errcode = 'P0001';
  end if;
  if exists (select 1 from categorias where padre_id = new.id) then
    raise exception 'Esta categoría ya tiene categorías adentro: no puede ir dentro de otra' using errcode = 'P0001';
  end if;
  -- Del menú madre: solo dentro de otra del menú madre. Propia de un local: dentro del menú madre o de ese mismo local.
  if p.sucursal_id is not null and p.sucursal_id is distinct from new.sucursal_id then
    raise exception 'Una categoría propia de un local solo puede contener categorías de ese local' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_validar_categoria_padre on categorias;
create trigger trg_validar_categoria_padre before insert or update of padre_id, sucursal_id on categorias
  for each row execute function validar_categoria_padre();
