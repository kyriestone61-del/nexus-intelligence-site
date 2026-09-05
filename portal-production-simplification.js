// Operational Release 1 authenticated browser-baseline trigger; no runtime behavior change.
const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');

const {state}=portal;
const $=id=>document.getElementById(id);
const terminal=new Set(['complete','completed','done','closed','resolved','cancelled','canceled','archived','approved','not_applicable']);
const adminPrimaryCache={home:null,clients:null,decisions:null,sales:null};
let scheduled=false,clientOverlayEscapeBound=false;

function text(node,value){if(node&&node.textContent!==value)node.textContent=value}
function hidden(node,value=true){if(!node)return;if(value){node.hidden=true;node.setAttribute('aria-hidden','true')}else{node.hidden=false;node.removeAttribute('aria-hidden')}}
function activePlanTasks(){return (state.tasks||[]).filter(task=>String(task.phase||'').toLowerCase()==='solution_design'&&!terminal.has(String(task.status||'').toLowerCase()))}
function currentPlanStep(){return [...document.querySelectorAll('#adminJourneyRoot .journey-step')].find(step=>step.querySelector('.journey-step-number')?.textContent.trim()==='3'||/Agree on the Plan|Choose Solutions/i.test(step.querySelector('h3')?.textContent||''))||null}
function openDecisions(){
  const button=document.querySelector('.side-nav button[data-section="notifications"]')||adminPrimaryCache.decisions;
  if(button){button.click();return true}
  portal.toast?.('Relystra could not open Decisions. Reload the workspace and try again.');
  return false;
}
