import {journeyMarkup,journeyGate,gateMarkup,journeyNext} from './portal-journey-steps.js';
import {mountTranscriptStage,selectedTranscript} from './portal-transcript-stage.js';
import {createLifecycleStore,lifecycle,mountMobileMenu} from './portal-delivery-lifecycle.js';
import {mountBuilds} from './portal-builds.js';
import {mountPackageDelivery} from './portal-package-delivery.js';
import {mountDiagnosisOffer} from './portal-diagnosis-offer.js';
import {workspaceUrl} from './portal-workspace-context.js';

const portal=window.NexusPortal;
if(!portal?.state.admin)throw new Error('Administrator workspace required');
const {state,sb,toast}=portal,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store=createLifecycleStore(portal),tools=new Map();
let company=state.companyId,viewedProject=new URL(location.href).searchParams.get('project'),active='overview',refreshSequence=0,navigationSequence=0,loadError=null;
const main=document.querySelector('.main'),nav=document.querySelector('.side-nav');
function section(id){let el=$('section-'+id);if(!el){el=document.createElement('section');el.id='section-'+id;el.className='section';main.append(el)}return el}
const overview=section('journey'),buildRoot=section('relystra-builds'),deliveryRoot=section('relystra-delivery'),projectsRoot=section('relystra-projects'),templatesRoot=section('relystra-templates'),settingsRoot=section('relystra-settings');
overview.innerHTML='<div id="adminJourneyRoot"></div>';
const transcriptRoot=section('transcript'),gateRoot=section('journey-gate');
const transcript=mountTranscriptStage(transcriptRoot,portal,{navigate,onChange:refresh});
const header=document.createElement('div');header.id='relystraWorkspaceHeader';main.prepend(header);
const offerRoot=document.createElement('div');offerRoot.id='relystraDiagnosisOffer';overview.append(offerRoot);
const builds=mountBuilds(buildRoot,portal),delivery=mountPackageDelivery(deliveryRoot,portal),offer=mountDiagnosisOffer(offerRoot,portal);

// Keep supporting tool buttons and their handlers, with navigation owned here.
for(const button of nav.querySelectorAll('button[data-section]'))tools.set(button.dataset.section,button);
const retained=document.createElement('div');retained.hidden=true;retained.id='relystraRetainedToolRoutes';
for(const button of tools.values())retained.append(button);
nav.replaceChildren();nav.append(retained);
function navButton(title,target,parent=nav){const b=document.createElement('button');b.type='button';b.textContent=title;b.dataset.relystraNav=target;b.onclick=()=>navigate(target);parent.append(b);return b}
navButton('Home','overview').classList.add('journey-primary');navButton('Clients','clients');navButton('Projects','projects');navButton('Sales','sales');
const records=document.createElement('details');records.className='admin-tool-drawer';records.innerHTML='<summary>Records & Tools</summary>';nav.append(records);
navButton('Files','files',records);navButton('Activity','activity',records);navButton('Templates','templates',records);
navButton('Settings','settings').classList.add('relystra-settings-nav');
mountMobileMenu(nav);

function activate(id){document.querySelectorAll('.main > .section').forEach(el=>el.classList.toggle('active',el.id==='section-'+id))}
function renderHeader(){
  const s=store.value;if(!s){header.innerHTML='';return}
  const name=state.companies?.find(c=>c.id===state.companyId)?.name||'Client workspace';
  header.innerHTML=`<div class="relystra-workspace-context"><div><small>Client workspace</small><h2>${esc(name)}</h2></div><label>Build Package<select data-package-picker><option value="">Current package</option>${s.projects.map(p=>`<option value="${esc(p.id)}" ${viewedProject===p.id?'selected':''}>${esc(p.name)}${p.status==='complete'?' · Completed':''}${!p.paid?' · Historical':''}</option>`).join('')}</select></label></div>${journeyMarkup(s,{active,hasTranscript:!!selectedTranscript(portal,s)})}`;
}
function renderOverview(){
  if(loadError){$('adminJourneyRoot').innerHTML=`<p role="alert">${esc(loadError.message)}</p><button class="btn secondary" data-workspace-retry>Retry</button>`;return}
  const next=journeyNext(store.value,!!selectedTranscript(portal,store.value)),actor={ADMIN:'Relystra',CLIENT:'Client',AI_SYSTEM:'AI / system',NO_ACTION_COMPLETE:'No action required'}[next.actor];
  $('adminJourneyRoot').innerHTML=`<header><div class="eyebrow">Overview</div><h1>${esc(next.title)}</h1><p>${esc(next.detail)}</p></header><section class="relystra-build-card"><p><b>Who moves next:</b> ${actor}</p>${next.blocker?`<p role="status">${esc(next.blocker)}</p>`:''}${next.percent!==null?`<label>Build Package progress <progress max="100" value="${next.percent}">${next.percent}%</progress> ${next.percent}%</label>`:''}${next.stage==='diagnosis_purchase'?'':`<button type="button" class="btn primary" data-delivery-nav="${esc(next.section)}">${esc(next.label)}</button>`}</section><p>Current stage: ${esc(next.stage.replaceAll('_',' '))}</p>`;
}
async function refresh(){
  const version=++refreshSequence;
  if(company!==state.companyId){company=state.companyId;viewedProject=null;active='overview';navigationSequence++;header.hidden=false;activate('journey');store.invalidate();buildRoot.replaceChildren();deliveryRoot.replaceChildren()}
  try{const s=await store.refresh(viewedProject);if(!s||version!==refreshSequence)return;loadError=null;renderHeader();renderOverview();transcript.refresh(s);await offer.refresh(s);
    if(['builds','scope'].includes(active))await builds.refresh({stage:active});else if(['progress','review','final-package','support'].includes(active)&&!journeyGate(active,s))await delivery.refresh({projectId:s.project_id,section:active==='review'?'progress':active});
  }catch(error){if(version===refreshSequence){loadError=error;header.innerHTML='<p role="alert">Workspace status could not be loaded.</p>';$('adminJourneyRoot').innerHTML=`<p role="alert">${esc(error.message)}</p><button class="btn secondary" data-workspace-retry>Retry</button>`}}
}
async function navigate(target){
  const version=++navigationSequence;
  active=target;header.hidden=['clients','sales','projects','templates','settings'].includes(target);
  document.querySelectorAll('[data-relystra-nav]').forEach(b=>b.classList.toggle('active',b.dataset.relystraNav===target));
  const aliases={diagnosis:'intake',actions:'tasks',files:'documents',sales:'revenue'};
  const gate=journeyGate(target,store.value);
  if(gate){activate('journey-gate');gateRoot.innerHTML=gateMarkup(gate)}
  else if(target==='transcript'){activate('transcript');transcript.refresh(store.value)}
  else if(target==='overview'){activate('journey');renderOverview()}
  else if(['builds','scope'].includes(target)){activate('relystra-builds');await builds.refresh({stage:target})}
  else if(['progress','review','final-package','support'].includes(target)){
    if(store.value?.project_type&&store.value.project_type!=='build_package'){tools.get('timeline')?.click();activate('timeline')}
    else{activate('relystra-delivery');await delivery.refresh({projectId:store.value?.project_id,section:target==='review'?'progress':target})}
  }else if(target==='projects'){activate('relystra-projects');await renderProjects()}
  else if(target==='templates'){activate('relystra-templates');await renderTemplates()}
  else if(target==='settings'){activate('relystra-settings');await renderSettings()}
  else{const key=aliases[target]||target;tools.get(key)?.click();activate(key)}
  if(version!==navigationSequence)return;
  renderHeader();const url=new URL(workspaceUrl(location.href,state.companyId,viewedProject),location.origin);url.searchParams.set('section',target);history.replaceState(null,'',url.pathname+url.search+url.hash);window.scrollTo({top:0,left:0,behavior:'auto'});
}
async function renderProjects(){
  const {data,error}=await sb.from('nexus_projects').select('id,company_id,name,status,project_type,paid_at,package_stage').order('created_at',{ascending:false});
  projectsRoot.innerHTML=`<h1>Projects</h1><p>Each new Project is a paid Build Package. Existing engagements remain available as historical records.</p>${error?`<p role="alert">${esc(error.message)}</p>`:`<div class="relystra-build-grid">${(data||[]).map(p=>`<article class="relystra-build-card"><h2>${esc(p.name)}</h2><p>${esc(state.companies?.find(c=>c.id===p.company_id)?.name||'Client')}</p><p>${esc(p.paid_at?p.package_stage||p.status:'Historical engagement · '+p.status)}</p><button type="button" class="btn secondary" data-project-open="${esc(p.id)}" data-company="${esc(p.company_id)}">Open package</button></article>`).join('')||'<p>No Projects yet. Verified Build Plan payment creates the first package.</p>'}</div>`}`;
}
async function renderTemplates(){
  const rows=await Promise.all([sb.from('nexus_action_templates').select('code,title,instructions,workflow_metadata').eq('active',true).order('sort_order'),sb.from('nexus_resolution_catalog').select('code,title,category,default_recipe').eq('active',true).order('title')]);
  const error=rows.find(r=>r.error)?.error;
  templatesRoot.innerHTML=`<h1>Templates</h1>${error?`<p role="alert">${esc(error.message)}</p>`:`<h2>Pre-build Actions</h2>${rows[0].data.filter(t=>t.workflow_metadata?.work_kind==='prebuild_action').map(t=>`<details class="relystra-build-card"><summary>${esc(t.title)}</summary><p>${esc(t.instructions)}</p></details>`).join('')}<h2>Builds</h2>${rows[1].data.filter(t=>t.default_recipe?.catalog_kind==='build_template').map(t=>`<details class="relystra-build-card"><summary>${esc(t.title)}</summary><p>${esc(t.category)}</p><ul>${(t.default_recipe.default_checklist||[]).map(i=>`<li>${esc(i)}</li>`).join('')}</ul></details>`).join('')}`}`;
}
async function renderSettings(){
  const {data,error}=await sb.from('nexus_delivery_settings').select('*').single();
  settingsRoot.innerHTML=`<h1>Settings</h1>${error?`<p role="alert">${esc(error.message)}</p>`:`<form id="relystraDeliverySettings" class="relystra-build-card"><label>Diagnosis price (${esc(data.currency.toUpperCase())})<input name="price" type="number" min="0.01" step="0.01" required value="${data.diagnosis_price_cents/100}"></label><label>Parallel Build capacity<input name="capacity" type="number" min="1" step="1" required value="${data.parallel_capacity}"></label><label>QA allowance (business days)<input name="qa" type="number" min="1" step="1" required value="${data.qa_days}"></label><label>Client review allowance (business days)<input name="review" type="number" min="1" step="1" required value="${data.client_review_days}"></label><fieldset><legend>Complexity scoring</legend><label>Simple maximum score<input name="simple_max" type="number" min="5" max="13" required value="${data.simple_max}"></label><label>Standard maximum score<input name="standard_max" type="number" min="6" max="14" required value="${data.standard_max}"></label></fieldset>${['simple','standard','advanced'].map(tier=>`<fieldset><legend>${esc(tier)} Build guidance</legend><label>Minimum price (${esc(data.currency.toUpperCase())})<input name="${tier}_price_min" type="number" min="0.01" step="0.01" required value="${data.price_guidance[tier][0]/100}"></label><label>Maximum guide price<input name="${tier}_price_max" type="number" min="0.01" step="0.01" required value="${data.price_guidance[tier][1]/100}"></label><label>Minimum business days<input name="${tier}_days_min" type="number" min="1" required value="${data.duration_guidance[tier][0]}"></label><label>Maximum business days<input name="${tier}_days_max" type="number" min="1" required value="${data.duration_guidance[tier][1]}"></label></fieldset>`).join('')}<p>Guidance supports review. Each approved Build retains its own fixed price and duration.</p><button class="btn primary">Save delivery settings</button></form>`}`;
}
main.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.deliveryNav)navigate(button.dataset.deliveryNav);
  if(button.hasAttribute('data-workspace-retry'))refresh();
  if(button.dataset.projectOpen){
    const id=button.dataset.projectOpen,co=button.dataset.company;await portal.workspace(co,{reason:'open-paid-project'});if(state.companyId!==co)return;
    company=co;viewedProject=id;await refresh();await navigate('progress');
  }
});
header.addEventListener('change',async event=>{if(!event.target.matches('[data-package-picker]'))return;viewedProject=event.target.value||null;history.replaceState(null,'',workspaceUrl(location.href,state.companyId,viewedProject));await refresh();await navigate('overview')});
settingsRoot.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,fd=new FormData(form),n=key=>Number(fd.get(key)),button=form.querySelector('button');
  const price_guidance={},duration_guidance={};
  for(const tier of ['simple','standard','advanced']){
    price_guidance[tier]=['min','max'].map(edge=>Math.round(n(`${tier}_price_${edge}`)*100));
    duration_guidance[tier]=['min','max'].map(edge=>n(`${tier}_days_${edge}`));
    if(price_guidance[tier][0]>price_guidance[tier][1]||duration_guidance[tier][0]>duration_guidance[tier][1]){toast('Each guidance maximum must be at least its minimum.');return}
  }
  if(n('standard_max')<=n('simple_max')){toast('Standard scoring must extend beyond Simple scoring.');return}
  button.disabled=true;
  try{const {error}=await sb.from('nexus_delivery_settings').update({diagnosis_price_cents:Math.round(n('price')*100),parallel_capacity:n('capacity'),qa_days:n('qa'),client_review_days:n('review'),simple_max:n('simple_max'),standard_max:n('standard_max'),price_guidance,duration_guidance,updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('singleton',true);if(error)throw error;toast('Delivery settings saved.');await refresh()}
  catch(error){toast(error.message)}finally{button.disabled=false}
});
for(const event of ['nexus:workspace-ready','nexus:diagnosis-changed','nexus:diagnosis-updated','nexus:delivery-changed','relystra:delivery-changed'])window.addEventListener(event,refresh);
window.NexusAdminJourney=Object.freeze({refresh,navigate});
await refresh();await navigate(new URL(location.href).searchParams.get('section')||'overview');
