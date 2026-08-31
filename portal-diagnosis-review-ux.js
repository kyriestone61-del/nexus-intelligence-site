const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');

const {sb,state,toast}=portal;
let routeBusy=false;
let compactQueued=false;

function ensureStyles(){
  if(document.getElementById('diagnosisCompactReviewStyles'))return;
  const style=document.createElement('style');
  style.id='diagnosisCompactReviewStyles';
  style.textContent=`
    .diagnosis-review-card{max-width:920px!important}
    #diagnosisReviewBody.diagnosis-compact-issue>.note.error,
    #diagnosisReviewBody.diagnosis-compact-issue>.diagnosis-review-section,
    #diagnosisReviewBody.diagnosis-compact-issue>.diagnosis-pilot,
    #diagnosisReviewBody.diagnosis-compact-issue>.diagnosis-review-actions{display:none!important}
    .diagnosis-compact-summary{padding:16px 18px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.035);margin:10px 0 14px}
    .diagnosis-compact-summary h3{margin:5px 0 6px;font-size:20px}
    .diagnosis-compact-summary p{margin:0;color:var(--muted,#a8a8b8)}
    .diagnosis-manual-fallback.diagnosis-compact-fallback{padding:16px 18px!important;margin:0!important}
    .diagnosis-manual-fallback.diagnosis-compact-fallback h3{margin:5px 0 8px}
    .diagnosis-manual-fallback.diagnosis-compact-fallback .field{margin-top:12px}
    .diagnosis-manual-fallback.diagnosis-compact-fallback textarea{min-height:130px}
    .diagnosis-compact-highlights{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
    .diagnosis-compact-highlight{padding:13px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.025)}
    .diagnosis-compact-highlight b{display:block;margin-bottom:5px}
    .diagnosis-compact-highlight p{margin:0;color:var(--muted,#a8a8b8);font-size:13px}
    .diagnosis-compact-details{margin:12px 0;border:1px solid rgba(255,255,255,.1);border-radius:12px;overflow:hidden}
    .diagnosis-compact-details>summary{cursor:pointer;padding:13px 14px;font-weight:700}
    .diagnosis-compact-details-body{padding:0 12px 12px}
    #diagnosisReviewBody.diagnosis-compact-result>.diagnosis-review-actions{margin-top:12px}
    #diagnosisReviewBody.diagnosis-compact-result>.diagnosis-review-actions>p.small:last-child{display:none}
    @media(max-width:720px){.diagnosis-compact-highlights{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

const text=v=>String(v||'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hasResult=run=>{
  const r=run?.analysis_result;
  return !!r&&(typeof r==='string'?!!r.trim():Object.keys(r||{}).length>0);
};

function diagnosisJourneyButton(button){
  if(!button?.closest?.('#adminJourneyRoot'))return false;
  const step=button.closest('.journey-step');
  const stepTitle=text(step?.querySelector('h3')?.textContent);
  const label=text(button.textContent).toLowerCase();
  return stepTitle==='Diagnose'||label.includes('diagnosis');
}

async function latestRun(){
  if(!state.companyId)return null;
  const {data,error}=await sb.from('nexus_diagnosis_runs')
    .select('id,status,analysis_result,execution_error,created_at')
    .eq('company_id',state.companyId)
    .order('created_at',{ascending:false})
    .limit(1);
  if(error)throw error;
  return data?.[0]||null;
}

async function openIntake(){
  if(!document.getElementById('section-intake')){
    const repair=window.NexusJourneyReliability?.ensureAdminIntake;
    if(repair)await repair({open:true,quiet:true});
  }
  const nav=document.querySelector('.side-nav button[data-section="intake"]');
  if(nav){nav.click();return true}
  const section=document.getElementById('section-intake');
  if(section){
    document.querySelectorAll('.section').forEach(node=>node.classList.toggle('active',node===section));
    window.scrollTo({top:0,left:0,behavior:'auto'});
    return true;
  }
  return false;
}

async function clickRunAction(run){
  const escaped=CSS.escape(run.id);
  for(let i=0;i<24;i++){
    const review=document.querySelector(`.diagnosis-review-btn[data-id="${escaped}"]`);
    if(review){review.click();return true}
    if(['ready_for_analysis','blocked','revision_requested'].includes(run.status)){
      const retry=document.querySelector(`.diagnosis-retry-btn[data-id="${escaped}"]`);
      if(retry&&run.status==='ready_for_analysis'){retry.click();return true}
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return false;
}

async function routeDiagnosis(button){
  if(routeBusy)return;
  routeBusy=true;
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='Opening diagnosis…'}
  try{
    const run=await latestRun();
    const opened=await openIntake();
    if(!opened)throw new Error('Discovery & Diagnosis could not be opened.');
    if(!run){
      toast?.('No diagnosis exists yet. Queue the diagnosis from Step 4 on this page.');
      return;
    }
    const actionOpened=await clickRunAction(run);
    if(!actionOpened){
      const card=[...document.querySelectorAll('.diagnosis-run-card')].find(node=>node.querySelector(`[data-id="${CSS.escape(run.id)}"]`));
      card?.scrollIntoView({block:'center'});
      toast?.(hasResult(run)?'The diagnosis is saved. Open the highlighted diagnosis run to review it.':'This diagnosis has no result yet. Review the diagnosis issue shown here.');
    }
  }catch(error){
    console.error('Diagnosis deep-link failed',error);
    toast?.(error.message||'Diagnosis could not be opened.');
  }finally{
    routeBusy=false;
    if(button?.isConnected){button.disabled=false;button.textContent=original}
  }
}

function directChildren(body,selector){return [...body.children].filter(node=>node.matches?.(selector))}
function summaryLabel(section){return text(section.querySelector('summary')?.textContent)}
function firstItemTitle(section){return text(section?.querySelector('.diagnosis-review-item b')?.textContent)}
function firstItemCopy(section){return text(section?.querySelector('.diagnosis-review-item p')?.textContent)}

function compactFallback(panel){
  if(!panel||panel.querySelector('.diagnosis-compact-fallback-marker'))return;
  const download=panel.querySelector('[data-manual-download]');
  const copy=panel.querySelector('[data-manual-copy]');
  const save=panel.querySelector('[data-manual-save]');
  const textarea=panel.querySelector('[data-manual-result]');
  const id=copy?.dataset.manualCopy||download?.dataset.manualDownload||save?.dataset.manualSave||textarea?.dataset.manualResult;
  if(!id)return;
  const safeId=esc(id),hasDownload=!!download;
  panel.classList.add('diagnosis-compact-fallback');
  panel.innerHTML=`<span class="diagnosis-compact-fallback-marker" hidden></span><div class="kicker">Next action</div><h3>Finish diagnosis with ChatGPT</h3><p class="small">Use the saved transcript and prepared prompt, then paste the diagnosis result below.</p><div class="actions">${hasDownload?`<button class="btn secondary" data-manual-download="${safeId}" type="button">Download transcript</button>`:''}<button class="btn secondary" data-manual-copy="${safeId}" type="button">Copy prompt</button></div><div class="field"><label>Paste diagnosis result</label><textarea data-manual-result="${safeId}" rows="6" placeholder="Paste the ChatGPT diagnosis here..."></textarea></div><div class="actions"><button class="btn primary" data-manual-save="${safeId}" type="button">Save for review →</button></div>`;
}

function compactIssue(body){
  body.classList.add('diagnosis-compact-issue');
  body.classList.remove('diagnosis-compact-result');
  if(!body.querySelector('.diagnosis-compact-summary')){
    const summary=document.createElement('section');
    summary.className='diagnosis-compact-summary';
    summary.innerHTML='<div class="kicker">Diagnosis not generated</div><h3>The analysis did not run.</h3><p>Your transcript and evidence are saved. Complete the diagnosis with the fallback below.</p>';
    const meta=body.querySelector('.diagnosis-review-meta');
    meta?.after(summary);
    if(!meta)body.prepend(summary);
  }
  compactFallback(body.querySelector('.diagnosis-manual-fallback'));
}

function compactResult(body){
  if(body.querySelector('.diagnosis-compact-details'))return;
  body.classList.add('diagnosis-compact-result');
  body.classList.remove('diagnosis-compact-issue');
  const sections=directChildren(body,'.diagnosis-review-section');
  if(!sections.length)return;
  sections.forEach(section=>section.removeAttribute('open'));
  const bottlenecks=sections.find(section=>summaryLabel(section)==='Bottlenecks');
  const opportunities=sections.find(section=>summaryLabel(section).includes('Ranked AI'));
  const pilot=directChildren(body,'.diagnosis-pilot')[0]||null;
  const bottleneckTitle=firstItemTitle(bottlenecks);
  const bottleneckCopy=firstItemCopy(bottlenecks);
  const opportunityTitle=firstItemTitle(opportunities);
  const opportunityCopy=firstItemCopy(opportunities);
  const pilotTitle=text(pilot?.querySelector('h3')?.textContent);
  const pilotCopy=text(pilot?.querySelector('p')?.textContent);
  if(bottleneckTitle||opportunityTitle||pilotTitle){
    const highlights=document.createElement('div');
    highlights.className='diagnosis-compact-highlights';
    highlights.innerHTML=`${bottleneckTitle?`<div class="diagnosis-compact-highlight"><div class="kicker">Primary issue</div><b>${esc(bottleneckTitle)}</b>${bottleneckCopy?`<p>${esc(bottleneckCopy)}</p>`:''}</div>`:''}${opportunityTitle?`<div class="diagnosis-compact-highlight"><div class="kicker">Best opportunity</div><b>${esc(opportunityTitle)}</b>${opportunityCopy?`<p>${esc(opportunityCopy)}</p>`:''}</div>`:''}${pilotTitle?`<div class="diagnosis-compact-highlight"><div class="kicker">Recommended first move</div><b>${esc(pilotTitle)}</b>${pilotCopy?`<p>${esc(pilotCopy)}</p>`:''}</div>`:''}`;
    const executive=body.querySelector('.diagnosis-executive');
    executive?.after(highlights);
    if(!executive)body.querySelector('.diagnosis-review-meta')?.after(highlights);
  }
  const details=document.createElement('details');
  details.className='diagnosis-compact-details';
  details.innerHTML='<summary>Full diagnosis details</summary><div class="diagnosis-compact-details-body"></div>';
  const detailBody=details.querySelector('.diagnosis-compact-details-body');
  sections.forEach(section=>detailBody.appendChild(section));
  if(pilot)detailBody.appendChild(pilot);
  const actions=directChildren(body,'.diagnosis-review-actions').at(-1)||null;
  if(actions)actions.before(details);else body.appendChild(details);
}

function compactModal(){
  ensureStyles();
  const modal=document.getElementById('diagnosisReviewModal');
  const body=document.getElementById('diagnosisReviewBody');
  if(!modal?.classList.contains('open')||!body)return;
  const heading=modal.querySelector('.diagnosis-review-card h2');
  if(heading)heading.textContent='Diagnosis Review';
  const fallback=body.querySelector('.diagnosis-manual-fallback');
  const generated=!!body.querySelector('.diagnosis-executive')||directChildren(body,'.diagnosis-review-section').some(section=>section.querySelector('.diagnosis-review-item'));
  if(fallback){compactIssue(body);return}
  if(generated){compactResult(body);return}
}

function scheduleCompact(){
  if(compactQueued)return;
  compactQueued=true;
  requestAnimationFrame(()=>{compactQueued=false;compactModal()});
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('button');
  if(!diagnosisJourneyButton(button))return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  routeDiagnosis(button);
},true);

const observer=new MutationObserver(scheduleCompact);
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(scheduleCompact,80));
setTimeout(scheduleCompact,250);

window.NexusDiagnosisReviewUX={routeDiagnosis,compactModal};
