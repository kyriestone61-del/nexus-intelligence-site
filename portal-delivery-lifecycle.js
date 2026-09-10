// One presentation of the server-authorized workspace facts, shared by both shell owners.
export const deliverySections=[['overview','Overview'],['diagnosis','Diagnosis'],['actions','Actions'],['builds','Roadmap & Builds'],['progress','Progress'],['final-package','Final Package'],['support','Support']];
export function lifecycle(snapshot){
  const s=snapshot||{},a=s.actions||{},d=s.diagnosis||{},p=s.package;
  const result=(stage,actor,title,detail,section,label,blocker=null)=>({stage,actor,title,detail,section,label,blocker,percent:p?.percent??null});
  if(!s.company_id)return result('workspace','ADMIN','Open a client workspace','Choose a client to see its next step.','clients','Open Clients');
  if(s.initial_engagement&&d.status!=='approved'&&p?.stage==='briefs'){
    return result(['ready_for_review','review_required'].includes(d.status)?'diagnosis_review':'diagnosis','ADMIN','Your Full Diagnosis is included','Review the original Discovery and collect any additional evidence. The first Build stays within its accepted scope; additional recommendations are optional.','diagnosis','Continue Full Diagnosis');
  }
  if(p){
    const stages={
      briefs:['ADMIN','Review the Build Briefs','Payment is confirmed. Approve the scope and execution checklist for each Build.','progress','Review Build Briefs'],
      building:['ADMIN','Relystra is building your systems','The approved internal work is underway. Progress reflects the purchased Builds.','progress','View progress'],
      internal_qa:['ADMIN','Check the draft before client review','Verify functionality and delivery materials for every Build.','progress','Review draft readiness'],
      client_review:['CLIENT','Your draft is ready to test','Review each Build and approve it or explain a correction.','progress','Review Draft Package'],
      revisions:['ADMIN','Relystra is reviewing your feedback','Corrections are checked against the purchased scope before work continues.','progress','Review revisions'],
      final_qa:['ADMIN','Complete the final delivery checks','Confirm the approved Builds, tutorials, FAQs and support sources before handoff.','progress','Complete final QA'],
      support:['CLIENT','Your Final Package is ready','Your guides and FAQs are available. Use Support for questions during the seven-day light support period.','final-package','Open Final Package'],
      completed:['NO_ACTION_COMPLETE','Your package is complete','Your Builds, guides, FAQs and support history remain available. Other recommended Builds can be purchased separately.','final-package','Open Final Package'],
    };
    const row=stages[p.stage];
    return row?result(p.stage,...row):result('package_attention','ADMIN','Review this package status','Relystra needs to confirm the next delivery step.','progress','Open progress','Package status needs review');
  }
  if(s.project_type&&s.project_type!=='build_package')return result('legacy','ADMIN','Review the existing engagement','Historical work remains available. New Builds follow the paid package workflow.','progress','Open project records');
  if(d.status!=='approved'){
    if(!d.access)return result('discovery','ADMIN','Start with free Discovery','Your Basic Report identifies one first Build, with clear scope and pricing. Full Diagnosis is included after you accept the first implementation.','discovery','Review Discovery & Basic Report');
    if(['queued','analyzing','processing'].includes(d.status))return result('diagnosis_processing','AI_SYSTEM','Your diagnosis is being prepared','Relystra is analyzing the supplied evidence. Review starts when the analysis finishes.','diagnosis','View diagnosis status');
    if(['ready_for_review','review_required'].includes(d.status))return result('diagnosis_review','ADMIN','Review the diagnosis','Check the findings and approve them before generating pre-build Actions.','diagnosis','Review diagnosis');
    if(['blocked','failed','revision_requested'].includes(d.status))return result('diagnosis_attention','ADMIN','Diagnosis needs attention','Review the execution status and missing evidence before retrying.','diagnosis','Resolve diagnosis blocker','Diagnosis requires review');
    return result('diagnosis','ADMIN','Prepare the diagnosis','Collect the representative inputs and confirm the context before running the analysis.','diagnosis','Continue diagnosis');
  }
  if(a.suggested)return result('action_curation','ADMIN','Review the suggested Actions','Confirm the owner and requested inputs before releasing each Action.','actions','Review Actions');
  if(a.review)return result('action_review','ADMIN','Review the submitted inputs','Accept the responses or request clarification before Build planning.','actions','Review responses');
  if(a.client)return result('actions','CLIENT','Your input is needed','Complete the ready Actions so Relystra can define the right Builds.','actions','Open Actions');
  if(a.admin)return result('actions','ADMIN','Relystra is preparing the Build inputs','Complete the approved preparation Actions and submit them for review.','actions','Continue Actions');
  if(a.ai)return result('actions','ADMIN','Run the approved AI preparation','Relystra starts the approved preparation and reviews its output before Build planning.','actions','Prepare Actions');
  if(a.ai_processing)return result('actions','AI_SYSTEM','AI preparation is running','The output will be submitted for Relystra review.','actions','View Actions');
  if(s.payment_pending)return result('payment','CLIENT','Your plan is ready for payment','Review the saved scope and price. Verified payment activates the Build Package.','builds','Review saved plan');
  if(s.builds?.approved)return result('build_selection','CLIENT','Review your optional next Builds','Keep your included scope or review additional approved recommendations and their separate prices.','builds','Choose Builds');
  return result('build_curation','ADMIN','Prepare the Build recommendations','Use the approved diagnosis and accepted inputs, then confirm scope, price and duration.','builds','Review Build recommendations');
}

export function visibleDeliverySections(snapshot){
  const s=snapshot||{},approved=s.diagnosis?.status==='approved',hasPackage=!!s.package,delivered=['support','completed'].includes(s.package?.stage);
  return deliverySections.filter(([key])=>['overview','diagnosis'].includes(key)||key==='actions'&&approved||key==='builds'&&(approved||hasPackage)||key==='progress'&&!!s.project_id||['final-package','support'].includes(key)&&delivered);
}

export function clientLifecycle(snapshot){
  const next=lifecycle(snapshot);
  if(next.stage==='discovery')return {...next,section:'diagnosis',title:'Your first recommendation starts with Discovery',detail:'Relystra will provide a private Basic Report with one initial Build, its scope and price. Full Diagnosis is included in your first paid implementation.',label:'View next steps'};
  if(next.actor!=='ADMIN')return next;
  const waiting={
    briefs:['Your payment is confirmed','Relystra is reviewing the purchased scope and preparing your Builds.'],
    internal_qa:['Relystra is checking your draft','Functionality and delivery materials are being checked before your review.'],
    final_qa:['Relystra is preparing your Final Package','The approved Builds, tutorials and support materials are receiving their final checks.'],
    diagnosis:['Relystra is preparing your diagnosis','Your supplied evidence and context are being prepared for analysis.'],
    diagnosis_review:['Relystra is reviewing your diagnosis','The findings are being checked before they are shared with you.'],
    diagnosis_attention:['Relystra is checking the diagnosis','The team will resolve the analysis issue or request the evidence it needs.'],
    action_curation:['Relystra is preparing your Actions','Your next preparation steps are being reviewed before they are shared.'],
    actions:['Relystra is preparing the Build inputs','Relystra is completing the approved preparation and will review the results before Build planning.'],
    action_review:['Relystra is reviewing your input','Your submitted responses are being checked. Any clarification will appear in Actions.'],
    build_curation:['Relystra is preparing your Build recommendations','The diagnosis and accepted inputs are being turned into scoped recommendations.'],
  };
  const copy=waiting[next.stage];
  return {...next,...(copy?{title:copy[0],detail:copy[1]}:{}),label:next.section==='progress'?'View progress':next.section==='diagnosis'?'View diagnosis':next.section==='actions'?'View Actions':next.section==='builds'?'View Builds':next.label};
}

export function createLifecycleStore(portal){
  let value=null,sequence=0;
  return {get value(){return value},async refresh(projectId=null){
    const company=portal.state.companyId,version=++sequence;
    value=null;
    if(!company)return null;
    const {data,error}=await portal.sb.rpc('relystra_workspace_snapshot',{p_company_id:company,p_project_id:projectId});
    if(version!==sequence||portal.state.companyId!==company)return null;
    if(error)throw error;
    value=data;if(data?.free_discovery)portal.state.discoveryEvidence=data.free_discovery;return data;
  },invalidate(){sequence++;value=null}};
}

export function mountMobileMenu(nav){
  const sidebar=nav.closest('.sidebar');if(!sidebar||sidebar.querySelector('.relystra-mobile-toggle'))return;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='relystra-mobile-toggle';toggle.textContent='Workspace menu';
  nav.id=nav.id||'relystraSidebarNav';toggle.setAttribute('aria-controls',nav.id);nav.before(toggle);
  const mobile=matchMedia('(max-width:760px)');
  const collapse=value=>{sidebar.classList.toggle('relystra-menu-collapsed',value);toggle.setAttribute('aria-expanded',String(!value))};
  toggle.onclick=()=>collapse(!sidebar.classList.contains('relystra-menu-collapsed'));
  nav.addEventListener('click',event=>{if(mobile.matches&&event.target.closest('[data-relystra-nav],[data-client-view]')){collapse(true);toggle.focus()}});
  mobile.addEventListener('change',()=>collapse(mobile.matches));collapse(mobile.matches);
}
