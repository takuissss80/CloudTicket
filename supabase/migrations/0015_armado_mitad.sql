-- =====================================================================
-- 0015: recargo por armado de pizza mitad y mitad
-- Crea en cada cuenta el producto "Armado mitad y mitad" ($1500) con el
-- código ARMADO-MITAD, en la categoría ADICIONALES del menú madre.
-- El sistema lo suma solo (1 por cada pizza armada con 2 mitades).
-- El precio se cambia en Administración -> Menú, como cualquier producto
-- (y cada local puede tener su propio precio). No le cambies el código.
-- Se puede correr más de una vez.
-- =====================================================================
do $$
declare
  c record; v_cat uuid; v_orden int;
begin
  for c in select id from cuentas loop
    if exists (select 1 from productos where cuenta_id = c.id and upper(codigo) = 'ARMADO-MITAD') then continue; end if;

    -- Si ya había un "Armado mitad" cargado a mano en el menú madre, se usa ese (con su precio)
    update productos set codigo = 'ARMADO-MITAD', tipo = 'extra', activo = true
     where id = (select id from productos where cuenta_id = c.id and sucursal_id is null
                  and lower(nombre) like 'armado%mitad%' order by orden, nombre limit 1);
    if found then continue; end if;

    select id into v_cat from categorias
     where cuenta_id = c.id and sucursal_id is null and upper(nombre) = 'ADICIONALES' limit 1;
    if v_cat is null then
      select coalesce(max(orden), -1) + 1 into v_orden from categorias where cuenta_id = c.id and sucursal_id is null;
      insert into categorias (cuenta_id, nombre, orden, color) values (c.id, 'ADICIONALES', v_orden, 'green') returning id into v_cat;
    end if;

    insert into productos (cuenta_id, categoria_id, tipo, nombre, codigo, precio, orden, activo, descripcion)
    values (c.id, v_cat, 'extra', 'Armado mitad y mitad', 'ARMADO-MITAD', 1500, 0, true,
            'Se suma solo por cada pizza armada con dos mitades');
  end loop;
end $$;
