-- =====================================================================
-- 0020: el plan (Principal / PRO) pasa a ser de cada local
--   Ej.: NAPOLES VILLA ADELINA en PRO y NAPOLES BOULOGNE en Principal.
--   Requiere la 0019. Se puede correr más de una vez.
-- =====================================================================

-- Al crearla, cada local toma el plan que tenía su cuenta
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'sucursales' and column_name = 'plan') then
    alter table sucursales add column plan text;
    update sucursales s set plan = c.plan from cuentas c where c.id = s.cuenta_id;
  end if;
end $$;
update sucursales set plan = 'principal' where plan is null;
alter table sucursales alter column plan set default 'principal';
alter table sucursales alter column plan set not null;
alter table sucursales drop constraint if exists sucursales_plan;
alter table sucursales add constraint sucursales_plan check (plan in ('principal', 'pro'));

-- Un local nuevo creado sin plan toma el de la cuenta (el alta de cuenta guarda el plan elegido en la cuenta)
create or replace function plan_local_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.plan = 'principal' then
    new.plan := coalesce((select plan from cuentas where id = new.cuenta_id), 'principal');
  end if;
  return new;
end $$;
drop trigger if exists trg_plan_local_nuevo on sucursales;
create trigger trg_plan_local_nuevo before insert on sucursales for each row execute function plan_local_nuevo();

-- Solo el administrador general cambia plan y vencimiento del local
create or replace function proteger_vence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.vence is distinct from old.vence or new.plan is distinct from old.plan)
     and auth.uid() is not null and not es_superadmin() then
    raise exception 'El plan y el vencimiento los cambia el administrador de CloudTicket' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Pantalla de cocina: según el plan del local
create or replace function config_cocina(p_sucursal uuid, p_activa boolean, p_amarillo int, p_rojo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    (es_admin() and exists (select 1 from sucursales where id = p_sucursal and cuenta_id = mi_cuenta()))
    or (es_encargado() and p_sucursal = mi_sucursal())
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

-- ---- Administrador general
create or replace function sa_set_plan_local(p_sucursal uuid, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform sa_chequear();
  if p_plan not in ('principal', 'pro') then raise exception 'Plan inválido'; end if;
  update sucursales set plan = p_plan,
         cocina_activa = case when p_plan = 'pro' then cocina_activa else false end
   where id = p_sucursal;
  if not found then raise exception 'Local no encontrado'; end if;
end $$;
grant execute on function sa_set_plan_local(uuid, text) to authenticated;

drop function if exists sa_crear_local(uuid, text, date);
create or replace function sa_crear_local(p_cuenta uuid, p_nombre text, p_vence date, p_plan text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_suc uuid;
begin
  perform sa_chequear();
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Poné el nombre del local' using errcode = 'P0001'; end if;
  if p_plan not in ('principal', 'pro') then raise exception 'Plan inválido'; end if;
  if not exists (select 1 from cuentas where id = p_cuenta) then raise exception 'Cuenta no encontrada'; end if;
  insert into sucursales (cuenta_id, nombre, es_principal, vence)
  values (p_cuenta, trim(p_nombre), not exists (select 1 from sucursales where cuenta_id = p_cuenta), p_vence)
  returning id into v_suc;
  -- después del insert, para que no lo pise el plan de la cuenta
  update sucursales set plan = p_plan where id = v_suc;
  insert into impresoras (sucursal_id, nombre) values (v_suc, 'Cocina');
  return v_suc;
end $$;
grant execute on function sa_crear_local(uuid, text, date, text) to authenticated;

-- Resumen: ahora con el plan de cada local
create or replace function sa_resumen() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform sa_chequear();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'plan', c.plan, 'created_at', c.created_at,
      'locales', coalesce((select jsonb_agg(jsonb_build_object(
          'id', s.id, 'nombre', s.nombre, 'vence', s.vence, 'activa', s.activa, 'es_principal', s.es_principal,
          'plan', s.plan, 'created_at', s.created_at
        ) order by s.es_principal desc, s.created_at) from sucursales s where s.cuenta_id = c.id), '[]'::jsonb),
      'usuarios', coalesce((select jsonb_agg(jsonb_build_object(
          'user_id', p.user_id, 'usuario', p.usuario, 'rol', p.rol, 'sucursal_id', p.sucursal_id, 'nombre', p.nombre,
          'puede_descontar', p.puede_descontar, 'es_produccion', p.es_produccion, 'created_at', p.created_at
        ) order by p.rol, p.created_at) from perfiles p where p.cuenta_id = c.id), '[]'::jsonb)
    ) order by c.created_at desc)
    from cuentas c
  ), '[]'::jsonb);
end $$;
grant execute on function sa_resumen() to authenticated;
