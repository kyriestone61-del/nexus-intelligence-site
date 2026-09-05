-- Security-critical authentication email delivery ledger.
-- Applied to production as migration platform_auth_email_resilience on 2026-09-05.
-- Raw email addresses, passwords, reset links, OTPs and auth tokens are intentionally excluded.

create table if not exists public.platform_auth_email_events (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('relystra','statecraft','human_os')),
  event_type text not null check (event_type in ('recovery','signup_confirmation','invite','reauthentication')),
  email_hash text not null,
  ip_hash text,
  status text not null default 'requested'
    check (status in ('requested','suppressed','not_found','generated','provider_accepted','provider_failed','internal_failed')),
  provider text,
  provider_message_id text,
  error_code text,
  requested_at timestamptz not null default now(),
  provider_accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_auth_email_events enable row level security;
revoke all on table public.platform_auth_email_events from anon, authenticated;

create index if not exists platform_auth_email_events_email_time_idx
  on public.platform_auth_email_events (email_hash, requested_at desc);
create index if not exists platform_auth_email_events_ip_time_idx
  on public.platform_auth_email_events (ip_hash, requested_at desc);
create index if not exists platform_auth_email_events_status_time_idx
  on public.platform_auth_email_events (status, requested_at desc);

comment on table public.platform_auth_email_events is
  'Hashed, non-content audit ledger for security-critical authentication email delivery. Raw email addresses, reset links, passwords, and tokens are never stored here.';
