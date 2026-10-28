-- =====================================================================
-- Caja: dinero inicial, movimientos, cierre con efectivo real e historial
-- =====================================================================
-- Igual que el resumen de Datalive:
--   dinero al inicio + ventas en efectivo + ingresos
--   - gastos - egresos (retiros) - sueldos
--   = total teórico en caja (sin lo cobrado online)
-- Al cerrar se carga el efectivo contado y queda la diferencia.

alter table cajas
  add column dinero_inicial      numeric(12,2) not null default 0,
  add column abierta_por_usuario text,
  add column cerrada_por         uuid references auth.users(id) on delete set null,
  add column cerrada_por_usuario text,
  add column observaciones       text,
  -- Foto de los totales al cerrar (para el historial)
  add column cant_comandas       int,
  add column cant_anuladas       int,
  add column total_ventas        numeric(12,2),
  add column ventas_efectivo     numeric(12,2),
  add column total_ingresos      numeric(12,2),
  add column total_gastos        numeric(12,2),
  add column total_egresos       numeric(12,2),
  add column total_sueldos       numeric(12,2),
  add column efectivo_teorico    numeric(12,2),
  add column dinero_cierre       numeric(12,2),
  add column diferencia          numeric(12,2);

create index on cajas (sucursal_id, abierta_at desc);

-- Tipos de gasto (por cuenta)
create table tipos_gasto (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  nombre     text not null,
  orden      int not null default 0,
  activo     boolean not null default true
);
alter table tipos_gasto enable row level security;
create policy tg_sel on tipos_gasto for select to authenticated using (cuenta_id = mi_cuenta());
create policy tg_all on tipos_gasto for all to authenticated
  using (cuenta_id = mi_cuenta() and es_admin()) with check (cuenta_id = mi_cuenta() and es_admin());

create or replace function crear_tipos_gasto(p_cuenta uuid) returns void
language sql security definer set search_path = public as $$
  insert into tipos_gasto (cuenta_id, nombre, orden)
  select p_cuenta, n, o from unnest(array['Motos','Proveedores varios','Pago remito','Servicios','Alquiler','Impuestos','Abonos profesionales','Varios'])
    with ordinality as t(n, o)
  where not exists (select 1 from tipos_gasto where cuenta_id = p_cuenta);
$$;
select crear_tipos_gasto(id) from cuentas;

create or replace function trg_cuenta_tipos_gasto() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform crear_tipos_gasto(new.id); return new; end $$;
create trigger trg_cuentas_tipos_gasto after insert on cuentas for each row execute function trg_cuenta_tipos_gasto();

-- Movimientos de la caja
-- ingreso: entra efectivo (cambio, aporte)
-- gasto:   se paga algo con la caja (motos, proveedores…)
-- egreso:  retiro de efectivo (al cofre / al dueño)
-- sueldo:  pago de sueldo en efectivo
create table caja_movimientos (
  id              uuid primary key default gen_random_uuid(),
  caja_id         uuid not null references cajas(id) on delete cascade,
  tipo            text not null check (tipo in ('ingreso','gasto','egreso','sueldo')),
  tipo_gasto_id   uuid references tipos_gasto(id) on delete set null,
  concepto        text not null,
  monto           numeric(12,2) not null check (monto > 0),
  creado_por      uuid references auth.users(id) on delete set null,
  creado_por_usuario text,
  created_at      timestamptz not null default now()
);
create index on caja_movimientos (caja_id);
alter table caja_movimientos enable row level security;
create policy mov_sel on caja_movimientos for select to authenticated
  using (exists (select 1 from cajas c where c.id = caja_id and puede_sucursal(c.sucursal_id)));
-- Solo con la caja abierta
create policy mov_ins on caja_movimientos for insert to authenticated
  with check (exists (select 1 from cajas c where c.id = caja_id and c.estado = 'abierta' and puede_sucursal(c.sucursal_id)));
create policy mov_del on caja_movimientos for delete to authenticated
  using (exists (select 1 from cajas c where c.id = caja_id and c.estado = 'abierta' and puede_sucursal(c.sucursal_id)));

-- Quién abre la caja y quién carga cada movimiento
create or replace function trg_usuario_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.abierta_por := coalesce(new.abierta_por, auth.uid());
  new.abierta_por_usuario := (select usuario from perfiles where user_id = new.abierta_por);
  return new;
end $$;
create trigger trg_cajas_usuario before insert on cajas for each row execute function trg_usuario_caja();

create or replace function trg_usuario_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.creado_por := auth.uid();
  new.creado_por_usuario := (select usuario from perfiles where user_id = auth.uid());
  return new;
end $$;
create trigger trg_mov_usuario before insert on caja_movimientos for each row execute function trg_usuario_movimiento();

-- Totales de una caja (los mismos que muestra la web)
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
      -- efectivo cobrado, descontando el vuelto
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
$$;

-- Cerrar: guarda los totales, el efectivo contado y la diferencia
create or replace function cerrar_caja(p_caja uuid, p_dinero_cierre numeric, p_observaciones text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_suc uuid;
begin
  select sucursal_id into v_suc from cajas where id = p_caja and estado = 'abierta';
  if v_suc is null then raise exception 'La caja no está abierta'; end if;
  if not puede_sucursal(v_suc) then raise exception 'Sin acceso a ese local'; end if;
  select * into t from totales_caja(p_caja);
  update cajas set
    estado = 'cerrada', cerrada_at = now(), cerrada_por = auth.uid(),
    cerrada_por_usuario = (select usuario from perfiles where user_id = auth.uid()),
    observaciones = nullif(trim(p_observaciones), ''),
    cant_comandas = t.cant_comandas, cant_anuladas = t.cant_anuladas, total_ventas = t.total_ventas,
    ventas_efectivo = t.ventas_efectivo, total_ingresos = t.total_ingresos, total_gastos = t.total_gastos,
    total_egresos = t.total_egresos, total_sueldos = t.total_sueldos, efectivo_teorico = t.efectivo_teorico,
    dinero_cierre = p_dinero_cierre, diferencia = p_dinero_cierre - t.efectivo_teorico
  where id = p_caja;
end $$;

-- Reabrir la última caja del local (si se cerró por error)
create or replace function reabrir_caja(p_caja uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_suc uuid;
begin
  select sucursal_id into v_suc from cajas where id = p_caja and estado = 'cerrada';
  if v_suc is null then raise exception 'Esa caja no está cerrada'; end if;
  if not puede_sucursal(v_suc) then raise exception 'Sin acceso a ese local'; end if;
  if exists (select 1 from cajas where sucursal_id = v_suc and estado = 'abierta') then
    raise exception 'Ya hay una caja abierta en este local';
  end if;
  if exists (select 1 from cajas where sucursal_id = v_suc and abierta_at > (select abierta_at from cajas where id = p_caja)) then
    raise exception 'Solo se puede reabrir la última caja del local';
  end if;
  update cajas set estado = 'abierta', cerrada_at = null, cerrada_por = null, cerrada_por_usuario = null,
    cant_comandas = null, cant_anuladas = null, total_ventas = null, ventas_efectivo = null, total_ingresos = null,
    total_gastos = null, total_egresos = null, total_sueldos = null, efectivo_teorico = null,
    dinero_cierre = null, diferencia = null
  where id = p_caja;
end $$;

grant execute on function totales_caja(uuid), cerrar_caja(uuid, numeric, text), reabrir_caja(uuid) to authenticated;

-- Las cajas ya no se cierran con un update directo: solo con cerrar_caja()
drop policy if exists caj_all on cajas;
create policy caj_sel on cajas for select to authenticated using (puede_sucursal(sucursal_id));
create policy caj_ins on cajas for insert to authenticated with check (puede_sucursal(sucursal_id) and estado = 'abierta');
