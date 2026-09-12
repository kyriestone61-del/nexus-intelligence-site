import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freeDiagnosisPdfBytes} from '../../functions/api/diagnosis-report-pdf.js';

const here=dirname(fileURLToPath(import.meta.url));
const output=resolve(process.argv[2]||`${here}/../../tmp/pdfs/RELYSTRA_Acme-Operations-International_Free-Diagnosis_2026-09-11.pdf`);
const sourceRefs=['source-transcript','source-notes'];
const detail='The supplied discovery transcript and operating notes consistently describe a manual handoff across appointment, payment, and bookkeeping systems. The exact time cost and exception volume still require measurement.';
const report={
  executive_summary:[
    {label:'Reviewed',text:'Relystra reviewed two discovery sources covering intake, scheduling, payment reconciliation, bookkeeping, and month-end reporting.',source_refs:sourceRefs},
    {label:'Working well',text:'The operating team has repeatable review checkpoints and clear source systems for the underlying records.',source_refs:sourceRefs},
    {label:'Primary friction',text:'Visibility depends on staff comparing information across several systems and escalating unresolved exceptions to the owner.',source_refs:sourceRefs},
    {label:'Overall opportunity',text:'A controlled exception review could focus attention on records that require a decision while preserving human approval.',source_refs:sourceRefs},
    {label:'Deeper investigation',text:'Relystra still needs a measured baseline for time, volume, and exception categories before estimating implementation value.',source_refs:[]}
  ],
  diagnosis_snapshot:[
    {area:'Administration',condition:'moderate friction',priority:'medium'},
    {area:'Customer / Sales Process',condition:'stable',priority:'low'},
    {area:'Operations',condition:'needs attention',priority:'high'},
    {area:'Information / Documentation',condition:'moderate friction',priority:'medium'},
    {area:'Reporting / Visibility',condition:'high priority',priority:'high'}
  ],
  key_findings:Array.from({length:5},(_,index)=>({
    title:['Owner-led reporting control','Fragmented exception visibility','Unmeasured review effort','Inconsistent handoff documentation','Delayed escalation visibility'][index],
    text:detail,
    evidence_summary:`Finding ${index+1} is supported by both supplied sources; neither source establishes an exact financial impact.`,
    business_impact:'Staff may spend additional time locating and comparing records, while unresolved exceptions can remain invisible until the scheduled review.',
    priority:index<2?'high':index<4?'medium':'low',
    recommended_direction:'Validate the current handoff and collect a representative baseline before defining any implementation scope.',
    source_refs:sourceRefs
  })),
  observed_problems:[
    {area:'Administration',text:'Follow-up ownership is recorded in multiple places.'},
    {area:'Operations',text:'The same record is checked at more than one handoff.'},
    {area:'Information / Documentation',text:'Exception notes do not use a consistent format.'},
    {area:'Reporting / Visibility',text:'The owner assembles status across separate systems.'}
  ],
  opportunity_areas:Array.from({length:5},(_,index)=>({title:`Controlled improvement area ${index+1}`,text:detail,potential_benefit:'Make exceptions easier to see and assign without replacing the existing source systems.'})),
  quick_wins:Array.from({length:4},(_,index)=>({title:`Low-risk process clarification ${index+1}`,text:'Use one agreed checklist and record the owner, status, and next action for each unresolved item.',potential_benefit:'Improve consistency and follow-up clarity while deeper investigation continues.'})),
  missing_information:Array.from({length:5},(_,index)=>({text:`Baseline question ${index+1} is not answered by the supplied evidence.`,what_to_review:'Observe two representative cycles and record time, volume, exception type, and decision owner.',why_it_matters:'This evidence is needed to distinguish a documentation problem from an automation opportunity.'}))
};

const shortBytes=freeDiagnosisPdfBytes({executive_summary:[{label:'Reviewed',text:'One discovery source was reviewed.'}]},'Short Example',{date:'2026-09-11',version:1});
if(new TextDecoder().decode(shortBytes.slice(0,8))!=='%PDF-1.4')throw new Error('Short PDF did not render.');
const bytes=freeDiagnosisPdfBytes(report,'Acme Operations International / Northeast',{date:'2026-09-11',version:7});
await mkdir(dirname(output),{recursive:true});
await writeFile(output,bytes);
console.log(output);
