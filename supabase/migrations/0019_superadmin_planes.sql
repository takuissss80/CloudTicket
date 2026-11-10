-- =====================================================================
-- 0019: Administrador general de CloudTicket + planes + vencimientos
--   * Administrador general (superadmin): da de alta cuentas, locales y
--     usuarios de cualquier cuenta, cambia el plan y la fecha de vencimiento.
--   * Plan de cada cuenta: Principal (sin pantallas de cocina y de clientes)
--     o PRO (todo).
--   * Cada local tiene su propio vencimiento de suscripción.
--   * El administrador de una cuenta ya no crea locales ni cuentas: solo
--     usuarios Encargado / Común / Producción de sus locales.
-- Se puede correr más de una vez.
--
-- Para hacerte administrador general (una sola vez, después de correr esto):
--   1. Supabase → Authentication → Users → Add user: tu email y contraseña
--      (tildá "Auto Confirm User").
--   2. En el SQL Editor:
--      insert into superadmins (user_id) select id from auth.users where email = 'TU_EMAIL'
--      on conflict do nothing;
-- =====================================================================

-- ---------------------------------------------------------------------
-- Administradores generales
-- ---------------------------------------------------------------------
create table if not exists superadmins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table superadmins enable row level security;
drop policy if exists sa_sel on superadmins;
create policy sa_sel on superadmins for select to authenticated using (user_id = auth.uid());

create or replace function es_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from superadmins where user_id = auth.uid())
$$;
grant execute on function es_superadmin() to authenticated;

-- ---------------------------------------------------------------------
-- Plan por cuenta y vencimiento por local
-- ---------------------------------------------------------------------
-- Las cuentas que ya existen quedan en PRO (para no apagarles la cocina); las nuevas arrancan en Principal.
alter table cuentas add column if not exists plan text not null default 'pro';
alter table cuentas alter column plan set default 'principal';
alter table cuentas drop constraint if exists cuentas_plan;
alter table cuentas add constraint cuentas_plan check (plan in ('principal', 'pro'));

alter table sucursales add column if not exists vence date;

create or replace function mi_plan() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select plan from cuentas where id = mi_cuenta()), 'principal')
$$;
grant execute on function mi_plan() to authenticated;

-- Solo el administrador general cambia el plan y los vencimientos
-- (auth.uid() null = SQL Editor o funciones del servidor)
create or replace function proteger_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.plan is distinct from old.plan and auth.uid() is not null and not es_superadmin() then
    raise exception 'El plan lo cambia el administrador de CloudTicket' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_plan on cuentas;
create trigger trg_proteger_plan before update on cuentas for each row execute function proteger_plan();

create or replace function proteger_vence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vence is distinct from old.vence and auth.uid() is not null and not es_superadmin() then
    raise exception 'El vencimiento lo cambia el administrador de CloudTicket' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_vence on sucursales;
create trigger trg_proteger_vence before update on sucursales for each row execute function proteger_vence();

-- ---------------------------------------------------------------------
-- El administrador de la cuenta ya no da de alta cuentas ni locales
-- ---------------------------------------------------------------------
drop policy if exists suc_ins on sucursales;

create or replace function crear_cuenta(p_cuenta text, p_local text, p_usuario text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Las cuentas nuevas las da de alta el administrador de CloudTicket' using errcode = 'P0001';
end $$;

create or replace function crear_sucursal(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Los locales nuevos los da de alta el administrador de CloudTicket' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------
-- Pantalla de cocina: solo plan PRO
-- ---------------------------------------------------------------------
create or replace function config_cocina(p_sucursal uuid, p_activa boolean, p_amarillo int, p_rojo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    (es_admin() and exists (select 1 from sucursales where id = p_sucursal and cuenta_id = mi_cuenta()))
    or (es_encargado() and p_sucursal = mi_sucursal())
  ) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar la cocina' using errcode = 'P0001';
  end if;
  if p_activa and mi_plan() <> 'pro' then
    raise exception 'La pantalla de cocina es del plan PRO' using errcode = 'P0001';
  end if;
  if p_amarillo < 1 or p_rojo <= p_amarillo then
    raise exception 'Los minutos de rojo tienen que ser más que los de amarillo' using errcode = 'P0001';
  end if;
  update sucursales set cocina_activa = p_activa, cocina_amarillo = p_amarillo, cocina_rojo = p_rojo where id = p_sucursal;
end $$;
grant execute on function config_cocina(uuid, boolean, int, int) to authenticated;

-- Tipo de usuario: el admin de la cuenta en sus locales, o el administrador general en cualquiera
create or replace function set_tipo_usuario(p_user uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (es_admin() or es_superadmin()) then
    raise exception 'Solo un administrador puede cambiar el tipo de usuario' using errcode = 'P0001';
  end if;
  if p_tipo not in ('comun', 'encargado', 'produccion') then raise exception 'Tipo de usuario inválido'; end if;
  update perfiles set puede_descontar = (p_tipo = 'encargado'), es_produccion = (p_tipo = 'produccion')
   where user_id = p_user and rol = 'local' and (es_superadmin() or cuenta_id = mi_cuenta());
  if not found then raise exception 'Ese usuario no es de tu cuenta' using errcode = 'P0001'; end if;
end $$;
grant execute on function set_tipo_usuario(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Funciones del administrador general
-- ---------------------------------------------------------------------
create or replace function sa_chequear() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_superadmin() then raise exception 'Solo el administrador de CloudTicket' using errcode = 'P0001'; end if;
end $$;

-- Todas las cuentas con sus locales y usuarios
create or replace function sa_resumen() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform sa_chequear();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'plan', c.plan, 'created_at', c.created_at,
      'locales', coalesce((select jsonb_agg(jsonb_build_object(
          'id', s.id, 'nombre', s.nombre, 'vence', s.vence, 'activa', s.activa, 'es_principal', s.es_principal, 'created_at', s.created_at
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

create or replace function sa_set_plan(p_cuenta uuid, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform sa_chequear();
  if p_plan not in ('principal', 'pro') then raise exception 'Plan inválido'; end if;
  update cuentas set plan = p_plan where id = p_cuenta;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  -- Al bajar a Principal se apagan las pantallas de cocina
  if p_plan = 'principal' then update sucursales set cocina_activa = false where cuenta_id = p_cuenta; end if;
end $$;
grant execute on function sa_set_plan(uuid, text) to authenticated;

create or replace function sa_set_vence(p_sucursal uuid, p_vence date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform sa_chequear();
  update sucursales set vence = p_vence where id = p_sucursal;
  if not found then raise exception 'Local no encontrado'; end if;
end $$;
grant execute on function sa_set_vence(uuid, date) to authenticated;

create or replace function sa_crear_local(p_cuenta uuid, p_nombre text, p_vence date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_suc uuid;
begin
  perform sa_chequear();
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Poné el nombre del local' using errcode = 'P0001'; end if;
  if not exists (select 1 from cuentas where id = p_cuenta) then raise exception 'Cuenta no encontrada'; end if;
  insert into sucursales (cuenta_id, nombre, es_principal, vence)
  values (p_cuenta, trim(p_nombre), not exists (select 1 from sucursales where cuenta_id = p_cuenta), p_vence)
  returning id into v_suc;
  insert into impresoras (sucursal_id, nombre) values (v_suc, 'Cocina');
  return v_suc;
end $$;
grant execute on function sa_crear_local(uuid, text, date) to authenticated;

create or replace function sa_editar_local(p_sucursal uuid, p_nombre text, p_activa boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform sa_chequear();
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Poné el nombre del local' using errcode = 'P0001'; end if;
  update sucursales set nombre = trim(p_nombre), activa = p_activa where id = p_sucursal;
end $$;
grant execute on function sa_editar_local(uuid, text, boolean) to authenticated;

create or replace function sa_renombrar_cuenta(p_cuenta uuid, p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform sa_chequear();
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Poné el nombre de la cuenta' using errcode = 'P0001'; end if;
  update cuentas set nombre = trim(p_nombre) where id = p_cuenta;
end $$;
grant execute on function sa_renombrar_cuenta(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Cuentas nuevas: arrancan con el "Armado mitad y mitad" (ver 0015)
-- ---------------------------------------------------------------------
create or replace function trg_cuenta_armado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat uuid;
begin
  insert into categorias (cuenta_id, nombre, orden, color) values (new.id, 'ADICIONALES', 0, 'green') returning id into v_cat;
  insert into productos (cuenta_id, categoria_id, tipo, nombre, codigo, precio, orden, activo, descripcion)
  values (new.id, v_cat, 'extra', 'Armado mitad y mitad', 'ARMADO-MITAD', 1500, 0, true,
          'Se suma solo por cada pizza armada con dos mitades');
  return new;
end $$;
drop trigger if exists trg_cuentas_armado on cuentas;
create trigger trg_cuentas_armado after insert on cuentas for each row execute function trg_cuenta_armado();
