create or replace function public.nexus_get_inbox_admin_preview(p_company_id uuid)
returns table(
  item_key text,
  kind text,
  company_id uuid,
  company_name text,
  title text,
  message text,
  status text,
  priority text,
  due_at timestamptz,
  created_at timestamptz,
  action_url text,
  related_type text,
  related_id uuid,
  approval_chain_id uuid,
  approval_step_id uuid,
  step_order integer,
  step_count integer,
  can_approve boolean,
  is_unread boolean
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  if p_company_id is null then raise exception 'Company is required'; end if;

  return query
  with owner_users as (
    select m.user_id
    from public.nexus_company_members m
    where m.company_id=p_company_id and m.active=true and m.member_role='owner'
  ), visible_chains as (
    select c.*
    from public.nexus_approval_chains c
    where c.company_id=p_company_id
      and c.visibility='company'
      and c.status in ('pending','changes_requested')
  ), pending_steps as (
    select s.*,c.company_id,c.title chain_title,c.description chain_description,c.status chain_status,c.id chainid,
      co.name company_name,
      (select count(*)::int from public.nexus_approval_chain_steps x where x.chain_id=c.id) step_count
    from visible_chains c
    join public.nexus_approval_chain_steps s on s.chain_id=c.id and s.status='pending' and s.approver_scope='company_role'
    left join public.nexus_companies co on co.id=c.company_id
  ), unified as (
    select 'approval:'||ps.id::text item_key,'approval'::text kind,ps.company_id,ps.company_name,ps.chain_title title,
      coalesce(ps.chain_description,ps.instructions,'Approval is waiting for review.') message,ps.chain_status status,
      case when ps.due_at is not null and ps.due_at<now() then 'high' else 'normal' end priority,
      ps.due_at,ps.created_at,'/portal?view=inbox&approval_chain='||ps.chainid::text action_url,'approval_chain'::text related_type,ps.chainid related_id,
      ps.chainid approval_chain_id,ps.id approval_step_id,ps.step_order,ps.step_count,true can_approve,false is_unread
    from pending_steps ps

    union all
    select 'task:'||t.id::text,'task',t.company_id,co.name,t.title,coalesce(t.description,'Action item requires attention.'),t.status,t.priority,
      case when t.due_date is null then null else t.due_date::timestamptz end,t.created_at,'/portal?view=inbox&task='||t.id::text,'task',t.id,
      null::uuid,null::uuid,null::integer,null::integer,true,false
    from public.nexus_tasks t join public.nexus_companies co on co.id=t.company_id
    where t.company_id=p_company_id and t.assignee='client'
      and t.status not in ('done','completed','not_applicable','draft')

    union all
    select 'document_request:'||d.id::text,'document_request',d.company_id,co.name,d.title,coalesce(d.purpose,'Nexus requested supporting evidence.'),d.status,'normal',
      case when d.due_date is null then null else d.due_date::timestamptz end,d.created_at,'/portal?view=inbox&document_request='||d.id::text,'document_request',d.id,
      null::uuid,null::uuid,null::integer,null::integer,true,false
    from public.nexus_document_requests d join public.nexus_companies co on co.id=d.company_id
    where d.company_id=p_company_id and d.status='requested' and coalesce(d.owner_scope,'client')='client'

    union all
    select 'question:'||q.id::text,'question',q.company_id,co.name,'Diagnosis report question',q.question,q.status,'normal',null::timestamptz,q.created_at,
      '/portal?view=diagnosis-question&question='||q.id::text,'diagnosis_report_question',q.id,
      null::uuid,null::uuid,null::integer,null::integer,false,false
    from public.nexus_diagnosis_report_questions q join public.nexus_companies co on co.id=q.company_id
    where q.company_id=p_company_id and q.status='open' and q.asked_by in (select user_id from owner_users)

    union all
    select 'notification:'||n.id::text,'update',n.company_id,co.name,n.title,coalesce(n.message,''),'unread','normal',null::timestamptz,n.created_at,
      coalesce(n.action_url,'/portal?view=inbox'),'notification',n.id,
      null::uuid,null::uuid,null::integer,null::integer,false,true
    from public.nexus_notifications n left join public.nexus_companies co on co.id=n.company_id
    where n.company_id=p_company_id and n.read_at is null
      and (n.user_id is null or n.user_id in (select user_id from owner_users))
  )
  select u.item_key,u.kind,u.company_id,u.company_name,u.title,u.message,u.status,u.priority,u.due_at,u.created_at,u.action_url,u.related_type,u.related_id,
    u.approval_chain_id,u.approval_step_id,u.step_order,u.step_count,u.can_approve,u.is_unread
  from unified u
  order by case u.priority when 'critical' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 0 end desc,
    u.due_at asc nulls last,u.created_at desc;
end
$$;

revoke all on function public.nexus_get_inbox_admin_preview(uuid) from public;
grant execute on function public.nexus_get_inbox_admin_preview(uuid) to authenticated;
comment on function public.nexus_get_inbox_admin_preview(uuid) is 'Read-only client-facing Inbox projection for authenticated Nexus platform administrators previewing a selected company. It does not change the caller role or grant client permissions.';
