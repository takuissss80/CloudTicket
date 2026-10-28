-- =====================================================================
-- Repartidores y tiempos de delivery
-- =====================================================================
-- Flujo simplificado:
--   mostrador: pendiente -> entregado
--   delivery:  pendiente -> en_camino (moto asignada) -> entregado
-- Los estados 'en_preparacion' y 'listo' quedan en el check pero no se usan.

create table repartidores (
  id           uuid primary key default gen_random_uuid(),
  sucursal_id  uuid not null references sucursales(id) on delete cascade,
  nombre       text not null,
  dni          text,
  telefono     text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on repartidores (sucursal_id);

alter table repartidores enable row level security;
create policy rep_all on repartidores for all to authenticated
  using (puede_sucursal(sucursal_id)) with check (puede_sucursal(sucursal_id));

alter table comandas
  add column repartidor_id uuid references repartidores(id) on delete set null,
  add column asignada_at   timestamptz,   -- salió la moto: arranca el contador
  add column entregada_at  timestamptz;

-- La moto tiene que ser del mismo local que la comanda
create or replace function validar_repartidor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.repartidor_id is not null and not exists (
    select 1 from repartidores r where r.id = new.repartidor_id and r.sucursal_id = new.sucursal_id
  ) then
    raise exception 'Ese repartidor no es de este local';
  end if;
  return new;
end $$;

create trigger trg_validar_repartidor before insert or update of repartidor_id on comandas
for each row execute function validar_repartidor();
