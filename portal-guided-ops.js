const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {$}=portal;
let scheduled=false;

const choices={
  approvals:[
    ['production_launch','Production launch / go-live'],
    ['workflow_design','Workflow or solution design'],
    ['automation_permission','Automation action permission'],
    ['integration_access','System integration / access'],
    ['client_communication','Client-facing communication'],
    ['scope_change','Scope or implementation change'],
    ['data_handling','Data handling / retention decision'],
    ['training_handoff','Training / handoff acceptance'],
    ['other','Other explicit client decision']
  ],
  automations:[
    ['lead_capture','Lead capture & routing'],
    ['follow_up','Follow-up & reminders'],
    ['email_comms','Email / communication workflow'],
    ['crm_updates','CRM updates & data entry'],
    ['scheduling','Scheduling / intake'],
    ['reporting','Reporting / KPI automation'],
    ['document_processing','Document processing'],
    ['customer_support','Customer support / FAQ'],
    ['alerts','Internal alerts & escalation'],
    ['ai_agent','AI agent workflow'],
    ['other','Other automation']
  ],
  improvements:[
    ['time_saved','Time saved'],
    ['response_speed','Faster response time'],
    ['manual_steps','Fewer manual steps'],
    ['errors','Fewer errors / less rework'],
    ['conversion','Higher conversion / sales'],
    ['cost_reduction','Cost reduction'],
    ['revenue','Revenue increase'],
    ['throughput','Higher throughput / capacity'],
    ['customer_experience','Better customer experience'],
    ['visibility','Better reporting / visibility'],
    ['risk','Lower risk / stronger compliance'],
    ['other','Other measurable improvement']
  ],
  milestones:[
    ['discovery_complete','Discovery complete'],
    ['evidence_received','Required evidence received'],
    ['diagnosis_complete','Diagnosis complete'],
    ['design_approved','Solution design approved'],
    ['build_complete','Build complete'],
    ['qaqc_complete','QA/QC complete'],
    ['uat_complete','Client acceptance test complete'],
    ['production_launch','Production launch'],
    ['training_complete','Training complete'],
    ['baseline_established','KPI baseline established'],
    ['optimization_review','Optimization review'],
    ['other','Other milestone']
  ]
};

function options(rows){return rows.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}
function labelFor(rows,value){return rows.find(x=>x[0]===value)?.[1]||rows[0]?.[1]||''}
function hideField(input){const field=input?.closest('.field');if(field){field.classList.add('guided-source-field');field.setAttribute('aria-hidden','true')}}
function insertBeforeField(input,html){const field=input?.closest('.field');if(!field)return null;const wrap=document.createElement('div');wrap.innerHTML=html.trim();const node=wrap.firstElementChild;field.before(node);return node}
function syncSelect(select,input,rows){if(!select||!input)return;const update=()=>{input.value=labelFor(rows,select.value);input.dispatchEvent(new Event('input',{bubbles:true}))};select.onchange=update;update()}

function approvalGuide(){
 const root=$('opsApprovalsRoot');if(!root||$('approvalTypeGuide'))return;
 const toolbar=root.querySelector('.ops-toolbar');if(!toolbar)return;
 const guide=document.createElement('div');guide.id='approvalTypeGuide';guide.className='guided-help-panel';guide.innerHTML=`<div><b>What belongs in Approvals to Send?</b><span>Use this only when the client must make an explicit decision before Nexus should proceed.</span></div><div class="guided-help-grid"><span><b>Launch</b>Put a new automation or workflow into production.</span><span><b>Design</b>Approve the future-state workflow or implementation plan.</span><span><b>Permission</b>Allow an automation to send, update, create, or take another meaningful action.</span><span><b>Access</b>Approve a connection, integration, or system-access boundary.</span><span><b>Client-facing output</b>Approve messages, campaigns, forms, or other material customers will see.</span><span><b>Scope / handoff</b>Approve a material implementation change, training acceptance, or handoff.</span></div>`;
 toolbar.after(guide);
}

function enhanceApprovals(){
 const form=$('opsApprovalForm'),input=$('opsApprovalTitle');if(!form||!input)return;
 approvalGuide();
 let select=$('guidedApprovalType');
 if(!select){const node=insertBeforeField(input,`<div class="field guided-choice-field"><label>Approval type</label><select id="guidedApprovalType">${options(choices.approvals)}</select><div class="guided-field-help">Choose the decision the client is being asked to make.</div></div>`);select=node?.querySelector('select');hideField(input)}
 syncSelect(select,input,choices.approvals);
 const desc=$('opsApprovalDescription');const label=desc?.closest('.field')?.querySelector('label');if(label)label.textContent='Description / context (optional)';if(desc)desc.placeholder='Add only the context the client needs to make the decision.';
}

function enhanceAutomations(){
 const form=$('opsAutomationForm'),input=$('opsAutomationName');if(!form||!input)return;
 let select=$('guidedAutomationType');
 if(!select){const node=insertBeforeField(input,`<div class="field guided-choice-field"><label>Automation type</label><select id="guidedAutomationType">${options(choices.automations)}</select><div class="guided-field-help">Pick the closest business function. Add detail below only when useful.</div></div>`);select=node?.querySelector('select');hideField(input)}
 syncSelect(select,input,choices.automations);
 const purpose=$('opsAutomationPurpose');const label=purpose?.closest('.field')?.querySelector('label');if(label)label.textContent='Description / business purpose (optional)';if(purpose)purpose.placeholder='Example: Route website leads to the right salesperson and create the CRM record automatically.';
}

function enhanceImprovements(){
 const form=$('metricForm'),input=$('metricName');if(!form||!input)return;
 let select=$('guidedImprovementType');
 if(!select){const node=insertBeforeField(input,`<div class="field guided-choice-field"><label>Improvement type</label><select id="guidedImprovementType">${options(choices.improvements)}</select><div class="guided-field-help">Select what changed. Use the fields below to document baseline, current result, and target.</div></div>`);select=node?.querySelector('select');hideField(input)}
 syncSelect(select,input,choices.improvements);
 const method=$('metricMethod'),label=method?.closest('.field')?.querySelector('label');if(label)label.textContent='Description / measurement note (optional)';if(method)method.placeholder='Optional: explain what changed, how it is measured, or any important assumptions.';
 const modal=form.closest('.modal-card');const heading=modal?.querySelector('h2');if(heading)heading.textContent='Record an improvement';
}

function enhanceMilestones(){
 const form=$('milestoneForm'),input=$('milestoneTitle');if(!form||!input)return;
 let select=$('guidedMilestoneType');
 if(!select){const node=insertBeforeField(input,`<div class="field guided-choice-field"><label>Milestone type</label><select id="guidedMilestoneType">${options(choices.milestones)}</select><div class="guided-field-help">Use milestones for major engagement checkpoints, not every task.</div></div>`);select=node?.querySelector('select');hideField(input)}
 syncSelect(select,input,choices.milestones);
 const desc=$('milestoneDescription'),label=desc?.closest('.field')?.querySelector('label');if(label)label.textContent='Description (optional)';if(desc)desc.placeholder='Optional: add the specific result, acceptance condition, or context for this client.';
}

function enhanceSectionCopy(){
 const auto=$('opsAutomationsRoot')?.querySelector('.ops-section-copy');if(auto)auto.textContent='Register the business function, then add optional context about what it does, the systems involved, and where human control remains.';
 const metrics=$('section-metrics')?.querySelector('.toolbar p.small');if(metrics)metrics.textContent='Track measurable business changes using a standard improvement type, baseline, current result, and target.';
 const timeline=$('section-timeline')?.querySelector('.toolbar');if(timeline&&!$('guidedMilestoneNote')){const note=document.createElement('p');note.id='guidedMilestoneNote';note.className='small guided-toolbar-note';note.textContent='Projects show the engagement. Milestones mark major checkpoints such as diagnosis, QA/QC, launch, training, and optimization.';timeline.querySelector('div')?.appendChild(note)}
}

function enhance(){scheduled=false;approvalGuide();enhanceApprovals();enhanceAutomations();enhanceImprovements();enhanceMilestones();enhanceSectionCopy()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance)}
function reapply(){schedule();setTimeout(schedule,120);setTimeout(schedule,450)}

window.addEventListener('load',reapply);
window.addEventListener('focus',reapply);
document.addEventListener('click',reapply,true);
document.addEventListener('change',reapply,true);
document.addEventListener('submit',reapply,true);
document.addEventListener('nexus:portal-rendered',reapply);
setTimeout(reapply,120);setTimeout(reapply,700);setTimeout(reapply,1600);
