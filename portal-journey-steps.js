import {lifecycle,clientLifecycle} from './portal-delivery-lifecycle.js';
import {preparationDocuments} from './portal-workspace-context.js';
export const journeySteps=[['overview','Setup & access'],['transcript','Meeting transcript'],['diagnosis','Diagnosis & approval'],['actions','Required inputs'],['builds','Recommended Builds'],['scope','Agree scope & payment'],['progress','Build & quality checks'],['review','Client review'],['final-package','Final handoff'],['support','Completion & support']];
export function transcriptDocuments(state,projectId=null,diagnosis=null){return preparationDocuments(state,projectId,diagnosis);}
export function currentTranscript(state,projectId=null,selectedId=null,diagnosis=null){const docs=transcriptDocuments(state,projectId,diagnosis);return docs.find(d=>d.id===selectedId)||docs.find(d=>d.id===diagnosis?.transcript_document_id)||docs.find(d=>d.category==='Discovery Transcript'||/transcript|\.(srt|vtt)$/i.test(d.file_name||''))||null;}
export function journeyProgress(snapshot,hasTranscript=false){
  const s=snapshot||{},d=s.diagnosis||{},next=lifecycle(s),p=s.package;
  let current=0;
  if(s.initial_engagement&&d.status!=='approved'&&p?.stage==='briefs')current=2;
  else if(p)current=({briefs:6,building:6,internal_qa:6,client_review:7,revisions:7,final_qa:8,support:9,completed:9}[p.stage]??6);
  else if(d.status==='approved')current=next.section==='actions'?3:s.payment_pending?5:4;
  else if(d.access)current=hasTranscript||['queued','analyzing','processing','ready_for_review','review_required','in_review','failed','blocked','revision_requested'].includes(d.status)?2:1;
  return journeySteps.map(([key,title],index)=>({key,title,number:index+1,status:s.package?.stage==='completed'||index<current?'completed':index===current?'current':'upcoming'}));
}
export function journeyGate(key,snapshot){
  const s=snapshot||{},d=s.diagnosis||{},p=s.package;
  if(['overview','transcript','diagnosis'].includes(key))return null;
  if(['builds','scope'].includes(key)&&d.status!=='approved'&&!p)return {title:'Approve the diagnosis first',detail:'Relystra reviews and approves the evidence-backed findings before preparing the recommended work.',section:'diagnosis',label:'Go to diagnosis & approval'};
  if(key==='progress'&&s.project_id&&s.project_type!=='build_package')return null;
  if(['progress','review','final-package','support'].includes(key)&&!p)return {title:'This step begins after scope and payment',detail:'A verified paid Build Package starts implementation. Existing records remain available in the library.',section:'scope',label:'Go to scope & payment'};
  if(key==='review'&&!['client_review','revisions','final_qa','support','completed'].includes(p?.stage))return {title:'Relystra is preparing your draft',detail:'Build work and internal quality checks must finish before client review.',section:'progress',label:'View Build progress'};
  if(['final-package','support'].includes(key)&&p?.stage==='final_qa')return {title:'Final quality checks are in progress',detail:'Relystra is checking the approved Builds and delivery materials before publishing your Final Package.',section:'progress',label:'View final quality checks'};
  if(['final-package','support'].includes(key)&&!['support','completed'].includes(p?.stage))return {title:'Final handoff is not ready yet',detail:'Client approval and final quality checks come before the Final Package and seven-day support period.',section:'review',label:'Go to client review'};
  return null;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function journeyMarkup(snapshot,{active='overview',hasTranscript=false,attribute='data-delivery-nav'}={}){
  const steps=journeyProgress(snapshot,hasTranscript),current=steps.find(s=>s.status==='current')||steps.at(-1);
  return `<nav class="relystra-numbered-journey" aria-label="Numbered client journey"><p><b>Step ${current.number} of ${steps.length}: ${esc(current.title)}</b></p><ol>${steps.map(s=>`<li class="is-${s.status}"><button type="button" ${attribute}="${s.key}" aria-current="${active===s.key?'step':'false'}"><span class="journey-number" aria-hidden="true">${s.number}</span><span>${esc(s.title)}<small>${s.status==='completed'?'Completed':s.status==='current'?'Current step':'Upcoming'}</small></span></button></li>`).join('')}</ol></nav>`;
}
export function gateMarkup(gate,attribute='data-delivery-nav'){return `<article class="relystra-build-card relystra-stage-gate"><h1>${esc(gate.title)}</h1><p>${esc(gate.detail)}</p><button class="btn primary" type="button" ${attribute}="${gate.section}">${esc(gate.label)}</button></article>`;}

export const transcriptSelectionKey=(company,project)=>`relystra_transcript:${company}:${project||'preparation'}`;
export function journeyNext(snapshot,hasTranscript=false,client=false){const next=client?clientLifecycle(snapshot):lifecycle(snapshot);if(next.stage==='diagnosis'&&snapshot?.initial_engagement)return {...next,section:'transcript',label:'Review retained Discovery and additional evidence'};if(next.stage==='diagnosis')return {...next,section:'transcript',title:hasTranscript?'Your transcript is ready':'Add the meeting transcript',detail:hasTranscript?'Continue to diagnosis using the saved meeting transcript and supporting evidence.':'Upload the meeting transcript in Step 2, then continue with diagnosis.',label:hasTranscript?'Continue with diagnosis':'Upload meeting transcript',actor:hasTranscript?'ADMIN':'CLIENT'};if(next.stage==='diagnosis_purchase')return {...next,section:'overview'};if(next.stage==='payment')return {...next,section:'scope'};if(['client_review','revisions'].includes(next.stage))return {...next,section:'review'};return next;}
