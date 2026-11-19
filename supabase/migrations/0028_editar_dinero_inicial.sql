-- =====================================================================
-- 0028: el administrador o el encargado del local pueden corregir el
--   dinero al inicio de la caja abierta (ej.: se cargó mal al abrir).
-- Se puede correr más de una vez.
-- =====================================================================

create or replace function cambiar_dinero_inicial(p_caja uuid, p_monto numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_suc uuid;
begin
  if p_monto is null or p_monto < 0 then raise exception 'Monto inválido' using errcode = 'P0001'; end if;
  select sucursal_id into v_suc from cajas where id = p_caja and estado = 'abierta';
  if v_suc is null then raise exception 'Solo se puede cambiar el inicio de la caja abierta' using errcode = 'P0001'; end if;
  if not coalesce(
    (es_admin() and exists (select 1 from sucursales where id = v_suc and cuenta_id = mi_cuenta()))
    or (es_encargado() and v_suc = mi_sucursal()), false
  ) then
    raise exception 'Solo el administrador o el encargado del local pueden cambiar el dinero al inicio' using errcode = 'P0001';
  end if;
  update cajas set dinero_inicial = round(p_monto, 2) where id = p_caja;
end $$;
grant execute on function cambiar_dinero_inicial(uuid, numeric) to authenticated;

-- De paso: config_cocina tenía el mismo descuido (un NULL dejaba pasar a un admin de otra cuenta)
create or replace function config_cocina(p_sucursal uuid, p_activa boolean, p_amarillo int, p_rojo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(
    (es_admin() and exists (select 1 from sucursales where id = p_sucursal and cuenta_id = mi_cuenta()))
    or (es_encargado() and p_sucursal = mi_sucursal()), false
  ) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar la cocina' using errcode = 'P0001';
  end if;
  if p_activa and (select plan from sucursales where id = p_sucursal) <> 'pro' then
    raise exception 'La pantalla de cocina es del plan PRO' using errcode = 'P0001';
  end if;
  if p_amarillo < 1 or p_rojo <= p_amarillo then
    raise exception 'Los minutos de rojo tienen que ser más que los de amarillo' using errcode = 'P0001';
  end if;
  update sucursales set cocina_activa = p_activa, cocina_amarillo = p_amarillo, cocina_rojo = p_rojo where id = p_sucursal;
end $$;
grant execute on function config_cocina(uuid, boolean, int, int) to authenticated;
