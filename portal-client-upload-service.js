import {resolveDocumentContext} from '/core/document-context.js';

/**
 * Client upload service: one owner for client uploads from the Data Room and
 * from an individual client action. All uploads use the same private bucket,
 * company scope, audit path, and 25 MB limit.
 */
const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for upload service.');
const {sb,state,runtime,toast}=portal;
const {events,boundary}=runtime;
const BUCKET='nexus-client-documents';
const MAX_BYTES=26214400;
let selection={requestId:null,requirementId:null,taskId:null,title:''};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function clear(){selection={requestId:null,requirementId:null,taskId:null,title:''};const box=$('uploadContext');if(box){box.classList.remove('show');box.innerHTML=''}}
function prepare({requestId=null,requirementId=null,taskId=null,title=''}){
  selection={requestId,requirementId,taskId,title:String(title||'')};
  const box=$('uploadContext');if(!box)return;
  box.classList.add('show');box.innerHTML=`<b>Upload for:</b> ${esc(selection.title||'General evidence')} <button id="clientClearUploadContext" class="btn secondary" type="button">Clear</button>`;
  if($('docNote')&&!$('docNote').value)$('docNote').value=selection.title?`File for ${selection.title}`:'';
  events.bind($('clientClearUploadContext'),'click','client-upload:clear',clear);
}

function taskFor(id){return id?(state.tasks||[]).find(task=>String(task.id)===String(id))||null:null}
function assertTaskBoundary(taskId){
  if(!taskId)return null;
  const task=taskFor(taskId);
  if(!task)throw new Error('This action could not be found.');
  if(String(task.company_id)!==String(state.companyId))throw new Error('This action is outside the current company workspace.');
  if(String(task.assignee||'').toLowerCase()!=='client')throw new Error('Files can only be attached here for a client-owned action.');
  return task;
}

async function uploadFile({file,requestId=null,requirementId=null,taskId=null,title='',category='Client Source',note=null,refresh=true}={}){
  if(!file)throw new Error('Choose a file first.');
  if(file.size>MAX_BYTES)throw new Error('File exceeds the 25 MB limit.');
  const companyId=state.companyId;if(!companyId)throw new Error('Client company context is unavailable.');
  const task=assertTaskBoundary(taskId);
  const context=resolveDocumentContext({
    companyId,
    projects:state.projects||[],
    tasks:state.tasks||[],
    docRequests:state.docRequests||[],
    dataRequirements:state.dataRequirements||[],
    taskId,
    requestId,
    requirementId
  });
  const {projectId,request,requirement}=context;
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${companyId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const sensitivity=request?.sensitivity||requirement?.catalog?.sensitivity||'standard';
  const upload=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(upload.error)throw upload.error;
  try{
    const row={company_id:companyId,project_id:projectId,task_id:task?.id||null,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category,status:'shared',note:(note||title)?String(note||`File for ${title}`):null,uploaded_by:state.user.id,sensitivity,request_id:requestId||null,data_requirement_id:requirementId||null,document_area:'client_submission',source_role:'client'};
    const insert=await sb.from('nexus_documents').insert(row).select().single();if(insert.error)throw insert.error;
    await portal.log?.('document_uploaded','document',insert.data.id,task?`Client uploaded ${file.name} for action: ${task.title}`:`Client uploaded ${file.name}`);
    if(refresh)await portal.workspace?.();
    return insert.data;
  }catch(error){try{await sb.storage.from(BUCKET).remove([path])}catch(rollbackError){console.warn('Nexus upload rollback failed',rollbackError)}throw error}
}

async function uploadFilesForTask({taskId,files,note=null,onProgress=null}={}){
  const task=assertTaskBoundary(taskId),list=Array.from(files||[]).filter(Boolean);
  if(!list.length)throw new Error('Choose at least one file.');
  const uploaded=[];
  for(let index=0;index<list.length;index+=1){
    onProgress?.({index:index+1,total:list.length,file:list[index]});
    uploaded.push(await uploadFile({file:list[index],taskId:task.id,title:task.title,category:'Action Attachment',note,refresh:false}));
  }
  await portal.workspace?.();
  return uploaded;
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
portal.services=portal.services||{};portal.services.clientUpload=service;
Object.defineProperty(portal,'prepareUpload',{value:prepare,configurable:true,enumerable:false});
window.NexusClientUploadService=service;

const TASK_FILE_BUILD='20260903-inline-action-files1';
if(!document.querySelector('link[data-nexus-task-files]')){const link=document.createElement('link');link.rel='stylesheet';link.href=`/portal-task-file-attachments.css?v=${TASK_FILE_BUILD}`;link.dataset.nexusTaskFiles='1';document.head.appendChild(link)}
import(`/portal-task-file-attachments.js?v=${TASK_FILE_BUILD}`).then(()=>import(`/portal-task-file-attachments-live.js?v=${TASK_FILE_BUILD}`)).catch(error=>console.error('Nexus task file controls failed to load.',error));
