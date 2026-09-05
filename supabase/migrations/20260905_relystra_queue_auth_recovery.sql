-- RELYSTRA password recovery queue.
-- Applied to production as migration relystra_queue_auth_recovery on 2026-09-05.
-- The queue contains only the target auth user, static message metadata and an audit-event ID.
-- Supabase recovery links are generated inside the delivery worker immediately before send and are never persisted.

create or replace function public.nexus_queue_auth_recovery(
  p_email text,
  p_email_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_email_hash text := trim(coalesce(p_email_hash,''));
  v_ip_hash text := trim(coalesce(p_ip_hash,''));
  v_user_id uuid;
  v_event_id uuid;
  v_email_recent integer := 0;
  v_ip_recent integer := 0;
begin
  if v_email = '' or length(v_email) > 254 or position('@' in v_email) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  if length(v_email_hash) < 32 or length(v_ip_hash) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('auth-ip:' || v_ip_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('auth-email:' || v_email_hash, 0));

  select count(*) into v_email_recent
  from public.platform_auth_email_events
  where app='relystra'
    and event_type='recovery'
    and email_hash=v_email_hash
    and requested_at >= now() - interval '1 hour';

  select count(*) into v_ip_recent
  from public.platform_auth_email_events
  where app='relystra'
    and event_type='recovery'
    and ip_hash=v_ip_hash
    and requested_at >= now() - interval '1 hour';

  insert into public.platform_auth_email_events(
    app,event_type,email_hash,ip_hash,status,metadata
  ) values (
    'relystra','recovery',v_email_hash,v_ip_hash,'requested',
    jsonb_build_object('delivery_path','nexus_email_outbox','token_persisted',false)
  ) returning id into v_event_id;

  if v_email_recent >= 3 or v_ip_recent >= 12 then
    update public.platform_auth_email_events
       set status='suppressed', error_code='rate_limited'
     where id=v_event_id;
    return jsonb_build_object('ok', true, 'queued', false, 'suppressed', true);
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email)=v_email
    and u.deleted_at is null
  limit 1;

  if v_user_id is null then
    update public.platform_auth_email_events
       set status='not_found', error_code='account_not_found'
     where id=v_event_id;
    return jsonb_build_object('ok', true, 'queued', false, 'not_found', true);
  end if;

  insert into public.nexus_email_outbox(
    user_id,recipient_email,message_kind,subject,body_text,
    action_url,related_type,related_id,payload,dedupe_key,status,available_at
  ) values (
    v_user_id,v_email,'auth_recovery','Reset your Relystra password',
    'A password reset was requested for your Relystra account.',
    null,'auth_email_event',v_event_id,'{}'::jsonb,
    'auth-recovery:' || v_event_id::text,'queued',now()
  );

  return jsonb_build_object('ok', true, 'queued', true);
end;
$$;

revoke all on function public.nexus_queue_auth_recovery(text,text,text) from public, anon, authenticated;
grant execute on function public.nexus_queue_auth_recovery(text,text,text) to service_role;

comment on function public.nexus_queue_auth_recovery(text,text,text) is
  'Service-role-only RELYSTRA recovery queue. Enforces hashed per-account/IP throttles, prevents account enumeration, and never persists a recovery token or recovery URL.';
