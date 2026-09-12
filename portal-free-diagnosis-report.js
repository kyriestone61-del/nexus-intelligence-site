const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const freeSections={
 business_context:'Business Context',
 current_processes:'Current Processes',
 observed_problems:'Observed Problems',
 key_findings:'Key Findings',
 opportunity_areas:'Opportunity Areas',
 missing_information:'Missing Information',
 evidence_confidence:'Evidence Confidence'
};

export const diagnosisAreas=['Administration','Customer / Sales Process','Operations','Information / Documentation','Reporting / Visibility'];
const summaryLabels={reviewed:'What Relystra reviewed',working_well:'What appears to be working',primary_friction:'Primary operational friction',overall_opportunity:'Overall opportunity',deeper_investigation:'What deserves deeper investigation'};
const confidenceLabels={confirmed:'Confirmed',strongly_indicated:'Strongly indicated',supported:'Supported',tentative:'Tentative',insufficient_information:'Insufficient information'};
const priorityLabels={high:'High',medium:'Medium',low:'Low'};

export const reportText=item=>typeof item==='string'?item:String(item?.text||item?.finding||item?.statement||'');
export const confidenceText=item=>confidenceLabels[String(item?.confidence||'').toLowerCase()]||String(item?.confidence||'').replaceAll('_',' ');
export const reportDate=value=>{if(!value)return '';const date=new Date(value);return Number.isNaN(date.valueOf())?String(value):new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(date)};
const reportIsoDate=value=>{const date=new Date(value||Date.now());return Number.isNaN(date.valueOf())?new Date().toISOString().slice(0,10):date.toISOString().slice(0,10)};
const cleanFilenamePart=value=>String(value||'Client').trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'Client';
export const freeDiagnosisFilename=(companyName,date)=>`RELYSTRA_${cleanFilenamePart(companyName)}_Free-Diagnosis_${reportIsoDate(date)}.pdf`;
const priorityText=item=>priorityLabels[String(item?.priority||'').toLowerCase()]||'To validate';
const statusClass=value=>String(value||'').toLowerCase().replaceAll(' ','-').replace(/[^a-z-]/g,'');
const sourceCount=item=>new Set(Array.isArray(item?.source_refs)?item.source_refs:[]).size;
const tokenFor=run=>String(run?.id||'report').replace(/[^a-z0-9_-]/gi,'').slice(-24)||'report';

function heading(id,number,title,lede=''){
 return `<header class="relystra-report-section-head"><span>${esc(number)}</span><div><h2 id="${esc(id)}">${esc(title)}</h2>${lede?`<p>${esc(lede)}</p>`:''}</div></header>`;
}

function executiveSummary(report,id){
 const supplied=Array.isArray(report.executive_summary)?report.executive_summary.filter(item=>reportText(item)):[];
 const fallback=[
  {label:'reviewed',text:reportText(report.business_context?.[0]),source_refs:report.business_context?.[0]?.source_refs},
  {label:'working_well',text:reportText(report.current_processes?.[0]),source_refs:report.current_processes?.[0]?.source_refs},
  {label:'primary_friction',text:reportText(report.key_findings?.[0]||report.observed_problems?.[0]),source_refs:(report.key_findings?.[0]||report.observed_problems?.[0])?.source_refs},
  {label:'overall_opportunity',text:reportText(report.opportunity_areas?.[0]),source_refs:report.opportunity_areas?.[0]?.source_refs},
  {label:'deeper_investigation',text:reportText(report.missing_information?.[0]),source_refs:report.missing_information?.[0]?.source_refs}
 ].filter(item=>item.text);
 const items=(supplied.length?supplied:fallback).slice(0,5);
 if(!items.length)return '';
 return `<section class="relystra-report-section relystra-report-executive" data-report-section="executive-summary">${heading(id,'01','Executive Summary','The clearest preliminary conclusions from the discovery information reviewed.')}<div class="relystra-report-summary-grid">${items.map(item=>`<article><h3>${esc(summaryLabels[item.label]||item.label||'Assessment summary')}</h3><p>${esc(reportText(item))}</p></article>`).join('')}</div></section>`;
}

function diagnosisSnapshot(report,id){
 const fallbackKeys=['current_processes','observed_problems','key_findings','opportunity_areas','missing_information'];
 const conditions={current_processes:'Current process documented',observed_problems:'Friction documented',key_findings:'Priority finding recorded',opportunity_areas:'Opportunity identified',missing_information:'Needs deeper investigation'};
 const supplied=Array.isArray(report.diagnosis_snapshot)?report.diagnosis_snapshot.filter(item=>item?.area&&item?.condition):[];
 const rows=supplied.length?supplied:fallbackKeys.filter(key=>(report[key]||[]).length).map(key=>({area:freeSections[key],condition:conditions[key],priority:priorityText((report[key]||[])[0])}));
 if(!rows.length)return '';
 return `<section class="relystra-report-section relystra-report-snapshot" data-report-section="diagnosis-snapshot">${heading(id,'02','Diagnosis Snapshot','A concise view of the conditions and priorities recorded in this preliminary assessment.')}<div class="relystra-report-snapshot-table" role="table" aria-label="Diagnosis snapshot"><div class="relystra-report-snapshot-row relystra-report-snapshot-head" role="row"><span role="columnheader">Area</span><span role="columnheader">Condition</span><span role="columnheader">Priority</span></div>${rows.map(row=>{const priority=priorityLabels[String(row.priority||'').toLowerCase()]||String(row.priority||'To validate');return `<div class="relystra-report-snapshot-row" role="row"><strong role="cell" data-label="Area">${esc(row.area)}</strong><span role="cell" data-label="Condition"><i class="relystra-condition-marker" aria-hidden="true"></i>${esc(String(row.condition).replaceAll('_',' '))}</span><span role="cell" data-label="Priority"><b class="relystra-priority-badge is-${esc(statusClass(priority))}">${esc(priority)}</b></span></div>`}).join('')}</div></section>`;
}

function keyFindings(report,id){
 const items=(report.key_findings||[]).slice(0,5);
 if(!items.length)return '';
 return `<section class="relystra-report-section relystra-report-key-findings" data-report-section="key-findings">${heading(id,'03','Highest-Priority Findings','The most consequential evidence-backed conditions identified in the initial review.')}<div class="relystra-report-findings">${items.map((item,index)=>{const count=sourceCount(item),evidence=String(item?.evidence_summary||item?.evidence||'')||`${count?`${count} supporting source reference${count===1?'':'s'}. `:''}${confidenceText(item)?`Evidence confidence: ${confidenceText(item)}.`:'Evidence retained in the discovery record.'}`;const impact=String(item?.business_impact||item?.why_it_matters||item?.operational_significance||'');const direction=String(item?.recommended_direction||item?.direction||'');const priority=priorityText(item);return `<article class="relystra-report-finding"><div class="relystra-report-finding-head"><div><span>Finding ${String(index+1).padStart(2,'0')}</span><h3>${esc(item?.title||reportText(item).split(/[.!?]/)[0]||`Finding ${index+1}`)}</h3></div><b class="relystra-priority-badge is-${esc(statusClass(priority))}">${esc(priority)} priority</b></div><dl class="relystra-report-finding-details"><div class="is-observed"><dt>Observed Condition</dt><dd>${esc(reportText(item))}</dd></div><div><dt>Evidence</dt><dd>${esc(evidence)}</dd></div>${impact?`<div><dt>Business Impact</dt><dd>${esc(impact)}</dd></div>`:''}${direction?`<div><dt>Recommended Direction</dt><dd>${esc(direction)}</dd></div>`:''}</dl></article>`}).join('')}</div></section>`;
}

function frictionMap(report,id){
 const items=[...(report.observed_problems||[]),...(report.current_processes||[]).filter(item=>item?.area)].filter(item=>reportText(item));
 if(!items.length)return '';
 const groups=new Map();
 for(const item of items){const area=diagnosisAreas.includes(item?.area)?item.area:'Current Evidence';if(!groups.has(area))groups.set(area,[]);groups.get(area).push(item)}
 return `<section class="relystra-report-section relystra-report-friction" data-report-section="friction-map">${heading(id,'04','Where Friction Is Occurring','Issues are grouped only where the current diagnosis record supports an operational area.')}<div class="relystra-friction-grid">${[...groups.entries()].map(([area,group])=>`<article><h3>${esc(area)}</h3><ul>${group.map(item=>`<li>${esc(reportText(item))}</li>`).join('')}</ul></article>`).join('')}</div></section>`;
}

function opportunities(report,id){
 const items=(report.opportunity_areas||[]).slice(0,5);
 if(!items.length)return '';
 return `<section class="relystra-report-section relystra-report-opportunities" data-report-section="opportunities">${heading(id,'05','Highest-Value Opportunities','Directional opportunities for deeper evaluation; they are not implementation scope.')}<div class="relystra-opportunity-list">${items.map((item,index)=>{const benefit=String(item?.potential_benefit||item?.business_impact||item?.why_it_matters||'');return `<article><span>${String(index+1).padStart(2,'0')}</span><div><h3>${esc(item?.title||`Opportunity ${index+1}`)}</h3><p>${esc(reportText(item))}</p>${benefit?`<dl><dt>Potential Benefit</dt><dd>${esc(benefit)}</dd></dl>`:''}</div></article>`}).join('')}</div></section>`;
}

function quickWins(report,id){
 const items=Array.isArray(report.quick_wins)?report.quick_wins.slice(0,4):[];
 return `<section class="relystra-report-section relystra-report-quick-wins" data-report-section="quick-wins">${heading(id,'06','Potential Quick Wins','Low-complexity directions suggested by the preliminary evidence; implementation has not been scoped.')} ${items.length?`<div class="relystra-quick-win-list">${items.map((item,index)=>`<article><span aria-hidden="true">${String(index+1).padStart(2,'0')}</span><div><h3>${esc(item?.title||`Potential quick win ${index+1}`)}</h3><p>${esc(reportText(item))}</p>${item?.potential_benefit?`<small><b>Potential benefit:</b> ${esc(item.potential_benefit)}</small>`:''}</div></article>`).join('')}</div>`:'<p class="relystra-report-disclosure">No supported quick win was recorded in this report version. Deeper diagnosis should confirm whether a low-complexity change is appropriate.</p>'}</section>`;
}

function deeperInvestigation(report,id){
 const items=(report.missing_information||[]).slice(0,6);
 if(!items.length)return '';
 return `<section class="relystra-report-section relystra-report-investigation" data-report-section="deeper-investigation">${heading(id,'07','What Needs Deeper Investigation','Questions that should be resolved before Relystra recommends or builds a solution.')}<div class="relystra-investigation-list">${items.map((item,index)=>`<article><span>Question ${String(index+1).padStart(2,'0')}</span><h3>${esc(reportText(item))}</h3>${item?.what_to_review?`<p><b>Review needed:</b> ${esc(item.what_to_review)}</p>`:''}${item?.why_it_matters?`<p><b>Why it matters:</b> ${esc(item.why_it_matters)}</p>`:''}</article>`).join('')}</div></section>`;
}

function sourcesReviewed(run,report,documents,id,showSourceEvidence){
 const ids=new Set(run.document_ids||[]),matched=(documents||[]).filter(document=>ids.has(document.id)&&document.state!=='removed');
 const materials=report.coverage?.documents??run.document_ids?.length??matched.length;
 const sourceCountValue=report.coverage?.logical_documents??run.source_ids?.length??materials;
 if(!matched.length&&!materials)return '';
 return `<section class="relystra-report-section relystra-report-reviewed-sources" data-report-section="sources-reviewed">${heading(id,'08','Sources Reviewed','Discovery material synthesized for this report version.')} ${matched.length?`<ul>${matched.map(document=>`<li><strong>${esc(document.file_name||'Discovery material')}</strong><span>${esc(document.category||'Discovery material')}${document.created_at?` · ${esc(reportDate(document.created_at))}`:''}</span></li>`).join('')}</ul>`:`<p>${esc(materials)} discovery document${materials===1?'':'s'} representing ${esc(sourceCountValue)} unique evidence source${sourceCountValue===1?'':'s'}.</p>`}${showSourceEvidence&&report.evidence_ledger?.length?`<details class="relystra-report-sources"><summary>Internal evidence traceability</summary>${report.evidence_ledger.map(source=>`<div class="relystra-report-source"><h3>${esc(source.source_id)}</h3>${(source.extraction?.observations||[]).map(observation=>`<p>${esc(observation.statement)}<q>${esc(observation.excerpt)}</q></p>`).join('')}</div>`).join('')}</details>`:''}</section>`;
}

function conclusion(id,includeWorkflowNextStep){
 if(!includeWorkflowNextStep)return '';
 return `<section class="relystra-report-conclusion" data-report-section="recommended-next-step"><div><div class="relystra-report-kicker">09 · Recommended Next Step</div><h2 id="${esc(id)}">Validate the preliminary findings.</h2><p>The next stage allows Relystra to confirm the evidence, inspect the affected workflows, identify root causes, define requirements, and decide which improvements are worth pursuing.</p></div><button type="button" class="btn primary" data-report-review>Continue to Review Findings</button></section>`;
}

export function freeReportMarkup(run,{companyName='your organization',projectName='',documents=[],headingLevel=2,includeWorkflowNextStep=false,includeNavigation=false,showSourceEvidence=false}={}){
 if(!run?.report)return '';
 const report=run.report,token=tokenFor(run),titleTag=headingLevel===1?'h1':'h2',generatedAt=run.completed_at||run.created_at,generated=reportDate(generatedAt);
 const ids={summary:`report-${token}-summary`,snapshot:`report-${token}-snapshot`,findings:`report-${token}-findings`,friction:`report-${token}-friction`,opportunities:`report-${token}-opportunities`,quickWins:`report-${token}-quick-wins`,investigation:`report-${token}-investigation`,sources:`report-${token}-sources`,next:`report-${token}-next`};
 const sections=[executiveSummary(report,ids.summary),diagnosisSnapshot(report,ids.snapshot),keyFindings(report,ids.findings),frictionMap(report,ids.friction),opportunities(report,ids.opportunities),quickWins(report,ids.quickWins),deeperInvestigation(report,ids.investigation),sourcesReviewed(run,report,documents,ids.sources,showSourceEvidence),conclusion(ids.next,includeWorkflowNextStep)].filter(Boolean);
 const links=[['Executive Summary',ids.summary,'executive-summary'],['Diagnosis Snapshot',ids.snapshot,'diagnosis-snapshot'],['Key Findings',ids.findings,'key-findings'],['Operational Friction',ids.friction,'friction-map'],['Opportunities',ids.opportunities,'opportunities'],['Quick Wins',ids.quickWins,'quick-wins'],['Deeper Investigation',ids.investigation,'deeper-investigation'],['Sources Reviewed',ids.sources,'sources-reviewed'],['Next Step',ids.next,'recommended-next-step']].filter(([,sectionId,key])=>sections.some(section=>section.includes(`data-report-section="${key}"`)));
 const tocBody=`<div><span>In this report</span><ol>${links.map(([label,sectionId])=>`<li><a href="#${esc(sectionId)}">${esc(label)}</a></li>`).join('')}</ol></div>`;
 const navigation=includeNavigation?`<nav class="relystra-report-toc relystra-report-toc--desktop" aria-label="Report sections">${tocBody}</nav><details class="relystra-report-toc relystra-report-toc--mobile"><summary>Jump to a report section</summary>${tocBody}</details>`:'';
 const article=`<article class="relystra-free-report" data-free-report="${esc(run.id)}"><header class="relystra-report-cover"><div class="relystra-report-kicker">RELYSTRA · Preliminary Operational Assessment</div><${titleTag}>Free Business Diagnosis</${titleTag}><p class="relystra-report-prepared">Prepared for <strong>${esc(companyName)}</strong></p><p class="relystra-report-introduction">This Free Diagnosis summarizes the primary operational issues identified from the discovery information provided to Relystra. It highlights the highest-value opportunities for deeper investigation and improvement.</p><dl class="relystra-report-metadata">${generated?`<div><dt>Diagnosis date</dt><dd>${esc(generated)}</dd></div>`:''}${projectName?`<div><dt>Engagement</dt><dd>${esc(projectName)}</dd></div>`:''}<div><dt>Prepared by</dt><dd>Relystra</dd></div><div><dt>Report</dt><dd>Version ${esc(run.version||1)}${run.id?` · ${esc(String(run.id).slice(0,8))}`:''}</dd></div></dl></header><div class="relystra-report-body">${sections.join('')}</div><footer class="relystra-report-footer"><span>RELYSTRA | Free Business Diagnosis</span><span>${esc(companyName)}</span><span>Preliminary assessment based on discovery information provided.</span></footer></article>`;
 return includeNavigation?`<div class="relystra-report-layout">${navigation}${article}</div>`:article;
}

export function freeReportStateMarkup({status,companyName='your organization',documents=[]}={}){
 const state=status?.state||'loading',failed=documents.filter(document=>document.state==='failed').length,processing=documents.filter(document=>!['parsed','failed','removed'].includes(document.state)).length;
 const content={
  loading:['Loading Saved Diagnosis','Relystra is retrieving the saved report and discovery status for this engagement.'],
  not_ready:['Free Diagnosis Not Generated Yet',failed?`${failed} discovery document${failed===1?' needs':'s need'} attention before the report can be prepared.`:'Add and process discovery information in Step 1 before generating the report.'],
  processing:['Discovery Processing Is Incomplete',`${processing||'Some'} discovery material${processing===1?' is':'s are'} still being prepared. The report will remain unavailable until processing finishes.`],
  ready:['Free Diagnosis Not Generated Yet','The discovery information is ready. Generate the report to turn the saved evidence into a preliminary operational assessment.'],
  requesting:['Preparing Free Diagnosis','Relystra is starting the evidence review. You can leave this page and return without losing progress.'],
  generating:['Preparing Free Diagnosis','Relystra is reviewing and organizing the saved discovery information. You can leave this page and return without losing progress.'],
  failed:["We couldn't generate the Free Diagnosis.",'The saved discovery information is still available. Retry the diagnosis, or return to Step 1 to review the source material.']
 }[state]||['Free Diagnosis Not Available','Review the report status and return to Step 1 if discovery information needs attention.'];
 const progress=['Reviewing discovery information','Identifying recurring operational issues','Organizing findings by priority','Preparing preliminary recommendations','Formatting the client report'];
 return `<article class="relystra-free-report relystra-free-report-empty" data-report-state="${esc(state)}"><header class="relystra-report-cover"><div class="relystra-report-kicker">RELYSTRA · Preliminary Operational Assessment</div><h1>Free Business Diagnosis</h1><p class="relystra-report-prepared">Prepared for <strong>${esc(companyName)}</strong></p></header><div class="relystra-report-empty-state"><span>${esc(status?.label||'Report status unavailable')}</span><h2>${esc(content[0])}</h2><p>${esc(content[1])}</p>${['requesting','generating'].includes(state)?`<ol class="relystra-report-progress">${progress.map((label,index)=>`<li class="${index===0?'is-current':''}"><span aria-hidden="true"></span>${esc(label)}</li>`).join('')}</ol>`:''}</div></article>`;
}

export function printFreeDiagnosis({companyName,generatedAt}={}){
 const previousTitle=document.title,filename=freeDiagnosisFilename(companyName,generatedAt),cleanup=()=>{document.body.classList.remove('relystra-free-diagnosis-printing');document.title=previousTitle};
 document.title=filename.replace(/\.pdf$/i,'');
 document.body.classList.add('relystra-free-diagnosis-printing');
 window.addEventListener('afterprint',cleanup,{once:true});
 requestAnimationFrame(()=>window.print());
 setTimeout(cleanup,30000);
 return filename;
}
