import {createDocumentService} from './core/document-service.js';

/**
 * Client upload UI/facade. Canonical persistence, lineage validation, rollback,
 * file-size enforcement, and download behavior live in core/document-service.js.
 */
const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for upload service.');
const {sb,state,runtime,toast}=portal;
const {events,boundary}=runtime;
let selection={requestId:null,requirementId:null,taskId:null,title:''};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

portal.services=portal.services||{};
const documents=portal.services.documents||createDocumentService({
  sb,
  state,
  log:(...args)=>portal.log?.(...args),
  refresh:()=>portal.workspace?.()
});
portal.services.documents=documents;

function clear(){selection={requestId:null,requirementId:null,taskId:null,title:''};const box=$('uploadContext');if(box){box.classList.remove('show');box.innerHTML=''}}
function prepare({requestId=null,requirementId=null,taskId=null,title=''}){
  selection={requestId,requirementId,taskId,title:String(title||'')};
  const box=$('uploadContext');if(!box)return;
  box.classList.add('show');box.innerHTML=`<b>Upload for:</b> ${esc(selection.title||'General evidence')} <button id="clientClearUploadContext" class="btn secondary" type="button">Clear</button>`;
  if($('docNote')&&!$('docNote').value)$('docNote').value=selection.title?`File for ${selection.title}`:'';
  events.bind($('clientClearUploadContext'),'click','client-upload:clear',clear);
}

async function uploadFile({file,requestId=null,requirementId=null,taskId=null,title='',category='Client Source',note=null,refresh=true}={}){
  return documents.uploadFile({
    file,
    requestId,
    requirementId,
    taskId,
    title,
    category,
    note,
    refreshAfter:refresh,
    sourceRole:'client',
    documentArea:'client_submission',
    enforceClientTask:!!taskId
  });
}

async function uploadFilesForTask({taskId,files,note=null,onProgress=null}={}){
  return documents.uploadFilesForTask({
    taskId,
    files,
    note,
    onProgress,
    sourceRole:'client',
    documentArea:'client_submission',
    enforceClientTask:true
  });
}

async function submit(event){
  event.preventDefault();event.stopImmediatePropagation();
  const form=event.currentTarget,file=$('docFile')?.files?.[0];if(!file)return;
  const category=$('docCategory')?.value||'Client Source',note=$('docNote')?.value.trim()||null;
  await uploadFile({file,requestId:selection.requestId,requirementId:selection.requirementId,taskId:selection.taskId,title:selection.title,category,note,refresh:false});
  form.reset();clear();toast('Document uploaded securely.');await portal.workspace?.();
}

const form=$('uploadForm');if(form)events.bind(form,'submit','client-upload:submit',boundary.wrap('client secure upload',submit),true);
const service=Object.freeze({prepare,clear,uploadFile,uploadFilesForTask,getSelection:()=>({...selection})});
portal.services.clientUpload=service;
Object.defineProperty(portal,'prepareUpload',{value:prepare,configurable:true,enumerable:false});
window.NexusClientUploadService=service;

const TASK_FILE_BUILD='20260903-inline-action-files1';
if(!document.querySelector('link[data-nexus-task-files]')){const link=document.createElement('link');link.rel='stylesheet';link.href=`/portal-task-file-attachments.css?v=${TASK_FILE_BUILD}`;link.dataset.nexusTaskFiles='1';document.head.appendChild(link)}
import(`/portal-task-file-attachments.js?v=${TASK_FILE_BUILD}`).then(()=>import(`/portal-task-file-attachments-live.js?v=${TASK_FILE_BUILD}`)).catch(error=>console.error('Nexus task file controls failed to load.',error));
