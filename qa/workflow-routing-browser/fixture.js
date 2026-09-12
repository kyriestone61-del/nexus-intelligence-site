import {journeyMarkup,journeyPagerMarkup,journeySteps,workflowStepIntroMarkup} from '/portal-journey-steps.js?v=20260911-free-diagnosis-v2';
import {mountTranscriptStage} from '/portal-transcript-stage.js?v=20260911-free-diagnosis-v4';

const reportItem=(text,confidence='supported')=>({text,confidence});
const discovery={
  id:'qa-discovery',revision:2,
  documents:[
    {id:'qa-doc-1',file_name:'Discovery Call Transcript — September 9.docx',mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',category:'Discovery Transcript',created_at:'2026-09-09T15:00:00Z',state:'parsed',chunk_count:3,chunks_processed:3},
    {id:'qa-doc-2',file_name:'Owner Operations Notes.txt',mime_type:'text/plain',category:'Discovery Material',created_at:'2026-09-09T15:04:00Z',state:'parsed',chunk_count:1,chunks_processed:1}
  ],
  reports:[{id:'qa-report-1',version:1,status:'complete',evidence_revision:2,document_ids:['qa-doc-1','qa-doc-2'],source_ids:['qa-source-1','qa-source-2'],created_at:'2026-09-09T15:00:00Z',completed_at:'2026-09-09T15:12:00Z',report:{
    coverage:{documents:2,logical_documents:2},
    executive_summary:[
      {label:'reviewed',text:'Relystra reviewed the discovery call and owner notes covering appointments, payments, bookkeeping, and month-end reporting.',source_refs:['qa-source-1','qa-source-2']},
      {label:'working_well',text:'The owner has a consistent month-end review point and understands which source systems contain the underlying records.',source_refs:['qa-source-1']},
      {label:'primary_friction',text:'Operational visibility depends on manual reconciliation across separate appointment, payment, and bookkeeping systems.',source_refs:['qa-source-1','qa-source-2']},
      {label:'overall_opportunity',text:'A controlled exception-based review could reduce repeated checking while keeping financial decisions with the owner.',source_refs:['qa-source-1']},
      {label:'deeper_investigation',text:'The time spent reconciling and the number of monthly exceptions have not yet been measured.',source_refs:['qa-source-2']}
    ],
    diagnosis_snapshot:[
      {area:'Administration',condition:'moderate_friction',priority:'medium',source_refs:['qa-source-1']},
      {area:'Operations',condition:'stable',priority:'low',source_refs:['qa-source-1']},
      {area:'Information / Documentation',condition:'moderate_friction',priority:'medium',source_refs:['qa-source-2']},
      {area:'Reporting / Visibility',condition:'needs_attention',priority:'high',source_refs:['qa-source-1','qa-source-2']}
    ],
    business_context:[{...reportItem('Moon Wax uses appointment, payment, and bookkeeping tools across its current service workflow.'),source_refs:['qa-source-1']}],
    current_processes:[{...reportItem('Appointment and payment records are reconciled through separate systems.'),area:'Operations',source_refs:['qa-source-1']}],
    observed_problems:[
      {...reportItem('Monthly bookkeeping visibility depends on manual reconciliation.'),area:'Reporting / Visibility',source_refs:['qa-source-1']},
      {...reportItem('Exceptions are recorded in different places before the owner reviews them.'),area:'Information / Documentation',source_refs:['qa-source-2']}
    ],
    key_findings:[
      {...reportItem('Operational reporting relies on owner-led manual checks.'),title:'Owner-led reporting control',evidence_summary:'Both discovery sources describe the owner as the final month-end checkpoint.',business_impact:'Reporting takes longer and exceptions may remain unresolved until the owner reviews them.',priority:'high',recommended_direction:'Validate the month-end handoff and determine which checks can be presented as exceptions.',source_refs:['qa-source-1','qa-source-2']},
      {...reportItem('Separate source systems make monthly exceptions harder to isolate.'),title:'Fragmented exception visibility',evidence_summary:'Appointment, payment, and bookkeeping records are reviewed in separate systems.',business_impact:'Time is spent locating and comparing records instead of resolving the exceptions themselves.',priority:'high',recommended_direction:'Define one review view for exceptions without replacing source-of-record systems.',source_refs:['qa-source-1']},
      {...reportItem('The current process has a repeatable review point but no measured operating baseline.'),title:'Unmeasured review effort',evidence_summary:'The review cadence is described, but duration and exception volume are not documented.',business_impact:'Relystra cannot yet quantify the value or scope of a change.',priority:'medium',recommended_direction:'Measure two representative month-end cycles before defining implementation scope.',source_refs:['qa-source-2']}
    ],
    opportunity_areas:[
      {...reportItem('Use a controlled exception review to focus owner attention on records that need a decision.'),title:'Exception-based reconciliation',potential_benefit:'Reduce repeated manual checking while preserving owner control.',priority:'high',source_refs:['qa-source-1']},
      {...reportItem('Standardize where unresolved month-end items and owners are recorded.'),title:'Shared exception ownership',potential_benefit:'Make follow-up responsibility and status easier to see.',priority:'medium',source_refs:['qa-source-2']}
    ],
    quick_wins:[
      {...reportItem('Use one agreed checklist for the existing month-end review.'),title:'Standardize the review checklist',potential_benefit:'Improve consistency without changing source systems.',source_refs:['qa-source-1']},
      {...reportItem('Record each unresolved exception, owner, and next action in one temporary view.'),title:'Clarify exception ownership',potential_benefit:'Reduce follow-up ambiguity while the deeper diagnosis is completed.',source_refs:['qa-source-2']}
    ],
    missing_information:[
      {...reportItem('A measured baseline for reporting time is not yet available.','insufficient_information'),what_to_review:'Measure preparation and review time for two representative month-end cycles.',why_it_matters:'A baseline is needed before estimating benefit or implementation scope.',source_refs:[]},
      {...reportItem('The normal monthly volume and type of exceptions are not documented.','insufficient_information'),what_to_review:'Sample recent reconciliations and categorize the exceptions that required owner action.',why_it_matters:'The exception pattern determines whether workflow design or automation is appropriate.',source_refs:[]}
    ],
    evidence_confidence:[{...reportItem('The primary finding is supported by both supplied discovery sources.'),source_refs:['qa-source-1','qa-source-2']}],
    contradictions:[],
    evidence_ledger:[{source_id:'qa-source-1',extraction:{observations:[{statement:'Monthly review requires a manual check.',excerpt:'I check it manually at month end.'}]}}]
  }}],
  reviews:[]
};
const reportState=new URL(location.href).searchParams.get('reportState');
if(reportState==='empty')discovery.reports=[];
if(reportState==='processing'){
  discovery.reports=[];
  discovery.documents[1].state='parsing';
}
if(reportState==='generating')discovery.reports=[{...discovery.reports[0],status:'generating',report:null,completed_at:null}];
if(reportState==='failed')discovery.reports=[{...discovery.reports[0],status:'failed',report:null,completed_at:null,error:'The evidence could not be assembled into a report. Your uploaded sources remain available.'}];
const snapshot={company_id:'qa-company',project_id:'qa-engagement',project_type:'build_package',workflow:{current_step:3,completed:false},diagnosis:{access:false,status:null},package:null,projects:[]};
const state={companyId:'qa-company',companies:[{id:'qa-company',name:'Moon Wax Co.'}],user:{id:'qa-user'},admin:false,previewReadOnly:false,docs:discovery.documents.map(document=>({...document,company_id:'qa-company',project_id:'qa-engagement'}))};
let qaDocumentSequence=1;
const portal={state,sb:{
  rpc:async(name,args={})=>{if(name!=='relystra_discovery_workspace')return {data:null,error:null};if(['verified','correction_requested'].includes(args.p_action))discovery.reviews.push({run_id:args.p_run_id,decision:args.p_action,note:args.p_note||'',created_at:new Date().toISOString()});if(args.p_action==='attach'){discovery.revision+=1;const saved=state.docs.find(document=>document.id===args.p_document_id);if(saved)discovery.documents.unshift({...saved,state:'parsed',chunk_count:1,chunks_processed:1})}return {data:structuredClone(discovery),error:null}},
  storage:{from:()=>({upload:async()=>({data:{},error:null}),remove:async()=>({data:{},error:null}),createSignedUrl:async()=>({data:{signedUrl:'#'},error:null})})},
  from:()=>({insert:row=>({select:()=>({single:async()=>({data:{id:`qa-doc-${++qaDocumentSequence}`,created_at:new Date().toISOString(),...row},error:null})})})}),
  functions:{invoke:async()=>({data:{ok:true},error:null})}
},runtime:{storage:{get:()=>null,set:()=>{}}}};
const roots={transcript:document.querySelector('[data-route="transcript"]'),freeDiagnosis:document.querySelector('[data-route="free-diagnosis"]'),reviewFindings:document.querySelector('[data-route="review-findings"]')};
const component=mountTranscriptStage(roots,portal,{navigate:key=>activate(key)});
const keys=new Set(journeySteps.map(([key])=>key));
let active='transcript';

const fixtureStages={
  diagnosis:{title:'Full Diagnosis & Approval',description:'Initiate the deeper diagnosis, review its evidence-backed result, and record the decision that unlocks Required Inputs.',statusLabel:'Diagnosis status',statusDetail:'Approved',nextTitle:'Required Inputs',body:'<section class="relystra-workflow-primary-section"><div class="relystra-section-intro"><span>Approved diagnosis</span><h2>Owner-led reconciliation is the root constraint.</h2><p>The deeper review confirms that three disconnected systems create the highest-risk monthly handoff.</p></div><button class="btn primary" type="button" data-qa-route="actions">Continue to Required Inputs →</button></section>'},
  actions:{title:'Required Inputs',description:'See exactly what Relystra still needs, what is complete, and which items block Build planning.',statusLabel:'Input status',statusDetail:'2 missing · 3 complete',nextTitle:'Recommended Builds',body:'<section class="relystra-input-summary"><div><span>Required now</span><strong>2</strong><small>Answer or upload</small></div><div><span>With Relystra</span><strong>1</strong><small>Under review</small></div><div><span>Blocked / upcoming</span><strong>1</strong><small>Waiting on access</small></div><div><span>Completed</span><strong>3</strong><small>Preserved</small></div></section><article class="relystra-build-card"><h2>Monthly reconciliation sample</h2><p>Upload one representative month with unrelated personal data removed.</p><button class="btn primary" type="button" data-fixture-complete>Upload requested file</button><p role="status" data-fixture-status></p></article>'},
  builds:{title:'Recommended Builds',description:'Review each diagnosis-led Build independently, including outcome, scope, complexity, timing, and price.',statusLabel:'Diagnosis translated',statusDetail:'2 recommendations available',nextTitle:'Agree Scope & Payment',body:'<section class="relystra-workflow-primary-section"><div class="relystra-section-intro"><span>Recommended next</span><h2>Choose improvements independently.</h2><p>The included reconciliation control remains separate from optional reporting automation.</p></div><div class="relystra-build-grid"><article class="relystra-build-card"><h3>Reconciliation Control</h3><p>Standard complexity · 8–10 business days</p><strong>$4,800 fixed</strong></article><article class="relystra-build-card"><h3>Exception Dashboard</h3><p>Simple complexity · 4–6 business days</p><strong>$2,400 fixed</strong></article></div></section>'},
  scope:{title:'Agree Scope & Payment',description:'Confirm selected Builds, complexity, scope, duration, pricing, totals, agreement, and payment state.',statusLabel:'Commercial decision',statusDetail:'1 plan awaiting payment',nextTitle:'Build & Quality Checks',body:'<section class="relystra-step-primary-action"><div><span>Scope ready</span><h2>Reconciliation Control</h2><p>Fixed scope · Standard complexity · 8–10 business days · $4,800 total</p></div><button class="btn primary" type="button" data-fixture-complete>Review agreement & pay</button></section>'},
  progress:{title:'Build & Quality Checks',description:'Follow production, internal QA, and final checks without mixing client feedback into the work queue.',statusLabel:'Production status',statusDetail:'Internal QA · 72%',nextTitle:'Client Review',body:'<section class="relystra-workflow-primary-section"><div class="relystra-section-intro"><span>Build in progress</span><h2>Reconciliation Control</h2><p>Functionality and input validation have passed. Permission and mobile usability checks remain.</p></div><progress max="100" value="72">72%</progress></section>'},
  review:{title:'Client Review',description:'Review the delivered draft, record feedback by Build, request scoped revisions, or approve the work.',statusLabel:'Review status',statusDetail:'1 of 2 decisions recorded',nextTitle:'Final Handoff',body:'<section class="relystra-review-brief"><div><span>Decision required</span><h2>Test against the agreed outcome.</h2><p>Approve what is ready or include specific revision feedback.</p></div><dl><div><dt>Drafts</dt><dd>2</dd></div><div><dt>Reviewed</dt><dd>1</dd></div><div><dt>Remaining</dt><dd>1</dd></div></dl></section>'},
  'final-package':{title:'Final Handoff',description:'Access approved Builds, usage guidance, supporting files, and final delivery material in one durable handoff.',statusLabel:'Handoff status',statusDetail:'Ready',nextTitle:'Completion & Support',body:'<section class="relystra-workflow-primary-section"><div class="relystra-section-intro"><span>Delivered assets</span><h2>Approved Builds & instructions</h2><p>Reconciliation Control, usage guide, QA record, and supporting files are ready.</p></div><button class="btn secondary" type="button" data-fixture-complete>Open Build</button></section>'},
  support:{title:'Completion & Support',description:'The engagement concludes with durable assets, support resources, instructions, and a clear final status.',statusLabel:'Engagement status',statusDetail:'Complete',nextTitle:'Final workflow stage',body:'<section class="relystra-workflow-primary-section"><div class="relystra-section-intro"><span>Delivered assets</span><h2>Your final Builds remain available.</h2><p>Reconciliation Control · usage guide · QA record · supporting files</p></div><button class="btn secondary" type="button" data-qa-route="final-package">Open Final Handoff →</button></section><section class="relystra-support-center"><div><span>Support active</span><h2>Ask about a delivered Build.</h2><p>Included light support ends Sep 17, 2026.</p></div><form data-fixture-form><label>Your question<textarea required></textarea></label><button class="btn primary">Ask Relystra</button><p role="status" data-fixture-status></p></form></section>'}
};
for(const [key,stage] of Object.entries(fixtureStages)){const root=document.querySelector(`[data-route="${key}"]`);root.innerHTML=workflowStepIntroMarkup(key,stage)+stage.body}

async function activate(key,{historyMode='push'}={}){
  active=keys.has(key)?key:'transcript';
  document.querySelectorAll('[data-route]').forEach(section=>section.classList.toggle('active',section.dataset.route===active));
  document.getElementById('qaJourney').innerHTML=journeyMarkup(snapshot,{active,attribute:'data-qa-route'});
  document.getElementById('qaPager').innerHTML=journeyPagerMarkup(active,snapshot,{attribute:'data-qa-route'});
  if(['transcript','free-diagnosis','review-findings'].includes(active))await component.refresh(snapshot);
  const url=new URL(location.href);url.searchParams.set('company','qa-company');url.searchParams.set('project','qa-engagement');url.searchParams.set('section',active);
  if(historyMode!=='none'&&url.href!==location.href)history[historyMode==='replace'?'replaceState':'pushState'](null,'',url.pathname+url.search);
  window.scrollTo(0,0);
}

document.addEventListener('click',event=>{const button=event.target.closest('[data-qa-route]');if(button)activate(button.dataset.qaRoute);const fixtureButton=event.target.closest('[data-fixture-complete]');if(fixtureButton){const status=fixtureButton.parentElement.querySelector('[data-fixture-status]');if(status)status.textContent='Fixture action completed and preserved.'}});
document.addEventListener('submit',event=>{if(!event.target.matches('[data-fixture-form]'))return;event.preventDefault();event.target.querySelector('[data-fixture-status]').textContent='Question saved for Relystra review.'});
window.addEventListener('popstate',()=>activate(new URL(location.href).searchParams.get('section')||'transcript',{historyMode:'none'}));
await activate(new URL(location.href).searchParams.get('section')||'transcript',{historyMode:'replace'});
window.RELYSTRA_WORKFLOW_QA={activate,get active(){return active},snapshot:()=>structuredClone(snapshot)};
