-- Allow diagnosis approval to preserve qualitative baseline context without
-- attempting to cast non-numeric model/client statements into nexus_metrics.baseline_value.

create or replace function private.nexus_try_numeric(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_text text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return null;
  end if;

  if jsonb_typeof(p_value) = 'number' then
    return (p_value #>> '{}')::numeric;
  end if;

  if jsonb_typeof(p_value) <> 'string' then
    return null;
  end if;

  v_text := btrim(p_value #>> '{}');
  if v_text ~ '^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$' then
    return v_text::numeric;
  end if;

  return null;
end
$function$;

revoke all on function private.nexus_try_numeric(jsonb) from public, anon, authenticated;

-- Patch the existing approval function in place while retaining its current
-- orchestration behavior. The guard makes migration drift fail loudly.
do $migration$
declare
  v_def text;
  v_old_value text := 'nullif(item->>''baseline_value'','''')::numeric';
  v_new_value text := 'private.nexus_try_numeric(item->''baseline_value'')';
  v_old_notes text := 'item->>''notes'',auth.uid()';
  v_new_notes text := 'case when item ? ''baseline_value'' and private.nexus_try_numeric(item->''baseline_value'') is null and nullif(btrim(item->>''baseline_value''),'''') is not null then concat_ws(E''\n'',nullif(item->>''notes'',''''),''Qualitative baseline: ''||item->>''baseline_value'') else item->>''notes'' end,auth.uid()';
begin
  select pg_get_functiondef('public.nexus_approve_diagnosis(uuid,text)'::regprocedure)
    into v_def;

  if position(v_old_value in v_def) = 0 then
    raise exception 'nexus_approve_diagnosis baseline cast contract changed; migration not applied';
  end if;

  if position(v_old_notes in v_def) = 0 then
    raise exception 'nexus_approve_diagnosis metric notes contract changed; migration not applied';
  end if;

  v_def := replace(v_def,v_old_value,v_new_value);
  v_def := replace(v_def,v_old_notes,v_new_notes);
  execute v_def;
end
$migration$;
