const MODE_LABELS={admin:'Admin',operations:'Operations',client:'Client View'};
const MUTATION_WORDS=/\b(approve|reject|request changes|submit|send|save|complete|mark complete|upload|delete|remove|create|add|assign|start|enable|disable|archive|block|revise|run secured|retry|record result)\b/i;
let context=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=()=>new URLSearchParams(location.search);
const companyById=(state,id)=>state.companies?.find(c=>c.id===id)||null;
const currentCompany=state=>companyById(state,state.companyId);
const isPreview=state=>state?.platformAdmin===true&&state?.viewMode==='client';

function addSelectColumn(table,columns){
  if(typeof columns!=='string'||columns==='*')return columns;
  const needed={nexus_document_requests:['owner_scope'],nexus_decision_register:['client_visible'],nexus_notifications:['user_id'],nexus_approval_chains:['visibility','company_id'],nexus_approval_chain_steps:['approver_scope','approver_role']}[table]||[];
  const existing=new Set(columns.split(',').map(x=>x.trim().split(':').pop().trim()));
  const missing=needed.filter(x=>!existing.has(x));
  return missing.length?`${columns},${missing.join(',')}`:columns;
}

function safeRow(table,row,state){
  if(!row||typeof row!=='object')return true;
  if(row.company_id&&state.companyId&&row.company_id!==state.companyId)return false;
  const status=String(row.status||'').toLowerCase();
  switch(table){
    case'nexus_tasks':return row.assignee==='client'&&status!=='draft';
    case'nexus_document_requests':return status!=='draft'&&String(row.owner_scope||'client')!=='nexus';
    case'nexus_approvals':return status!=='draft';
    case'nexus_approval_chains':return row.visibility==='company';
    case'nexus_approval_chain_steps':return row.approver_scope==='company_role';
    case'nexus_approval_events':return false;
    case'nexus_notifications':return !row.user_id||row.user_id===state.previewMemberUserId;
    case'nexus_diagnosis_report_releases':return status==='released';
    case'nexus_diagnosis_report_questions':return !state.previewMemberUserId||row.asked_by===state.previewMemberUserId;
    case'nexus_decision_register':return row.client_visible===true;
    case'nexus_automations':return false;
    case'nexus_company_memory':return false;
    case'nexus_diagnosis_runs':return false;
    case'nexus_opportunities':return false;
    case'nexus_founder_decision_queue':return false;
    case'nexus_activity_log':return false;
    case'nexus_memory_records':return false;
    case'nexus_evidence_registry':return false;
    case'nexus_incidents':return false;
    default:return true;
  }
}

function filteredResponse(table,response,state){
  if(!response||!('data'in response))return response;
  if(Array.isArray(response.data))return {...response,data:response.data.filter(row=>safeRow(table,row,state))};
  if(response.data&&typeof response.data==='object'&&!safeRow(table,response.data,state))return {...response,data:null};
  return response;
}

function wrapBuilder(builder,table,state){
  if(!builder||typeof builder!=='object')return builder;
  return new Proxy(builder,{
    get(target,prop){
      if(prop==='then')return (resolve,reject)=>target.then(value=>resolve(filteredResponse(table,value,state)),reject);
      const value=target[prop];
      if(typeof value!=='function')return value;
      return(...args)=>{
        if(prop==='select'&&args.length)args[0]=addSelectColumn(table,args[0]);
        const next=value.apply(target,args);
        return next&&typeof next==='object'&&typeof next.then==='function'?wrapBuilder(next,table,state):next;
      };
    }
  });
}

function createPreviewClient(platformSb,state){
  return new Proxy(platformSb,{
    get(target,prop){
      if(prop==='from')return table=>wrapBuilder(target.from(table),table,state);
      if(prop==='rpc')return(name,args,options)=>{
        if(name==='nexus_get_inbox')return target.rpc('nexus_get_inbox_admin_preview',{p_company_id:state.companyId},options);
        return target.rpc(name,args,options);
      };
      const value=target[prop];return typeof value==='function'?value.bind(target):value;
    }
  });
}

function filterLoadedState(state){
  state.tasks=(state.tasks||[]).filter(x=>safeRow('nexus_tasks',x,state));
  state.docRequests=(state.docRequests||[]).filter(x=>safeRow('nexus_document_requests',x,state));
  state.notes=(state.notes||[]).filter(x=>safeRow('nexus_notifications',x,state));
  state.activity=[];
}

async function resolvePreviewMember(platformSb,state){
  try{
    const {data,error}=await platformSb.from('nexus_company_members').select('user_id,member_role,created_at').eq('company_id',state.companyId).eq('active',true).order('created_at',{ascending:true});
    if(error)throw error;
    const rows=data||[];return rows.find(x=>x.member_role==='owner')?.user_id||rows[0]?.user_id||null;
  }catch(error){console.warn('Client preview member resolution failed',error?.message||error);return null}
}

function hideAdminOnlyBaseControls(portal){
  ['newMilestoneBtn','newDocumentRequestBtn','newTaskBtn','newMetricBtn','alertsBtn'].forEach(id=>{const el=portal.$?.(id)||document.getElementById(id);if(el)el.style.display='none'});
  const role=document.getElementById('roleLabel');if(role)role.textContent='Client-facing preview · read only';
}

function previewBlock(event){
  if(!context||!isPreview(context.portal.state))return;
  if(event.type==='submit'){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();context.portal.toast?.('Client View is read-only from your administrator account.');return;
  }
  const control=event.target.closest?.('button,input[type="file"],select[data-task-status],a');if(!control)return;
  const label=(control.textContent||control.getAttribute?.('aria-label')||control.value||'').trim();
  const alwaysBlock=control.matches?.('input[type="file"],.complete-task-action,.save-task-response,.req-inline-save,.req-inline-build,.req-inline-na,.req-open-upload,[data-diagnosis-action],[data-approval-action],[data-submit-request],[data-send-request],[data-send-request-draft]');
  const formMutation=!!control.closest?.('form')&&!control.matches?.('[type="button"]');
  if(alwaysBlock||formMutation||MUTATION_WORDS.test(label)){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();context.portal.toast?.('Client View is a read-only preview. Switch to Admin or Operations to make changes.');
  }
}

function installReadOnlyGuard(){
  if(document.documentElement.dataset.nexusPreviewGuard==='1')return;
  document.documentElement.dataset.nexusPreviewGuard='1';
  document.addEventListener('submit',previewBlock,true);
  document.addEventListener('click',previewBlock,true);
  document.addEventListener('change',event=>{if(!context||!isPreview(context.portal.state))return;const el=event.target;if(el.matches?.('input,textarea,select')&&!el.matches('#nexusPerspectiveCompany')){event.preventDefault();event.stopPropagation();context.portal.toast?.('Client View is read-only.')}},true);
}

function destination(mode,companyId){
  const id=companyId?`&company=${encodeURIComponent(companyId)}`:'';
  if(mode==='operations')return `/operations?company=${encodeURIComponent(companyId||'')}`;
  return `/portal?view_mode=${mode}${id}`;
}

function switcherMarkup(state,mode){
  const company=currentCompany(state);const companies=state.companies||[];
  return `<summary aria-label="Switch Relystra perspective"><span class="perspective-label">View as</span><b>${esc(MODE_LABELS[mode]||'Admin')}</b><span class="perspective-client">${esc(company?.name||'Select client')}</span></summary><div class="nexus-perspective-menu"><div class="perspective-account"><label for="nexusPerspectiveCompany">Client account</label><select id="nexusPerspectiveCompany">${companies.map(c=>`<option value="${esc(c.id)}" ${c.id===state.companyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="nexus-perspective-options"><button class="nexus-perspective-option ${mode==='admin'?'active':''}" data-perspective="admin" type="button"><span><b>Admin</b><small>Founder controls, diagnosis, approvals, revenue and configuration.</small></span>${mode==='admin'?'<i>✓</i>':'<i>›</i>'}</button><button class="nexus-perspective-option ${mode==='operations'?'active':''}" data-perspective="operations" type="button"><span><b>Operations</b><small>Delivery, QA, agents, workflows, health and operating reviews.</small></span>${mode==='operations'?'<i>✓</i>':'<i>›</i>'}</button><button class="nexus-perspective-option ${mode==='client'?'active':''}" data-perspective="client" type="button"><span><b>Client View</b><small>Read-only preview of what the selected client can see.</small></span>${mode==='client'?'<i>✓</i>':'<i>›</i>'}</button></div><p class="nexus-perspective-note">Switching perspective never changes your real Relystra administrator authorization.</p></div>`;
}

function bindSwitcher(node,portal,mode){
  node.querySelector('#nexusPerspectiveCompany')?.addEventListener('change',event=>{
    const companyId=event.target.value;location.assign(destination(mode,companyId));
  });
  node.querySelectorAll('[data-perspective]').forEach(button=>button.addEventListener('click',()=>location.assign(destination(button.dataset.perspective,portal.state.companyId))));
}

function ensurePreviewBanner(portal){
  if(!isPreview(portal.state)){document.querySelector('.nexus-client-preview-banner')?.remove();return}
  if(document.querySelector('.nexus-client-preview-banner'))return;
  const company=currentCompany(portal.state);const bar=document.createElement('div');bar.className='nexus-client-preview-banner';bar.innerHTML=`<b>Client View</b><span>${esc(company?.name||'Selected client')} · read-only preview</span>`;
  document.getElementById('portalApp')?.insertBefore(bar,document.querySelector('#portalApp .workspace'));
}

function renderSwitcher(portal){
  if(!portal.state?.platformAdmin)return;
  document.body.classList.add('nexus-perspective-enabled');
  const mode=portal.state.viewMode||'admin';let node=document.getElementById('nexusPerspectiveSwitcher');
  if(!node){node=document.createElement('details');node.id='nexusPerspectiveSwitcher';node.className='nexus-perspective-switcher';const anchor=document.getElementById('companySelect');if(anchor?.parentElement)anchor.after(node);else document.querySelector('.topbar')?.appendChild(node)}
  node.innerHTML=switcherMarkup(portal.state,mode);bindSwitcher(node,portal,mode);ensurePreviewBanner(portal);
}

function interceptCompanySelector(portal){
  const select=document.getElementById('companySelect');if(!select||select.dataset.perspectiveIntercept==='1')return;
  select.dataset.perspectiveIntercept='1';select.addEventListener('change',event=>{
    if(!portal.state.platformAdmin)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();location.assign(destination(portal.state.viewMode||'admin',event.target.value));
  },true);
}

export async function preparePerspective(portal){
  const state=portal.state;const platformSb=portal.sb;const platformAdmin=!!state.admin;state.platformAdmin=platformAdmin;
  if(!platformAdmin){state.viewMode='client';return {platformAdmin:false,mode:'client'}}
  const q=params();const requested=q.get('company');
  if(requested&&companyById(state,requested)&&requested!==state.companyId){state.companyId=requested;const select=document.getElementById('companySelect');if(select)select.value=requested;await portal.workspace()}
  const requestedMode=q.get('view_mode');const mode=requestedMode==='client'?'client':'admin';state.viewMode=mode;
  if(mode==='client'){
    state.previewMemberUserId=await resolvePreviewMember(platformSb,state);state.previewReadOnly=true;filterLoadedState(state);state.admin=false;portal.sb=createPreviewClient(platformSb,state);hideAdminOnlyBaseControls(portal);installReadOnlyGuard();
  }
  context={portal,platformSb};interceptCompanySelector(portal);return {platformAdmin:true,mode};
}

export function mountPerspectiveSwitcher(portal){
  if(!portal.state?.platformAdmin)return;renderSwitcher(portal);interceptCompanySelector(portal);
  const observer=new MutationObserver(()=>{if(!document.getElementById('nexusPerspectiveSwitcher'))renderSwitcher(portal)});observer.observe(document.getElementById('portalApp')||document.body,{childList:true,subtree:true});
}

window.NexusPerspectiveSwitcher={preparePerspective,mountPerspectiveSwitcher};
