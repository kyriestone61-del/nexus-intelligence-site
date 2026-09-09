// Disposable local PostgreSQL/browser integration fixture. Never connects to production or sends email.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {database,asUser} from '../database/fixture.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migrations=(await fs.readdir(path.join(root,'supabase/migrations'))).filter(n=>/^2026090[789]/.test(n)&&!n.includes('000100_')&&!n.includes('000200_')&&!n.includes('launch_security_controls')&&!n.includes('retire_unsafe_snapshot')).sort();
const db=await database(migrations);
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';
await db.exec(`insert into auth.users values ('${admin}'),('${client}');insert into nexus_platform_admins(user_id) values ('${admin}');
insert into nexus_companies(id,name,created_by) values ('${company}','Blue Harbor — local delivery fixture','${admin}');
insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','owner',true);
insert into nexus_commercial_offerings(code,name,description,client_outcome,pricing_model,sort_order) values ('find','Operational Diagnosis','Diagnosis','Findings','fixed',1);
insert into nexus_company_entitlements(company_id,offering_code,status,source,starts_at) values ('${company}','find','active','manual',now());`);
const run=(await db.query("insert into nexus_diagnosis_runs(company_id,status,analysis_result,created_by) values ($1,'approved',$2,$3) returning id",[company,{opportunity_backlog:[{title:'Bid intake',problem:'Bids lack an assigned owner'}]},admin])).rows[0].id;
const planId=await asUser(db,admin,async()=>{
  const qualification=Object.fromEntries(['impact','urgency','effort','dependency_readiness','client_readiness','confidence'].map(k=>[k,{level:'medium',reason:'Synthetic QA finding supports this qualification.'}]));
  const spec={qualification,operational_benefit:'Clear bid ownership',offer_code:'cleanup_sprint',commercial_state:'commercially_ready',price_override_reason:'Synthetic QA scenario retains its historical quoted scope.',name:'Bid intake',outcome:'Route each bid to an owner',diagnosis_run_id:run,template_code:'build_bid_intake',source_path:'opportunity_backlog/0',completed_action_ids:[],complexity_scores:[1,1,1,1,1],complexity:'simple',price_cents:175000,currency:'usd',duration_min:2,duration_max:3,scope_in:['One intake source'],scope_out:['No automatic bid submission'],acceptance_criteria:['Sample bid reaches its owner'],dependencies:[]};
  const id=(await db.query("select relystra_save_build($1,null,$2,'approve') id",[company,spec])).rows[0].id;
  return (await db.query('select relystra_create_build_plan($1,$2) id',[company,[id]])).rows[0].id;
});
await db.exec("update nexus_delivery_settings set checkout_enabled=true,stripe_account_id='acct_local_fixture'");
await db.exec('set role service_role');
const plan=(await db.query('select relystra_claim_checkout($1,$2) plan',[planId,client])).rows[0].plan;
await db.query('select relystra_bind_checkout($1,$2,$3,$4,$5,$6)',[planId,'cs_local_fixture','https://checkout.stripe.com/c/pay/local-fixture','acct_local_fixture',false,plan.checkout_expires_at]);
const project=(await db.query('select relystra_record_verified_payment($1,$2,$3,$4,$5,$6,$7,$8,$9) id',[planId,'evt_local_fixture','cs_local_fixture','pi_local_fixture',175000,'usd',false,plan.snapshot_digest,'acct_local_fixture'])).rows[0].id;
await db.exec('reset role');
const identifier=name=>{if(/^[a-z_][a-z0-9_]*->>[a-z_][a-z0-9_]*$/.test(name)){const [col,key]=name.split('->>');return '"'+col+'"->>\''+key+'\'';}if(!/^[a-z_][a-z0-9_]*$/.test(name))throw Error('Invalid SQL identifier');return '"'+name+'"'};
async function query(body){
  return asUser(db,body.role==='client'?client:admin,async()=>{
    if(body.rpc){if(!body.rpc.startsWith('relystra_'))throw Error('Only delivery fixture RPCs are exposed');const entries=Object.entries(body.args||{});return (await db.query(`select public.${identifier(body.rpc)}(${entries.map(([key],i)=>`${identifier(key)} => $${i+1}`).join(',')}) value`,entries.map(([,v])=>v))).rows[0].value}
    if(!body.table?.startsWith('nexus_'))throw Error('Invalid fixture table');
    const params=[],param=value=>{params.push(value);return '$'+params.length};
    const filters=(body.filters||[]).map(([kind,key,value])=>{
      if(kind==='or')return '('+key.split(',').map(part=>{const [column,op,...rest]=part.split('.');return identifier(column)+(op==='is'?' is null':' = '+param(rest.join('.')))}).join(' or ')+')';
      const column=identifier(key);
      if(kind==='is')return column+' is null';if(kind==='not')return column+' is not null';
      if(kind==='in')return column+' in ('+value.map(param).join(',')+')';
      return column+(kind==='neq'?' <> ':' = ')+param(value);
    });
    let sql;
    if(body.update){sql=`update public.${identifier(body.table)} set ${Object.entries(body.update).map(([key,value])=>`${identifier(key)}=${param(value)}`).join(',')}`}
    else sql=`select ${body.columns==='*'?'*':body.columns.split(',').map(identifier).join(',')} from public.${identifier(body.table)}`;
    if(filters.length)sql+=' where '+filters.join(' and ');
    if(!body.update&&(body.order||[]).length)sql+=' order by '+body.order.map(([key,ascending])=>identifier(key)+(ascending?' asc':' desc')).join(',');
    if(body.limit)sql+=' limit '+Number(body.limit);if(body.offset)sql+=' offset '+Number(body.offset);
    const rows=(await db.query(sql,params)).rows;return body.single?rows[0]||null:rows;
  });
}
const additionalIds=await asUser(db,admin,async()=>{
 const qualification=Object.fromEntries(['impact','urgency','effort','dependency_readiness','client_readiness','confidence'].map(k=>[k,{level:k==='effort'?'low':'high',reason:'Synthetic approved QA finding identifies this workflow gap.'}]));
 const ids=[];
 for(const [template,name,state,placement,price] of [['build_estimate_follow_up','Estimate follow-up','commercially_ready','next',100000],['build_ar_follow_up','AR follow-up','commercially_ready','next',100000],['build_owner_dashboard','Owner dashboard','needs_discussion','later',150000]]){
  const spec={qualification,operational_benefit:'Clear ownership and fewer missed follow-ups',offer_code:price===150000?'single_workflow':'cleanup_sprint',commercial_state:state,placement,name,outcome:'Every item has an owner and agreed next action',diagnosis_run_id:run,template_code:template,source_path:'opportunity_backlog/0',completed_action_ids:[],complexity_scores:[1,1,1,1,1],complexity:'simple',price_cents:price,deposit_cents:price/2,currency:'usd',duration_min:2,duration_max:3,scope_in:['One workflow using authorized records'],scope_out:['Other workflows'],required_inputs:['Client-approved sample records'],deliverables:['Configured and populated tracker','Maintenance guide and walkthrough'],acceptance_criteria:['Representative records follow the agreed workflow'],dependencies:[]};
  ids.push((await db.query("select relystra_save_build($1,null,$2,'approve') id",[company,spec])).rows[0].id);
 }
 return ids;
});
const reportId=await asUser(db,admin,()=>db.query('select relystra_save_basic_report(null,$1,$2,$3,$4,true) id',[company,{full_name:'Synthetic Prospect',email:'local-construction@example.invalid'},'Synthetic QA conversation: Closeout documents arrive across several inboxes and the owner cannot see missing items.',{heard:'Closeout documents are scattered.',bottleneck:'Missing documents delay handoff.',primary:{name:'Closeout Tracker',template_code:'build_closeout',offer_code:'cleanup_sprint',problem:'Scattered closeout documents',outcome:'See what is missing and who owns it',scope_in:['One closeout document workflow'],scope_out:['Additional workflows'],inputs:['Authorized sample documents'],deliverables:['Populated closeout tracker','Walkthrough and maintenance guide'],acceptance_criteria:['Sample job shows requirements and owners'],price_cents:100000,deposit_cents:50000,currency:'usd',duration_min:2,duration_max:4},later:[{name:'Owner Dashboard',template_code:'build_owner_dashboard',why:'Make agreed project status easier to review.'}]}]).then(r=>r.rows[0].id));
const reportToken=await asUser(db,admin,()=>db.query('select relystra_share_basic_report($1) token',[reportId]).then(r=>r.rows[0].token));
let queue=Promise.resolve();
async function serialized(fn){let resolve;const result=new Promise(r=>resolve=r);queue=queue.then(async()=>{try{resolve({data:await fn(),error:null})}catch(error){resolve({data:null,error:{message:error.message}})}});return result;}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/qa-reset-commercial'&&req.method==='POST'){
      const result=await serialized(async()=>{
        await db.query("update nexus_build_plans set status='cancelled' where company_id=$1 and status='awaiting_payment'",[company]);
        await db.query("update nexus_discovery_requests set initial_plan_id=null,report_state='approved' where id=$1",[reportId]);
        return true;
      });res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));
    }
    if(url.pathname==='/qa-fixture-info'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({company,project,admin,client,reportToken,reportId,additionalIds}))}
    if(url.pathname==='/api/offers'){const r=await serialized(async()=>(await db.query('select relystra_offer_ladder() data')).rows[0].data);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(r.data));}
    if(url.pathname==='/api/basic-report'&&req.method==='POST'){
      let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      if(['checkout','cancel'].includes(body.operation)){res.statusCode=409;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error:'LOCAL_PROVIDER_BOUNDARY',message:'Local acceptance verifies saved scope. External payment is tested separately.'}));}
      const result=await serialized(async()=>(await db.query('select relystra_basic_report_access($1,$2) data',[body.token,body.operation])).rows[0].data);
      res.setHeader('Content-Type','application/json');if(result.error){res.statusCode=404;return res.end(JSON.stringify(result.error));}
      const {actor_id,company_id,...report}=result.data;return res.end(JSON.stringify({ok:true,report}));
    }
    if(url.pathname==='/qa-db'&&req.method==='POST'){
      let text='';for await(const chunk of req){text+=chunk;if(text.length>200000)throw Error('Payload too large')}
      const body=JSON.parse(text);let resolve;const result=new Promise(r=>resolve=r);queue=queue.then(async()=>{try{resolve({data:await query(body),error:null})}catch(error){resolve({data:null,error:{message:error.message}})}});
      res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await result));
    }
    const requested=decodeURIComponent(url.pathname);let filename=path.resolve(root,'.'+requested+(requested.endsWith('/')?'index.html':''));
    if(!filename.startsWith(root)||requested.split('/').some(v=>v.startsWith('.')))throw Error('Invalid path');
    if(!path.extname(filename)){try{await fs.access(filename+'.html');filename+='.html'}catch{}}
    const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'}[path.extname(filename)]||'application/octet-stream';
    res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');res.end(await fs.readFile(filename));
  }catch(error){res.statusCode=404;res.end(error.message)}
});
server.listen(4179,'127.0.0.1',()=>console.log('Disposable delivery browser fixture: http://127.0.0.1:4179/qa/delivery-browser/'));
