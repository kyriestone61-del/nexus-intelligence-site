-- Admin-only recovery controls for failed Nexus transactional email.
-- Required because permanent provider failures are not automatically retried by the worker.

create or replace function public.nexus_admin_retry_failed_email(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.nexus_email_outbox%rowtype;
begin
  if not public.nexus_is_platform_admin() then
    raise exception 'Nexus administrator access required';
  end if;

  update public.nexus_email_outbox
     set status='queued',
         attempts=0,
         available_at=now(),
         sent_at=null,
         provider_message_id=null,
         last_error=null,
         last_attempt_at=null,
         failure_class=null,
         provider_status=null,
         provider_event_at=null,
         updated_at=now()
   where id=p_outbox_id
     and status='failed'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Failed Nexus email not found';
  end if;

  return jsonb_build_object('id',v_row.id,'status',v_row.status,'recipient_email',v_row.recipient_email);
end
$function$;

revoke all on function public.nexus_admin_retry_failed_email(uuid) from public, anon;
grant execute on function public.nexus_admin_retry_failed_email(uuid) to authenticated, service_role;

create or replace function public.nexus_admin_requeue_unverified_domain_failures()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  if not public.nexus_is_platform_admin() then
    raise exception 'Nexus administrator access required';
  end if;

  update public.nexus_email_outbox
     set status='queued',
         attempts=0,
         available_at=now(),
         sent_at=null,
         provider_message_id=null,
         last_error=null,
         last_attempt_at=null,
         failure_class=null,
         provider_status=null,
         provider_event_at=null,
         updated_at=now()
   where status='failed'
     and provider_status='403'
     and coalesce(last_error,'') ilike '%domain%not verified%';

  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

revoke all on function public.nexus_admin_requeue_unverified_domain_failures() from public, anon;
grant execute on function public.nexus_admin_requeue_unverified_domain_failures() to authenticated, service_role;
