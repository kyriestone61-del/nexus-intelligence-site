import {mountFullDiagnosisStage as mountTranscriptStage} from '/portal-full-diagnosis-stage.js';
import {journeyMarkup,journeyGate,gateMarkup} from '/portal-journey-steps.js';
import {createPortalRuntime} from '/portal-runtime-core.js';
const params=new URL(location.href).searchParams,role=params.get('role')||'admin';
let company='a',calls=0,uploadAttempts=0,runAttempts=0;
const records=JSON.parse(sessionStorage.getItem('qa-docs')||'[]');
const statuses={a:null,b:null};
const portal={state:{admin:role==='admin',companyId:company,user:{id:'synthetic-user'},docs:records},runtime:createPortalRuntime({}),log:async()=>{}};
const snapshot=()=>({company_id:company,project_id:null,diagnosis:{access:params.get('access')!=='no',status:statuses[company]}});
portal.sb={storage:{from:()=>({upload:async()=>{uploadAttempts++;if(params.get('upload')==='fail'&&uploadAttempts===1)return{error:{message:'Simulated upload failure. Try again.'}};return{}},remove:async()=>({})})},from:()=>({insert(row){return{select:()=>({single:async()=>{const data={id:crypto.randomUUID(),...row};records.push(data);sessionStorage.setItem('qa-docs',JSON.stringify(records));return{data}}})}}}),rpc:async()=>({data:snapshot()})};
window.NexusDiagnosisController={securedQueue:async()=>{calls++;document.querySelector('#calls').textContent=calls;runAttempts++;if(params.get('diagnosis')==='fail'&&runAttempts===1){statuses[company]='failed';throw Error('Simulated diagnosis failure. Your transcript is saved.')}statuses[company]='ready_for_review';return{status:'ready_for_review'}}};
let component,active='transcript';
function render(){document.querySelector('#steps').innerHTML=journeyMarkup(snapshot(),{active,hasTranscript:records.some(d=>d.company_id===company)});document.querySelectorAll('[data-delivery-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.deliveryNav));}
function navigate(key){active=key;render();const root=document.querySelector('#stage'),other=document.querySelector('#other-stage'),gate=journeyGate(key,snapshot());root.hidden=key!=='transcript';other.hidden=key==='transcript';if(key==='transcript'){if(!component)component=mountTranscriptStage(root,portal,{navigate,onChange:async()=>{render();component.refresh(snapshot())}});component.refresh(snapshot())}else if(gate)other.innerHTML=gateMarkup(gate);else other.innerHTML=`<h1>${key==='diagnosis'?'Existing diagnosis review':key}</h1>`}
document.querySelector('#company').onchange=e=>{company=e.target.value;portal.state.companyId=company;navigate('transcript')};
navigate('transcript');
