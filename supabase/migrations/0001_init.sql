-- =====================================================================
-- Sistema de comandas — esquema
-- =====================================================================
-- cuenta      -> la marca (ej: Napoles). Tiene un menú madre.
-- sucursal    -> cada local de la cuenta. Hereda el menú madre y puede
--                pisar precios, ocultar productos, marcar agotados o
--                tener productos propios.
-- perfil      -> usuario del sistema: 'admin' (toda la cuenta) o
--                'local' (un solo local).
-- caja        -> turno de un local. Las comandas se numeran por caja.
-- print_job   -> cola que consume el spool de Windows de cada local.
--
-- gen_random_uuid() es nativo desde Postgres 13 (Supabase lo trae).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cuentas, locales y usuarios
-- ---------------------------------------------------------------------
create table cuentas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

create table sucursales (
  id           uuid primary key default gen_random_uuid(),
  cuenta_id    uuid not null references cuentas(id) on delete cascade,
  nombre       text not null,
  es_principal boolean not null default false,
  direccion    text,
  telefono     text,
  activa       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on sucursales (cuenta_id);

create table perfiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  cuenta_id    uuid not null references cuentas(id) on delete cascade,
  rol          text not null check (rol in ('admin','local')),
  -- obligatorio para usuarios de local
  sucursal_id  uuid references sucursales(id) on delete cascade,
  usuario      text not null unique,        -- nombre con el que entra
  nombre       text,
  created_at   timestamptz not null default now(),
  check (rol = 'admin' or sucursal_id is not null)
);

-- Helpers para las políticas (security definer: leen perfiles sin RLS)
create or replace function mi_cuenta() returns uuid
language sql stable security definer set search_path = public as $$
  select cuenta_id from perfiles where user_id = auth.uid()
$$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from perfiles where user_id = auth.uid()), false)
$$;

create or replace function mi_sucursal() returns uuid
language sql stable security definer set search_path = public as $$
  select sucursal_id from perfiles where user_id = auth.uid()
$$;

-- ¿El usuario puede operar este local? Admin: cualquiera de su cuenta. Local: el suyo.
create or replace function puede_sucursal(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sucursales x
     where x.id = s and x.cuenta_id = mi_cuenta()
       and (es_admin() or x.id = mi_sucursal())
  )
$$;

-- ---------------------------------------------------------------------
-- Ingredientes y menú
-- ---------------------------------------------------------------------
-- unidad: 'un' (unidad), 'g' (gramos), 'ml' (mililitros)
-- costo:  por unidad, por kilo o por litro (como se compra)
create table ingredientes (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  nombre      text not null,
  unidad      text not null check (unidad in ('un','g','ml')),
  costo       numeric(14,2) not null default 0,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now()
);
create index on ingredientes (cuenta_id);

-- sucursal_id null = del menú madre; con valor = categoría propia de ese local
create table categorias (
  id           uuid primary key default gen_random_uuid(),
  cuenta_id    uuid not null references cuentas(id) on delete cascade,
  sucursal_id  uuid references sucursales(id) on delete cascade,
  nombre       text not null,
  orden        int  not null default 0,
  color        text not null default 'blue',
  activa       boolean not null default true
);
create index on categorias (cuenta_id);

-- tipo: 'producto' (se vende suelto), 'extra' (adicional), 'promo' (combo)
-- sucursal_id null = producto del menú madre; con valor = propio de ese local
create table productos (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  sucursal_id    uuid references sucursales(id) on delete cascade,
  categoria_id   uuid not null references categorias(id) on delete cascade,
  tipo           text not null default 'producto' check (tipo in ('producto','extra','promo')),
  codigo         text,
  nombre         text not null,
  descripcion    text,
  precio         numeric(12,2) not null default 0,  -- precio base (entera o único)
  precio_mitad   numeric(12,2),                      -- con valor: se vende por mitad
  admite_coccion boolean not null default false,     -- horno / frita
  incluye_envio  boolean not null default false,
  orden          int not null default 0,
  activo         boolean not null default true,
  updated_at     timestamptz not null default now()
);
create index on productos (cuenta_id, categoria_id);

-- Ajustes de un local sobre un producto del menú madre.
-- Campos en null = usa lo del menú madre.
create table producto_sucursal (
  producto_id   uuid not null references productos(id) on delete cascade,
  sucursal_id   uuid not null references sucursales(id) on delete cascade,
  precio        numeric(12,2),
  precio_mitad  numeric(12,2),
  oculto        boolean not null default false,
  agotado       boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (producto_id, sucursal_id)
);

-- Receta: ingredientes de una unidad (o pizza entera). La mitad usa la mitad.
create table recetas (
  producto_id     uuid not null references productos(id) on delete cascade,
  ingrediente_id  uuid not null references ingredientes(id) on delete restrict,
  cantidad        numeric(12,3) not null,   -- en la unidad del ingrediente (un / g / ml)
  primary key (producto_id, ingrediente_id)
);

-- Promos: productos que trae sí o sí
create table promo_fijos (
  id           uuid primary key default gen_random_uuid(),
  promo_id     uuid not null references productos(id) on delete cascade,
  producto_id  uuid not null references productos(id) on delete cascade,
  cantidad     int  not null default 1,
  variante     text not null default 'entera' check (variante in ('entera','mitad','unica'))
);

-- Promos: grupos "elegí N de esta categoría"
create table promo_slots (
  id            uuid primary key default gen_random_uuid(),
  promo_id      uuid not null references productos(id) on delete cascade,
  nombre        text not null,
  categoria_id  uuid not null references categorias(id) on delete cascade,
  cantidad      int  not null,
  orden         int  not null default 0
);

-- ¿Puede editar este producto? Admin: los de su cuenta. Local: solo los propios.
create or replace function puede_editar_producto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from productos x
     where x.id = p and x.cuenta_id = mi_cuenta()
       and (es_admin() or (x.sucursal_id is not null and x.sucursal_id = mi_sucursal()))
  )
$$;

-- ---------------------------------------------------------------------
-- Clientes y zonas de delivery
-- ---------------------------------------------------------------------
create table zonas_delivery (
  id           uuid primary key default gen_random_uuid(),
  sucursal_id  uuid not null references sucursales(id) on delete cascade,
  nombre       text not null,
  costo        numeric(12,2) not null default 0,
  activa       boolean not null default true
);

-- Los clientes se comparten entre los locales de la cuenta
create table clientes (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references cuentas(id) on delete cascade,
  nombre        text not null,
  telefono      text,
  direccion     text,
  entre_calles  text,
  zona_id       uuid references zonas_delivery(id) on delete set null,
  notas         text,
  created_at    timestamptz not null default now()
);
create index on clientes (cuenta_id, telefono);

-- ---------------------------------------------------------------------
-- Cajas y comandas
-- ---------------------------------------------------------------------
create table cajas (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null references sucursales(id) on delete cascade,
  turno         text not null default 'Noche',
  estado        text not null default 'abierta' check (estado in ('abierta','cerrada')),
  abierta_por   uuid references auth.users(id) on delete set null,
  abierta_at    timestamptz not null default now(),
  cerrada_at    timestamptz,
  ultimo_numero int not null default 0
);
create unique index cajas_una_abierta on cajas (sucursal_id) where estado = 'abierta';

create table comandas (
  id             uuid primary key default gen_random_uuid(),
  caja_id        uuid not null references cajas(id) on delete cascade,
  sucursal_id    uuid not null references sucursales(id) on delete cascade, -- lo completa el trigger
  numero         int  not null,
  tipo           text not null check (tipo in ('mostrador','delivery')),
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','en_preparacion','listo','en_camino','entregado','anulada')),
  cliente_id     uuid references clientes(id) on delete set null,
  cliente_nombre text,
  cliente_tel    text,
  direccion      text,
  entre_calles   text,
  zona_id        uuid references zonas_delivery(id) on delete set null,
  costo_envio    numeric(12,2) not null default 0,
  subtotal       numeric(12,2) not null default 0,
  descuento      numeric(12,2) not null default 0,
  adicional      numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  observaciones  text,
  cobrada        boolean not null default false,
  hora_entrega   text,
  creada_por     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (caja_id, numero)
);
create index on comandas (caja_id, estado);
create index on comandas (sucursal_id, created_at);

-- Numera la comanda dentro de su caja y copia el local
create or replace function asignar_numero_comanda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update cajas set ultimo_numero = ultimo_numero + 1
   where id = new.caja_id and estado = 'abierta'
  returning ultimo_numero, sucursal_id into new.numero, new.sucursal_id;
  if new.numero is null then
    raise exception 'La caja no está abierta';
  end if;
  return new;
end $$;

create trigger trg_numero_comanda before insert on comandas
for each row execute function asignar_numero_comanda();

create table comanda_items (
  id           uuid primary key default gen_random_uuid(),
  comanda_id   uuid not null references comandas(id) on delete cascade,
  producto_id  uuid references productos(id) on delete set null,
  descripcion  text not null,
  variante     text,
  coccion      text,
  cantidad     numeric(10,2) not null default 1,
  precio_unit  numeric(12,2) not null default 0,
  subtotal     numeric(12,2) not null default 0,
  nota         text,
  componentes  jsonb not null default '[]'::jsonb,
  orden        int not null default 0
);

create table pagos (
  id          uuid primary key default gen_random_uuid(),
  comanda_id  uuid not null references comandas(id) on delete cascade,
  forma       text not null,
  monto       numeric(12,2) not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Impresión
-- ---------------------------------------------------------------------
create table impresoras (
  id                uuid primary key default gen_random_uuid(),
  sucursal_id       uuid not null references sucursales(id) on delete cascade,
  nombre            text not null,
  imprime_mostrador boolean not null default true,
  imprime_delivery  boolean not null default true,
  copias            int not null default 1,
  ancho             int not null default 48,   -- 48 = 80mm, 32 = 58mm
  token_hash        text unique,               -- vinculación del spool
  ultimo_ping       timestamptz,
  activa            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table print_jobs (
  id           uuid primary key default gen_random_uuid(),
  impresora_id uuid not null references impresoras(id) on delete cascade,
  comanda_id   uuid references comandas(id) on delete set null,
  tipo         text not null default 'comanda' check (tipo in ('comanda','reimpresion','anulacion','cuenta','prueba')),
  contenido    jsonb not null,
  copias       int not null default 1,
  estado       text not null default 'pendiente' check (estado in ('pendiente','imprimiendo','impreso','error')),
  intentos     int not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  printed_at   timestamptz
);
create index print_jobs_pendientes on print_jobs (impresora_id, created_at) where estado = 'pendiente';

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trg_comandas_upd before update on comandas for each row execute function touch_updated_at();
create trigger trg_productos_upd before update on productos for each row execute function touch_updated_at();
create trigger trg_ingredientes_upd before update on ingredientes for each row execute function touch_updated_at();
create trigger trg_prodsuc_upd before update on producto_sucursal for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- Alta de cuenta y de locales
-- ---------------------------------------------------------------------
-- La llama un usuario recién registrado (sin perfil): crea la cuenta,
-- el local principal y lo deja como admin.
create or replace function crear_cuenta(p_cuenta text, p_local text, p_usuario text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cuenta uuid; v_suc uuid;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if exists (select 1 from perfiles where user_id = auth.uid()) then
    raise exception 'Este usuario ya tiene una cuenta';
  end if;
  insert into cuentas (nombre) values (trim(p_cuenta)) returning id into v_cuenta;
  insert into sucursales (cuenta_id, nombre, es_principal) values (v_cuenta, trim(p_local), true) returning id into v_suc;
  insert into perfiles (user_id, cuenta_id, rol, usuario) values (auth.uid(), v_cuenta, 'admin', lower(trim(p_usuario)));
  insert into impresoras (sucursal_id, nombre) values (v_suc, 'Cocina');
  return v_cuenta;
end $$;

-- Solo admin: agrega un local a su cuenta. Hereda el menú madre automáticamente.
create or replace function crear_sucursal(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_suc uuid;
begin
  if not es_admin() then raise exception 'Solo un administrador puede crear locales'; end if;
  insert into sucursales (cuenta_id, nombre) values (mi_cuenta(), trim(p_nombre)) returning id into v_suc;
  insert into impresoras (sucursal_id, nombre) values (v_suc, 'Cocina');
  return v_suc;
end $$;

-- Aumento masivo de precios de una categoría.
-- p_sucursal null = menú madre (solo admin). Con valor = precios propios de ese local.
create or replace function aumentar_precios(p_categoria uuid, p_porcentaje numeric, p_sucursal uuid default null, p_redondeo numeric default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
  f numeric := 1 + p_porcentaje / 100;
  r numeric := greatest(coalesce(p_redondeo, 1), 0.01);
begin
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

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table cuentas enable row level security;
alter table sucursales enable row level security;
alter table perfiles enable row level security;
alter table ingredientes enable row level security;
alter table categorias enable row level security;
alter table productos enable row level security;
alter table producto_sucursal enable row level security;
alter table recetas enable row level security;
alter table promo_fijos enable row level security;
alter table promo_slots enable row level security;
alter table zonas_delivery enable row level security;
alter table clientes enable row level security;
alter table cajas enable row level security;
alter table comandas enable row level security;
alter table comanda_items enable row level security;
alter table pagos enable row level security;
alter table impresoras enable row level security;
alter table print_jobs enable row level security;

-- Cuenta
create policy cuentas_sel on cuentas for select to authenticated using (id = mi_cuenta());
create policy cuentas_upd on cuentas for update to authenticated using (id = mi_cuenta() and es_admin());

-- Locales: el admin ve todos los de su cuenta, el local solo el suyo
create policy suc_sel on sucursales for select to authenticated using (puede_sucursal(id));
create policy suc_ins on sucursales for insert to authenticated with check (cuenta_id = mi_cuenta() and es_admin());
create policy suc_upd on sucursales for update to authenticated using (cuenta_id = mi_cuenta() and es_admin());

-- Perfiles: cada uno ve el suyo; el admin ve los de su cuenta.
-- Altas, bajas y contraseñas: Edge Function "usuarios" (service role).
create policy perf_sel on perfiles for select to authenticated
  using (user_id = auth.uid() or (cuenta_id = mi_cuenta() and es_admin()));

-- Ingredientes: todos los de la cuenta los ven, solo el admin los edita
create policy ing_sel on ingredientes for select to authenticated using (cuenta_id = mi_cuenta());
create policy ing_all on ingredientes for all to authenticated
  using (cuenta_id = mi_cuenta() and es_admin()) with check (cuenta_id = mi_cuenta() and es_admin());

-- Categorías y productos: madre (sucursal_id null) + propios del local
create policy cat_sel on categorias for select to authenticated
  using (cuenta_id = mi_cuenta() and (sucursal_id is null or puede_sucursal(sucursal_id)));
create policy cat_ins on categorias for insert to authenticated
  with check (cuenta_id = mi_cuenta() and (es_admin() or (sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy cat_upd on categorias for update to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy cat_del on categorias for delete to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (sucursal_id is not null and sucursal_id = mi_sucursal())));

create policy prod_sel on productos for select to authenticated
  using (cuenta_id = mi_cuenta() and (sucursal_id is null or puede_sucursal(sucursal_id)));
create policy prod_ins on productos for insert to authenticated
  with check (cuenta_id = mi_cuenta() and (es_admin() or (sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy prod_upd on productos for update to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (sucursal_id is not null and sucursal_id = mi_sucursal())))
  with check (cuenta_id = mi_cuenta() and (es_admin() or (sucursal_id is not null and sucursal_id = mi_sucursal())));
create policy prod_del on productos for delete to authenticated
  using (cuenta_id = mi_cuenta() and (es_admin() or (sucursal_id is not null and sucursal_id = mi_sucursal())));

-- Ajustes por local: cada local los suyos, el admin todos
create policy ps_sel on producto_sucursal for select to authenticated using (puede_sucursal(sucursal_id));
create policy ps_all on producto_sucursal for all to authenticated
  using (puede_sucursal(sucursal_id)) with check (puede_sucursal(sucursal_id));

-- Recetas y armado de promos: siguen al producto
create policy rec_sel on recetas for select to authenticated
  using (exists (select 1 from productos p where p.id = producto_id));
create policy rec_all on recetas for all to authenticated
  using (puede_editar_producto(producto_id)) with check (puede_editar_producto(producto_id));
create policy pf_sel on promo_fijos for select to authenticated
  using (exists (select 1 from productos p where p.id = promo_id));
create policy pf_all on promo_fijos for all to authenticated
  using (puede_editar_producto(promo_id)) with check (puede_editar_producto(promo_id));
create policy psl_sel on promo_slots for select to authenticated
  using (exists (select 1 from productos p where p.id = promo_id));
create policy psl_all on promo_slots for all to authenticated
  using (puede_editar_producto(promo_id)) with check (puede_editar_producto(promo_id));

-- Operación de cada local
create policy zon_all on zonas_delivery for all to authenticated
  using (puede_sucursal(sucursal_id)) with check (puede_sucursal(sucursal_id));
create policy cli_all on clientes for all to authenticated
  using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy caj_all on cajas for all to authenticated
  using (puede_sucursal(sucursal_id)) with check (puede_sucursal(sucursal_id));
create policy com_sel on comandas for select to authenticated using (puede_sucursal(sucursal_id));
-- al insertar, sucursal_id lo pone el trigger: se valida por la caja
create policy com_ins on comandas for insert to authenticated
  with check (exists (select 1 from cajas c where c.id = caja_id and puede_sucursal(c.sucursal_id)));
create policy com_upd on comandas for update to authenticated using (puede_sucursal(sucursal_id));
create policy item_all on comanda_items for all to authenticated
  using (exists (select 1 from comandas c where c.id = comanda_id and puede_sucursal(c.sucursal_id)))
  with check (exists (select 1 from comandas c where c.id = comanda_id and puede_sucursal(c.sucursal_id)));
create policy pago_all on pagos for all to authenticated
  using (exists (select 1 from comandas c where c.id = comanda_id and puede_sucursal(c.sucursal_id)))
  with check (exists (select 1 from comandas c where c.id = comanda_id and puede_sucursal(c.sucursal_id)));
create policy imp_all on impresoras for all to authenticated
  using (puede_sucursal(sucursal_id)) with check (puede_sucursal(sucursal_id));
create policy pj_all on print_jobs for all to authenticated
  using (exists (select 1 from impresoras i where i.id = impresora_id and puede_sucursal(i.sucursal_id)))
  with check (exists (select 1 from impresoras i where i.id = impresora_id and puede_sucursal(i.sucursal_id)));

grant execute on function crear_cuenta(text, text, text), crear_sucursal(text),
  aumentar_precios(uuid, numeric, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: tablero, cola de impresión y cambios de menú en vivo
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table comandas, print_jobs, productos, producto_sucursal, categorias;
