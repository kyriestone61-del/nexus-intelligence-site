import test from 'node:test';
import assert from 'node:assert/strict';
import {freeReportMarkup,freeSections} from '../../portal-discovery-evidence.js';
import {freeDiagnosisFilename,freeReportStateMarkup} from '../../portal-free-diagnosis-report.js';

const item=(text,confidence='strongly_indicated',extra={})=>({text,confidence,source_refs:['source-1'],...extra});
const report={
  coverage:{documents:2,logical_documents:2},
  executive_summary:[
    {label:'reviewed',text:'Appointment, payment, bookkeeping, and month-end review workflows were reviewed.',source_refs:['source-1']},
    {label:'working_well',text:'The owner has a repeatable monthly review point.',source_refs:['source-1']},
    {label:'primary_friction',text:'Manual reconciliation is the main constraint on timely visibility.',source_refs:['source-1']},
    {label:'overall_opportunity',text:'A controlled exception review could reduce repeated checking.',source_refs:['source-1']},
    {label:'deeper_investigation',text:'The time baseline and exception volume still need validation.',source_refs:['source-1']}
  ],
  diagnosis_snapshot:[
    {area:'Administration',condition:'moderate_friction',priority:'medium',source_refs:['source-1']},
    {area:'Reporting / Visibility',condition:'needs_attention',priority:'high',source_refs:['source-1']}
  ],
  business_context:[item('Context & operating model')],
  current_processes:[item('Current <manual> process','strongly_indicated',{area:'Operations'})],
  observed_problems:[item('Observed delay','strongly_indicated',{area:'Reporting / Visibility'})],
  key_findings:[item('Owner review is the primary control','strongly_indicated',{title:'Owner-led reconciliation',evidence_summary:'Two discovery sources describe an owner-led month-end check.',business_impact:'Reporting takes longer and exceptions can remain hidden.',priority:'high',recommended_direction:'Validate the handoff and define an exception-based review.'})],
  opportunity_areas:[item('Use a controlled exception review','strongly_indicated',{title:'Exception-based review',potential_benefit:'Reduce repeated manual checks while retaining owner control.',priority:'high'})],
  quick_wins:[
    item('Use one agreed month-end checklist.','strongly_indicated',{title:'Standardize month-end review',potential_benefit:'Make the current control more consistent.'}),
    item('Record exception ownership in one place.','strongly_indicated',{title:'Clarify exception ownership',potential_benefit:'Reduce follow-up ambiguity.'})
  ],
  missing_information:[item('Baseline duration is unknown','insufficient_information',{source_refs:[],what_to_review:'Measure two representative month-end reviews.',why_it_matters:'The baseline is needed before estimating benefit.'})],
  evidence_confidence:[item('The supplied transcripts support the finding')],
  contradictions:[{text:'Two sources describe different handoff owners',source_refs:['source-1']}],
  evidence_ledger:[{source_id:'source-1',extraction:{observations:[{statement:'The owner checks every month',excerpt:'I check every month'}]}}]
};
const run={id:'report-1',version:3,status:'complete',created_at:'2026-09-10T14:00:00Z',completed_at:'2026-09-10T14:15:00Z',document_ids:['doc-1','doc-2'],source_ids:['source-1','source-2'],report};
const documents=[
  {id:'doc-1',file_name:'Discovery Call Transcript — September 10.docx',category:'Discovery Transcript',created_at:'2026-09-10T13:00:00Z',state:'parsed'},
  {id:'doc-2',file_name:'Owner Notes.txt',category:'Discovery Material',created_at:'2026-09-10T13:10:00Z',state:'parsed'}
];

test('Free Diagnosis reads as a client-facing consulting report with navigation and truthful metadata',()=>{
  const html=freeReportMarkup(run,{companyName:'Moon Wax Co.',projectName:'Operations Review',documents,headingLevel:1,includeWorkflowNextStep:true,includeNavigation:true});
  assert.match(html,/<h1>Free Business Diagnosis<\/h1>/);
  assert.match(html,/Preliminary Operational Assessment/);
  assert.match(html,/Prepared for <strong>Moon Wax Co\.<\/strong>/);
  assert.match(html,/Sep 10, 2026/);
  assert.match(html,/Operations Review/);
  assert.match(html,/Version 3 · report-1/);
  for(const label of ['Executive Summary','Diagnosis Snapshot','Highest-Priority Findings','Where Friction Is Occurring','Highest-Value Opportunities','Potential Quick Wins','What Needs Deeper Investigation','Sources Reviewed','Recommended Next Step'])assert.match(html,new RegExp(label));
  assert.match(html,/role="table" aria-label="Diagnosis snapshot"/);
  assert.match(html,/data-report-section="recommended-next-step"/);
});

test('finding hierarchy separates observed condition, evidence, impact, priority, and direction',()=>{
  const html=freeReportMarkup(run,{companyName:'Moon Wax Co.',documents,showSourceEvidence:true});
  for(const label of ['Observed Condition','Evidence','Business Impact','High priority','Recommended Direction'])assert.match(html,new RegExp(label));
  assert.match(html,/Owner-led reconciliation/);
  assert.match(html,/Two discovery sources describe an owner-led month-end check/);
  assert.match(html,/Reporting takes longer and exceptions can remain hidden/);
  assert.match(html,/Validate the handoff and define an exception-based review/);
  assert.match(html,/Internal evidence traceability/);
  assert.match(html,/I check every month/);
});

test('report preserves source-safe content, approved areas, quick wins, unknowns, and multiple source names',()=>{
  const html=freeReportMarkup(run,{companyName:'Moon Wax Co.',documents});
  for(const value of ['Appointment, payment, bookkeeping','Current &lt;manual&gt; process','Reporting / Visibility','Exception-based review','Standardize month-end review','Baseline duration is unknown','Discovery Call Transcript — September 10.docx','Owner Notes.txt'])assert.match(html,new RegExp(value));
  assert.doesNotMatch(html,/source-1|I check every month/,'client output must not expose internal source identifiers or transcript excerpts');
});

test('shared Basic Report uses an h2 title and omits Step 2-only navigation and workflow action',()=>{
  const html=freeReportMarkup(run,{companyName:'Moon Wax Co.'});
  assert.match(html,/<h2>Free Business Diagnosis<\/h2>/);
  assert.doesNotMatch(html,/<h1>|relystra-report-toc|data-report-review/);
});

test('legacy saved reports remain readable without fabricated structured details',()=>{
  const legacy={...run,report:{...Object.fromEntries(Object.keys(freeSections).map(key=>[key,[item(`${key} statement`)]])),coverage:{documents:1,logical_documents:1},contradictions:[],evidence_ledger:[]}};
  const html=freeReportMarkup(legacy,{companyName:'& Co',headingLevel:1,includeWorkflowNextStep:true});
  assert.match(html,/Prepared for <strong>&amp; Co<\/strong>/);
  assert.match(html,/No supported quick win was recorded in this report version/);
  assert.match(html,/To validate priority/);
  assert.doesNotMatch(html,/Business Impact<\/dt>|Recommended Direction<\/dt>/,'legacy reports must not fabricate unsupported detail');
});

test('empty, loading, generating, and failed states explain the saved workflow state',()=>{
  assert.match(freeReportStateMarkup({status:{state:'not_ready',label:'Not ready'},documents:[]}),/Free Diagnosis Not Generated Yet/);
  const generating=freeReportStateMarkup({status:{state:'generating',label:'Generating'},documents});
  assert.match(generating,/Preparing Free Diagnosis/);
  assert.match(generating,/Reviewing discovery information/);
  assert.doesNotMatch(generating,/%/,'progress must not fabricate a percentage');
  assert.match(freeReportStateMarkup({status:{state:'failed',label:'Failed'},documents}),/We couldn&#39;t generate the Free Diagnosis/);
});

test('PDF filename is professional, dated, and sanitizes invalid characters',()=>{
  assert.equal(freeDiagnosisFilename('ACME / North:East?','2026-09-10T14:15:00Z'),'RELYSTRA_ACME-North-East_Free-Diagnosis_2026-09-10.pdf');
});
