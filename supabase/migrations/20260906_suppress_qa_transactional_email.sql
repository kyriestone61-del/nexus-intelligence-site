-- Keep automated QA/client-sandbox activity from consuming Resend quota or flooding admin inboxes.
-- This suppresses only external member email enqueueing for clearly named QA companies.
-- In-app notifications, real-client transactional email, and auth recovery remain unchanged.

create or replace function private.nexus_enqueue_member_email(
  p_user_id uuid,
  p_company_id uuid,
  p_kind text,
  p_subject text,
  p_body text,
  p_action_url text,
  p_related_type text,
  p_related_id uuid,
  p_dedupe_key text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text;
  v_enabled boolean := true;
  v_company_name text;
begin
  select c.name into v_company_name
  from public.nexus_companies c
  where c.id = p_company_id;

  if coalesce(v_company_name,'') ilike 'Nexus QA%'
     or coalesce(v_company_name,'') ilike 'Relystra QA%' then
    return;
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = p_user_id;
  if v_email is null then return; end if;

  select coalesce(
    case p_kind
      when 'task' then np.email_enabled and np.task_emails
      when 'approval' then np.email_enabled and np.approval_emails
      when 'document_request' then np.email_enabled and np.document_request_emails
      when 'digest' then np.email_enabled and np.digest_cadence <> 'off'
      else np.email_enabled
    end,
    true
  )
  into v_enabled
  from public.nexus_notification_preferences np
  where np.company_id = p_company_id
    and np.user_id = p_user_id;

  if v_enabled is false then return; end if;

  insert into public.nexus_email_outbox(
    company_id,user_id,recipient_email,message_kind,subject,body_text,
    action_url,related_type,related_id,payload,dedupe_key
  )
  values(
    p_company_id,p_user_id,lower(v_email),p_kind,p_subject,p_body,
    p_action_url,p_related_type,p_related_id,coalesce(p_payload,'{}'::jsonb),p_dedupe_key
  )
  on conflict(dedupe_key) do nothing;
end
$function$;
