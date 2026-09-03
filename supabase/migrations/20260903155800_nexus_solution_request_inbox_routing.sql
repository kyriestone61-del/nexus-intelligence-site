-- A client request to implement or separately purchase a diagnosis recommendation must land in the founder/admin Action Inbox,
-- not merely appear as a passive notification update.

create or replace function public.nexus_request_solution_purchase(p_release_id uuid,p_opportunity_index int)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_opp jsonb;
  v_title text;
  v_has_build boolean;
  v_type text;
  v_request public.nexus_solution_purchase_requests%rowtype;
  v_admin record;
  v_task_id uuid;
  v_task_title text;
  v_task_description text;
  v_task_instructions text;
begin
  select * into v_release
  from public.nexus_diagnosis_report_releases
  where id=p_release_id and status='released' and revoked_at is null;
  if v_release.id is null then raise exception 'Released diagnosis report not found'; end if;
  if not (public.nexus_is_platform_admin() or public.nexus_is_company_member(v_release.company_id)) then raise exception 'Not authorized'; end if;
  if p_opportunity_index is null or p_opportunity_index<0 then raise exception 'Opportunity index is required'; end if;

  v_opp:=v_release.client_report->'opportunities'->p_opportunity_index;
  if v_opp is null or jsonb_typeof(v_opp)<>'object' then raise exception 'Opportunity not found in this released report'; end if;
  v_title:=nullif(btrim(v_opp->>'title'),'');
  if v_title is null then raise exception 'Opportunity title is missing'; end if;

  select exists(
    select 1 from public.nexus_company_entitlements e
    where e.company_id=v_release.company_id
      and e.offering_code='build'
      and e.status='active'
      and (e.ends_at is null or e.ends_at>now())
  ) into v_has_build;
  v_type:=case when v_has_build then 'included_activation' else 'standalone_scope' end;

  insert into public.nexus_solution_purchase_requests(
    company_id,release_id,opportunity_index,opportunity_title,opportunity_snapshot,request_type,status,requested_by
  ) values(
    v_release.company_id,v_release.id,p_opportunity_index,v_title,v_opp,v_type,'requested',auth.uid()
  )
  on conflict(release_id,opportunity_index,requested_by) do update set
    opportunity_title=excluded.opportunity_title,
    opportunity_snapshot=excluded.opportunity_snapshot,
    request_type=excluded.request_type,
    status=case when public.nexus_solution_purchase_requests.status in ('declined','cancelled') then 'requested' else public.nexus_solution_purchase_requests.status end,
    updated_at=now()
  returning * into v_request;

  v_task_title:=case when v_type='included_activation'
    then 'Activate client-requested solution: '||v_title
    else 'Scope and price client-requested solution: '||v_title
  end;
  v_task_description:=case when v_type='included_activation'
    then 'The client requested implementation of this released diagnosis recommendation under its current Build engagement.'
    else 'The client requested this released diagnosis recommendation as an individual implementation. Nexus must confirm scope and authoritative pricing before any checkout or implementation commitment.'
  end;
  v_task_instructions:=case when v_type='included_activation'
    then 'Review the released recommendation and current Build entitlement. Confirm that the requested solution is within contracted scope, then add it to the governed implementation plan or contact the client if scope needs clarification.'
    else 'Review the released recommendation, define implementation scope, integration/data/risk requirements, delivery boundaries, and the authoritative price. Do not create or present checkout until those terms are approved.'
  end;

  select t.id into v_task_id
  from public.nexus_tasks t
  where t.source_diagnosis_run_id=v_release.diagnosis_run_id
    and t.assignee='nexus'
    and t.title=v_task_title
  order by t.created_at desc
  limit 1;

  if v_task_id is null then
    insert into public.nexus_tasks(
      company_id,project_id,title,description,assignee,status,priority,created_by,notify_client,
      task_type,instructions,form_schema,response_data,phase,source_diagnosis_run_id,owner_scope
    ) values(
      v_release.company_id,v_release.project_id,v_task_title,v_task_description,'nexus','open','high',auth.uid(),false,
      'commercial_scope',v_task_instructions,'[]'::jsonb,jsonb_build_object('solution_purchase_request_id',v_request.id,'release_id',v_release.id,'opportunity_index',p_opportunity_index),'commercial',v_release.diagnosis_run_id,'nexus'
    )
    returning id into v_task_id;
  else
    update public.nexus_tasks
    set description=v_task_description,
        instructions=v_task_instructions,
        status=case when status in ('completed','done','not_applicable') then 'open' else status end,
        priority='high',
        response_data=coalesce(response_data,'{}'::jsonb)||jsonb_build_object('solution_purchase_request_id',v_request.id,'release_id',v_release.id,'opportunity_index',p_opportunity_index),
        updated_at=now()
    where id=v_task_id;
  end if;

  for v_admin in select user_id from public.nexus_platform_admins loop
    if not exists(
      select 1 from public.nexus_notifications n
      where n.user_id=v_admin.user_id
        and n.related_type='solution_purchase_request'
        and n.related_id=v_request.id
        and n.created_at>=v_request.updated_at-interval '5 seconds'
    ) then
      insert into public.nexus_notifications(
        company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url
      ) values(
        v_release.company_id,v_admin.user_id,'commercial_request','Solution request: '||v_title,
        case when v_type='included_activation'
          then 'A client wants this recommendation added to the implementation plan under its current Build engagement. The request is in your Action Inbox.'
          else 'A client wants to purchase this recommendation as a separately scoped implementation. The scope-and-price action is in your Action Inbox.'
        end,
        'solution_purchase_request',v_request.id,auth.uid(),'/portal?view=inbox&task='||v_task_id::text
      );
    end if;
  end loop;

  return jsonb_build_object(
    'id',v_request.id,
    'status',v_request.status,
    'request_type',v_request.request_type,
    'opportunity_title',v_request.opportunity_title,
    'nexus_task_id',v_task_id
  );
end
$$;

revoke all on function public.nexus_request_solution_purchase(uuid,int) from public,anon;
grant execute on function public.nexus_request_solution_purchase(uuid,int) to authenticated;
