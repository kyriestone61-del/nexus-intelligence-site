-- Include immutable published limitations in grounded support retrieval.
begin;
create or replace function private.relystra_support_sources_unchecked(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; item jsonb; faq jsonb; source_id text; body text; idx integer; sources jsonb:='[]';
begin
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package' and final_package is not null;
  if p.id is null then return '[]'; end if;
  for item in select value from jsonb_array_elements(p.final_package->'items') loop
    source_id:=(item->>'build_id')||':'||(item->>'content_digest');
    body:=coalesce(item->'content'->>'description','');
    sources:=sources||jsonb_build_array(jsonb_build_object('id',source_id||':description','build_id',item->>'build_id','title',(item->>'name')||' — What this does','body',body));
    body:='What this does: '||(item->'content'->'tutorial'->>'what')||E'\nHow to use it:\n'||
      (select string_agg(n::text||'. '||value,E'\n' order by n) from jsonb_array_elements_text(item->'content'->'tutorial'->'steps') with ordinality s(value,n))||
      E'\nWhen to use it: '||(item->'content'->'tutorial'->>'when')||E'\nIf something goes wrong: '||(item->'content'->'tutorial'->>'troubleshooting');
    sources:=sources||jsonb_build_array(jsonb_build_object('id',source_id||':tutorial','build_id',item->>'build_id','title',(item->>'name')||' — Usage guide','body',body));
    -- Only published, client-visible content is eligible; never internal QA or live drafts.
    body:=(select string_agg(value,E'\n' order by n)
      from jsonb_array_elements_text(coalesce(item->'content'->'known_limitations','[]'::jsonb)) with ordinality s(value,n));
    if nullif(btrim(body),'') is not null then
      sources:=sources||jsonb_build_array(jsonb_build_object('id',source_id||':limitations','build_id',item->>'build_id',
        'title',(item->>'name')||' — Known limitations','body',body));
    end if;
    idx:=0;
    for faq in select value from jsonb_array_elements(item->'content'->'faq') loop
      idx:=idx+1;
      sources:=sources||jsonb_build_array(jsonb_build_object('id',source_id||':faq:'||idx,'build_id',item->>'build_id','title',(item->>'name')||' — '||(faq->>'question'),
        'body',(faq->>'question')||E'\n'||(faq->>'answer')));
    end loop;
  end loop;
  sources:=sources||jsonb_build_array(jsonb_build_object('id',p.id::text||':support-boundary','title','Light support coverage',
    'body','The seven-day light support period covers clarification, legitimate defects, small corrections and basic usage questions. It does not include unlimited consulting, major redesign, new functionality or materially expanded scope. Those requests require a separate scope decision.',
    'support_starts_at',p.support_starts_at,'support_ends_at',p.support_ends_at));
  return sources;
end $$;
revoke all on function private.relystra_support_sources_unchecked(uuid) from public,anon,authenticated;
commit;
