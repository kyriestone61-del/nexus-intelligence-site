begin;

-- Extend the existing private-file request workflow with an explicit purchased Build.
alter table public.nexus_document_requests add column build_id uuid references public.nexus_system_cards(id) on delete cascade;
create index nexus_document_requests_build_idx on public.nexus_document_requests(build_id) where build_id is not null;

create function private.relystra_guard_build_input() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.build_id is not null and (new.build_id is distinct from old.build_id or new.company_id is distinct from old.company_id or new.project_id is distinct from old.project_id) then raise exception 'Purchased Build input ownership is immutable'; end if;
 if new.build_id is not null and not exists(select 1 from public.nexus_system_cards b join public.nexus_projects p on p.id=b.project_id where b.id=new.build_id and b.company_id=new.company_id and b.project_id=new.project_id and p.company_id=new.company_id and p.project_type='build_package' and p.paid_at is not null) then raise exception 'Input request must belong to the same paid Build and project'; end if;
 return new;
end $$;
create trigger relystra_build_input_lineage before insert or update of build_id,company_id,project_id on public.nexus_document_requests for each row execute function private.relystra_guard_build_input();

create function public.relystra_request_build_input(p_build_id uuid,p_title text,p_purpose text,p_examples text default null,p_required boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype; request_id uuid;
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 select * into b from public.nexus_system_cards where id=p_build_id for update;
 select * into p from public.nexus_projects where id=b.project_id and company_id=b.company_id and project_type='build_package';
 if p.id is null or p.paid_at is null then raise exception 'A paid Build is required'; end if;
 if b.brief_approved_at is not null then raise exception 'Define required inputs before approving the Build Brief'; end if;
 if nullif(btrim(p_title),'') is null or length(p_title)>160 or length(coalesce(p_purpose,''))<10 or length(p_purpose)>3000 or length(coalesce(p_examples,''))>3000 or p_required is null then raise exception 'Provide a short title and clear input purpose'; end if;
 insert into public.nexus_document_requests(company_id,project_id,build_id,title,purpose,examples,requested_by,is_required)
 values(b.company_id,p.id,b.id,b.name||': '||btrim(p_title),btrim(p_purpose),nullif(btrim(p_examples),''),auth.uid(),p_required) returning id into request_id;
 return request_id;
end $$;

create function public.relystra_review_build_input(p_request_id uuid,p_accept boolean,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.nexus_document_requests%rowtype; d public.nexus_documents%rowtype;
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 if p_accept is null or length(btrim(coalesce(p_note,'')))<10 then raise exception 'Record the input review or revision reason'; end if;
 select * into r from public.nexus_document_requests where id=p_request_id and build_id is not null for update;
 if r.id is null then raise exception 'Purchased Build input request not found'; end if;
 select * into d from public.nexus_documents where id=r.fulfilled_document_id and request_id=r.id and company_id=r.company_id and project_id=r.project_id and status<>'archived';
 if d.id is null or not exists(select 1 from storage.objects where bucket_id='nexus-client-documents' and name=d.storage_path) then raise exception 'Review an uploaded private file for this Build'; end if;
 update public.nexus_document_requests set evidence_status=case when p_accept then 'approved' else 'needs_revision' end,status=case when p_accept then 'received' else 'requested' end,owner_scope=case when p_accept then 'nexus' else 'client' end,revision_reason=case when p_accept then null else p_note end,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=r.id;
 insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary) values(r.company_id,auth.uid(),case when p_accept then 'build_input_accepted' else 'build_input_revision' end,'document_request',r.id,p_note);
 return r.id;
end $$;

create function private.relystra_require_build_inputs() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.brief_approved_at is null and new.brief_approved_at is not null and exists(select 1 from public.nexus_document_requests r where r.build_id=new.id and r.is_required and (r.evidence_status<>'approved' or r.reviewed_by is null or not exists(select 1 from public.nexus_documents d join storage.objects s on s.bucket_id='nexus-client-documents' and s.name=d.storage_path where d.id=r.fulfilled_document_id and d.request_id=r.id and d.company_id=new.company_id and d.project_id=new.project_id and d.status<>'archived'))) then raise exception 'Review and accept the required Build inputs before approving the brief'; end if;
 return new;
end $$;
create trigger relystra_required_build_inputs before update of brief_approved_at on public.nexus_system_cards for each row execute function private.relystra_require_build_inputs();

revoke all on function private.relystra_guard_build_input(),private.relystra_require_build_inputs() from public,anon,authenticated;
revoke all on function public.relystra_request_build_input(uuid,text,text,text,boolean),public.relystra_review_build_input(uuid,boolean,text) from public,anon;
grant execute on function public.relystra_request_build_input(uuid,text,text,text,boolean),public.relystra_review_build_input(uuid,boolean,text) to authenticated;

commit;
