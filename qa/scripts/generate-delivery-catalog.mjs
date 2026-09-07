import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('relystra-delivery-catalog.json',root),'utf8'));
const sql=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>sql(JSON.stringify(value))+'::jsonb';
const lines=['-- Generated from relystra-delivery-catalog.json. Run node qa/scripts/generate-delivery-catalog.mjs.',
  '-- Insert missing templates only; preserve administrator edits and historical catalog records.','begin;'];
for(const [index,action] of catalog.actions.entries()){
  lines.push(`insert into public.nexus_action_templates(code,category,title,description,instructions,assignee,priority,task_type,form_schema,active,sort_order,phase,required_evidence,completion_criteria,workflow_metadata)
values(${[action.code,action.category,action.title,action.description,action.instructions,action.responsible_party==='client'?'client':'nexus','normal',action.task_type].map(sql).join(',')},${json(action.form_schema)},true,${index+1},'prebuild',${json(action.required_evidence)},${json(action.completion_criteria)},${json({work_kind:'prebuild_action',responsible_party:action.responsible_party,catalog_version:catalog.version})}) on conflict(code) do nothing;`);
}
for(const build of catalog.builds){
  lines.push(`insert into public.nexus_resolution_catalog(code,title,category,description,match_terms,default_recipe,version,active)
values(${[build.code,build.title,build.category,build.typical_problem].map(sql).join(',')},'{}'::text[],${json({...build,catalog_kind:'build_template',steps:[]})},${catalog.version},true) on conflict(code) do nothing;`);
}
lines.push('commit;','');
const output=lines.join('\n');
const path=new URL('supabase/migrations/20260907000200_relystra_delivery_catalog.sql',root);
if(process.argv.includes('--check')){
  if(await fs.readFile(path,'utf8')!==output)throw new Error('The catalog migration does not match the reviewed catalog. Regenerate it.');
}else await fs.writeFile(path,output);
