-- =====================================================================
-- 0012: el usuario común no edita el menú ni los precios
--
-- Dónde se guarda el tipo de usuario: tabla perfiles
--   rol = 'admin'                          -> administrador de la cuenta
--   rol = 'local' y puede_descontar = true -> Encargado
--   rol = 'local' y puede_descontar = false -> Común
-- La función puede_descontar() devuelve true para admin y encargados.
-- Se puede correr más de una vez.
-- =====================================================================

-- Nombre más claro para lo mismo: admin o encargado
create or replace function es_encargado() returns boolean
language sql stable security definer set search_path = public as $$ select puede_descontar() $$;
grant execute on function es_encargado() to authenticated;

-- Categorías y productos propios del local: solo admin o encargado de ese local
drop policy if exists cat_ins on categorias;
drop policy if exists cat_upd on categorias;
drop policy if exists cat_del on categorias;
create policy cat_ins on categorias for insert to authenticated
  with check (cuenta_id = mi_cuenta() and (es_admin() or (es_encargado() and sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy cat_upd on categorias for update to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (es_encargado() and sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy cat_del on categorias for delete to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (es_encargado() and sucursal_id is not null and sucursal_id = mi_sucursal())));

drop policy if exists prod_ins on productos;
drop policy if exists prod_upd on productos;
drop policy if exists prod_del on productos;
create policy prod_ins on productos for insert to authenticated
  with check (cuenta_id = mi_cuenta() and (es_admin() or (es_encargado() and sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy prod_upd on productos for update to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (es_encargado() and sucursal_id is not null and sucursal_id = mi_sucursal())))
  with check (cuenta_id = mi_cuenta() and (es_admin() or (es_encargado() and sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy prod_del on productos for delete to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (es_encargado() and sucursal_id is not null and sucursal_id = mi_sucursal())));

-- Recetas y armado de promos siguen al producto
create or replace function puede_editar_producto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from productos x
     where x.id = p and x.cuenta_id = mi_cuenta()
       and (es_admin() or (es_encargado() and x.sucursal_id is not null and x.sucursal_id = mi_sucursal()))
  )
$$;

-- Ajustes del local (precio propio, oculto, agotado):
-- el común solo puede marcar o desmarcar agotado
create or replace function proteger_ajustes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or es_encargado() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Solo el administrador o un encargado pueden cambiar el menú del local' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.precio is not null or new.precio_mitad is not null or new.oculto then
      raise exception 'Solo el administrador o un encargado pueden cambiar precios' using errcode = 'P0001';
    end if;
  elsif new.precio is distinct from old.precio or new.precio_mitad is distinct from old.precio_mitad or new.oculto is distinct from old.oculto then
    raise exception 'Solo el administrador o un encargado pueden cambiar precios' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_ajustes on producto_sucursal;
create trigger trg_proteger_ajustes before insert or update or delete on producto_sucursal
for each row execute function proteger_ajustes();

-- Aumento masivo de precios
create or replace function aumentar_precios(p_categoria uuid, p_porcentaje numeric, p_sucursal uuid default null, p_redondeo numeric default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
  f numeric := 1 + p_porcentaje / 100;
  r numeric := greatest(coalesce(p_redondeo, 1), 0.01);
begin
  if not es_encargado() then raise exception 'Solo el administrador o un encargado pueden cambiar precios' using errcode = 'P0001'; end if;
  if p_sucursal is null then
    if not es_admin() then raise exception 'Solo un administrador cambia el menú madre'; end if;
    update productos set
      precio = round(precio * f / r) * r,
      precio_mitad = case when precio_mitad is null then null else round(precio_mitad * f / r) * r end
     where categoria_id = p_categoria and cuenta_id = mi_cuenta() and sucursal_id is null and tipo <> 'promo';
    get diagnostics v_n = row_count;
  else
    if not puede_sucursal(p_sucursal) then raise exception 'Sin acceso a ese local'; end if;
    -- productos propios del local
    update productos set
      precio = round(precio * f / r) * r,
      precio_mitad = case when precio_mitad is null then null else round(precio_mitad * f / r) * r end
     where categoria_id = p_categoria and sucursal_id = p_sucursal and tipo <> 'promo';
    get diagnostics v_n = row_count;
    -- precios propios sobre productos del menú madre
    update producto_sucursal ps set
      precio = case when ps.precio is null then null else round(ps.precio * f / r) * r end,
      precio_mitad = case when ps.precio_mitad is null then null else round(ps.precio_mitad * f / r) * r end
      from productos p
     where p.id = ps.producto_id and ps.sucursal_id = p_sucursal and p.categoria_id = p_categoria
       and (ps.precio is not null or ps.precio_mitad is not null);
  end if;
  return v_n;
end $$;
