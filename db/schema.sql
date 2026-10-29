-- Esquema base: plataforma de inteligencia de demanda laboral (junior/trainee, LATAM).
-- Postgres 16+. La DDL completa vive acá; la explicación de cada decisión, en docs/der.md.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums (cerrados a propósito: si mañana entra "freelance" se agrega con ALTER TYPE)
-- ---------------------------------------------------------------------------
create type member_role  as enum ('owner', 'admin', 'member', 'viewer');
create type source_kind  as enum ('api', 'html', 'rss', 'manual');
create type modality     as enum ('remoto', 'hibrido', 'presencial', 'desconocida');
create type seniority    as enum ('trainee', 'junior', 'mid', 'senior', 'lead', 'director', 'desconocida');
create type job_status   as enum ('open', 'closed');
create type crawl_status as enum ('running', 'ok', 'partial', 'failed');
create type alert_channel as enum ('email', 'webhook', 'telegram');

-- ---------------------------------------------------------------------------
-- Identidad y acceso
-- ---------------------------------------------------------------------------
create table users (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null unique,
  email_verified_at timestamptz,
  password_hash     text,                    -- null si la cuenta es sólo OAuth
  name              text,
  avatar_url        text,
  locale            text not null default 'es-AR',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  disabled_at       timestamptz
);

create table sessions (
  id         text primary key,               -- hash del token, nunca el token en claro
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  ip         inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

create table oauth_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  provider            text not null,          -- 'google' | 'github'
  provider_account_id text not null,
  created_at          timestamptz not null default now(),
  unique (provider, provider_account_id)
);
create index oauth_accounts_user_idx on oauth_accounts (user_id);

-- Tokens de un solo uso: verificación de email, reset de contraseña, invitaciones.
create table auth_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('verify_email', 'reset_password', 'invite')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_user_idx on auth_tokens (user_id, kind);

-- ---------------------------------------------------------------------------
-- Organizaciones (multi-tenant: cada consultora / equipo es un tenant)
-- ---------------------------------------------------------------------------
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique,
  name          text not null,
  plan          text not null default 'free',
  trial_ends_at timestamptz,
  created_at    timestamptz not null default now()
);

create table memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

-- Lista de espera de la landing (captación previa al producto).
create table waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null unique,
  source       text,                           -- utm / campaña / referido
  role_hint    text,                           -- 'recruiter' | 'bootcamp' | 'rrhh'
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Ingesta: fuentes, corridas y crudo
-- ---------------------------------------------------------------------------
create table sources (
  id                  smallserial primary key,
  slug                text not null unique,    -- 'computrabajo-ar', 'getonboard', 'vacantesdigitales'
  name                text not null,
  kind                source_kind not null,
  country             char(2),                 -- 'AR', 'CL', ... null si es multi-país
  base_url            text,
  enabled             boolean not null default true,
  rate_limit_per_min  int not null default 30,
  config              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create table crawl_runs (
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
create index crawl_runs_source_idx on crawl_runs (source_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Entidades canónicas (lo que un reclutador entiende, no lo que devuelve cada sitio)
-- ---------------------------------------------------------------------------
create table companies (
  id         uuid primary key default gen_random_uuid(),
  slug       citext not null unique,
  name       text not null,
  domain     text,
  created_at timestamptz not null default now()
);

-- El mismo empleador aparece como "ADN - Recursos Humanos", "ADN RRHH" y "ADN".
create table company_aliases (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  raw_name   citext not null,
  source_id  smallint references sources(id),
  unique (raw_name, source_id)
);

create table locations (
  id         serial primary key,
  country    char(2) not null,
  region     text not null default '',   -- '' y no NULL: un UNIQUE con NULL nunca colisiona
  city       text not null default '',
  geo_bucket text not null,                    -- 'AR-CABA', 'AR-GBA', 'LATAM', 'GLOBAL'
  unique (country, region, city)
);
create index locations_bucket_idx on locations (geo_bucket);

-- Una oferta canónica, deduplicada entre fuentes.
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  dedupe_hash     text not null unique,        -- sha1(company_id | title normalizado | city | modality)
  title           text not null,
  company_id      uuid references companies(id) on delete set null,
  location_id     int references locations(id) on delete set null,
  modality        modality not null default 'desconocida',
  seniority       seniority not null default 'desconocida',
  area            text,
  salary_min      numeric(14, 2),
  salary_max      numeric(14, 2),
  salary_currency char(3),
  salary_period   text,                        -- 'month' | 'year' | 'hour'
  status          job_status not null default 'open',
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  closed_at       timestamptz,
  search          tsvector generated always as
                    (to_tsvector('spanish', coalesce(title, ''))) stored
);
create index jobs_open_idx on jobs (status, last_seen_at desc);
create index jobs_search_idx on jobs using gin (search);
create index jobs_company_idx on jobs (company_id);
create index jobs_geo_mod_idx on jobs (location_id, modality);

-- Cada aparición concreta en un sitio. Es la capa que se puede re-scrapear y perder
-- sin destruir la identidad canónica de la oferta.
create table job_source_records (
  id          bigserial primary key,
  job_id      uuid not null references jobs(id) on delete cascade,
  source_id   smallint not null references sources(id) on delete cascade,
  external_id text,
  url         text not null,
  raw_payload jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (source_id, external_id),
  unique (url)
);
create index job_source_records_job_idx on job_source_records (job_id);

-- Historial de estados: es lo que permite decir "lleva 21 días abierta".
create table job_events (
  id     bigserial primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  kind   text not null check (kind in ('opened', 'reopened', 'closed', 'updated')),
  at     timestamptz not null default now(),
  meta   jsonb
);
create index job_events_job_idx on job_events (job_id, at desc);

-- ---------------------------------------------------------------------------
-- Producto: búsquedas guardadas, alertas, API
-- ---------------------------------------------------------------------------
create table saved_searches (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  name       text not null,
  filters    jsonb not null,                   -- { q, geo[], modality[], seniority[], areas[], sources[] }
  created_at timestamptz not null default now()
);
create index saved_searches_org_idx on saved_searches (org_id);

create table alerts (
  id              uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references saved_searches(id) on delete cascade,
  channel         alert_channel not null default 'email',
  target          text,                        -- email, URL de webhook o chat id
  frequency       text not null default 'daily' check (frequency in ('instant', 'daily', 'weekly')),
  enabled         boolean not null default true,
  last_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index alerts_search_idx on alerts (saved_search_id);

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  prefix       text not null,                  -- primeros 8 chars, para mostrar en la UI
  key_hash     text not null unique,           -- sha256 de la key completa
  scopes       text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index api_keys_org_idx on api_keys (org_id);
