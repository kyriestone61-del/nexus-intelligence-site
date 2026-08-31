const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast,downloadDocument}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentRunId=null;

const providerMissing=run=>String(run?.execution_error||'').includes('AI_GATEWAY_NOT_CONFIGURED');
const emptyStructuredResult=text=>({executive_summary:text,facts:[],client_statements:[],inferences:[],unknowns:[],process_map:[],bottlenecks:[],baseline_gaps:[],baseline_measurements:[],opportunity_backlog:[],risks:[],follow_up_questions:[],smallest_safe_pilot:{title:'Manual diagnosis output',summary:text,scope_in:[],scope_out:[],acceptance_criteria:[],human_controls:[]},manual_capture:true});

async function loadRun(id){const {data,error}=await sb.from('nexus_diagnosis_runs').select('*').eq('id',id).single();if(error)throw error;return data}
function stripFence(text){return String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()}
function parseResult(text){const clean=stripFence(text);try{const parsed=JSON.parse(clean);if(parsed&&typeof parsed==='object')return {...parsed,manual_capture:true}}catch{}return emptyStructuredResult(clean)}

function buildPrompt(run){
 const packet=run.analysis_packet||{},manifest=Array.isArray(packet.evidence_manifest)?packet.evidence_manifest:[];
 const company=packet.company||{},project=packet.project||{};
 return `NEXUS INTELLIGENCE — CLIENT DIAGNOSIS AGENT\n\nMODE\nInternal draft analysis only. Do not send emails, contact anyone, modify systems, publish, purchase, or take external action. Separate established facts, client statements, inferences, assumptions, and unknowns. Do not invent ROI without a documented baseline.\n\nCLIENT\nCompany: ${company.name||'Current Nexus client'}\nIndustry: ${company.industry||'Unknown'}\nProject: ${project.name||'Current Nexus engagement'}\nService: ${project.service_type||'Nexus diagnosis'}\n\nDISCOVERY NOTES\n${packet.discovery_notes||'No separate notes were captured.'}\n\nTRANSCRIPT\n${packet.transcript_text||'The transcript is stored as a Nexus evidence file. Attach the downloaded transcript to this ChatGPT conversation before running this prompt.'}\n\nEVIDENCE MANIFEST\n${manifest.length?manifest.map((x,i)=>`${i+1}. ${x.file_name||'Evidence'} — ${x.category||'General'}${x.note?` — ${x.note}`:''}`).join('\n'):'No additional evidence was listed.'}\n\nOBJECTIVE\nDiagnose the current business state, reconstruct the relevant workflow, identify bottlenecks and measurable gaps, rank AI/automation opportunities, define human-control boundaries, and recommend the smallest sensible first pilot. Start with business problems, not tools.\n\nRETURN VALID JSON ONLY using this structure:\n{\n  "executive_summary":"",\n  "facts":[{"statement":"","evidence_refs":[]}],\n  "client_statements":[{"statement":"","evidence_refs":[]}],\n  "inferences":[{"statement":"","basis":"","confidence":"high|medium|low"}],\n  "unknowns":[{"question":"","why_it_matters":""}],\n  "process_map":[{"step":1,"name":"","current_state":"","owner":"","evidence_refs":[]}],\n  "bottlenecks":[{"title":"","description":"","impact":"","evidence_refs":[]}],\n  "baseline_gaps":[{"metric":"","gap":"","needed_evidence":""}],\n  "baseline_measurements":[],\n  "opportunity_backlog":[{"rank":1,"title":"","problem":"","recommendation":"","value_score":1,"effort_score":1,"readiness_score":1,"evidence_refs":[]}],\n  "risks":[{"risk":"","control":"","severity":"low|medium|high"}],\n  "follow_up_questions":[{"question":"","reason":""}],\n  "smallest_safe_pilot":{"title":"","summary":"","scope_in":[],"scope_out":[],"acceptance_criteria":[],"human_controls":[]}\n}\n`;
}

async function enhance(id=currentRunId){
 if(!id||!state.admin)return;
 const body=document.getElementById('diagnosisReviewBody');if(!body)return;
 let run;try{run=await loadRun(id)}catch{return}
 if(!providerMissing(run)){body.querySelector('.diagnosis-manual-fallback')?.remove();return}
 let panel=body.querySelector('.diagnosis-manual-fallback');if(!panel){panel=document.createElement('section');panel.className='diagnosis-manual-fallback note';body.prepend(panel)}
 const hasTranscript=!!run.transcript_document_id;
 panel.innerHTML=`<div class="kicker">Continue without the automatic provider</div><h3 style="margin:6px 0 8px">Finish Step 3 with ChatGPT</h3><p class="small">Your evidence is safe. Use this fallback now; when the automatic AI provider is connected later, this manual path can remain only as a backup.</p><div class="actions">${hasTranscript?`<button class="btn secondary" data-manual-download="${esc(id)}" type="button">1. Download transcript</button>`:''}<button class="btn secondary" data-manual-copy="${esc(id)}" type="button">${hasTranscript?'2':'1'}. Copy diagnosis prompt</button></div><div class="field" style="margin-top:12px"><label>${hasTranscript?'3':'2'}. Paste the completed diagnosis JSON</label><textarea data-manual-result="${esc(id)}" rows="9" placeholder="Paste the diagnosis output from ChatGPT here..."></textarea></div><div class="actions"><button class="btn primary" data-manual-save="${esc(id)}" type="button">Save diagnosis for review →</button></div><p class="small">After saving, Nexus changes the diagnosis to <b>Ready for review</b>. Review it once, approve it, and Step 4 unlocks.</p>`;
}

async function saveManual(id,button){
 const textarea=document.querySelector(`[data-manual-result="${CSS.escape(id)}"]`);const text=textarea?.value?.trim();if(!text)return toast?.('Paste the completed diagnosis before saving.');
 button.disabled=true;const original=button.textContent;button.textContent='Saving…';
 try{
   const result=parseResult(text),now=new Date().toISOString();
   const {error}=await sb.from('nexus_diagnosis_runs').update({analysis_result:result,status:'ready_for_review',execution_error:null,analysis_completed_at:now,updated_at:now}).eq('id',id);if(error)throw error;
   toast?.('Diagnosis saved and ready for your review.');
   window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));
   document.getElementById('diagnosisReviewModal')?.classList.remove('open');
   setTimeout(()=>document.querySelector(`.diagnosis-review-btn[data-id="${CSS.escape(id)}"]`)?.click(),280);
 }catch(error){console.error('Manual diagnosis fallback save failed',error);toast?.(error.message||'Diagnosis could not be saved.')}finally{if(button.isConnected){button.disabled=false;button.textContent=original}}
}

document.addEventListener('click',event=>{
 const review=event.target.closest?.('.diagnosis-review-btn');if(review){currentRunId=review.dataset.id;setTimeout(()=>enhance(currentRunId),100);setTimeout(()=>enhance(currentRunId),280);return}
 const copy=event.target.closest?.('[data-manual-copy]');if(copy){event.preventDefault();loadRun(copy.dataset.manualCopy).then(run=>navigator.clipboard.writeText(buildPrompt(run))).then(()=>toast?.('Diagnosis prompt copied.')).catch(()=>toast?.('Could not copy the diagnosis prompt.'));return}
 const download=event.target.closest?.('[data-manual-download]');if(download){event.preventDefault();loadRun(download.dataset.manualDownload).then(run=>run.transcript_document_id&&downloadDocument?.(run.transcript_document_id)).catch(error=>toast?.(error.message||'Transcript could not be downloaded.'));return}
 const save=event.target.closest?.('[data-manual-save]');if(save){event.preventDefault();return saveManual(save.dataset.manualSave,save)}
},true);

window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(()=>enhance(currentRunId),120));
