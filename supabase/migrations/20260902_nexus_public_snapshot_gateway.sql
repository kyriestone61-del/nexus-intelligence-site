create schema if not exists nexus_public_internal;

create or replace function nexus_public_internal.submit_opportunity_snapshot(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_first_name text:=btrim(coalesce(payload->>'first_name',''));
  v_email text:=lower(btrim(coalesce(payload->>'email','')));
  v_phone text:=nullif(btrim(coalesce(payload->>'phone','')),'');
  v_company text:=nullif(btrim(coalesce(payload->>'company_name','')),'');
  v_sms boolean:=lower(coalesce(payload->>'sms_opt_in','false'))='true';
  v_marketing boolean:=lower(coalesce(payload->>'marketing_opt_in','false'))='true';
  v_business text:=payload->>'business_type';
  v_team text:=payload->>'team_size';
  v_goal text:=payload->>'priority_goal';
  v_frequency text:=payload->>'frequency';
  v_burden text:=payload->>'burden';
  v_systems text:=payload->>'systems';
  v_authority text:=payload->>'authority';
  v_timeline text:=payload->>'timeline';
  v_primary text:=payload->>'primary_opportunity';
  v_score integer;
  v_areas text[];
  v_top jsonb:=coalesce(payload->'top_opportunities','[]'::jsonb);
  v_first jsonb:=coalesce(payload->'first_touch','{}'::jsonb);
  v_last jsonb:=coalesce(payload->'last_touch','{}'::jsonb);
begin
  if payload is null or octet_length(payload::text)>32000 then raise exception 'Invalid snapshot payload'; end if;
  if char_length(v_first_name)<1 or char_length(v_first_name)>80 then raise exception 'Please enter your first name'; end if;
  if char_length(v_email)<3 or char_length(v_email)>254 or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Please enter a valid email address'; end if;
  if v_phone is not null and char_length(v_phone)>40 then raise exception 'Phone number is too long'; end if;
  if v_sms and v_phone is null then raise exception 'A mobile number is required for text consent'; end if;
  if v_company is not null and char_length(v_company)>160 then raise exception 'Company name is too long'; end if;
  if v_business is null or v_business<>all(array['product','field','appointment','professional','other']) then raise exception 'Invalid business type'; end if;
  if v_team is null or v_team<>all(array['1-5','6-10','11-25','26-50','51-100','101+']) then raise exception 'Invalid team size'; end if;
  if v_goal is null or v_goal<>all(array['time','revenue','response','visibility','knowledge','systems']) then raise exception 'Invalid priority goal'; end if;
  if v_frequency is null or v_frequency<>all(array['monthly','weekly','daily','high']) then raise exception 'Invalid frequency'; end if;
  if v_burden is null or v_burden<>all(array['unknown','under5','5-15','15-40','40plus']) then raise exception 'Invalid burden'; end if;
  if v_systems is null or v_systems<>all(array['email','crm','sheets','docs','multiple','paper']) then raise exception 'Invalid systems value'; end if;
  if v_authority is null or v_authority<>all(array['unclear','manager','owner']) then raise exception 'Invalid authority'; end if;
  if v_timeline is null or v_timeline<>all(array['exploring','quarter','month']) then raise exception 'Invalid timeline'; end if;
  if v_primary is null or v_primary<>all(array['admin','leads','reporting','customer','scheduling','knowledge','systems']) then raise exception 'Invalid primary opportunity'; end if;
  begin v_score:=(payload->>'opportunity_score')::integer; exception when others then raise exception 'Invalid opportunity score'; end;
  if v_score<0 or v_score>100 then raise exception 'Invalid opportunity score'; end if;
  if jsonb_typeof(coalesce(payload->'opportunity_areas','[]'::jsonb))<>'array' then raise exception 'Invalid opportunity areas'; end if;
  select coalesce(array_agg(x),array[]::text[]) into v_areas from jsonb_array_elements_text(coalesce(payload->'opportunity_areas','[]'::jsonb)) t(x);
  if cardinality(v_areas)<1 or cardinality(v_areas)>3 or not(v_areas<@array['admin','leads','reporting','customer','scheduling','knowledge','systems']::text[]) then raise exception 'Choose one to three opportunity areas'; end if;
  if jsonb_typeof(v_top)<>'array' or jsonb_array_length(v_top)<1 or jsonb_array_length(v_top)>3 then raise exception 'Invalid opportunity ranking'; end if;
  if octet_length(v_first::text)>6000 or octet_length(v_last::text)>6000 then raise exception 'Attribution payload too large'; end if;

  insert into public.nexus_opportunity_snapshot_leads(
    first_name,email,phone,sms_opt_in,company_name,business_type,team_size,priority_goal,
    opportunity_areas,frequency,burden,systems,authority,timeline,opportunity_score,
    primary_opportunity,top_opportunities,snapshot_data,first_touch,last_touch,
    marketing_opt_in,marketing_opt_in_at
  ) values(
    v_first_name,v_email,v_phone,v_sms,v_company,v_business,v_team,v_goal,
    v_areas,v_frequency,v_burden,v_systems,v_authority,v_timeline,v_score,
    v_primary,v_top,coalesce(payload->'snapshot_data','{}'::jsonb),v_first,v_last,
    v_marketing,case when v_marketing then now() end
  ) returning id into v_id;
  return v_id;
end
$$;

revoke all on schema nexus_public_internal from public;
revoke all on function nexus_public_internal.submit_opportunity_snapshot(jsonb) from public;
grant usage on schema nexus_public_internal to anon, authenticated, service_role;
grant execute on function nexus_public_internal.submit_opportunity_snapshot(jsonb) to anon, authenticated, service_role;

create or replace function public.submit_nexus_opportunity_snapshot(payload jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select nexus_public_internal.submit_opportunity_snapshot(payload)
$$;

revoke all on function public.submit_nexus_opportunity_snapshot(jsonb) from public;
grant execute on function public.submit_nexus_opportunity_snapshot(jsonb) to anon, authenticated, service_role;
