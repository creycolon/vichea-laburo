-- ============================================================================
-- Vichea Laburo — schema para Supabase
-- Ejecutar entero en el SQL Editor del proyecto. Idempotente donde se puede.
-- Auth la resuelve Supabase (auth.users); acá vive todo lo de negocio + RLS.
-- La versión portable sin Supabase queda en db/schema.sql como referencia.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type member_role   as enum ('owner', 'admin', 'member', 'viewer');
  create type source_kind   as enum ('api', 'html', 'rss', 'manual');
  create type modality      as enum ('remoto', 'hibrido', 'presencial', 'desconocida');
  create type seniority     as enum ('trainee', 'junior', 'mid', 'senior', 'lead', 'director', 'desconocida');
  create type job_status    as enum ('open', 'closed');
  create type crawl_status  as enum ('running', 'ok', 'partial', 'failed');
  create type alert_channel as enum ('email', 'webhook', 'telegram');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Perfil: espejo público de auth.users (email y contraseña viven en auth)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      citext,
  name       text,
  avatar_url text,
  locale     text not null default 'es-AR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Al registrarse: crea perfil + organización personal + membership owner.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  org_id uuid;
  base_slug text;
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  base_slug := regexp_replace(lower(coalesce(split_part(new.email, '@', 1), 'org')), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug) || '-' || substr(new.id::text, 1, 6);

  insert into public.organizations (slug, name)
  values (base_slug, coalesce(new.raw_user_meta_data->>'name', 'Mi organización'))
  returning id into org_id;

  insert into public.memberships (org_id, user_id, role) values (org_id, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Organizaciones
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique,
  name          text not null,
  plan          text not null default 'free',
  trial_ends_at timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null unique,
  source       text,
  role_hint    text,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Ingesta
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id                 smallserial primary key,
  slug               text not null unique,
  name               text not null,
  kind               source_kind not null,
  country            char(2),
  base_url           text,
  enabled            boolean not null default true,
  rate_limit_per_min int not null default 30,
  config             jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create table if not exists crawl_runs (
  id          bigserial primary key,
  source_id   smallint not null references sources(id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      crawl_status not null default 'running',
  fetched     int not null default 0,
  kept        int not null default 0,
  error       text,
  meta        jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Dominio
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id         uuid primary key default gen_random_uuid(),
  slug       citext not null unique,
  name       text not null,
  domain     text,
  created_at timestamptz not null default now()
);

create table if not exists company_aliases (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  raw_name   citext not null,
  source_id  smallint references sources(id),
  unique (raw_name, source_id)
);

create table if not exists locations (
  id         serial primary key,
  country    char(2) not null,
  region     text,
  city       text,
  geo_bucket text not null,
  unique (country, region, city)
);

create table if not exists jobs (
  id              uuid primary key default gen_random_uuid(),
  dedupe_hash     text not null unique,
  title           text not null,
  company_id      uuid references companies(id) on delete set null,
  location_id     int references locations(id) on delete set null,
  modality        modality not null default 'desconocida',
  seniority       seniority not null default 'desconocida',
  area            text,
  salary_min      numeric(14, 2),
  salary_max      numeric(14, 2),
  salary_currency char(3),
  salary_period   text,
  status          job_status not null default 'open',
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  closed_at       timestamptz,
  search          tsvector generated always as (to_tsvector('spanish', coalesce(title, ''))) stored
);
create index if not exists jobs_open_idx on jobs (status, last_seen_at desc);
create index if not exists jobs_search_idx on jobs using gin (search);
create index if not exists jobs_company_idx on jobs (company_id);
create index if not exists jobs_geo_mod_idx on jobs (location_id, modality);

create table if not exists job_source_records (
  id            bigserial primary key,
  job_id        uuid not null references jobs(id) on delete cascade,
  source_id     smallint not null references sources(id) on delete cascade,
  external_id   text,
  url           text not null,
  raw_payload   jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (source_id, external_id),
  unique (url)
);

create table if not exists job_events (
  id     bigserial primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  kind   text not null check (kind in ('opened', 'reopened', 'closed', 'updated')),
  at     timestamptz not null default now(),
  meta   jsonb
);

-- ---------------------------------------------------------------------------
-- Producto
-- ---------------------------------------------------------------------------
create table if not exists saved_searches (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  name       text not null,
  filters    jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id              uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references saved_searches(id) on delete cascade,
  channel         alert_channel not null default 'email',
  target          text,
  frequency       text not null default 'daily' check (frequency in ('instant', 'daily', 'weekly')),
  enabled         boolean not null default true,
  last_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  prefix       text not null,
  key_hash     text not null unique,
  scopes       text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- El scraper escribe con la service_role key (bypassa RLS). Los usuarios
-- autenticados leen el catálogo y sólo escriben lo suyo.
-- ============================================================================
alter table profiles           enable row level security;
alter table organizations      enable row level security;
alter table memberships        enable row level security;
alter table waitlist           enable row level security;
alter table sources            enable row level security;
alter table crawl_runs         enable row level security;
alter table companies          enable row level security;
alter table company_aliases    enable row level security;
alter table locations          enable row level security;
alter table jobs               enable row level security;
alter table job_source_records enable row level security;
alter table job_events         enable row level security;
alter table saved_searches     enable row level security;
alter table alerts             enable row level security;
alter table api_keys           enable row level security;

-- helper: ¿el usuario pertenece a la org?
create or replace function is_org_member(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = target and m.user_id = auth.uid());
$$;

create or replace function is_org_admin(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.org_id = target and m.user_id = auth.uid() and m.role in ('owner','admin'));
$$;

-- perfiles: cada uno ve y edita el suyo
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select using (id = auth.uid());
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- organizaciones: sólo miembros
drop policy if exists org_member_read on organizations;
create policy org_member_read on organizations for select using (is_org_member(id));

-- memberships: veo las de mis orgs; sólo owner/admin gestionan
drop policy if exists memberships_read on memberships;
create policy memberships_read on memberships for select using (is_org_member(org_id));
drop policy if exists memberships_admin_write on memberships;
create policy memberships_admin_write on memberships for all
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- waitlist: cualquiera puede anotarse (anon), nadie puede leer desde el cliente
drop policy if exists waitlist_insert on waitlist;
create policy waitlist_insert on waitlist for insert with check (true);

-- catálogo: lectura pública para usuarios autenticados (el free tier vive de esto)
do $$
declare t text;
begin
  foreach t in array array['sources','companies','company_aliases','locations','jobs','job_source_records','job_events']
  loop
    execute format('drop policy if exists %I on %I', t || '_read_auth', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read_auth', t);
  end loop;
end $$;

-- corridas de scraper: sólo visible para admins (es data operativa)
drop policy if exists crawl_runs_admin on crawl_runs;
create policy crawl_runs_admin on crawl_runs for select using (
  exists (select 1 from memberships m where m.user_id = auth.uid() and m.role in ('owner','admin'))
);

-- búsquedas y alertas: por organización
drop policy if exists saved_searches_rw on saved_searches;
create policy saved_searches_rw on saved_searches for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

drop policy if exists alerts_rw on alerts;
create policy alerts_rw on alerts for all
  using (exists (select 1 from saved_searches s where s.id = saved_search_id and is_org_member(s.org_id)))
  with check (exists (select 1 from saved_searches s where s.id = saved_search_id and is_org_member(s.org_id)));

-- api keys: sólo admin de la org, y el hash nunca sale al cliente
drop policy if exists api_keys_admin on api_keys;
create policy api_keys_admin on api_keys for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Semilla de fuentes (las que ya funcionan en el scraper)
-- ---------------------------------------------------------------------------
insert into sources (slug, name, kind, country, base_url, config) values
  ('computrabajo-ar', 'Computrabajo Argentina', 'html', 'AR', 'https://ar.computrabajo.com',
   '{"queries":["junior","trainee","pasantia","pasante"],"modalities":["presencial","hibrido","en-remoto"]}'),
  ('getonboard', 'GetOnBoard', 'api', null, 'https://www.getonbrd.com', '{"categories":["programming","data-science-analytics","design-ux"]}'),
  ('vacantesdigitales', 'Vacantes Digitales', 'api', null, 'https://vacantesdigitales.com', '{"experience":"junior"}'),
  ('remotive', 'Remotive', 'api', null, 'https://remotive.com', '{}'),
  ('remoteok', 'RemoteOK', 'api', null, 'https://remoteok.com', '{}'),
  ('wwr', 'We Work Remotely', 'rss', null, 'https://weworkremotely.com', '{}')
on conflict (slug) do nothing;
