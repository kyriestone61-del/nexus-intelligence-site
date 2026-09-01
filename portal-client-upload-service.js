/**
 * Client upload service: one owner for the visible Client Control Room upload form.
 * Owns queue state, request linkage, rollback, and accepted evidence types.
 */
const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for upload service.');
const {sb,state,runtime,toast}=portal;
const {events,boundary}=runtime;
const BUCKET='nexus-client-documents';
const MAX_BYTES=26214400;
const ACCEPTED_EXTENSIONS=new Set(['pdf','doc','docx','xls','xlsx','csv','txt','png','jpg','jpeg','webp','mp3','m4a','wav','mp4','mov','webm']);
let selection={requestId:null,requirementId:null,title:''};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
const extension=file=>String(file?.name||'').split('.').pop().toLowerCase();

function queueFor(file){return file?[{name:file.name,size:file.size,type:file.type||null,extension:extension(file),requestId:selection.requestId,requirementId:selection.requirementId,status:'ready'}]:[]}
function syncQueue(file){window.NexusStore?.setUploadQueue?.(queueFor(file));}
function clear(){selection={requestId:null,requirementId:null,title:''};syncQueue(null);const box=$('uploadContext');if(box){box.classList.remove('show');box.innerHTML=''}}
function prepare({requestId=null,requirementId=null,title=''}){
  selection={requestId,requirementId,title:String(title||'')};
  const box=$('uploadContext');if(!box)return;
  box.classList.add('show');box.innerHTML=`<b>Upload for:</b> ${esc(selection.title||'General evidence')} <button id="clientClearUploadContext" class="btn secondary" type="button">Clear</button>`;
  if($('docNote')&&!$('docNote').value)$('docNote').value=selection.title?`Evidence for ${selection.title}`:'';
  events.bind($('clientClearUploadContext'),'click','client-upload:clear',clear);
  const file=$('docFile')?.files?.[0];if(file)syncQueue(file);
}
function validate(file){
  if(!file)return 'Choose a file first.';
  if(file.size>MAX_BYTES)return 'File exceeds the 25 MB limit.';
  if(!ACCEPTED_EXTENSIONS.has(extension(file)))return 'Unsupported file type. Use documents, spreadsheets, images, audio, or video recordings.';
  return null;
}
async function submit(event){
  event.preventDefault();event.stopImmediatePropagation();
  const form=event.currentTarget,file=$('docFile')?.files?.[0],validation=validate(file);if(validation){toast(validation);return}
  const companyId=state.companyId;if(!companyId)throw new Error('Client company context is unavailable.');
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${companyId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const request=state.docRequests?.find(row=>row.id===selection.requestId),requirement=state.dataRequirements?.find(row=>row.id===selection.requirementId);
  const sensitivity=request?.sensitivity||requirement?.catalog?.sensitivity||'standard';
  window.NexusStore?.setUploadQueue?.([{...queueFor(file)[0],status:'uploading'}]);
  const upload=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(upload.error){syncQueue(file);throw upload.error}
  try{
    const row={company_id:companyId,project_id:state.projects?.[0]?.id||null,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category:$('docCategory')?.value||'Client Source',status:'shared',note:$('docNote')?.value.trim()||null,uploaded_by:state.user.id,sensitivity,request_id:selection.requestId||null,data_requirement_id:selection.requirementId||null,document_area:'client_submission',source_role:'client'};
    const insert=await sb.from('nexus_documents').insert(row).select().single();if(insert.error)throw insert.error;
    await portal.log?.('document_uploaded','document',insert.data.id,`Client uploaded ${file.name}`);
    form.reset();clear();toast('Evidence uploaded securely.');await portal.workspace?.();
  }catch(error){try{await sb.storage.from(BUCKET).remove([path])}catch(rollbackError){console.warn('Nexus upload rollback failed',rollbackError)}syncQueue(file);throw error}
}
const form=$('uploadForm');
if(form){events.bind(form,'submit','client-upload:submit',boundary.wrap('client secure upload',submit),true);const input=$('docFile');if(input){input.accept='.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.mp4,.mov,.webm,audio/*,video/*';events.bind(input,'change','client-upload:queue',()=>syncQueue(input.files?.[0]||null))}}
const service=Object.freeze({prepare,clear,validate,getSelection:()=>({...selection}),getQueue:()=>queueFor($('docFile')?.files?.[0]||null),acceptedExtensions:Object.freeze([...ACCEPTED_EXTENSIONS])});
portal.services=portal.services||{};portal.services.clientUpload=service;
Object.defineProperty(portal,'prepareUpload',{value:prepare,configurable:true,enumerable:false});
window.NexusClientUploadService=service;
