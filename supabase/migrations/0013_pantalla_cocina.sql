-- =====================================================================
-- 0013: pantalla de cocina
--   * Por local: activar la pantalla y los minutos de alerta (amarillo / rojo)
--   * Comandas: cuándo pasaron a cocina y cuándo quedaron listas
--   Flujo con cocina: pendiente -> en_preparacion (en cocina) -> listo -> en_camino / entregado
-- Se puede correr más de una vez.
-- =====================================================================

alter table sucursales
  add column if not exists cocina_activa   boolean not null default false,
  add column if not exists cocina_amarillo int not null default 7,
  add column if not exists cocina_rojo     int not null default 15;

do $$ begin
  alter table sucursales add constraint sucursales_cocina_minutos
    check (cocina_amarillo between 1 and 240 and cocina_rojo between 2 and 480 and cocina_amarillo < cocina_rojo);
exception when duplicate_object then null; end $$;

alter table comandas
  add column if not exists cocina_at timestamptz,
  add column if not exists listo_at  timestamptz;

-- Para la pantalla de cocina (los que están preparándose, en orden de llegada)
create index if not exists comandas_en_cocina on comandas (caja_id, cocina_at) where estado = 'en_preparacion';

-- Los horarios los pone la base (así no dependen del reloj de cada PC)
create or replace function tiempos_cocina() returns trigger
language plpgsql as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'en_preparacion' then
      new.cocina_at := coalesce(old.cocina_at, now());
      new.listo_at := null;
    elsif new.estado = 'listo' then
      new.listo_at := now();
      new.cocina_at := coalesce(new.cocina_at, now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_tiempos_cocina on comandas;
create trigger trg_tiempos_cocina before update of estado on comandas
for each row execute function tiempos_cocina();

-- Configuración de la cocina: el admin en cualquier local, el encargado en el suyo
create or replace function config_cocina(p_sucursal uuid, p_activa boolean, p_amarillo int, p_rojo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    (es_admin() and exists (select 1 from sucursales where id = p_sucursal and cuenta_id = mi_cuenta()))
    or (es_encargado() and p_sucursal = mi_sucursal())
  ) then
    raise exception 'Solo el administrador o el encargado del local pueden configurar la cocina' using errcode = 'P0001';
  end if;
  if p_amarillo < 1 or p_rojo <= p_amarillo then
    raise exception 'Los minutos de rojo tienen que ser más que los de amarillo' using errcode = 'P0001';
  end if;
  update sucursales set cocina_activa = p_activa, cocina_amarillo = p_amarillo, cocina_rojo = p_rojo where id = p_sucursal;
end $$;
grant execute on function config_cocina(uuid, boolean, int, int) to authenticated;

-- Server time para que la pantalla de cocina corrija el reloj de la PC
create or replace function hora_servidor() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function hora_servidor() to authenticated;
