-- =====================================================================
-- 0036: Encargado general
--   * Entra a cualquier local de la cuenta (como el administrador).
--   * Toma pedidos, cambia formas de pago (cobrados o no), anula,
--     hace descuentos y adicionales, y edita el menú de cada local.
--   * No toca la caja: no la abre, no la cierra, no ve sus movimientos
--     ni el historial de cajas; tampoco ve ventas de cajas cerradas
--     (así no hay reportes ni resúmenes que mostrarle).
--
-- Se guarda como perfiles.rol = 'general'. El sucursal_id queda como
-- "local de inicio" (el que se abre al entrar), pero no le da permisos
-- de encargado de local: mi_sucursal() devuelve null para él.
-- Se puede correr más de una vez.
-- =====================================================================

alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check check (rol in ('admin', 'local', 'general'));

create or replace function es_general() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'general' from perfiles where user_id = auth.uid()), false)
$$;
grant execute on function es_general() to authenticated;

-- El "local propio" de un usuario de local. El general no tiene uno: opera todos
-- con lo que le permite puede_sucursal(), pero nada de lo reservado al encargado
-- de su local (caja, cocina, pantallas, dinero inicial).
create or replace function mi_sucursal() returns uuid
language sql stable security definer set search_path = public as $$
  select sucursal_id from perfiles where user_id = auth.uid() and rol <> 'general'
$$;

create or replace function puede_sucursal(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sucursales x
     where x.id = s and x.cuenta_id = mi_cuenta()
       and (es_admin() or es_general() or x.id = mi_sucursal())
  )
$$;

-- Descuentos, adicionales, anular, cambiar pagos y precios: admin, encargado o general
create or replace function puede_descontar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('admin', 'general') or puede_descontar from perfiles where user_id = auth.uid()), false)
$$;

-- ¿Puede editar el menú propio de este local? Encargado: el suyo. General: cualquiera de la cuenta.
create or replace function encargado_de(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select s is not null and es_encargado() and puede_sucursal(s)
$$;
grant execute on function encargado_de(uuid) to authenticated;

-- ---------- Menú del local
drop policy if exists cat_ins on categorias;
drop policy if exists cat_upd on categorias;
drop policy if exists cat_del on categorias;
create policy cat_ins on categorias for insert to authenticated
  with check (cuenta_id = mi_cuenta() and (es_admin() or encargado_de(sucursal_id)));
create policy cat_upd on categorias for update to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or encargado_de(sucursal_id)));
create policy cat_del on categorias for delete to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or encargado_de(sucursal_id)));

drop policy if exists prod_ins on productos;
drop policy if exists prod_upd on productos;
drop policy if exists prod_del on productos;
create policy prod_ins on productos for insert to authenticated
  with check (cuenta_id = mi_cuenta() and (es_admin() or encargado_de(sucursal_id)));
create policy prod_upd on productos for update to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or encargado_de(sucursal_id)))
  with check (cuenta_id = mi_cuenta() and (es_admin() or encargado_de(sucursal_id)));
create policy prod_del on productos for delete to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or encargado_de(sucursal_id)));

create or replace function puede_editar_producto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from productos x
     where x.id = p and x.cuenta_id = mi_cuenta()
       and (es_admin() or encargado_de(x.sucursal_id))
  )
$$;

drop policy if exists cs_ins on categoria_sucursal;
create policy cs_ins on categoria_sucursal for insert to authenticated with check (
  ((es_admin() and puede_sucursal(sucursal_id)) or encargado_de(sucursal_id))
  and exists (select 1 from categorias c where c.id = categoria_id and c.cuenta_id = mi_cuenta())
);
drop policy if exists cs_del on categoria_sucursal;
create policy cs_del on categoria_sucursal for delete to authenticated using (
  (es_admin() and puede_sucursal(sucursal_id)) or encargado_de(sucursal_id)
);
drop policy if exists cs_upd on categoria_sucursal;
create policy cs_upd on categoria_sucursal for update to authenticated using (
  (es_admin() and puede_sucursal(sucursal_id)) or encargado_de(sucursal_id)
) with check (
  (es_admin() and puede_sucursal(sucursal_id)) or encargado_de(sucursal_id)
);

-- ---------- La caja, fuera de su alcance (políticas restrictivas: se suman a las que ya hay)
drop policy if exists caj_general_sel on cajas;
drop policy if exists caj_general_ins on cajas;
drop policy if exists caj_general_upd on cajas;
drop policy if exists caj_general_del on cajas;
-- Ve solo la caja abierta (la necesita para cargar pedidos), nunca las cerradas
create policy caj_general_sel on cajas as restrictive for select to authenticated
  using (estado = 'abierta' or not (select es_general()));
create policy caj_general_ins on cajas as restrictive for insert to authenticated
  with check (not (select es_general()));
create policy caj_general_upd on cajas as restrictive for update to authenticated
  using (not (select es_general()));
create policy caj_general_del on cajas as restrictive for delete to authenticated
  using (not (select es_general()));

-- Pedidos: solo los de la caja abierta. Pagos e ítems siguen a la comanda.
drop policy if exists com_general on comandas;
create policy com_general on comandas as restrictive for all to authenticated
  using (not (select es_general()) or exists (select 1 from cajas c where c.id = caja_id and c.estado = 'abierta'))
  with check (not (select es_general()) or exists (select 1 from cajas c where c.id = caja_id and c.estado = 'abierta'));

-- Movimientos de caja (gastos, retiros, sueldos): nada
drop policy if exists mov_general on caja_movimientos;
create policy mov_general on caja_movimientos as restrictive for all to authenticated
  using (not (select es_general())) with check (not (select es_general()));

-- Las funciones de caja (cerrar, reabrir, dinero inicial) pasan por alto las
-- políticas: este control las frena igual. Lo único que se le deja cambiar es el
-- número de comanda, que avanza solo al cargar un pedido.
create or replace function cajas_sin_general() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and es_general()
     and (to_jsonb(new) - 'ultimo_numero') is distinct from (to_jsonb(old) - 'ultimo_numero') then
    raise exception 'El encargado general no puede abrir, cerrar ni modificar la caja' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_cajas_sin_general on cajas;
create trigger trg_cajas_sin_general before update on cajas for each row execute function cajas_sin_general();

-- Totales de una caja: solo para quien opera ese local (y nunca para el general).
-- Antes no controlaba permisos: cualquiera con el id de una caja podía pedirlos.
create or replace function totales_caja(p_caja uuid)
returns table (cant_comandas int, cant_anuladas int, total_ventas numeric, ventas_efectivo numeric,
               total_ingresos numeric, total_gastos numeric, total_egresos numeric, total_sueldos numeric, efectivo_teorico numeric)
language sql stable security definer set search_path = public as $$
  with com as (
    select c.id, c.total, c.estado, c.cobrada,
      coalesce((select sum(monto) from pagos p where p.comanda_id = c.id and p.forma = 'efectivo'), 0) as efvo,
      coalesce((select sum(monto) from pagos p where p.comanda_id = c.id), 0) as pagado
    from comandas c where c.caja_id = p_caja
  ), v as (
    select
      count(*) filter (where estado <> 'anulada')::int as cant,
      count(*) filter (where estado = 'anulada')::int as anul,
      coalesce(sum(total) filter (where estado <> 'anulada'), 0) as ventas,
      coalesce(sum(greatest(0, efvo - greatest(0, pagado - total))) filter (where estado <> 'anulada' and cobrada), 0) as efectivo
    from com
  ), m as (
    select
      coalesce(sum(monto) filter (where tipo = 'ingreso'), 0) as ing,
      coalesce(sum(monto) filter (where tipo = 'gasto'), 0) as gas,
      coalesce(sum(monto) filter (where tipo = 'egreso'), 0) as egr,
      coalesce(sum(monto) filter (where tipo = 'sueldo'), 0) as sue
    from caja_movimientos where caja_id = p_caja
  )
  select v.cant, v.anul, v.ventas, v.efectivo, m.ing, m.gas, m.egr, m.sue,
         (select dinero_inicial from cajas where id = p_caja) + v.efectivo + m.ing - m.gas - m.egr - m.sue
  from v, m
  where auth.uid() is null
     or (not es_general() and exists (select 1 from cajas x where x.id = p_caja and puede_sucursal(x.sucursal_id)))
$$;

-- ---------- Tipo de usuario: Común / Encargado / Producción / Encargado general
create or replace function set_tipo_usuario(p_user uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (es_admin() or es_superadmin()) then
    raise exception 'Solo un administrador puede cambiar el tipo de usuario' using errcode = 'P0001';
  end if;
  if p_tipo not in ('comun', 'encargado', 'produccion', 'general') then raise exception 'Tipo de usuario inválido'; end if;
  update perfiles set
    rol = case when p_tipo = 'general' then 'general' else 'local' end,
    puede_descontar = (p_tipo in ('encargado', 'general')),
    es_produccion = (p_tipo = 'produccion')
   where user_id = p_user and rol in ('local', 'general') and (es_superadmin() or cuenta_id = mi_cuenta());
  if not found then raise exception 'Ese usuario no es de tu cuenta' using errcode = 'P0001'; end if;
end $$;
grant execute on function set_tipo_usuario(uuid, text) to authenticated;
