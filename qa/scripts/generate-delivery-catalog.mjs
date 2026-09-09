import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('relystra-delivery-catalog.json',root),'utf8'));
const sql=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>sql(JSON.stringify(value))+'::jsonb';
if(catalog.version!==3)throw new Error('Use the reviewed version 3 Master Build Library; historical migrations are immutable.');
const path=new URL('supabase/migrations/20260909082311_relystra_master_build_library.sql',root);
const current=await fs.readFile(path,'utf8');
// Commercial defaults remain in the migration's reviewed configuration header.
const header=current.slice(0,current.indexOf('insert into public.nexus_resolution_catalog'));
const rows=catalog.builds.map(build=>`insert into public.nexus_resolution_catalog(code,title,category,description,match_terms,default_recipe,version,active) values (${[build.code,build.title,build.workflow_lane,build.typical_problem].map(sql).join(',')},'{}',${json({...build,catalog_kind:'build_template',steps:[]})},3,true) on conflict(code) do update set category=excluded.category,default_recipe=excluded.default_recipe||public.nexus_resolution_catalog.default_recipe||${json({schema_version:3,workflow_lane:build.workflow_lane})}||case when public.nexus_resolution_catalog.default_recipe->'default_checklist'=${json(['Approve the evidence-linked build brief','Confirm authorized access and representative test inputs','Implement the approved workflow','Test the expected outcome and exception handling','Verify permissions, logging and rollback','Create the client tutorial','Write the build FAQ','Prepare grounded support knowledge','Pass internal QA'])} then jsonb_build_object('default_checklist',excluded.default_recipe->'default_checklist') else '{}'::jsonb end,version=greatest(public.nexus_resolution_catalog.version,3);`);
const output=header+rows.join('\n')+'\ncommit;\n';
if(process.argv.includes('--check')){if(current!==output)throw new Error('Master Library seed differs from the reviewed catalog. Regenerate it.');}
else await fs.writeFile(path,output);
